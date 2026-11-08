# Goose Playground Docs

A web playground for the [Goose programming language](https://github.com/aardappel/goose). Users write and run Goose code in Chrome. They can also connect Claude or ChatGPT through MCP and let the AI edit and run code in their browser.

Implementation has started (2026-11-08). Remaining open items are decided during implementation. This repository holds the browser client and is included in the jace-s platform as the `services/goose-playground` submodule. The hub, runner and run image are platform code (`services/goose/` in the private jace-s platform repository); `schema/` here is a copy of the platform schemas.

## Documents

- [Specs](specs/00-index.md) — What each feature must do
- [Design](design/00-index.md) — How the code implements each feature
- [Glossary](10-glossary.md) — Project terms: runner, hub, session token, service state, and others
- [Architecture](architecture/00-index.md) — Overall structure, request flow, decisions, and open items
- [API](api/00-index.md) — Run and health endpoints, error codes, and the session socket messages
- [Testing](testing/00-index.md) — Test strategy and scenarios
- [Guides](guides/00-index.md) — Where the hub and runner procedures live
- [Operations](operations/00-index.md) — Vercel deployment
- [Archive](archive/00-index.md) — Hub, runner and run image documents moved to the jace-s platform
