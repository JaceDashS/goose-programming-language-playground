import { afterEach, describe, expect, it, vi } from "vitest";
import { createTurnstileWidget, type TurnstileApi } from "./turnstile";

/** A fake window.turnstile that answers each execute with the next scripted reply. */
function fakeApi(replies: Array<"token" | "error" | "timeout" | "silent">) {
  let options: Record<string, (value?: string) => void> = {};
  let issued = 0;
  const api: TurnstileApi = {
    render: vi.fn((_container, opts) => { options = opts as typeof options; return "w1"; }),
    reset: vi.fn(),
    execute: vi.fn(() => {
      const reply = replies.shift();
      if (reply === "token") options.callback(`token-${++issued}`);
      if (reply === "error") options["error-callback"]();
      if (reply === "timeout") options["timeout-callback"]();
    }),
    remove: vi.fn(),
  };
  return api;
}

const container = {} as HTMLElement;

afterEach(() => vi.useRealTimers());

describe("Turnstile widget", () => {
  it("renders once in execute mode and returns a new token for each request", async () => {
    const api = fakeApi(["token", "token"]);
    const widget = createTurnstileWidget(api, container, "site-key");
    expect(api.render).toHaveBeenCalledOnce();
    expect(vi.mocked(api.render).mock.calls[0][1]).toMatchObject({ sitekey: "site-key", execution: "execute" });
    expect(await widget.getToken()).toBe("token-1");
    expect(await widget.getToken()).toBe("token-2");
    expect(api.reset).toHaveBeenCalledTimes(2);
  });

  it("rejects when the check fails or times out", async () => {
    const widget = createTurnstileWidget(fakeApi(["error", "timeout"]), container, "k");
    await expect(widget.getToken()).rejects.toThrow("The browser check failed.");
    await expect(widget.getToken()).rejects.toThrow("The browser check timed out.");
  });

  it("gives up after the time limit when no callback arrives", async () => {
    vi.useFakeTimers();
    const widget = createTurnstileWidget(fakeApi(["silent"]), container, "k", 1000);
    const token = widget.getToken();
    vi.advanceTimersByTime(1000);
    await expect(token).rejects.toThrow("The browser check timed out.");
  });

  it("does not let an old request's timer cancel a newer request", async () => {
    vi.useFakeTimers();
    const api = fakeApi(["silent", "silent"]);
    const widget = createTurnstileWidget(api, container, "k", 1000);
    const first = widget.getToken();
    first.catch(() => undefined);
    vi.advanceTimersByTime(600);
    const second = widget.getToken();
    vi.advanceTimersByTime(600);
    const callback = vi.mocked(api.render).mock.calls[0][1].callback as (token: string) => void;
    callback("late-token");
    await expect(first).rejects.toThrow("A newer browser check replaced this one.");
    await expect(second).resolves.toBe("late-token");
  });

  it("removes the widget on dispose", () => {
    const api = fakeApi([]);
    createTurnstileWidget(api, container, "k").dispose();
    expect(api.remove).toHaveBeenCalledWith("w1");
  });
});
