/* Generated from schema/socket-message.schema.json. Run npm run gen:contract to update. */

/**
 * Fixed allow-list of WebSocket messages on wss://api.jace-s.com/goose/session between the browser and the hub. Any other message is dropped. The browser never executes received code.
 */
export type SocketMessage =
  | Start
  | Hello
  | SetCode
  | GetCode
  | CodeSnapshot
  | RunStarted
  | RunFinished
  | CheckStarted
  | CheckFinished
  | AiActivity
  | ToolFailed
  | SessionEnded
  | Disconnect
  | ToolStarted
  | ToolReady
  | ToolFinished;

/**
 * browser -> hub, the first message after connect. Carries a fresh Turnstile token when Turnstile is on.
 */
export interface Start {
  type: "start";
  turnstileToken?: string;
}
/**
 * hub -> browser, the answer to start. Issues the session token and its lifetime.
 */
export interface Hello {
  type: "hello";
  sessionToken: string;
  /**
   * True when the jace-s session cookie was valid, which gives the longer lifetime.
   */
  loggedIn: boolean;
  /**
   * The session ends after this long without an MCP call.
   */
  idleSeconds: number;
  /**
   * The session ends at this time at the latest.
   */
  expiresAt: string;
}
/**
 * hub -> browser. Replace the editor content (AI set_code).
 */
export interface SetCode {
  type: "setCode";
  code: string;
}
/**
 * hub -> browser. Ask for the current editor content (AI get_code, run, check).
 */
export interface GetCode {
  type: "getCode";
  requestId: string;
}
/**
 * browser -> hub. Answer to getCode.
 */
export interface CodeSnapshot {
  type: "codeSnapshot";
  requestId: string;
  code: string;
}
/**
 * hub -> browser. The AI started a run of the editor content.
 */
export interface RunStarted {
  type: "runStarted";
}
/**
 * hub -> browser. Result of the AI-started run, shown in the output panel.
 */
export interface RunFinished {
  type: "runFinished";
  result: RunResult;
}
/**
 * Result of one run. Returned by the runner, the hub and the Vercel fallback, and sent to the browser in runFinished.
 */
export interface RunResult {
  /**
   * compile_error: goose check rejected the program and nothing ran. exited: the program ended on its own (see exitCode). timeout: stopped at the time limit. output_limit: stopped after the output cap. killed: stopped by the memory or process limit.
   */
  outcome: "compile_error" | "exited" | "timeout" | "output_limit" | "killed";
  /**
   * Program exit code when outcome is exited, otherwise null.
   */
  exitCode: number | null;
  stdout: string;
  stderr: string;
  /**
   * Errors and warnings from goose check --diagnostics json. Empty when there are none.
   */
  diagnostics: Diagnostic[];
  /**
   * True when stdout or stderr was cut at the output cap.
   */
  truncated: boolean;
  /**
   * Wall time inside the container, check and compile included.
   */
  durationMs: number;
  backend: "onprem" | "sandbox";
}
export interface Diagnostic {
  severity: "error" | "warning";
  message: string;
  line?: number;
  col?: number;
  endLine?: number;
  endCol?: number;
  /**
   * The whole message as a terminal would show it.
   */
  text?: string;
  [k: string]: unknown;
}
/**
 * hub -> browser. The AI started a check of the editor content.
 */
export interface CheckStarted {
  type: "checkStarted";
}
/**
 * hub -> browser. Result of the AI-started check, shown in the output panel.
 */
export interface CheckFinished {
  type: "checkFinished";
  result: CheckResult;
}
/**
 * Result of goose check without running the program. Returned by the runner's POST /check, the MCP check tool, and sent to the browser in checkFinished.
 */
export interface CheckResult {
  /**
   * ok: the check passed (warnings may remain). compile_error: the check found errors. timeout: stopped at the time limit. killed: stopped by the memory or process limit.
   */
  outcome: "ok" | "compile_error" | "timeout" | "killed";
  /**
   * Errors and warnings from goose check --diagnostics json. Empty when there are none.
   */
  diagnostics: Diagnostic[];
  /**
   * Wall time inside the container.
   */
  durationMs: number;
}
/**
 * hub -> browser. The AI called a tool with this session's token; drives the AI connected indicator.
 */
export interface AiActivity {
  type: "aiActivity";
  tool: "get_code" | "set_code" | "run" | "check";
}
/**
 * hub -> browser. Explain any refused or failed session tool, even before execution. Does not release another active tool lock.
 */
export interface ToolFailed {
  type: "toolFailed";
  tool: "get_code" | "set_code" | "run" | "check";
  message: string;
  errorCode?: "busy" | "rate_limited" | "invalid_request" | "unavailable";
  retryAfterSeconds?: number;
}
/**
 * hub -> browser, sent just before the hub closes the socket. The token no longer works.
 */
export interface SessionEnded {
  type: "sessionEnded";
  /**
   * idle: no MCP call for idleSeconds. expired: reached expiresAt. full: the global session cap is reached. ip_limit / account_limit: this visitor already has the maximum sessions. turnstile_failed: the browser check failed. shutdown: the hub is restarting.
   */
  reason: "idle" | "expired" | "full" | "ip_limit" | "account_limit" | "turnstile_failed" | "shutdown";
}
/**
 * browser -> hub. Revoke the token now.
 */
export interface Disconnect {
  type: "disconnect";
}
/**
 * hub -> browser. Lock manual editing and execution for one tool call before acknowledging.
 */
export interface ToolStarted {
  type: "toolStarted";
  requestId: string;
  tool: "get_code" | "set_code" | "run" | "check";
}
/**
 * browser -> hub. Acknowledge the lock, or refuse while a browser run owns the tab.
 */
export interface ToolReady {
  type: "toolReady";
  requestId: string;
  accepted: boolean;
}
/**
 * hub -> browser. Release only the matching tool lock, including after failure or timeout.
 */
export interface ToolFinished {
  type: "toolFinished";
  requestId: string;
}
