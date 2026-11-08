import { createFallback } from "@/lib/fallback/handler";
import { MemoryRunCounter } from "@/lib/fallback/counter";
import { createVercelSandbox } from "@/lib/fallback/vercel";


export const maxDuration = 120;
const counter = new MemoryRunCounter();
const cap = (value: string | undefined, fallback: number) =>
  value !== undefined && /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : fallback;

/** Serve fallback runs using one process-wide quota counter. */
export async function POST(request: Request): Promise<Response> {
  return createFallback({
    hubUrl: process.env.HUB_URL ?? "https://api.jace-s.com",
    development: process.env.NODE_ENV === "development",
    secret: process.env.TURNSTILE_SECRET,
    hourlyCap: cap(process.env.SANDBOX_HOURLY_CAP, 30),
    dailyCap: cap(process.env.SANDBOX_DAILY_CAP, 150),
    counter, fetch, create: createVercelSandbox,
  })(request);
}
