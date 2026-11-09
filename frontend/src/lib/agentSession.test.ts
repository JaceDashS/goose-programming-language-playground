import { describe, expect, it, vi } from "vitest";
import { connectAgent, parseHubMessage, starterPrompt, type AgentHandlers, type AgentState } from "./agentSession";

class FakeSocket {
  static OPEN = 1;
  static last: FakeSocket;
  readyState = 0;
  sent: unknown[] = [];
  closed = false;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public url: string) { FakeSocket.last = this; }
  send(data: string) { this.sent.push(JSON.parse(data)); }
  close() { this.closed = true; }
  open() { this.readyState = 1; this.onopen?.(); }
  hub(m: unknown) { this.onmessage?.({ data: typeof m === "string" ? m : JSON.stringify(m) }); }
}

function setup(getToken?: () => Promise<string>) {
  let editor = "fn main() {}";
  const states: AgentState[] = [];
  const handlers: AgentHandlers = {
    onLock: vi.fn(() => true),
    onUnlock: vi.fn(),
    getCode: () => editor,
    setCode: vi.fn((c: string) => { editor = c; }),
    onStarted: vi.fn(),
    onRunFinished: vi.fn(),
    onCheckFinished: vi.fn(),
    onToolFailed: vi.fn(),
    onState: (s) => states.push(s),
  };
  const conn = connectAgent("wss://hub/goose/session", handlers, {
    WebSocket: FakeSocket as unknown as typeof WebSocket,
    getToken,
    now: () => new Date("2026-11-09T01:00:00Z"),
  });
  return { conn, handlers, states, ws: FakeSocket.last, editor: () => editor };
}

const flush = () => new Promise((r) => setTimeout(r, 0));
const hello = { type: "hello", sessionToken: "a".repeat(64), loggedIn: false, idleSeconds: 1800, expiresAt: "2026-11-09T03:00:00Z" };

describe("connectAgent", () => {
  it("acknowledges one lock and ignores unrelated failures and stale unlocks", async () => {
    const { ws, handlers } = setup();
    ws.open(); await flush(); ws.hub(hello);
    ws.hub({ type: "toolStarted", requestId: "t1", tool: "run" });
    expect(ws.sent.at(-1)).toEqual({ type: "toolReady", requestId: "t1", accepted: true });
    ws.hub({ type: "toolStarted", requestId: "t2", tool: "set_code" });
    expect(ws.sent.at(-1)).toEqual({ type: "toolReady", requestId: "t2", accepted: false });
    ws.hub({ type: "toolFailed", tool: "set_code", errorCode: "busy", message: "Wait for the active call." });
    ws.hub({ type: "toolFinished", requestId: "t2" });
    expect(handlers.onUnlock).not.toHaveBeenCalled();
    ws.hub({ type: "toolFinished", requestId: "t1" });
    expect(handlers.onUnlock).toHaveBeenCalledOnce();
    ws.hub({ type: "setCode", code: "unsolicited" });
    expect(handlers.setCode).not.toHaveBeenCalled();
  });

  it("rejects the lock when the browser is busy and releases accepted locks on connection end", async () => {
    for (const mode of ["close", "disconnect", "sessionEnded"]) {
      const { ws, handlers, conn } = setup();
      ws.open(); await flush(); ws.hub(hello);
      vi.mocked(handlers.onLock).mockReturnValueOnce(false);
      ws.hub({ type: "toolStarted", requestId: "t1", tool: "set_code" });
      expect(ws.sent.at(-1)).toEqual({ type: "toolReady", requestId: "t1", accepted: false });
      ws.hub({ type: "toolStarted", requestId: "t2", tool: "check" });
      if (mode === "close") ws.onclose?.();
      if (mode === "disconnect") conn.disconnect();
      if (mode === "sessionEnded") ws.hub({ type: "sessionEnded", reason: "shutdown" });
      expect(handlers.onUnlock).toHaveBeenCalledOnce();
    }
  });

  it("gets the Turnstile token before opening the socket, then sends start and reports the session", async () => {
    FakeSocket.last = null as unknown as FakeSocket;
    let resolve!: (t: string) => void;
    const { states } = setup(() => new Promise<string>((r) => { resolve = r; }));
    expect(states.at(-1)).toEqual({ status: "connecting" });
    // No socket while the browser check is pending, so a slow check cannot hit the hub's start timeout.
    expect(FakeSocket.last).toBeNull();
    resolve("tok");
    await flush();
    const ws = FakeSocket.last;
    ws.open();
    await flush();
    expect(ws.sent).toEqual([{ type: "start", turnstileToken: "tok" }]);
    ws.hub(hello);
    expect(states.at(-1)).toMatchObject({ status: "connected", token: "a".repeat(64), loggedIn: false, idleSeconds: 1800 });
  });

  it("applies setCode, answers getCode with the editor and shows results", async () => {
    const { ws, handlers, editor } = setup();
    ws.open();
    await flush();
    ws.hub(hello);
    ws.hub({ type: "toolStarted", requestId: "t1", tool: "set_code" });
    ws.hub({ type: "setCode", code: "fn main() { print(2); }" });
    expect(editor()).toBe("fn main() { print(2); }");
    ws.hub({ type: "toolFinished", requestId: "t1" });
    ws.hub({ type: "toolStarted", requestId: "t2", tool: "run" });
    ws.hub({ type: "getCode", requestId: "r1" });
    expect(ws.sent.at(-1)).toEqual({ type: "codeSnapshot", requestId: "r1", code: "fn main() { print(2); }" });
    ws.hub({ type: "runStarted" });
    expect(handlers.onStarted).toHaveBeenCalledWith("run");
    const result = { outcome: "exited", exitCode: 0, stdout: "2\n", stderr: "", diagnostics: [], truncated: false, durationMs: 5, backend: "onprem" };
    ws.hub({ type: "runFinished", result });
    expect(handlers.onRunFinished).toHaveBeenCalledWith(result);
    ws.hub({ type: "toolFailed", tool: "check", message: "busy" });
    expect(handlers.onToolFailed).toHaveBeenCalledWith("check", "busy", undefined);
  });

  it("records AI activity", async () => {
    const { ws, states } = setup();
    ws.open();
    await flush();
    ws.hub(hello);
    ws.hub({ type: "aiActivity", tool: "set_code" });
    expect(states.at(-1)).toMatchObject({ status: "connected", lastTool: "set_code" });
  });

  it("drops anything outside the allow-list", async () => {
    const { ws, handlers } = setup();
    ws.open();
    await flush();
    ws.hub(hello);
    ws.hub("not json");
    ws.hub({ type: "eval", code: "alert(1)" });
    ws.hub({ type: "setCode", code: 42 });
    expect(handlers.setCode).not.toHaveBeenCalled();
  });

  it("ends with the hub's reason, or lost when the socket just closes", async () => {
    const a = setup();
    a.ws.open();
    await flush();
    a.ws.hub({ type: "sessionEnded", reason: "idle" });
    a.ws.onclose?.();
    expect(a.states.at(-1)).toEqual({ status: "ended", reason: "idle" });
    const b = setup();
    b.ws.open();
    await flush();
    b.ws.onclose?.();
    expect(b.states.at(-1)).toEqual({ status: "ended", reason: "lost" });
  });

  it("disconnect revokes the token and returns to idle", async () => {
    const { ws, conn, states } = setup();
    ws.open();
    await flush();
    ws.hub(hello);
    conn.disconnect();
    expect(ws.sent.at(-1)).toEqual({ type: "disconnect" });
    expect(ws.closed).toBe(true);
    ws.onclose?.();
    expect(states.at(-1)).toEqual({ status: "idle" });
  });

  it("opens no socket when Disconnect comes before the browser check finishes", async () => {
    FakeSocket.last = null as unknown as FakeSocket;
    let resolve!: (t: string) => void;
    const { conn, states } = setup(() => new Promise<string>((r) => { resolve = r; }));
    conn.disconnect();
    resolve("tok");
    await flush();
    expect(FakeSocket.last).toBeNull();
    expect(states.at(-1)).toEqual({ status: "idle" });
  });

  it("ends with error when the browser check fails", async () => {
    FakeSocket.last = null as unknown as FakeSocket;
    const { states } = setup(async () => { throw new Error("no"); });
    await flush();
    expect(FakeSocket.last).toBeNull();
    expect(states.at(-1)).toEqual({ status: "ended", reason: "error" });
  });
});

describe("parseHubMessage", () => {
  it("accepts only known hub messages with the right fields", () => {
    expect(parseHubMessage(JSON.stringify({ type: "runStarted", extra: 1 }))).toEqual({ type: "runStarted" });
    expect(parseHubMessage(JSON.stringify({ type: "sessionEnded", reason: "nope" }))).toBeNull();
    expect(parseHubMessage(JSON.stringify({ type: "codeSnapshot", requestId: "r", code: "" }))).toBeNull();
    expect(parseHubMessage(JSON.stringify([1]))).toBeNull();
  });
});

it("starter prompt gives the token, the curl API and rules that hold for follow-up requests", () => {
  const p = starterPrompt("t".repeat(64), "https://api.jace-s.com/goose/mcp");
  expect(p).toContain("Session token: " + "t".repeat(64));
  expect(p).toContain("POST https://api.jace-s.com/goose/mcp");
  expect(p).toContain("curl -s -X POST https://api.jace-s.com/goose/mcp");
  expect(p).toContain("No MCP setup is needed");
  expect(p).toContain("do not paste the program into the chat while the API works");
  expect(p).toContain("## When the API cannot be used");
  expect(p).toContain("this prompt needs an agent mode with a terminal, such as Claude Code or Codex");
  expect(p).toContain("Write the whole requested program in one code block");
  expect(p).toContain('follow "When the API cannot be used" instead');
  expect(p).toContain("This applies to every follow-up request too");
  expect(p).toContain("There is no separate test runner");
  for (const tool of ["goose_docs", "get_sample", "get_code", "set_code", "check", "run"]) expect(p).toContain(`- ${tool} {`);
  expect(p).toContain('reply only "Connected"');
  // The page is English: the prompt must not carry text from the browser's language.
  expect(p).toMatch(/^[\x20-\x7e\n]*$/);
});
