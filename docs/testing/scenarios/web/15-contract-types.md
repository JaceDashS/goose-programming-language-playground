# Contract Types Scenarios

- Design: [Contract Types Design](../../../design/web/15-contract-types.md)

## Representative Case

- Input: schema/*.schema.json
- Steps: Generate all schemas then compare committed text and validate every example with Ajv 2020
- Expected result: An unregenerated schema change fails the freshness test and names the schema
`frontend/scripts/gen-contract.test.ts` covers freshness and schema examples.
