# Account Login Scenarios

## Account Login Scenarios

- Design: [Account Login Design](../../../design/web/50-account-login.md)

### Password Login
- Input: Log in with a wrong password, then the right one.
- Steps: The dialog posts `/auth/login` with `credentials: "include"`; the first answer is 401 `INVALID_CREDENTIALS`.
- Expected result: "The username or password is incorrect.", then the dialog closes, the header shows the name and Log out, and the AI panel says a connection lasts up to 8 hours.
- Test: `frontend/src/components/AiPanel.test.tsx` → "logs in from the header and shows the account"; `account.test.ts` → "logs in with credentials included and uses the returned CSRF token for logout".

### Already Logged In
- Input: `/auth/session` answers 200 with the user.
- Expected result: The header shows the display name on load.
- Test: `AiPanel.test.tsx` → "shows the signed-in account on load".

### Errors
- Input: 401 from `/auth/session`; 429 from `/auth/login`; no network.
- Expected result: Logged out without an error; "Too many attempts. Try again later."; "The login server could not be reached."
- Test: `account.test.ts` → "reports a missing session as null and other failures as errors", "treats a network failure as its own error".

### Logged In Session Lifetime
- Input: A logged-in user presses Connect AI.
- Steps: The socket upgrade to `api.jace-s.com/goose/session` carries the API's session cookie; the hub looks it up.
- Expected result: `hello` reports `loggedIn: true` and `idleSeconds: 7200`; the panel says the connection ends after 2 h without AI activity. Hub-side test: platform `TestSocketMemberGetsLongerLifetimeAndOnlySessionCookieIsForwarded`. Not yet checked in production; it needs the platform deploy.

### Google Sign In
- Input: Google sign-in enabled on the jace-s API.
- Expected result: Google's button appears in the dialog; a credential is exchanged at `/auth/google` for the same account session. Not yet checked in production: the Google OAuth client must first list `https://goose-playground.jace-s.com`.
