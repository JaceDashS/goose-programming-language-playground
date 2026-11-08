import { expect, it, vi } from "vitest";
import { AccountError, createAccountClient, loginMessage } from "./account";

function api(responses: Array<[number, unknown]>) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const f = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const [status, body] = responses.shift()!;
    return new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  });
  return { f: f as unknown as typeof fetch, calls };
}

it("logs in with credentials included and uses the returned CSRF token for logout", async () => {
  const { f, calls } = api([
    [200, { user: { id: "u1", username: "jace" }, csrfToken: "c1" }],
    [204, {}],
  ]);
  const client = createAccountClient("https://api.jace-s.com", f);
  expect(await client.login(" jace ", "pw", true)).toEqual({ id: "u1", username: "jace" });
  expect(calls[0].url).toBe("https://api.jace-s.com/auth/login");
  expect(calls[0].init.credentials).toBe("include");
  expect(JSON.parse(String(calls[0].init.body))).toEqual({ username: "jace", password: "pw", remember: true });
  await client.logout();
  expect((calls[1].init.headers as Record<string, string>)["x-csrf-token"]).toBe("c1");
});

it("reports a missing session as null and other failures as errors", async () => {
  const { f } = api([[401, { error: "UNAUTHENTICATED" }], [429, { error: "RATE_LIMITED" }]]);
  const client = createAccountClient("https://api.jace-s.com", f);
  expect(await client.session()).toBeNull();
  const err = await client.login("a", "b", false).catch((e) => e);
  expect(err).toBeInstanceOf(AccountError);
  expect(loginMessage(err)).toBe("Too many attempts. Try again later.");
});

it("treats a network failure as its own error", async () => {
  const client = createAccountClient("https://api.jace-s.com", (async () => { throw new TypeError("x"); }) as unknown as typeof fetch);
  expect(loginMessage(await client.session().catch((e) => e))).toBe("The login server could not be reached.");
});
