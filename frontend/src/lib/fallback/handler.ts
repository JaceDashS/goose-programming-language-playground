import type { ErrorCode, ErrorResponse } from "../contract";
import { MAX_CODE_BYTES } from "../contract";
import type { RunCounter } from "./counter";
import { executeSandbox, type RunSandbox } from "./execute";

/** Dependencies keep network calls, quota admission and sandbox lifecycle independently testable. */
export interface FallbackOptions {
  hubUrl: string; development: boolean; secret?: string;
  hourlyCap: number; dailyCap: number; counter: RunCounter;
  fetch: typeof fetch; create(): Promise<RunSandbox>;
}
const failure = (status: number, code: ErrorCode, message: string) =>
  Response.json({ error: { code, message } } satisfies ErrorResponse, { status });

/** Validate requests, refuse healthy-primary traffic and admit one isolated fallback run. */
export function createFallback(options: FallbackOptions) {
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get("origin");
    if (origin !== "https://goose-playground.jace-s.com" && !(options.development && origin === "http://localhost:3000"))
      return failure(403, "forbidden_origin", "This origin may not run code.");
    let body;
    try { body = await request.json(); }
    catch { return failure(400, "invalid_request", "The body must be a RunRequest JSON object."); }
    if (!body || typeof body !== "object" || Array.isArray(body) || typeof body.code !== "string" ||
      (body.turnstileToken !== undefined && typeof body.turnstileToken !== "string") ||
      Object.keys(body).some(key => key !== "code" && key !== "turnstileToken"))
      return failure(400, "invalid_request", "The body must be a RunRequest JSON object.");
    if (Buffer.byteLength(body.code, "utf8") > MAX_CODE_BYTES)
      return failure(413, "too_large", "The code is larger than 65536 bytes.");
    if (options.secret && !await verify(options, body.turnstileToken))
      return failure(403, "turnstile_failed", "The Turnstile check failed.");
    try {
      const response = await options.fetch(`${options.hubUrl.replace(/\/$/, "")}/goose/health`, {
        cache: "no-store", signal: AbortSignal.timeout(2000),
      });
      if (response.ok) {
        const health = await response.json();
        if (health.runner === "up" && health.freeRunSlots > 0)
          return failure(409, "use_primary", "The primary run server is available.");
      }
    } catch { /* Unreachable primary permits fallback admission. */ }
    try {
      if (!await options.counter.take(Date.now(), options.hourlyCap, options.dailyCap))
        return failure(503, "unavailable", "The backup run quota is exhausted.");
      const sandbox = await options.create();
      return Response.json(await executeSandbox(sandbox, body.code));
    } catch {
      return failure(503, "unavailable", "The backup run server is unavailable.");
    }
  };
}

async function verify(options: FallbackOptions, token?: string): Promise<boolean> {
  if (!token) return false;
  try {
    const response = await options.fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST", signal: AbortSignal.timeout(5000),
      body: new URLSearchParams({ secret: options.secret!, response: token }),
    });
    return response.ok && (await response.json()).success === true;
  } catch { return false; }
}
