/* Generated from schema/run-result.schema.json. Run npm run gen:contract to update. */

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
