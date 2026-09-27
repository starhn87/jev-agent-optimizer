import { build } from 'esbuild';
import { cpSync, mkdirSync, copyFileSync, chmodSync, rmSync } from 'node:fs';
const root = new URL('../', import.meta.url);
const pkg = new URL('packages/cli/', root);
rmSync(new URL('dist/', pkg), { recursive: true, force: true });
rmSync(new URL('skills/', pkg), { recursive: true, force: true });
mkdirSync(new URL('dist/', pkg), { recursive: true });
await build({ entryPoints: [new URL('src/cli.mjs', pkg).pathname], outfile: new URL('dist/cli.mjs', pkg).pathname,
  bundle: true, platform: 'node', format: 'esm', target: 'node22', legalComments: 'eof' });
cpSync(new URL('skills/', root), new URL('skills/', pkg), { recursive: true });
copyFileSync(new URL('node_modules/@typesafe-ai/sdk/LICENSE', root), new URL('THIRD_PARTY_LICENSES', pkg));
chmodSync(new URL('dist/cli.mjs', pkg), 0o755);
