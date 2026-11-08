import { compileFromFile } from 'json-schema-to-typescript';
import { readdir, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
// Generate all contracts together so cross-schema references use the same source.
export async function generateContracts() {
  const result = new Map();
  for (const name of (await readdir(path.join(root, 'schema'))).sort()) {
    if (!name.endsWith('.schema.json')) continue;
    result.set(name, await compileFromFile(path.join(root, 'schema', name), {
      bannerComment: '/* Generated from schema/' + name + '. Run npm run gen:contract to update. */',
      style: { singleQuote: false },
    }));
  }
  return result;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dest = path.join(root, 'frontend/src/lib/generated');
  await mkdir(dest, { recursive: true });
  for (const [name, source] of await generateContracts()) {
    await writeFile(path.join(dest, name.replace('.schema.json', '.ts')), source);
  }
}
