// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import Playground from "./Playground";

class FakeSocket {
  static OPEN = 1;
  static last: FakeSocket | null = null;
  readyState = 0;
  sent: Record<string, unknown>[] = [];
  closed = false;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public url: string) { FakeSocket.last = this; }
  send(data: string) { this.sent.push(JSON.parse(data)); }
  close() { this.closed = true; }
  hub(m: unknown) { act(() => this.onmessage?.({ data: JSON.stringify(m) })); }
}

const token = "a1".repeat(32);
const hello = { type: "hello", sessionToken: token, loggedIn: false, idleSeconds: 1800, expiresAt: "2026-11-09T03:00:00Z" };

function stubFetch(session: unknown = { error: "UNAUTHENTICATED" }, sessionStatus = 401) {
  const f = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith("/auth/session")) return Response.json(session, { status: sessionStatus });
    if (url.endsWith("/auth/login")) {
      const body = JSON.parse(String(init?.body));
      return body.password === "right"
        ? Response.json({ user: { id: "u1", username: body.username }, csrfToken: "c1" })
        : Response.json({ error: "INVALID_CREDENTIALS" }, { status: 401 });
    }
    if (url.endsWith("/auth/google/config")) return Response.json({ enabled: false, clientId: null });
    return Response.json({ runner: "up", freeRunSlots: 2, agentAvailable: true });
  });
  vi.stubGlobal("fetch", f);
  return f;
}

beforeEach(() => {
  vi.stubGlobal("WebSocket", FakeSocket);
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) { this.setAttribute("open", ""); };
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); FakeSocket.last = null; });

async function connect() {
  const button = await screen.findByRole("button", { name: "Connect AI" });
  await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(button);
  const ws = FakeSocket.last!;
  expect(ws.url).toBe("wss://api.jace-s.com/goose/session");
  ws.readyState = 1;
  await act(async () => { ws.onopen?.(); });
  expect(ws.sent).toEqual([{ type: "start" }]);
  ws.hub(hello);
  return ws;
}

it("opens no socket until Connect AI, then shows the starter prompt with the token", async () => {
  stubFetch();
  render(<Playground />);
  await screen.findByRole("button", { name: "Connect AI" });
  expect(FakeSocket.last).toBeNull();
  await connect();
  const prompt = screen.getByLabelText("Starter prompt") as HTMLTextAreaElement;
  expect(prompt.value).toContain(`Session token: ${token}`);
  expect(prompt.value).toContain("https://api.jace-s.com/goose/mcp");
  expect(screen.getByText(/Waiting for the AI/)).toBeTruthy();
});

it("lets the AI replace and read the editor and shows its run", async () => {
  stubFetch();
  render(<Playground />);
  const ws = await connect();
  ws.hub({ type: "aiActivity", tool: "set_code" });
  ws.hub({ type: "toolStarted", requestId: "t1", tool: "set_code" });
  ws.hub({ type: "setCode", code: "fn main() { print(2); }" });
  expect((screen.getByRole("textbox", { name: "" }) as HTMLTextAreaElement).value).toBe("fn main() { print(2); }");
  expect(screen.getByText(/AI connected: changed the code/)).toBeTruthy();
  ws.hub({ type: "toolFinished", requestId: "t1" });
  ws.hub({ type: "toolStarted", requestId: "t2", tool: "run" });
  ws.hub({ type: "getCode", requestId: "r1" });
  expect(ws.sent.at(-1)).toEqual({ type: "codeSnapshot", requestId: "r1", code: "fn main() { print(2); }" });
  ws.hub({ type: "runStarted" });
  expect(screen.getByText("AI is running the code…")).toBeTruthy();
  ws.hub({ type: "runFinished", result: { outcome: "exited", exitCode: 0, stdout: "2\n", stderr: "", diagnostics: [], truncated: false, durationMs: 5, backend: "onprem" } });
  expect(screen.getByText(/AI · Exited with code 0/)).toBeTruthy();
  ws.hub({ type: "toolFinished", requestId: "t2" });
  ws.hub({ type: "toolStarted", requestId: "t3", tool: "check" });
  ws.hub({ type: "checkFinished", result: { outcome: "compile_error", diagnostics: [{ severity: "error", message: "expression expected", line: 1, col: 23 }], durationMs: 4 } });
  expect(screen.getByText(/AI · Compile error/)).toBeTruthy();
  expect(screen.getByText(/line 1:23: expression expected/)).toBeTruthy();
});

it("disconnects on request and explains an ended session", async () => {
  stubFetch();
  render(<Playground />);
  let ws = await connect();
  fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));
  expect(ws.sent.at(-1)).toEqual({ type: "disconnect" });
  expect(ws.closed).toBe(true);
  ws = await connect();
  ws.hub({ type: "sessionEnded", reason: "idle" });
  expect(screen.getByText(/made no calls for a while/)).toBeTruthy();
  expect(screen.getByRole("button", { name: "Connect again" })).toBeTruthy();
});

it("logs in from the header and shows the account", async () => {
  const f = stubFetch();
  render(<Playground />);
  fireEvent.click(await screen.findByRole("button", { name: "Log in" }));
  fireEvent.change(screen.getByLabelText("Username"), { target: { value: "jace" } });
  const dialog = within(screen.getByRole("dialog"));
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "wrong" } });
  fireEvent.click(dialog.getByRole("button", { name: "Log in" }));
  expect(await screen.findByText("The username or password is incorrect.")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "right" } });
  fireEvent.click(dialog.getByRole("button", { name: "Log in" }));
  expect(await screen.findByRole("button", { name: "Log out" })).toBeTruthy();
  expect(screen.getByText("jace")).toBeTruthy();
  const login = f.mock.calls.find(([url]) => String(url).endsWith("/auth/login")) as unknown as [string, RequestInit];
  expect(login[1].credentials).toBe("include");
  expect(screen.getByText(/a connection lasts up to 8 hours/)).toBeTruthy();
});

it("locks editing, sample replacement and mouse or keyboard runs only for the active AI call", async () => {
  const f = stubFetch();
  render(<Playground />);
  const ws = await connect();
  const editor = screen.getByRole("textbox", { name: "" }) as HTMLTextAreaElement;
  const run = screen.getByRole("button", { name: "Run" }) as HTMLButtonElement;
  const picker = screen.getByLabelText("Sample") as HTMLSelectElement;
  expect(editor.readOnly).toBe(false);
  ws.hub({ type: "toolStarted", requestId: "t1", tool: "run" });
  expect(editor.readOnly).toBe(true);
  expect(run.disabled).toBe(true);
  expect(picker.disabled).toBe(true);
  const original = editor.value;
  fireEvent.change(editor, { target: { value: "manual edit" } });
  fireEvent.change(picker, { target: { value: "07_sieve" } });
  fireEvent.click(run);
  fireEvent.keyDown(editor, { key: "Enter", ctrlKey: true });
  expect(editor.value).toBe(original);
  expect(f.mock.calls.some(([url]) => url.endsWith("/goose/run"))).toBe(false);
  ws.hub({ type: "toolFailed", tool: "set_code", errorCode: "busy", message: "Another AI tool is using this editor." });
  expect(screen.getByText("Another AI tool is using this editor.")).toBeTruthy();
  ws.hub({ type: "toolFinished", requestId: "other" });
  expect(editor.readOnly).toBe(true);
  ws.hub({ type: "toolFinished", requestId: "t1" });
  expect(editor.readOnly).toBe(false);
  expect(run.disabled).toBe(false);
  expect(picker.disabled).toBe(false);
  fireEvent.change(editor, { target: { value: "manual edit" } });
  expect(editor.value).toBe("manual edit");
});

it("shows pre-execution quota failures and unlocks on failure cleanup or disconnection", async () => {
  stubFetch(); render(<Playground />);
  const ws = await connect();
  const editor = screen.getByRole("textbox", { name: "" }) as HTMLTextAreaElement;
  ws.hub({ type: "toolStarted", requestId: "t1", tool: "check" });
  ws.hub({ type: "toolFailed", tool: "check", errorCode: "rate_limited", message: "Try again in 40 seconds." });
  expect(screen.getByText("Try again in 40 seconds.")).toBeTruthy();
  ws.hub({ type: "toolFinished", requestId: "t1" });
  expect(editor.readOnly).toBe(false);
  ws.hub({ type: "toolStarted", requestId: "t2", tool: "get_code" });
  act(() => ws.onclose?.());
  expect(editor.readOnly).toBe(false);
  expect((screen.getByRole("button", { name: "Run" }) as HTMLButtonElement).disabled).toBe(false);
});

it("refuses AI edits during a browser run without replacing that run's output", async () => {
  let finishRun!: (response: Response) => void;
  const f = stubFetch();
  const defaultFetch = f.getMockImplementation()!;
  f.mockImplementation((url, init) => url.endsWith("/goose/run")
    ? new Promise<Response>((resolve) => { finishRun = resolve; }) : defaultFetch(url, init));
  render(<Playground />);
  const ws = await connect();
  fireEvent.click(screen.getByRole("button", { name: "Run" }));
  ws.hub({ type: "toolStarted", requestId: "t1", tool: "set_code" });
  expect(ws.sent.at(-1)).toEqual({ type: "toolReady", requestId: "t1", accepted: false });
  expect(screen.getByText(/The user is running code/)).toBeTruthy();
  ws.hub({ type: "toolFinished", requestId: "t1" });
  ws.hub({ type: "toolFailed", tool: "set_code", errorCode: "busy", message: "The user is running code in the playground. Wait for that run to finish before trying again." });
  await waitFor(() => expect(typeof finishRun).toBe("function"));
  await act(async () => finishRun(Response.json({ outcome: "exited", exitCode: 0, stdout: "browser result", stderr: "", diagnostics: [], truncated: false, durationMs: 5, backend: "onprem" })));
  expect(screen.getByText("browser result")).toBeTruthy();
  expect(screen.getByText(/Exited with code 0/).textContent).not.toContain("AI ·");
});

it("shows the signed-in account on load", async () => {
  stubFetch({ user: { id: "u1", username: "jace", displayName: "Jace" }, csrfToken: "c" }, 200);
  render(<Playground />);
  expect(await screen.findByText("Jace")).toBeTruthy();
});
