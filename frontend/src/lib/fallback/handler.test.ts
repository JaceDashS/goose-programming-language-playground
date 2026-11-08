import { afterEach, describe, expect, it, vi } from "vitest";
import { createFallback, type FallbackOptions } from "./handler";
import { MemoryRunCounter } from "./counter";
import type { RunSandbox } from "./execute";

const origin = "https://goose-playground.jace-s.com";
function fixture(overrides: Partial<FallbackOptions> = {}) {
  const sandbox: RunSandbox = {
    prepare: vi.fn().mockResolvedValue(undefined),
    command: vi.fn(async (phase, opts) => { opts.output("stdout", Buffer.from(phase === "check" ? "[]" : "hello\n")); return 0; }),
    stop: vi.fn().mockResolvedValue(undefined),
  };
  const opts: FallbackOptions = { hubUrl: "https://hub.test", development: false, hourlyCap: 30, dailyCap: 150,
    counter: new MemoryRunCounter(), fetch: vi.fn(async () => Response.json({ runner: "down", freeRunSlots: 0 })),
    create: vi.fn(async () => sandbox), ...overrides };
  const handler = createFallback(opts);
  return { sandbox, opts, send: (body: unknown = { code: "hello" }, requestOrigin = origin) => handler(new Request("https://site.test/api/run", {
    method: "POST", headers: { origin: requestOrigin, "Content-Type": "application/json" }, body: JSON.stringify(body),
  })), handler };
}
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
describe("fallback admission", () => {
  it.each(["", "https://evil.test", "http://localhost:3000"])("rejects forbidden origin %s", async bad => {
    const f = fixture(); const r = await f.send(undefined, bad);
    expect(r.status).toBe(403); expect((await r.json()).error.code).toBe("forbidden_origin"); expect(f.opts.create).not.toHaveBeenCalled();
  });
  it("permits localhost only in development", async () => { expect((await fixture({development:true}).send(undefined, "http://localhost:3000")).status).toBe(200); });
  it.each([null, [], {}, {code:1}, {code:"", extra:true}, {code:"",turnstileToken:1}])("rejects invalid request %#", async body => {
    const r = await fixture().send(body); expect(r.status).toBe(400); expect((await r.json()).error.code).toBe("invalid_request");
  });
  it("rejects malformed JSON", async () => { const r = await fixture().handler(new Request("https://site.test", {method:"POST",headers:{origin},body:"{"})); expect(r.status).toBe(400); });
  it("enforces UTF-8 byte size", async () => {
    const f = fixture(); const r = await f.send({code:"한".repeat(21846)});
    expect(r.status).toBe(413); expect((await r.json()).error.code).toBe("too_large"); expect(f.opts.create).not.toHaveBeenCalled();
    expect((await fixture().send({code:"a".repeat(65536)})).status).toBe(200);
  });
  it.each([undefined, "bad"])("fails closed for missing or rejected Turnstile token", async token => {
    const f=fixture({secret:"secret",fetch:vi.fn(async()=>Response.json({success:false}))}); const r=await f.send({code:"",turnstileToken:token});
    expect(r.status).toBe(403); expect((await r.json()).error.code).toBe("turnstile_failed"); expect(f.opts.create).not.toHaveBeenCalled();
  });
  it.each(["network", "json", "non-200"])("fails closed on Turnstile %s failure", async mode => {
    const f=fixture({secret:"secret",fetch:vi.fn(async()=>{if(mode==="network") throw Error(); return new Response(mode==="json"?"{":'{"success":true}', {status:mode==="non-200"?500:200});})});
    expect((await f.send({code:"",turnstileToken:"token"})).status).toBe(403);
  });
  it("verifies Turnstile before checking primary", async () => {
    const fetcher=vi.fn(async (url: string | URL | Request)=>Response.json(String(url).includes("siteverify")?{success:true}:{runner:"down"}));
    const f=fixture({secret:"secret",fetch:fetcher}); expect((await f.send({code:"",turnstileToken:"token"})).status).toBe(200);
    expect(String(fetcher.mock.calls[0][0])).toContain("siteverify");
  });
  it("refuses healthy primary without counting or creating a sandbox", async () => {
    const counter={take:vi.fn()}; const f=fixture({counter,fetch:vi.fn(async()=>Response.json({runner:"up",freeRunSlots:1}))}); const r=await f.send();
    expect(r.status).toBe(409); expect((await r.json()).error.code).toBe("use_primary"); expect(counter.take).not.toHaveBeenCalled();expect(f.opts.create).not.toHaveBeenCalled();
  });
  it.each(["network","invalid","busy","http"])("falls back on primary %s", async mode => {
    const f=fixture({fetch:vi.fn(async()=>{if(mode==="network")throw Error();if(mode==="invalid")return new Response("{");return Response.json({runner:"up",freeRunSlots:0},{status:mode==="http"?503:200});})});
    expect((await f.send()).status).toBe(200);
  });
  it.each([{hourlyCap:1,dailyCap:150},{hourlyCap:30,dailyCap:1}])("enforces both caps %#", async caps => {
    const f=fixture(caps);expect((await f.send()).status).toBe(200); const r=await f.send(); expect(r.status).toBe(503);expect((await r.json()).error.code).toBe("unavailable");expect(f.opts.create).toHaveBeenCalledTimes(1);
  });
  it("returns unavailable on creation, setup, execution or cleanup failure", async () => {
    for(const phase of ["create","prepare","command","stop"] as const){ const f=fixture();
      if(phase==="create") vi.mocked(f.opts.create).mockRejectedValue(Error()); else vi.mocked(f.sandbox[phase]).mockRejectedValue(Error());
      expect((await f.send()).status).toBe(503); if(phase!=="create") expect(f.sandbox.stop).toHaveBeenCalledOnce();
    }
  });
});
describe("sandbox outcomes", () => {
  it("returns exited output and backend", async () => {const f=fixture();const r=await (await f.send()).json();expect(r).toMatchObject({outcome:"exited",exitCode:0,stdout:"hello\n",stderr:"",backend:"sandbox",diagnostics:[],truncated:false});expect(f.sandbox.stop).toHaveBeenCalledOnce();});
  it("returns compile diagnostics without executing code",async()=>{
    const f=fixture();vi.mocked(f.sandbox.command).mockImplementation(async(_,o)=>{o.output("stdout",Buffer.from('[{"severity":"error","message":"bad","line":1}]'));return 1;});
    const r=await(await f.send()).json();expect(r.outcome).toBe("compile_error");expect(r.exitCode).toBeNull();expect(r.diagnostics[0].line).toBe(1);expect(f.sandbox.command).toHaveBeenCalledOnce();expect(f.sandbox.stop).toHaveBeenCalledOnce();
  });
  it.each([0,1,137,-1])("maps program exit %s",async exit=>{
    const f=fixture();vi.mocked(f.sandbox.command).mockImplementation(async(phase,o)=>{if(phase==="check"){o.output("stdout",Buffer.from("[]"));return 0;}return exit;});
    const r=await(await f.send()).json();expect(r.outcome).toBe(exit===137||exit<0?"killed":"exited");expect(r.exitCode).toBe(exit===137||exit<0?null:exit);
  });
  it("shares the output budget across stdout and stderr",async()=>{
    const f=fixture();vi.mocked(f.sandbox.command).mockImplementation(async(phase,o)=>{if(phase==="check")return 0;o.output("stdout",Buffer.alloc(700000,97));o.output("stderr",Buffer.alloc(700000,98));return 0;});
    const r=await(await f.send()).json();expect(r.outcome).toBe("output_limit");expect(Buffer.byteLength(r.stdout)+Buffer.byteLength(r.stderr)).toBe(1<<20);expect(r.truncated).toBe(true);expect(r.exitCode).toBeNull();expect(f.sandbox.stop).toHaveBeenCalledOnce();
  });
  it.each(["check","run"])("limits %s with one deadline",async stuck=>{
    vi.useFakeTimers();const f=fixture();vi.mocked(f.sandbox.command).mockImplementation(async(phase,o)=>{if(phase!==stuck)return 0;return new Promise((_,reject)=>o.signal.addEventListener("abort",()=>reject(Error("aborted")),{once:true}));});
    const pending=f.send();await vi.advanceTimersByTimeAsync(10000);const r=await(await pending).json();expect(r.outcome).toBe("timeout");expect(r.exitCode).toBeNull();expect(f.sandbox.stop).toHaveBeenCalledOnce();
  });
});
describe("counter windows",()=>{
  it("resets hourly and daily windows and admits atomically",async()=>{const c=new MemoryRunCounter();expect(await Promise.all(Array.from({length:5},()=>c.take(0,2,3)))).toEqual([true,true,false,false,false]);expect(await c.take(3600000,2,3)).toBe(true);expect(await c.take(3600001,2,3)).toBe(false);expect(await c.take(86400000,2,3)).toBe(true);});
});


it("accepts exactly one MiB of program output after compiler diagnostics",async()=>{
  const f=fixture();vi.mocked(f.sandbox.command).mockImplementation(async(phase,o)=>{o.output("stdout",Buffer.from(phase==="check"?"[]":"a".repeat(1<<20)));return 0;});
  const r=await(await f.send()).json();expect(r.outcome).toBe("exited");expect(r.truncated).toBe(false);expect(r.stdout.length).toBe(1<<20);
});
it("does not restart the deadline after check",async()=>{
  vi.useFakeTimers();const f=fixture();vi.mocked(f.sandbox.command).mockImplementation(async(phase,o)=>{
    if(phase==="check"){await new Promise(resolve=>setTimeout(resolve,7000));return 0;}
    return new Promise((_,reject)=>o.signal.addEventListener("abort",()=>reject(Error()),{once:true}));
  });
  const pending=f.send();await vi.advanceTimersByTimeAsync(10000);const r=await(await pending).json();expect(r.outcome).toBe("timeout");expect(r.durationMs).toBe(10000);expect(f.sandbox.stop).toHaveBeenCalledOnce();
});
it("uses a two second abort signal for a hanging primary",async()=>{
  vi.useFakeTimers();const fetcher=vi.fn(async(_url,init)=>new Promise<Response>((_,reject)=>init?.signal?.addEventListener("abort",()=>reject(Error()),{once:true})));
  const f=fixture({fetch:fetcher});const pending=f.send();await vi.advanceTimersByTimeAsync(2000);expect((await pending).status).toBe(200);
});
