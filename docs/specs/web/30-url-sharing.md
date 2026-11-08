# URL Sharing

- Related: [Playground Page](10-playground-page.md)

## Requirements

- A Share button puts the current code into the page URL hash and copies the URL to the clipboard (D-0017: URL-hash sharing). Nothing is sent to a server.
- Format: `#code=<payload>`, where payload is the UTF-8 code compressed with `deflate-raw` (`CompressionStream`) and encoded as base64url without padding.
- Opening a URL with `#code=` loads that code into the editor instead of the default program.
- If the shared URL would be longer than 8000 characters, do not share; show "This program is too long to share as a link."
- A payload that does not decode, or decodes to more than 65536 bytes, is ignored: show the default program and the message "This link could not be opened."
- The encode and decode functions live in `frontend/src/lib/share.ts` and have unit tests, including non-ASCII text and the size limits.

## Example

- Input: The editor holds `fn main() { print("안녕"); }` and the user presses Share.
- Steps: compress → base64url → `https://goose-playground.jace-s.com/#code=...` copied.
- Result: Opening that URL in a new tab shows the same code, Korean text intact.

- Design: [URL Sharing Design](../../design/web/30-url-sharing.md)
- Scenarios: [URL Sharing Scenarios](../../testing/scenarios/web/30-url-sharing.md)
