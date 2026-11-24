import { readFileSync } from 'node:fs';

/** Package version, read once from package.json for the OpenAPI document. */
export const version: string = (
  JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
    version: string;
  }
).version;
