# Contract Types

- Related: [Run API](../../api/10-run.md), [Playground Page](10-playground-page.md)

## Requirements

- `frontend/src/lib/contract.ts` must match the JSON schemas in `schema/` (D-0014: shared types come from the schema).
- Generate TypeScript types from `schema/*.schema.json` into `frontend/src/lib/generated/` with a script `npm run gen:contract` in `frontend/`. Commit the generated files.
- `contract.ts` re-exports the generated types under the existing names (`RunRequest`, `RunResult`, `Diagnostic`, `ErrorCode`, `ErrorResponse`, `Health`, `Outcome`, `Backend`). Code that imports from `@/lib/contract` must not change.
- A test fails when the generated files are out of date with the schemas (regenerate in memory and compare).
- A test checks that every `examples` entry of each schema is accepted by a JSON schema validator.
- No schema file changes in this task. If a schema looks wrong, record it and leave it.

## Example

- Input: Someone adds `"memoryKb"` to `run-result.schema.json` without regenerating.
- Steps: `npm test` in `frontend/`.
- Result: The freshness test fails and names `run-result.schema.json`.

- Design: [Contract Types Design](../../design/web/15-contract-types.md)
- Scenarios: [Contract Types Scenarios](../../testing/scenarios/web/15-contract-types.md)
