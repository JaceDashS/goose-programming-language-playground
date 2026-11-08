import { MAX_CODE_BYTES } from "./contract";

export const MAX_SHARE_URL = 8000;
export const SHARE_TOO_LONG = "This program is too long to share as a link.";
export const SHARE_INVALID = "This link could not be opened.";

/** Compress UTF-8 source into a complete share URL; reject oversized links. */
export async function encodeShare(code: string, pageUrl: string): Promise<string> {
  const input = new TextEncoder().encode(code);
  if (input.byteLength > MAX_CODE_BYTES) throw new Error(SHARE_TOO_LONG);
  const stream = new Blob([input]).stream().pipeThrough(new CompressionStream("deflate-raw"));
  const compressed = new Uint8Array(await new Response(stream).arrayBuffer());
  const payload = btoa(Array.from(compressed, b => String.fromCharCode(b)).join(""))
    .replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
  const url = new URL(pageUrl);
  url.hash = `code=${payload}`;
  if (url.href.length > MAX_SHARE_URL) throw new Error(SHARE_TOO_LONG);
  return url.href;
}

/** Decode a share hash with a bounded streaming inflate; null means no shared code. */
export async function decodeShare(hash: string): Promise<string | null> {
  if (!hash.startsWith("#code=")) return null;
  const payload = hash.slice(6);
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(payload) || payload.length % 4 === 1) throw new Error();
    const base64 = payload.replaceAll("-", "+").replaceAll("_", "/");
    const bytes = Uint8Array.from(atob(base64 + "=".repeat((4 - base64.length % 4) % 4)), c => c.charCodeAt(0));
    // Reject non-canonical base64url encodings, including nonzero unused bits.
    if (btoa(Array.from(bytes, b => String.fromCharCode(b)).join("")).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "") !== payload) throw new Error();
    const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw")).getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_CODE_BYTES) throw new Error();
        chunks.push(value);
      }
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
    const result = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
    return new TextDecoder("utf-8", { fatal: true }).decode(result);
  } catch {
    throw new Error(SHARE_INVALID);
  }
}
