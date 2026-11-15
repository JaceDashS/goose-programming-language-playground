// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import Playground from "./Playground";
import { samples } from "../samples";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ runner: "up", freeRunSlots: 1, agentAvailable: true })));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it("starts with hello and selects an unedited sample without confirmation", () => {
  const confirm = vi.spyOn(window, "confirm");
  render(<Playground />);
  expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toContain("Hello, Goose!");
  fireEvent.change(screen.getByLabelText("Sample"), { target: { value: "07_sieve" } });
  expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe(samples.find(s => s.name === "07_sieve")!.code);
  expect(confirm).not.toHaveBeenCalled();
});
it("keeps edits on cancel and replaces them only on confirmation", () => {
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  render(<Playground />);
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "my edits" } });
  fireEvent.change(screen.getByLabelText("Sample"), { target: { value: "07_sieve" } });
  expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("my edits");
  expect(confirm).toHaveBeenCalledWith("Replace your code with the sample?");
  confirm.mockReturnValue(true);
  fireEvent.change(screen.getByLabelText("Sample"), { target: { value: "07_sieve" } });
  expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe(samples.find(s => s.name === "07_sieve")!.code);
});

it("restores shared Korean code and copies the current editor as a URL", async () => {
  const { Blob } = await import("node:buffer");
  vi.stubGlobal("Blob", Blob);
  const { encodeShare, decodeShare } = await import("../lib/share");
  const { waitFor } = await import("@testing-library/react");
  const code = 'fn main() { print("안녕"); }';
  window.history.replaceState(null, "", new URL(await encodeShare(code, window.location.href)).hash);
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  render(<Playground />);
  await waitFor(() => expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe(code));
  fireEvent.click(screen.getByRole("button", { name: "Share" }));
  await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
  expect(await decodeShare(new URL(writeText.mock.calls[0][0]).hash)).toBe(code);
  window.history.replaceState(null, "", "/");
});
it("runs without loading Turnstile when no site key is built in", async () => {
  const { waitFor } = await import("@testing-library/react");
  const fetchMock = vi.fn(async (url: string) => url.endsWith("/goose/run")
    ? Response.json({ outcome: "exited", exitCode: 0, stdout: "Hello, Goose!\n", stderr: "", diagnostics: [], truncated: false, durationMs: 1, backend: "onprem" })
    : Response.json({ runner: "up", freeRunSlots: 1, agentAvailable: true }));
  vi.stubGlobal("fetch", fetchMock);
  render(<Playground />);
  fireEvent.click(screen.getByRole("button", { name: "Run" }));
  await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/goose/run"))).toBe(true));
  const runCall = fetchMock.mock.calls.find(([url]) => String(url).endsWith("/goose/run")) as unknown as [string, RequestInit];
  expect(JSON.parse(runCall[1].body as string)).not.toHaveProperty("turnstileToken");
  expect(document.querySelector('script[src*="challenges.cloudflare.com"]')).toBeNull();
});
it("sends a Turnstile token from the widget when a site key is built in", async () => {
  const { waitFor } = await import("@testing-library/react");
  vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "site-key");
  let callback: (token: string) => void = () => undefined;
  vi.stubGlobal("turnstile", {
    render: vi.fn((_box: HTMLElement, opts: { callback: (token: string) => void }) => { callback = opts.callback; return "w1"; }),
    reset: vi.fn(),
    execute: vi.fn(() => callback("token-from-widget")),
    remove: vi.fn(),
  });
  const fetchMock = vi.fn(async (url: string) => url.endsWith("/goose/run")
    ? Response.json({ outcome: "exited", exitCode: 0, stdout: "", stderr: "", diagnostics: [], truncated: false, durationMs: 1, backend: "onprem" })
    : Response.json({ runner: "up", freeRunSlots: 1, agentAvailable: true }));
  vi.stubGlobal("fetch", fetchMock);
  render(<Playground />);
  fireEvent.click(screen.getByRole("button", { name: "Run" }));
  await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/goose/run"))).toBe(true));
  const runCall = fetchMock.mock.calls.find(([url]) => String(url).endsWith("/goose/run")) as unknown as [string, RequestInit];
  expect(JSON.parse(runCall[1].body as string).turnstileToken).toBe("token-from-widget");
});
it("keeps hello and explains an invalid shared link", async () => {
  const { waitFor } = await import("@testing-library/react");
  window.history.replaceState(null, "", "#code=@@");
  render(<Playground />);
  await waitFor(() => expect(screen.getByText("This link could not be opened.")).toBeTruthy());
  expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toContain("Hello, Goose!");
  window.history.replaceState(null, "", "/");
});
it("opens feedback inside the app, retains a rate limited draft and retries successfully", async () => {
  const { waitFor, within } = await import("@testing-library/react");
  let attempts = 0;
  const fetchMock = vi.fn(async (url: string) => {
    if (String(url).endsWith("/auth/session")) return Response.json({ user: null });
    if (String(url).endsWith("/comments")) {
      attempts++;
      return attempts === 1 ? Response.json({ error: "RATE_LIMITED" }, { status: 429 }) : Response.json({ id: 42 }, { status: 201 });
    }
    return Response.json({ runner: "up", freeRunSlots: 1, agentAvailable: true });
  });
  vi.stubGlobal("fetch", fetchMock);
  render(<Playground />);
  fireEvent.click(screen.getByRole("button", { name: "Feedback" }));
  const dialog = screen.getByRole("dialog", { name: "Feedback" });
  const form = within(dialog);
  fireEvent.change(form.getByLabelText("Your feedback"), { target: { value: "a retained draft" } });
  fireEvent.change(form.getByLabelText("Password for editing or deleting"), { target: { value: "guest-password" } });
  fireEvent.submit(form.getByRole("button", { name: "Send feedback" }).closest("form")!);
  await waitFor(() => expect(form.getByRole("alert").textContent).toContain("Too many attempts"));
  expect((form.getByLabelText("Your feedback") as HTMLTextAreaElement).value).toBe("a retained draft");
  fireEvent.submit(form.getByRole("button", { name: "Send feedback" }).closest("form")!);
  await waitFor(() => expect(form.getByRole("status").textContent).toContain("Thank you"));
  expect(attempts).toBe(2);
  fireEvent.click(form.getByRole("button", { name: "Close" }));
  expect(screen.queryByRole("dialog", { name: "Feedback" })).toBeNull();
  expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toContain("Hello, Goose!");
});
