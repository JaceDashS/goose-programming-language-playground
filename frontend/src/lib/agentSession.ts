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
  /** Current editor content, sent when the AI reads the code or runs it. */
  getCode(): string;
  /** Replace the editor content (AI set_code). */
  setCode(code: string): void;
  onStarted(tool: "run" | "check"): void;
  onRunFinished(result: RunResult): void;
  onCheckFinished(result: CheckResult): void;
  onToolFailed(tool: "run" | "check", message: string): void;
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
    case "runFinished":
    case "checkFinished":
      return obj("result") ? (m as unknown as SocketMessage) : null;
    case "runStarted":
    case "checkStarted":
      return { type: m.type } as SocketMessage;
    case "toolFailed":
      return (m.tool === "run" || m.tool === "check") && str("message") ? (m as unknown as SocketMessage) : null;
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
  const set = (next: AgentState) => {
    state = next;
    handlers.onState(next);
  };
  const end = (reason: EndReason) => {
    if (finished) return;
    finished = true;
    set({ status: "ended", reason });
  };
  set(state);

  const ws = new WS(url);
  const send = (m: SocketMessage) => {
    if (ws.readyState === WS.OPEN) ws.send(JSON.stringify(m));
  };

  ws.onopen = async () => {
    let turnstileToken: string | undefined;
    if (options.getToken) {
      try {
        turnstileToken = await options.getToken();
      } catch {
        end("error");
        ws.close();
        return;
      }
    }
    send(turnstileToken ? { type: "start", turnstileToken } : { type: "start" });
  };

  ws.onmessage = (event: MessageEvent) => {
    if (finished) return;
    const m = parseHubMessage(event.data);
    if (!m) return;
    switch (m.type) {
      case "hello":
        set({ status: "connected", token: m.sessionToken, loggedIn: m.loggedIn, idleSeconds: m.idleSeconds, expiresAt: new Date(m.expiresAt) });
        break;
      case "setCode":
        handlers.setCode(m.code);
        break;
      case "getCode":
        send({ type: "codeSnapshot", requestId: m.requestId, code: handlers.getCode() });
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
        handlers.onToolFailed(m.tool, m.message);
        break;
      case "aiActivity":
        if (state.status === "connected") set({ ...state, lastTool: m.tool, lastActivity: now() });
        break;
      case "sessionEnded":
        end(m.reason);
        break;
    }
  };

  ws.onclose = () => end("lost");
  ws.onerror = () => undefined; // onclose follows

  return {
    disconnect() {
      if (finished) return;
      finished = true;
      send({ type: "disconnect" });
      ws.close();
      set({ status: "idle" });
    },
  };
}

/** The starter prompt the user pastes into the AI (goose D-0039). */
export function starterPrompt(token: string, mcpUrl: string): string {
  return [
    `You are connected to my Goose Playground editor through the "goose-playground" MCP server (${mcpUrl}).`,
    `Session token: ${token}`,
    "Call goose_docs first (topic \"playground\", then \"tutorial\"). Write code with set_code, then use check and run.",
    "Edit the code in my editor; do not paste code into the chat.",
  ].join("\n");
}
