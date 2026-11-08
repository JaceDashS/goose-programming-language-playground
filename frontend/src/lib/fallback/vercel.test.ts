import { beforeEach, describe, expect, it, vi } from "vitest";


import { executeSandbox } from "./execute";
const mocks=vi.hoisted(()=>({create:vi.fn(),fetch:vi.fn(),writeFiles:vi.fn(),runCommand:vi.fn(),network:vi.fn(),stop:vi.fn(),digest:vi.fn()}));
vi.mock("node:crypto",()=>({createHash:()=>({update:()=>({digest:mocks.digest})})}));
vi.mock("@vercel/sandbox",()=>({Sandbox:{create:mocks.create}}));
import { createVercelSandbox, GOOSE_SHA256 } from "./vercel";
beforeEach(()=>{
  vi.resetAllMocks();vi.stubGlobal("fetch",mocks.fetch);
  mocks.create.mockResolvedValue({writeFiles:mocks.writeFiles,runCommand:mocks.runCommand,updateNetworkPolicy:mocks.network,stop:mocks.stop});
  mocks.writeFiles.mockResolvedValue(undefined);mocks.network.mockResolvedValue(undefined);mocks.stop.mockResolvedValue(undefined);
  mocks.runCommand.mockImplementation(async opts=>{if(opts.stdout)opts.stdout.end(Buffer.from(opts.args.includes("check")?"[]":"hello\n"));if(opts.stderr)opts.stderr.end();return {exitCode:0};});
});
import { afterEach } from "vitest";
afterEach(()=>vi.unstubAllGlobals());
describe("Vercel SDK adapter",()=>{
  it("rejects a download with the wrong SHA and stops",async()=>{
    mocks.fetch.mockResolvedValue(new Response("wrong archive"));const box=await createVercelSandbox();await expect(executeSandbox(box,"code")).rejects.toThrow("checksum");expect(mocks.stop).toHaveBeenCalledOnce();expect(mocks.runCommand).not.toHaveBeenCalled();
  });
  it("stops after a failed download",async()=>{mocks.fetch.mockResolvedValue(new Response("bad",{status:502}));await expect(executeSandbox(await createVercelSandbox(),"code")).rejects.toThrow("download");expect(mocks.stop).toHaveBeenCalledOnce();});
  it("passes deadline, no stdin and both output streams to the SDK",async()=>{
    const box=await createVercelSandbox();const chunks:string[]=[];
    const signal=new AbortController().signal;
    await box.command("run",{signal,timeoutMs:321,output:(_,data)=>chunks.push(Buffer.from(data).toString())});
    expect(mocks.runCommand.mock.calls[0][0]).toMatchObject({signal,timeoutMs:321,cwd:"/work"});
    expect(mocks.runCommand.mock.calls[0][0].args.join(" ")).toContain("< /dev/null");
    expect(mocks.runCommand.mock.calls[0][0].args).toContain("env");expect(chunks).toEqual(["hello\n"]);await box.stop();expect(mocks.stop).toHaveBeenCalledOnce();
  });
  it("requests one fresh bounded sandbox",async()=>{await createVercelSandbox();expect(mocks.create).toHaveBeenCalledWith({image:"vercel/sandbox/node:24",timeout:60000,resources:{vcpus:1}});});
});



it("verifies the pinned digest before setup and denies network before checking",async()=>{
  mocks.digest.mockReturnValue(GOOSE_SHA256);mocks.fetch.mockResolvedValue(new Response("archive"));
  const result=await executeSandbox(await createVercelSandbox(),"source");
  expect(result.outcome).toBe("exited");expect(mocks.digest).toHaveBeenCalledWith("hex");
  expect(mocks.writeFiles.mock.calls[1][0][0]).toMatchObject({path:"/work/main.goose",content:Buffer.from("source")});
  expect(mocks.network).toHaveBeenCalledWith("deny-all");
  expect(mocks.network.mock.invocationCallOrder[0]).toBeLessThan(mocks.runCommand.mock.invocationCallOrder[1]);
  expect(mocks.stop).toHaveBeenCalledOnce();
});
it("stops when compiler setup fails",async()=>{
  mocks.digest.mockReturnValue(GOOSE_SHA256);mocks.fetch.mockResolvedValue(new Response("archive"));mocks.runCommand.mockResolvedValue({exitCode:1});
  await expect(executeSandbox(await createVercelSandbox(),"source")).rejects.toThrow("setup");expect(mocks.stop).toHaveBeenCalledOnce();expect(mocks.network).not.toHaveBeenCalled();
});

it("checks compiler compatibility during trusted setup", async () => {
  mocks.digest.mockReturnValue(GOOSE_SHA256);
  mocks.fetch.mockResolvedValue(new Response("archive"));
  await executeSandbox(await createVercelSandbox(), "source");
  const setup = mocks.runCommand.mock.calls[0][0];
  expect(setup.args[1]).toContain("apt-get install");
  expect(setup.args[1]).toContain("/opt/goose/goose --version");
});


it("uses the release asset API when the browser download endpoint fails", async () => {
  mocks.digest.mockReturnValue(GOOSE_SHA256);
  mocks.fetch.mockResolvedValueOnce(new Response("gateway timeout", { status: 504 }))
    .mockResolvedValueOnce(new Response("archive"));
  await executeSandbox(await createVercelSandbox(), "source");
  expect(mocks.fetch.mock.calls[1][0]).toContain("/releases/assets/718918559");
  expect(mocks.fetch.mock.calls[1][1].headers.Accept).toBe("application/octet-stream");
  expect(mocks.digest).toHaveBeenCalledWith("hex");
});
