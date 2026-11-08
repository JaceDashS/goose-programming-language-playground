/* Generated from schema/error.schema.json. Run npm run gen:contract to update. */

/**
 * Body of every non-2xx response from the hub, the runner and the Vercel fallback.
 */
export interface ErrorResponse {
  error: {
    /**
     * invalid_request 400, too_large 413, forbidden_origin 403, turnstile_failed 403, rate_limited 429, busy 503 (run slots full: fall back), use_primary 409 (fallback refuses while on-prem is healthy), unavailable 503 (this backend cannot run code now), internal 500.
     */
    code:
      | "invalid_request"
      | "too_large"
      | "forbidden_origin"
      | "turnstile_failed"
      | "rate_limited"
      | "busy"
      | "use_primary"
      | "unavailable"
      | "internal";
    message: string;
  };
}
