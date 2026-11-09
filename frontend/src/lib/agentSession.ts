// The browser side of the agent session (AI connection). The tab opens a WebSocket to the hub,
// gets a session token for the starter prompt, and then only answers a fixed allow-list of
// messages: it replaces or reports the editor content and shows AI results. It never executes
// anything it receives. Contract: schema/socket-message.schema.json.
import type { CheckResult, RunResult, SocketMessage } from "./contract";

export type AgentTool = "get_code" | "set_code" | "run" | "check";

export type EndReason =
  | "idle" | "expired" | "full" | "ip_limit" | "account_limit" | "turnstile_failed" | "shutdown"
  | "lost" // the socket closed without sessionEnded
  | "error"; // the browser check could not produce a token

export type AgentState =
  | { status: "idle" }
  | { status: "connecting" }
  | {
    status: "connected";
    token: string;
    loggedIn: boolean;
    idleSeconds: number;
    expiresAt: Date;
    lastTool?: AgentTool;
    lastActivity?: Date;
  }
  | { status: "ended"; reason: EndReason };

export interface AgentHandlers {
  /** Synchronously lock editing and execution, or refuse while a browser run is active. */
  onLock(tool: AgentTool): boolean;
  /** Release the active tool lock. Also called when the connection ends. */
  onUnlock(): void;
  /** Current editor content, sent when the AI reads the code or runs it. */
  getCode(): string;
  /** Replace the editor content (AI set_code). */
  setCode(code: string): void;
  onStarted(tool: "run" | "check"): void;
  onRunFinished(result: RunResult): void;
  onCheckFinished(result: CheckResult): void;
  onToolFailed(tool: AgentTool, message: string, errorCode?: string): void;
  onState(state: AgentState): void;
}

export interface AgentOptions {
  /** Fresh Turnstile token for the start message; omit when Turnstile is off. */
  getToken?: () => Promise<string>;
  WebSocket?: typeof WebSocket;
  now?: () => Date;
}

export interface AgentConnection {
  /** Revoke the token and close the socket. */
  disconnect(): void;
}

/** Messages shown when a session ends, by reason. */
export const END_MESSAGE: Record<EndReason, string> = {
  idle: "The AI connection ended because the AI made no calls for a while.",
  expired: "The AI connection reached its maximum time.",
  full: "All AI connections on the server are in use. Try again in a few minutes.",
  ip_limit: "This network already has the maximum number of AI connections. Disconnect another tab first.",
  account_limit: "Your account already has the maximum number of AI connections. Disconnect another tab first.",
  turnstile_failed: "The browser check failed. Try again.",
  shutdown: "The server restarted. Connect again.",
  lost: "The connection to the server was lost.",
  error: "The AI connection could not start. Try again.",
};

const TOOLS: ReadonlySet<string> = new Set(["get_code", "set_code", "run", "check"]);
const REASONS: ReadonlySet<string> = new Set(Object.keys(END_MESSAGE));

/** Parse a hub message, returning null for anything outside the allow-list or malformed. */
export function parseHubMessage(raw: unknown): SocketMessage | null {
  if (typeof raw !== "string") return null;
  let m: Record<string, unknown>;
  try {
    const v = JSON.parse(raw);
    if (!v || typeof v !== "object" || Array.isArray(v)) return null;
    m = v as Record<string, unknown>;
  } catch {
    return null;
  }
  const str = (k: string) => typeof m[k] === "string";
  const obj = (k: string) => !!m[k] && typeof m[k] === "object";
  switch (m.type) {
    case "hello":
      return str("sessionToken") && typeof m.loggedIn === "boolean" && typeof m.idleSeconds === "number" && str("expiresAt")
        ? (m as unknown as SocketMessage) : null;
    case "setCode":
      return str("code") ? (m as unknown as SocketMessage) : null;
    case "getCode":
      return str("requestId") ? (m as unknown as SocketMessage) : null;
    case "toolStarted":
      return str("requestId") && typeof m.tool === "string" && TOOLS.has(m.tool) ? (m as unknown as SocketMessage) : null;
    case "toolFinished":
      return str("requestId") ? (m as unknown as SocketMessage) : null;
    case "runFinished":
    case "checkFinished":
      return obj("result") ? (m as unknown as SocketMessage) : null;
    case "runStarted":
    case "checkStarted":
      return { type: m.type } as SocketMessage;
    case "toolFailed":
      return typeof m.tool === "string" && TOOLS.has(m.tool) && str("message") &&
        (m.errorCode === undefined || typeof m.errorCode === "string") ? (m as unknown as SocketMessage) : null;
    case "aiActivity":
      return typeof m.tool === "string" && TOOLS.has(m.tool) ? (m as unknown as SocketMessage) : null;
    case "sessionEnded":
      return typeof m.reason === "string" && REASONS.has(m.reason) ? (m as unknown as SocketMessage) : null;
    default:
      return null;
  }
}

/** Open an agent session. State changes arrive through handlers.onState. */
export function connectAgent(url: string, handlers: AgentHandlers, options: AgentOptions = {}): AgentConnection {
  const WS = options.WebSocket ?? WebSocket;
  const now = options.now ?? (() => new Date());
  let state: AgentState = { status: "connecting" };
  let finished = false;
  let lockId: string | null = null;
  const unlock = () => {
    if (lockId === null) return;
    lockId = null;
    handlers.onUnlock();
  };
  const set = (next: AgentState) => {
    state = next;
    handlers.onState(next);
  };
  const end = (reason: EndReason) => {
    if (finished) return;
    finished = true;
    unlock();
    set({ status: "ended", reason });
  };
  set(state);

  // The Turnstile token comes first: the hub closes a socket that sends no start within
  // 10 seconds, and an interactive browser check can take longer than that.
  let ws: WebSocket | null = null;
  const send = (m: SocketMessage) => {
    if (ws && ws.readyState === WS.OPEN) ws.send(JSON.stringify(m));
  };
  const open = (turnstileToken: string | undefined) => {
    if (finished) return;
    const socket = new WS(url);
    ws = socket;
    socket.onopen = () => send(turnstileToken ? { type: "start", turnstileToken } : { type: "start" });
    socket.onmessage = onMessage;
    socket.onclose = () => end("lost");
    socket.onerror = () => undefined; // onclose follows
  };
  if (options.getToken) {
    options.getToken().then(open, () => end("error"));
  } else {
    open(undefined);
  }

  function onMessage(event: MessageEvent) {
    if (finished) return;
    const m = parseHubMessage(event.data);
    if (!m) return;
    switch (m.type) {
      case "toolStarted": {
        const accepted = lockId === null && handlers.onLock(m.tool);
        if (accepted) lockId = m.requestId;
        send({ type: "toolReady", requestId: m.requestId, accepted });
        break;
      }
      case "toolFinished":
        if (m.requestId === lockId) unlock();
        break;
      case "hello":
        set({ status: "connected", token: m.sessionToken, loggedIn: m.loggedIn, idleSeconds: m.idleSeconds, expiresAt: new Date(m.expiresAt) });
        break;
      case "setCode":
        if (lockId !== null) handlers.setCode(m.code);
        break;
      case "getCode":
        if (lockId !== null) send({ type: "codeSnapshot", requestId: m.requestId, code: handlers.getCode() });
        break;
      case "runStarted":
        handlers.onStarted("run");
        break;
      case "checkStarted":
        handlers.onStarted("check");
        break;
      case "runFinished":
        handlers.onRunFinished(m.result);
        break;
      case "checkFinished":
        handlers.onCheckFinished(m.result);
        break;
      case "toolFailed":
        handlers.onToolFailed(m.tool, m.message, m.errorCode);
        break;
      case "aiActivity":
        if (state.status === "connected") set({ ...state, lastTool: m.tool, lastActivity: now() });
        break;
      case "sessionEnded":
        end(m.reason);
        break;
    }
  }

  return {
    disconnect() {
      if (finished) return;
      finished = true;
      unlock();
      send({ type: "disconnect" });
      ws?.close();
      set({ status: "idle" });
    },
  };
}

/**
 * The starter prompt the user pastes into a terminal AI agent such as Claude Code or Codex
 * (goose D-0048). It describes the hub's JSON-RPC endpoint as a plain HTTP API called with curl,
 * so no MCP registration is needed, and states the rules for the whole conversation so that
 * follow-up requests also go to the editor. When the API cannot be used it says why and gives the
 * program as a code block to copy (goose D-0049).
 */
export function starterPrompt(token: string, apiUrl: string): string {
  return `For this whole conversation you work on my Goose Playground: an editor open in my browser tab. You reach it only through the HTTP API below, called with curl from your terminal. No MCP setup is needed.

Session token: ${token}

## Rules for every request in this conversation
- Every program I ask for goes into my editor with set_code, then check, then run. This applies to every follow-up request too, not only the first one.
- Do not create source files in this folder or project, and do not paste the program into the chat while the API works. The only file you may write is the temporary JSON body for curl.
- A playground program is one file (main.goose) with fn main(). There is no separate test runner: when I ask for tests, put them in the same program, e.g. test functions called from main that print "PASS <name>" or "FAIL <name>: <details>", and finish with a summary line.
- Make one call at a time and wait for its result. Runs are limited per session, so change the code between runs.
- If a call says the session token is not valid, stop and ask me for a new token.
- After each run, tell me briefly what you did and the output.

## How to call the API
POST ${apiUrl} with header "Content-Type: application/json" and this body:
{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"<tool>","arguments":{...}}}

Build the body with a JSON library (Python json.dump or Node JSON.stringify) so the code is escaped correctly, write it to a temporary file, and send it:
curl -s -X POST ${apiUrl} -H "Content-Type: application/json" --data @body.json

The answer is JSON. The text you need is in result.content[0].text. If result.isError is true, that text explains the problem.

## Tools
- goose_docs {"topic": "..."}: topics playground, tutorial, reference, stdlib, cpp_rust, command_line, spec. A long topic returns its section list; call again with {"topic": "...", "section": "<number or title>"}.
- get_sample {"name": "sieve"}: example programs; without a name, the list.
- get_code {"sessionToken": "<token>"}: the code in my editor.
- set_code {"sessionToken": "<token>", "code": "<whole program>"}: replace my editor content.
- check {"sessionToken": "<token>"}: compile the editor content and return diagnostics.
- run {"sessionToken": "<token>"}: run the editor content and return stdout, stderr and the exit code.

## When the API cannot be used
If you cannot send these requests (for example in a chat app such as ChatGPT or claude.ai, or without a terminal or network access), or a call fails so the program cannot reach my editor:
1. Tell me briefly why, quoting the error if there is one.
2. If you cannot run curl at all, tell me that this prompt needs an agent mode with a terminal, such as Claude Code or Codex; chat mode cannot send these requests.
3. Write the whole requested program in one code block so I can copy it into the editor, and say that it was not checked or run.

Goose is not C, Rust or Go. Before writing code, read goose_docs "playground" and "tutorial", and look up details in "reference" and "stdlib" (dictionaries, vectors, sorting) when you need them. Do not guess syntax; fix every check error before running.

## First step now
Call goose_docs "playground" and get_code to confirm the connection. Then reply with exactly these lines and wait for my request:
Connected to your Goose Playground.
Your editor has <number of lines> lines and starts with \`<first line>\`. (If the editor is empty: Your editor is empty.)
Tell me what to build.
If you cannot make these calls, follow "When the API cannot be used" instead.`;
}
