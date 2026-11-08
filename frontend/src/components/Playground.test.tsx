// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import Playground from "./Playground";
import { samples } from "../samples";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ runner: "up", freeRunSlots: 1, agentAvailable: true })));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

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
it("keeps hello and explains an invalid shared link", async () => {
  const { waitFor } = await import("@testing-library/react");
  window.history.replaceState(null, "", "#code=@@");
  render(<Playground />);
  await waitFor(() => expect(screen.getByText("This link could not be opened.")).toBeTruthy());
  expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toContain("Hello, Goose!");
  window.history.replaceState(null, "", "/");
});
