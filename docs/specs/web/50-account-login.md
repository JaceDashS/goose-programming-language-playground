# Account Login

Logging in with a jace-s account gives AI connections the longer lifetime (goose D-0041, D-0043). Nothing else on the page needs a login.

- Design: [Account Login Design](../../design/web/50-account-login.md)
- Scenarios: [Account Login Scenarios](../../testing/scenarios/web/50-account-login.md)

## Requirements

- The header shows Log in, or the account name with Log out. On load the page asks the jace-s API whether the visitor is already logged in.
- Log in opens a dialog: username, password, "Keep me logged in", Google sign-in (when the jace-s API has it enabled, goose D-0042), and links to create an account and reset the password on `jace-s.com`.
- Errors are shown in the dialog: wrong username or password, email not verified, too many attempts, suspended or expired account, server unreachable.
- Any valid jace-s account qualifies; no extra permission is needed.
- Logging in or out does not change an AI connection that is already open; its lifetime was fixed when it opened.

| Visitor | AI connection idle limit | AI connection maximum |
| --- | --- | --- |
| Logged out | 30 min | 2 h |
| Logged in | 2 h | 8 h |

## Example

- Input: A logged-out user opens Log in, enters a wrong password, then the right one.
- Steps: The dialog shows "The username or password is incorrect.", then closes after the second attempt.
- Result: The header shows the account name and Log out; the AI panel says a connection lasts up to 8 hours.
