# Test Strategy

## Levels
- The browser run client is tested with a fake `fetch` (`frontend/src/lib/runGoose.test.ts`).
- Contract tests regenerate the TypeScript types from `schema/` and validate every schema example (`frontend/scripts/gen-contract.test.ts`). `schema/` is a copy of the jace-s platform schemas; the platform test `TestClientSchemaCopyMatches` fails when the copy differs.
- Hub, runner and run image tests live in the jace-s platform with that code.

## Commands
- Frontend: `npm test` (Vitest), `npm run lint` and `npx tsc --noEmit` in `frontend/`.

## Test Data
- Test programs are short inline Goose sources. No user code is stored as test data.

## Example
- Input: The platform adds a field to `run-result.schema.json`.
- Steps: Copy the schema into `schema/`, run `npm run gen:contract` and `npm test` in `frontend/`.
- Result: The generated types include the field, the freshness test passes, and the platform copy check passes after the submodule reference is updated.
