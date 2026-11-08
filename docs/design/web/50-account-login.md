# Account Login Design

- Spec: [Account Login](../../specs/web/50-account-login.md)
- Architecture: [Overview](../../architecture/10-overview.md#agent-mode)
- All scenarios: [Account Login Scenarios](../../testing/scenarios/web/50-account-login.md#account-login-scenarios)

The page calls the jace-s account API on `api.jace-s.com` with `credentials: "include"`. The API sets its session cookie on that host only; the hub at `api.jace-s.com/goose` receives the same cookie on the socket upgrade and asks the API who it belongs to, without renewing it.

## Account Client

- Input: API origin (`endpoints.account`, the hub origin) and `fetch`.
- Output: `session()` → user or null; `login()`, `googleLogin()` → user; `logout()`; `googleConfig()`, `googleChallenge()`.
- Code: `frontend/src/lib/account.ts` → `createAccountClient()`, `AccountError`, `loginMessage()`, `LOGIN_ERRORS`.
- The page cannot read the API's CSRF cookie, so the client keeps the `csrfToken` from JSON answers and sends it as `x-csrf-token` on POST (logout).
- A 401 from `/auth/session` means logged out. A network failure is the error code `network`.
- Scenario: `/auth/login` answers 429 `RATE_LIMITED` → `loginMessage` → "Too many attempts. Try again later."

## Login Dialog

- Code: `frontend/src/components/LoginDialog.tsx`, `frontend/src/components/GoogleButton.tsx`; header in `Playground.tsx`.
- A modal `dialog` with username, password and "Keep me logged in" (default on, sent as `remember`). Escape or Cancel closes it.
- `GoogleButton` follows the companion apps: read `/auth/google/config`, get a one-use nonce from `/auth/google/challenge`, render Google's official button, exchange the credential at `/auth/google`. A failure shows a message and renders a new button with a fresh nonce. Hidden when Google sign-in is off.
- Links go to `https://jace-s.com/register` and `https://jace-s.com/login` (`NEXT_PUBLIC_SITE_URL` overrides the site).
- Platform prerequisites: the api allows the origin `https://goose-playground.jace-s.com` (CORS and the Google origin guard), and the Google OAuth client lists it as an authorized JavaScript origin.
- Scenario: The user logs in with the right password → the dialog closes → the header shows the name → the next Connect AI opens a session with `idleSeconds: 7200`.
