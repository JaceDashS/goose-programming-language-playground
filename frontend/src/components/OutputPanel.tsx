import type { CheckResult, Diagnostic, Outcome } from "@/lib/contract";
import type { RunOutcome } from "@/lib/runGoose";
import styles from "./Playground.module.css";

const LABEL: Record<Outcome, string> = {
  compile_error: "Compile error",
  exited: "Exited",
  timeout: "Stopped: time limit (10 s)",
  output_limit: "Stopped: output limit (1 MB)",
  killed: "Stopped: memory or process limit",
};

const CHECK_LABEL: Record<CheckResult["outcome"], string> = {
  ok: "Check passed",
  compile_error: "Compile error",
  timeout: "Check stopped: time limit (10 s)",
  killed: "Check stopped: memory or process limit",
};

/** What the output panel shows: a run outcome, or a check result from the AI. */
export type PanelOutcome = RunOutcome | { kind: "check"; result: CheckResult; state?: undefined };

interface Props {
  outcome: PanelOutcome | null;
  /** Text while something runs, for example "Running…" or "AI is checking…"; null when idle. */
  busy: string | null;
  /** The shown result came from the AI. */
  byAI?: boolean;
}

function Diagnostics({ items }: { items: Diagnostic[] }) {
  if (items.length === 0) return null;
  return (
    <ul className={styles.diagnostics}>
      {items.map((d, i) => (
        <li key={i} className={d.severity === "error" ? styles.error : styles.warning}>
          {d.line ? `line ${d.line}${d.col ? `:${d.col}` : ""}: ` : ""}
          {d.message}
        </li>
      ))}
    </ul>
  );
}

export default function OutputPanel({ outcome, busy, byAI }: Props) {
  if (busy) return <p className={styles.muted}>{busy}</p>;
  if (!outcome) return <p className={styles.muted}>Press Run to see the output.</p>;
  if (outcome.kind === "error") return <p className={styles.error}>{outcome.message}</p>;
  const by = byAI ? "AI · " : "";

  if (outcome.kind === "check") {
    const c = outcome.result;
    return (
      <div className={styles.output}>
        <p className={styles.status}>{by}{CHECK_LABEL[c.outcome]} · {c.durationMs} ms</p>
        <Diagnostics items={c.diagnostics} />
      </div>
    );
  }

  const r = outcome.result;
  const status = r.outcome === "exited" ? `Exited with code ${r.exitCode}` : LABEL[r.outcome];
  return (
    <div className={styles.output}>
      <p className={styles.status}>
        {by}{status} · {r.durationMs} ms · {r.backend === "onprem" ? "server" : "backup server"}
        {r.truncated && " · output truncated"}
      </p>
      <Diagnostics items={r.diagnostics} />
      {r.stdout && <pre className={styles.stdout}>{r.stdout}</pre>}
      {r.stderr && <pre className={styles.stderr}>{r.stderr}</pre>}
    </div>
  );
}
