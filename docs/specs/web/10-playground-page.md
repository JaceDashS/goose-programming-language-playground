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
- Sample and Share use the toolbar theme: matching control height, rounded borders, light and dark colors, visible keyboard focus, and at phone widths a sample field that never shrinks below a usable width.
- Scrollbars follow the light or dark theme.
- The layout works from phone width (one column) to desktop (editor and output side by side).
- Turnstile: when the build has `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, every run request (hub, fallback, and the retry after `use_primary`) carries its own fresh Turnstile token, because a token is single use. The widget appears only when the visitor must interact. If no token can be obtained, the run is not sent and the page shows `turnstile_failed`. Without the site key, no Turnstile script is loaded and runs carry no token.
- Not yet decided, so not part of this version: the editor component.
- The AI connection panel and the header login: [AI Connection](40-ai-connection.md), [Account Login](50-account-login.md).

## Example

- Input: The hub answers 503 `busy` when the user presses Run.
- Steps: The page sends the same code to `/api/run`, which runs it in Vercel Sandbox.
- Result: The output appears marked "backup server", and the Degraded banner shows.

## Turnstile Example

- Input: The site key is built in, Turnstile is configured on the hub and the fallback, and the hub answers 503 `busy`.
- Steps: The page gets token A for the hub, which verifies and spends it, then gets token B for `/api/run`.
- Result: The fallback verifies token B and runs the code; the output shows "backup server".

## Browser Check Position

- The Cloudflare check is right aligned in the Run toolbar, without a separate row. Narrow toolbars scroll horizontally.
- Input: Run is pressed and Cloudflare needs interaction.
- Steps: Show the check at the right of the existing controls.
- Expected result: The check stays in the Run row.

## Project Link
- The header identifies the upstream language link as Goose project rather than About. It keeps the existing destination and opens separately.
- Input: Playground header. Steps: Follow Goose project. Expected result: The upstream language repository opens without adding a creator About page.
