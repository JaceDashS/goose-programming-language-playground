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

  it("sends no token field when Turnstile is not configured", async () => {
    const bodies: unknown[] = [];
    const f = (async (_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(init.body as string));
      return Response.json(result("onprem"));
    }) as unknown as typeof fetch;
    await runGoose("x", endpoints, { fetch: f });
    expect(bodies).toEqual([{ code: "x" }]);
  });

  it("asks for a fresh token for the fallback after a busy primary", async () => {
    const sent: Array<[string, unknown]> = [];
    const replies: Record<string, Response[]> = {
      [endpoints.primary]: [Response.json(err("busy"), { status: 503 })],
      [endpoints.fallback]: [Response.json(result("sandbox"))],
    };
    const f = (async (url: string, init: RequestInit) => {
      sent.push([url, JSON.parse(init.body as string).turnstileToken]);
      return replies[url].shift()!;
    }) as unknown as typeof fetch;
    let n = 0;
    const getToken = async () => `token-${++n}`;
    const out = await runGoose("x", endpoints, { fetch: f, getToken });
    expect(out).toMatchObject({ kind: "result", state: "degraded" });
    expect(sent).toEqual([[endpoints.primary, "token-1"], [endpoints.fallback, "token-2"]]);
  });

  it("uses a third token when the fallback sends it back to the primary", async () => {
    const tokens: unknown[] = [];
    const replies: Record<string, Response[]> = {
      [endpoints.primary]: [Response.json(err("busy"), { status: 503 }), Response.json(result("onprem"))],
      [endpoints.fallback]: [Response.json(err("use_primary"), { status: 409 })],
    };
    const f = (async (url: string, init: RequestInit) => {
      tokens.push(JSON.parse(init.body as string).turnstileToken);
      return replies[url].shift()!;
    }) as unknown as typeof fetch;
    let n = 0;
    await runGoose("x", endpoints, { fetch: f, getToken: async () => `t${++n}` });
    expect(tokens).toEqual(["t1", "t2", "t3"]);
  });

  it("reports turnstile_failed without sending when no token can be obtained", async () => {
    const { f, calls } = fakeFetch({});
    const out = await runGoose("x", endpoints, {
      fetch: f,
      getToken: async () => { throw new Error("The browser check timed out."); },
    });
    expect(out).toMatchObject({ kind: "error", code: "turnstile_failed", message: "The browser check timed out.", state: "normal" });
    expect(calls).toEqual([]);
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
