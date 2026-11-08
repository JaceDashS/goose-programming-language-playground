# Goose Playground

A web playground for the [Goose programming language](https://github.com/aardappel/goose). Write and run Goose code in the browser, or connect Claude or ChatGPT through MCP and let the AI edit and run code in your open editor.

Status: early implementation. Start from [docs/00-index.md](docs/00-index.md).

## Layout

| Path | Contents |
| --- | --- |
| `docs/` | Specs, architecture, design, and test scenarios |
| `schema/` | Copy of the run and socket JSON schemas used to generate the client types |
| `frontend/` | Next.js page and the Vercel fallback route |

The on-prem hub and runner that execute code at `api.jace-s.com/goose` are operated by the jace-s platform and are not part of this repository.

## License

Apache-2.0, the same license as Goose. See [LICENSE](LICENSE).
