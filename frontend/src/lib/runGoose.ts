// runGoose sends code to the on-prem hub first and falls back to the Vercel endpoint only
// when the hub is busy or unreachable (D-0001, D-0010). It is the single place that knows
// where code runs, so the UI and the agent never depend on it (D-0008).
import type { ErrorCode, ErrorResponse, RunResult, ServiceState } from "./contract";

export interface RunEndpoints {
  primary: string; // https://api.jace-s.com/goose/run
  fallback: string; // /api/run on the Vercel deployment
}

export interface RunOptions {
  turnstileToken?: string;
  fetch?: typeof fetch;
  /** Abort the primary request after this long and treat it as unreachable. */
  primaryTimeoutMs?: number;
}

/** What the UI gets back: a result, or an error to show. `state` is the service state this attempt observed. */
export type RunOutcome =
  | { kind: "result"; result: RunResult; state: ServiceState }
  | { kind: "error"; code: ErrorCode | "network"; message: string; state: ServiceState };

/** Errors from the primary that mean "try the fallback". */
const FALL_BACK_ON: ReadonlySet<string> = new Set(["busy", "unavailable", "network"]);

/** The run limit is 10 s; leave room for the network and container handoff. */
const DEFAULT_PRIMARY_TIMEOUT_MS = 20_000;

type Attempt =
  | { ok: true; result: RunResult }
  | { ok: false; code: ErrorCode | "network"; message: string };

async function post(
  url: string,
  body: unknown,
  f: typeof fetch,
  timeoutMs: number | undefined,
): Promise<Attempt> {
  const ctl = new AbortController();
  const timer = timeoutMs ? setTimeout(() => ctl.abort(), timeoutMs) : undefined;
  try {
    const res = await f(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctl.signal,
    });
    const data: unknown = await res.json().catch(() => null);
    if (res.ok) return { ok: true, result: data as RunResult };
    const err = (data as ErrorResponse | null)?.error;
    if (err?.code) return { ok: false, code: err.code, message: err.message };
    // A proxy error page (502 from the gateway when the hub is down) has no JSON body.
    return { ok: false, code: res.status >= 500 ? "unavailable" : "internal", message: `HTTP ${res.status}` };
  } catch {
    return { ok: false, code: "network", message: "The server could not be reached." };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function runGoose(code: string, endpoints: RunEndpoints, opts: RunOptions = {}): Promise<RunOutcome> {
  const f = opts.fetch ?? fetch;
  const body = { code, turnstileToken: opts.turnstileToken };
  const timeout = opts.primaryTimeoutMs ?? DEFAULT_PRIMARY_TIMEOUT_MS;

  const first = await post(endpoints.primary, body, f, timeout);
  if (first.ok) return { kind: "result", result: first.result, state: "normal" };
  if (!FALL_BACK_ON.has(first.code)) {
    return { kind: "error", code: first.code, message: first.message, state: "normal" };
  }

  const second = await post(endpoints.fallback, body, f, undefined);
  if (second.ok) return { kind: "result", result: second.result, state: "degraded" };

  if (second.code === "use_primary") {
    // The fallback saw a healthy primary: the first failure was momentary. Retry once.
    const retry = await post(endpoints.primary, body, f, timeout);
    if (retry.ok) return { kind: "result", result: retry.result, state: "normal" };
    return { kind: "error", code: retry.code, message: retry.message, state: "degraded" };
  }
  if (second.code === "unavailable" || second.code === "network") {
    return { kind: "error", code: second.code, message: "Temporary service outage.", state: "outage" };
  }
  return { kind: "error", code: second.code, message: second.message, state: "degraded" };
}
