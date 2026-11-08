// Vercel fallback for runs (D-0001, D-0010). Not implemented yet: it always answers
// `unavailable`, which the browser shows as an outage. The implementation must follow
// docs/specs/run/30-vercel-fallback.md.
import type { ErrorResponse } from "@/lib/contract";

export async function POST(): Promise<Response> {
  const body: ErrorResponse = {
    error: { code: "unavailable", message: "The backup run server is not available yet." },
  };
  return Response.json(body, { status: 503 });
}
