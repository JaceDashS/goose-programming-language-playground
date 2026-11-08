import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import Ajv2020 from "ajv/dist/2020.js";
import { generateContracts } from "./gen-contract.mjs";

describe("schema contracts", () => {
  it("keeps every generated contract fresh", async () => {
    for (const [name, source] of await generateContracts()) {
      const actual = await readFile(resolve("src/lib/generated", name.replace(".schema.json", ".ts")), "utf8");
      expect(actual.replaceAll("\r\n", "\n"), name).toBe(source.replaceAll("\r\n", "\n"));
    }
  });
  it("validates every schema example", async () => {
    const ajv = new Ajv2020({ strict: false });
    const schemas = await Promise.all((await readdir("../schema")).map(async name =>
      JSON.parse(await readFile(resolve("../schema", name), "utf8"))));
    schemas.forEach(schema => ajv.addSchema(schema));
    for (const schema of schemas) {
      const validate = ajv.getSchema(schema.$id)!;
      for (const example of schema.examples ?? []) expect(validate(example), JSON.stringify(validate.errors)).toBe(true);
    }
  });
});
