// jace-s account login for the playground (goose D-0041, D-0042). The account API lives on
// api.jace-s.com; its session cookie is host-only there and also reaches the hub at
// api.jace-s.com/goose, which gives AI sessions the logged-in lifetime. The page cannot read the
// cookies, so it keeps the CSRF token from the JSON answers for logout.

export interface AccountUser {
  id: string;
  username: string;
  displayName?: string | null;
}

export class AccountError extends Error {
  constructor(public status: number, public code: string) {
    super(code);
  }
}

export interface AccountClient {
  /** The signed-in user, or null. */
  session(): Promise<AccountUser | null>;
  login(username: string, password: string, remember: boolean): Promise<AccountUser>;
  logout(): Promise<void>;
  googleConfig(): Promise<{ enabled: boolean; clientId: string | null }>;
  googleChallenge(): Promise<string>;
  googleLogin(credential: string, remember: boolean): Promise<AccountUser>;
}

/** Messages for the login dialog, by API error code. */
export const LOGIN_ERRORS: Record<string, string> = {
  INVALID_CREDENTIALS: "The username or password is incorrect.",
  EMAIL_NOT_VERIFIED: "Verify your email address first, then log in.",
  RATE_LIMITED: "Too many attempts. Try again later.",
  ACCOUNT_SUSPENDED: "This account cannot be used.",
  ACCOUNT_EXPIRED: "This account has expired.",
  GOOGLE_ACCOUNT_CONFLICT: "This email already has an account. Log in with your password.",
  network: "The login server could not be reached.",
};

export function loginMessage(error: unknown): string {
  const code = error instanceof AccountError ? error.code : "";
  return LOGIN_ERRORS[code] ?? "Login failed. Try again.";
}

export function createAccountClient(base: string, f: typeof fetch = (...a) => fetch(...a)): AccountClient {
  let csrf = "";
  async function request<T>(path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      if (csrf) headers["x-csrf-token"] = csrf;
    }
    let res: Response;
    try {
      res = await f(base + path, {
        method: body === undefined ? "GET" : "POST",
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        credentials: "include",
        cache: "no-store",
      });
    } catch {
      throw new AccountError(0, "network");
    }
    const payload = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (!res.ok) throw new AccountError(res.status, typeof payload?.error === "string" ? payload.error : "UNKNOWN");
    if (typeof payload?.csrfToken === "string") csrf = payload.csrfToken;
    return payload as T;
  }
  return {
    async session() {
      try {
        return (await request<{ user?: AccountUser }>("/auth/session")).user ?? null;
      } catch (e) {
        if (e instanceof AccountError && e.status === 401) return null;
        throw e;
      }
    },
    async login(username, password, remember) {
      return (await request<{ user: AccountUser }>("/auth/login", { username: username.trim(), password, remember })).user;
    },
    async logout() {
      await request("/auth/logout", {});
      csrf = "";
    },
    googleConfig: () => request("/auth/google/config"),
    async googleChallenge() {
      return (await request<{ nonce: string }>("/auth/google/challenge", {})).nonce;
    },
    async googleLogin(credential, remember) {
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      return (await request<{ user: AccountUser }>("/auth/google", { credential, remember, timeZone })).user;
    },
  };
}
