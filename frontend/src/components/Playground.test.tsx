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
