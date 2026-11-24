// CORE-16-04: fails when the built frontend (dist/) contains something that must never reach a browser:
// connection strings, private keys, token-signing secrets or server-only setting names. Run after `npm run build`.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const DIST = new URL('../dist/', import.meta.url);

const FORBIDDEN = [
  [/postgres(ql)?:\/\/[^\s"'`]+/i, 'a PostgreSQL connection string'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'a private key'],
  [/\bJWT_SECRET\b/, 'the JWT_SECRET setting name'],
  [/\bDATABASE_URL\b/, 'the DATABASE_URL setting name'],
  [/\bSEED_PASSWORD\b/, 'the SEED_PASSWORD setting name'],
  [/\bAKIA[0-9A-Z]{16}\b/, 'an AWS access key id'],
  [/\b(sk|rk)_(live|test)_[0-9a-zA-Z]{16,}\b/, 'a payment provider secret key'],
];

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

let all;
try {
  all = files(DIST.pathname.replace(/^\/([A-Za-z]:)/, '$1'));
} catch {
  console.error('dist/ not found: run `npm run build` first');
  process.exit(1);
}

const problems = [];
for (const file of all.filter((f) => /\.(js|css|html|json|map|txt)$/.test(f))) {
  const text = readFileSync(file, 'utf8');
  for (const [pattern, what] of FORBIDDEN) if (pattern.test(text)) problems.push(`${file}: contains ${what}`);
}

if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log(`bundle check passed: ${all.length} files, no secrets or connection strings`);
