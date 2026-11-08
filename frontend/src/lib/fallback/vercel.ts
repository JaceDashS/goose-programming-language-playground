import { Sandbox } from "@vercel/sandbox";
import { createHash } from "node:crypto";
import { Writable } from "node:stream";
import type { RunSandbox } from "./execute";

export const GOOSE_URL = "https://github.com/aardappel/goose/releases/download/v2026.4/goose-v2026.4-linux-x64.tar.gz";
const GOOSE_ASSET_URL = "https://api.github.com/repos/aardappel/goose/releases/assets/718918559";
export const GOOSE_SHA256 = "559ad7572df89fcd1273512d8679528bcdf876c252ec1f31608d3808b24125b3";

/** Create a fresh SDK sandbox. Compiler setup is checked before any source is executed. */
export async function createVercelSandbox(): Promise<RunSandbox> {
  const sandbox = await Sandbox.create({ image: "vercel/sandbox/node:24", timeout: 60000, resources: { vcpus: 1 } });
  return {
    async prepare(code) {
      let response: Response | undefined;
      try { response = await fetch(GOOSE_URL, { signal: AbortSignal.timeout(15000) }); } catch { /* Try the release asset API. */ }
      if (!response?.ok) {
        response = await fetch(GOOSE_ASSET_URL, {
          headers: { Accept: "application/octet-stream" }, signal: AbortSignal.timeout(15000),
        });
      }
      if (!response.ok) throw new Error("Compiler download failed");
      const archive = Buffer.from(await response.arrayBuffer());
      if (createHash("sha256").update(archive).digest("hex") !== GOOSE_SHA256)
        throw new Error("Compiler checksum mismatch");
      await sandbox.writeFiles([{ path: "/vercel/sandbox/goose.tgz", content: archive }]);
      const setup = await sandbox.runCommand({ cmd: "bash", sudo: true, timeoutMs: 30000, args: ["-ceu", `
        export DEBIAN_FRONTEND=noninteractive
        apt-get update -qq
        apt-get install -y --no-install-recommends libc6-dev tar gzip >/dev/null
        mkdir -p /opt/goose /work
        tar xzf /vercel/sandbox/goose.tgz -C /opt/goose --strip-components=1
        useradd --uid 10001 --no-create-home --shell /sbin/nologin goose
        chown 10001:10001 /work
        chmod -R a-w /opt/goose
        /opt/goose/goose --version >/dev/null
      `] });
      if (setup.exitCode !== 0) throw new Error("Compiler setup failed");
      await sandbox.writeFiles([{ path: "/work/main.goose", content: Buffer.from(code, "utf8") }]);
      await sandbox.updateNetworkPolicy("deny-all");
    },
    async command(phase, options) {
      const sink = (stream: "stdout" | "stderr") => new Writable({
        write(chunk, _encoding, callback) { options.output(stream, Buffer.from(chunk)); callback(); },
      });
      const args = phase === "check" ? ["check", "/work/main.goose", "--diagnostics", "json"] : ["run", "/work/main.goose"];
      const result = await sandbox.runCommand({
        cmd: "sudo", sudo: true,
        args: ["-u", "goose", "env", "-i", "PATH=/opt/goose:/usr/bin:/bin", "GOOSE_HOME=/work/.goose", "GOOSE_PROGRESS=plain", "NO_COLOR=1",
          "bash", "-c", 'ulimit -u 64; ulimit -v 524288; exec /opt/goose/goose "$@" < /dev/null', "goose", ...args],
        cwd: "/work", signal: options.signal, timeoutMs: options.timeoutMs,
        stdout: sink("stdout"), stderr: sink("stderr"),
      });
      return result.exitCode;
    },
    async stop() { await sandbox.stop(); },
  };
}
