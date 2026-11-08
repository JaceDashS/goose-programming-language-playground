// Cloudflare Turnstile in explicit "execute" mode. Each token is single use, so every run request
// asks for a new one: the hub verifies the first, and a fallback request needs its own.
// Without NEXT_PUBLIC_TURNSTILE_SITE_KEY nothing is loaded and runs carry no token.

export const TURNSTILE_SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

/** Maximum wait for one token, including an interactive challenge. */
const TOKEN_TIMEOUT_MS = 60_000;

/** The subset of window.turnstile this module uses. */
export interface TurnstileApi {
  render(container: HTMLElement, options: Record<string, unknown>): string | undefined;
  reset(widgetId: string): void;
  execute(widgetId: string): void;
  remove(widgetId: string): void;
}

export interface TurnstileWidget {
  /** Resolves with a fresh single-use token, or rejects when the check fails or times out. */
  getToken(): Promise<string>;
  dispose(): void;
}

export function turnstileSiteKey(): string | undefined {
  return process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || undefined;
}

export function createTurnstileWidget(
  api: TurnstileApi,
  container: HTMLElement,
  siteKey: string,
  timeoutMs = TOKEN_TIMEOUT_MS,
): TurnstileWidget {
  let pending: { resolve(token: string): void; reject(error: Error): void } | null = null;
  const settle = (token: string | null, error?: string) => {
    const p = pending;
    pending = null;
    if (!p) return;
    if (token) p.resolve(token);
    else p.reject(new Error(error ?? "The browser check failed."));
  };
  const widgetId = api.render(container, {
    sitekey: siteKey,
    execution: "execute",
    appearance: "interaction-only",
    // Match the English page instead of the browser language.
    language: "en",
    callback: (token: string) => settle(token),
    "error-callback": () => settle(null, "The browser check failed."),
    "timeout-callback": () => settle(null, "The browser check timed out."),
    "expired-callback": () => undefined,
  });
  if (!widgetId) throw new Error("The browser check could not start.");

  return {
    getToken() {
      settle(null, "A newer browser check replaced this one.");
      return new Promise<string>((resolve, reject) => {
        const request = {
          resolve: (token: string) => { clearTimeout(timer); resolve(token); },
          reject: (error: Error) => { clearTimeout(timer); reject(error); },
        };
        const timer = setTimeout(() => {
          if (pending === request) settle(null, "The browser check timed out.");
        }, timeoutMs);
        pending = request;
        api.reset(widgetId);
        api.execute(widgetId);
      });
    },
    dispose() {
      settle(null, "The browser check was closed.");
      api.remove(widgetId);
    },
  };
}

let scriptPromise: Promise<TurnstileApi> | null = null;

/** Loads the Turnstile script once per page. */
export function loadTurnstile(): Promise<TurnstileApi> {
  const w = window as unknown as { turnstile?: TurnstileApi };
  if (w.turnstile) return Promise.resolve(w.turnstile);
  scriptPromise ??= new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = TURNSTILE_SCRIPT;
    script.async = true;
    script.onload = () => (w.turnstile ? resolve(w.turnstile) : reject(new Error("Turnstile did not load.")));
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error("Turnstile could not be loaded."));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}
