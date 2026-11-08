import { describe, expect, it } from "vitest";
import type { RunResult } from "./contract";
import { runGoose } from "./runGoose";
import { agentAllowed, recheckDelayMs, stateFromHealth } from "./serviceState";

const endpoints = { primary: "https://api.example/goose/run", fallback: "/api/run" };

const result = (backend: "onprem" | "sandbox"): RunResult => ({
  outcome: "exited",
  exitCode: 0,
  stdout: "hi\n",
  stderr: "",
  diagnostics: [],
  truncated: false,
  durationMs: 5,
  backend,
});

type Reply = { status: number; body?: unknown } | "network";

/** A fetch that answers each URL from its own queue and records the calls. */
function fakeFetch(replies: Record<string, Reply[]>) {
  const calls: string[] = [];
  const f = (async (url: string) => {
    calls.push(url);
    const r = replies[url]?.shift();
    if (!r || r === "network") throw new TypeError("Failed to fetch");
    return new Response(r.body === undefined ? "<html>bad gateway</html>" : JSON.stringify(r.body), {
      status: r.status,
    });
  }) as unknown as typeof fetch;
  return { f, calls };
}

const err = (code: string) => ({ error: { code, message: code } });

describe("runGoose", () => {
  it("uses the primary when it answers", async () => {
    const { f, calls } = fakeFetch({ [endpoints.primary]: [{ status: 200, body: result("onprem") }] });
    const out = await runGoose("x", endpoints, { fetch: f });
    expect(out).toMatchObject({ kind: "result", state: "normal", result: { backend: "onprem" } });
    expect(calls).toEqual([endpoints.primary]);
  });

  it.each([
    ["busy", { status: 503, body: err("busy") }],
    ["unavailable", { status: 503, body: err("unavailable") }],
    ["gateway 502 without JSON", { status: 502 }],
    ["network failure", "network"],
  ] as const)("falls back on %s", async (_name, reply) => {
    const { f, calls } = fakeFetch({
      [endpoints.primary]: [reply as Reply],
      [endpoints.fallback]: [{ status: 200, body: result("sandbox") }],
    });
    const out = await runGoose("x", endpoints, { fetch: f });
    expect(out).toMatchObject({ kind: "result", state: "degraded", result: { backend: "sandbox" } });
    expect(calls).toEqual([endpoints.primary, endpoints.fallback]);
  });

  it.each(["rate_limited", "turnstile_failed", "too_large", "forbidden_origin"])(
    "does not fall back on %s",
    async (code) => {
      const { f, calls } = fakeFetch({ [endpoints.primary]: [{ status: 400, body: err(code) }] });
      const out = await runGoose("x", endpoints, { fetch: f });
      expect(out).toMatchObject({ kind: "error", code, state: "normal" });
      expect(calls).toEqual([endpoints.primary]);
    },
  );

  it("retries the primary once when the fallback says use_primary", async () => {
    const { f, calls } = fakeFetch({
      [endpoints.primary]: ["network", { status: 200, body: result("onprem") }],
      [endpoints.fallback]: [{ status: 409, body: err("use_primary") }],
    });
    const out = await runGoose("x", endpoints, { fetch: f });
    expect(out).toMatchObject({ kind: "result", state: "normal" });
    expect(calls).toEqual([endpoints.primary, endpoints.fallback, endpoints.primary]);
  });

  it("reports an outage when both are unavailable", async () => {
    const { f } = fakeFetch({
      [endpoints.primary]: ["network"],
      [endpoints.fallback]: [{ status: 503, body: err("unavailable") }],
    });
    const out = await runGoose("x", endpoints, { fetch: f });
    expect(out).toMatchObject({ kind: "error", state: "outage" });
  });
});

describe("service state", () => {
  it("is normal only with the runner up and a free slot", () => {
    expect(stateFromHealth({ runner: "up", freeRunSlots: 1, agentAvailable: true }, false)).toBe("normal");
    expect(stateFromHealth({ runner: "up", freeRunSlots: 0, agentAvailable: true }, false)).toBe("degraded");
    expect(stateFromHealth({ runner: "down", freeRunSlots: 0, agentAvailable: false }, false)).toBe("degraded");
    expect(stateFromHealth(null, false)).toBe("degraded");
    expect(stateFromHealth(null, true)).toBe("outage");
  });

  it("offers the AI connection only when normal and the hub allows it", () => {
    const h = { runner: "up" as const, freeRunSlots: 1, agentAvailable: true };
    expect(agentAllowed("normal", h)).toBe(true);
    expect(agentAllowed("degraded", h)).toBe(false);
    expect(agentAllowed("normal", { ...h, agentAvailable: false })).toBe(false);
  });

  it("backs off while not normal", () => {
    expect([0, 1, 2, 3, 4, 5].map((n) => recheckDelayMs("degraded", n))).toEqual([
      5_000, 10_000, 20_000, 40_000, 60_000, 60_000,
    ]);
    expect(recheckDelayMs("normal", 3)).toBe(5_000);
  });
});
