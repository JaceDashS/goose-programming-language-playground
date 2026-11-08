/* Generated from schema/socket-message.schema.json. Run npm run gen:contract to update. */

/**
 * Fixed allow-list of WebSocket messages between the browser and the hub. Any other message is dropped. The browser never executes received code.
 */
export type SocketMessage =
  Hello | SetCode | GetCode | CodeSnapshot | RunStarted | RunFinished | AiActivity | Disconnect;

/**
 * hub -> browser, right after connect. Issues the session token.
 */
export interface Hello {
  type: "hello";
  sessionToken: string;
}
/**
 * hub -> browser. Replace the editor content (AI set_code).
 */
export interface SetCode {
  type: "setCode";
  code: string;
}
/**
 * hub -> browser. Ask for the current editor content (AI get_code).
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
 * hub -> browser. The AI started a run of the current code.
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
 * hub -> browser. Drives the AI connected indicator.
 */
export interface AiActivity {
  type: "aiActivity";
  connected: boolean;
}
/**
 * browser -> hub. Revoke the session token now.
 */
export interface Disconnect {
  type: "disconnect";
}
