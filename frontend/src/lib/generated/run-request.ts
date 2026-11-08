/* Generated from schema/run-request.schema.json. Run npm run gen:contract to update. */

/**
 * Body of POST /goose/run (hub), POST /run (runner, internal) and POST /api/run (Vercel fallback).
 */
export interface RunRequest {
  /**
   * Goose source of a single root file. At most 65536 UTF-8 bytes; the byte limit is enforced by the server.
   */
  code: string;
  /**
   * Cloudflare Turnstile response token. Ignored by the runner. Required by the hub and the fallback once Turnstile is enabled.
   */
  turnstileToken?: string;
}
