// Types for the JSON contracts in /schema. Keep in sync with the schema files;
// the Go side is checked by server/internal/contract/contract_test.go.

export const MAX_CODE_BYTES = 65536;

export interface RunRequest {
  code: string;
  turnstileToken?: string;
}

export type Outcome = "compile_error" | "exited" | "timeout" | "output_limit" | "killed";
export type Backend = "onprem" | "sandbox";

export interface Diagnostic {
  severity: "error" | "warning";
  message: string;
  line?: number;
  col?: number;
  endLine?: number;
  endCol?: number;
  text?: string;
}

export interface RunResult {
  outcome: Outcome;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  diagnostics: Diagnostic[];
  truncated: boolean;
  durationMs: number;
  backend: Backend;
}

export type ErrorCode =
  | "invalid_request"
  | "too_large"
  | "forbidden_origin"
  | "turnstile_failed"
  | "rate_limited"
  | "busy"
  | "use_primary"
  | "unavailable"
  | "internal";

export interface ErrorResponse {
  error: { code: ErrorCode; message: string };
}

export interface Health {
  runner: "up" | "down";
  freeRunSlots: number;
  agentAvailable: boolean;
}

export type ServiceState = "normal" | "degraded" | "outage";
