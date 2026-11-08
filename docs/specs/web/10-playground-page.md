# Playground Page

- Design: [Playground Page Design](../../design/web/10-playground-page.md)

## Requirements

- One page with an editor, a Run button (also Ctrl+Enter or Cmd+Enter), an output panel and an AI connection panel.
- Runs go to the on-prem hub first. On `busy`, `unavailable`, a gateway error or a network failure, the same code goes to the Vercel fallback. Other errors are shown without falling back.
- The output panel shows how the run ended (exit code, compile error, time, output, or memory limit), the time taken, which server ran it, compiler diagnostics with line and column, stdout and stderr.
- The page shows the service state:
  - Normal: no banner; the AI connection may be offered.
  - Degraded: "The server is busy, so the AI connection (MCP) is unavailable. You can still use the playground."
  - Outage: "Temporary service outage." Run is disabled; editing still works.
- The page rechecks the hub's health every 5 s while normal, and backs off to 5, 10, 20, 40, then 60 s while not normal.
- The layout works from phone width (one column) to desktop (editor and output side by side).
- Not yet decided, so not part of this version: the editor component, Turnstile on the page, the AI connection panel's content.

## Example

- Input: The hub answers 503 `busy` when the user presses Run.
- Steps: The page sends the same code to `/api/run`, which runs it in Vercel Sandbox.
- Result: The output appears marked "backup server", and the Degraded banner shows.
