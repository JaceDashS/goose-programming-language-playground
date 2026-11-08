import type { Diagnostic, RunResult, Outcome } from "../contract";

/** One isolated sandbox; prepare installs the pinned compiler before code execution. */
export interface RunSandbox {
  prepare(code: string): Promise<void>;
  command(phase: "check" | "run", options: {
    signal: AbortSignal; timeoutMs: number;
    output(stream: "stdout" | "stderr", data: Uint8Array): void;
  }): Promise<number>;
  stop(): Promise<void>;
}

/** Check then run with one wall-clock deadline and combined byte budget; always stop. */
export async function executeSandbox(sandbox: RunSandbox, code: string): Promise<RunResult> {
  try {
    await sandbox.prepare(code);
    return await execute(sandbox);
  } finally {
    await sandbox.stop();
  }
}

async function execute(sandbox: RunSandbox): Promise<RunResult> {
  const started = Date.now(), controller = new AbortController();
  let stopped: Outcome | undefined;
  const timer = setTimeout(() => { stopped ??= "timeout"; controller.abort(); }, 10000);
  let budget = 1 << 20;
  let checking = true;
  const stdout: Buffer[] = [], stderr: Buffer[] = [], check: Buffer[] = [];
  const result: RunResult = { outcome: "killed", exitCode: null, stdout: "", stderr: "", diagnostics: [], truncated: false, durationMs: 0, backend: "sandbox" };
  const output = (stream: "stdout" | "stderr", data: Uint8Array) => {
    const bytes = Buffer.from(data), kept = bytes.subarray(0, budget);
    budget -= kept.length;
    if (checking) { if (stream === "stdout") check.push(kept); }
    else (stream === "stdout" ? stdout : stderr).push(kept);
    if (kept.length < bytes.length) { stopped ??= "output_limit"; result.truncated = true; controller.abort(); }
  };
  const command = (phase: "check" | "run") => sandbox.command(phase, {
    signal: controller.signal, timeoutMs: Math.max(1, 10000 - (Date.now() - started)), output,
  });
  try {
    const checkExit = await command("check");
    if (Date.now() - started >= 10000) stopped ??= "timeout";
    if (stopped) return finish();
    result.diagnostics = parseDiagnostics(Buffer.concat(check).toString("utf8"));
    if (checkExit === 137 || checkExit < 0) result.outcome = "killed";
    else if (checkExit !== 0) result.outcome = "compile_error";
    else {
      checking = false;
      budget = 1 << 20;
      if (Date.now() - started >= 10000) { stopped = "timeout"; return finish(); }
      const exit = await command("run");
      if (Date.now() - started >= 10000) stopped ??= "timeout";
      if (exit === 137 || exit < 0) result.outcome = "killed";
      else { result.outcome = "exited"; result.exitCode = exit; }
    }
  } catch (error) {
    if (!stopped) throw error;
  } finally { clearTimeout(timer); }
  return finish();

  function finish(): RunResult {
    clearTimeout(timer);
    if (stopped) { result.outcome = stopped; result.exitCode = null; }
    result.stdout = Buffer.concat(stdout).toString("utf8");
    result.stderr = Buffer.concat(stderr).toString("utf8");
    result.durationMs = Math.max(0, Date.now() - started);
    return result;
  }
}

function parseDiagnostics(text: string): Diagnostic[] {
  if (!text.trim()) return [];
  const parsed: unknown = JSON.parse(text);
  if (!Array.isArray(parsed)) throw new Error("Invalid compiler diagnostics");
  return parsed.map((value: Diagnostic) => ({ ...value,
    ...(value.text ? { text: value.text.replaceAll("/work/main.goose", "main.goose") } : {}),
  }));
}
