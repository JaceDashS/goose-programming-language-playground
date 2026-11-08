# Goose Playground

A web playground for the [Goose programming language](https://github.com/aardappel/goose). Write and run Goose code in the browser, or connect Claude or ChatGPT through MCP and let the AI edit and run code in your open editor.

Status: early implementation. Start from [docs/00-index.md](docs/00-index.md).

## Layout

| Path | Contents |
| --- | --- |
| `docs/` | Specs, architecture, design, and test scenarios |
| `schema/` | JSON schemas shared by the browser, hub and runner |
| `server/` | Go module: `cmd/hub`, `cmd/runner`, `internal/` |
| `runimage/` | Run container image (Goose release + run script) |
| `deploy/` | Compose file for the on-prem hub and runner |

## License

Apache-2.0, the same license as Goose. See [LICENSE](LICENSE).
