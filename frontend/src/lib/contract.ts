import type { RunResult } from "./generated/run-result";
import type { ErrorResponse } from "./generated/error";

export type { RunRequest } from "./generated/run-request";
export type { RunResult, Diagnostic } from "./generated/run-result";
export type { ErrorResponse } from "./generated/error";
export type { Health } from "./generated/health";
export type Outcome = RunResult["outcome"];
export type Backend = RunResult["backend"];
export type ErrorCode = ErrorResponse["error"]["code"];
export const MAX_CODE_BYTES = 65536;
export type ServiceState = "normal" | "degraded" | "outage";
