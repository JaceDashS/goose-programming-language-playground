import { describe, it, expect } from "vitest";
import { deflateRawSync } from "node:zlib";
import { encodeShare, decodeShare, SHARE_INVALID, SHARE_TOO_LONG } from "./share";

const base = "https://goose-playground.jace-s.com/";
const hashFor = (bytes: Buffer) => "#code=" + deflateRawSync(bytes).toString("base64url");
describe("URL sharing", () => {
  it.each(["", 'fn main() { print("안녕 👋 café"); }', "x".repeat(65536)])("round trips UTF-8 source including the byte limit", async code => {
    const url = await encodeShare(code, base + "#old");
    expect(url).toMatch(/#code=[A-Za-z0-9_-]+$/);
    expect(await decodeShare(new URL(url).hash)).toBe(code);
  });
  it("accepts 8000 URL characters and rejects 8001", async () => {
    const url = await encodeShare("hello", base);
    const padding = "a".repeat(8000 - url.length);
    expect((await encodeShare("hello", base + padding)).length).toBe(8000);
    await expect(encodeShare("hello", base + padding + "a")).rejects.toThrow(SHARE_TOO_LONG);
  });
  it("rejects oversized incompressible code and UTF-8 byte overflow", async () => {
    let seed = 123;
    const code = Array.from({length: 16000}, () => { seed = (Math.imul(seed,1664525)+1013904223) >>> 0; return String.fromCharCode(32 + seed % 95); }).join("");
    await expect(encodeShare(code, base)).rejects.toThrow(SHARE_TOO_LONG);
    await expect(encodeShare("한".repeat(21846), base)).rejects.toThrow(SHARE_TOO_LONG);
  });
  it.each(["#code=", "#code=@@", "#code=a", "#code=AAAA", "#code=AA=="])("rejects malformed payload %s", async hash => {
    await expect(decodeShare(hash)).rejects.toThrow(SHARE_INVALID);
  });
  it("bounds inflation and rejects invalid UTF-8", async () => {
    await expect(decodeShare(hashFor(Buffer.alloc(65537, 97)))).rejects.toThrow(SHARE_INVALID);
    await expect(decodeShare(hashFor(Buffer.from([255])))).rejects.toThrow(SHARE_INVALID);
  });
  it("ignores unrelated hashes", async () => { expect(await decodeShare("#other")).toBeNull(); });
});
