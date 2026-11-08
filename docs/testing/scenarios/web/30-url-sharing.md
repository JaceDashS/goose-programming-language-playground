# URL Sharing Scenarios

- Design: [URL Sharing Design](../../../design/web/30-url-sharing.md)

## Representative Case

- Input: Current source text and page URL or code hash
- Steps: Encode UTF-8 then deflate-raw then unpadded base64url; check complete URL length; inflate incrementally up to 65536 bytes when opening
- Expected result: Korean source survives sharing; invalid or oversized input shows the specified message

## Encoding Limits
- Input: Korean text, empty code, 65536 bytes, 8000 and 8001 character URLs, malformed base64, invalid UTF-8 and a 65537 byte compressed payload.
- Steps: Encode or decode using the public helpers.
- Expected result: Valid inputs round trip; oversized links and malformed or oversized decoded input fail with the specified messages.
- Test: frontend/src/lib/share.test.ts


## Page Integration
- Input: Valid Korean shared code or a malformed hash.
- Steps: Open the page; for valid code press Share.
- Expected result: Valid code replaces hello and clipboard receives the matching URL; invalid code leaves hello and shows the error.
- Test: frontend/src/components/Playground.test.tsx

