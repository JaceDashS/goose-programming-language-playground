/* Generated from schema/check-result.schema.json. Run npm run gen:contract to update. */

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
