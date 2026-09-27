import { build } from 'esbuild';
import { cpSync, mkdirSync, copyFileSync, chmodSync } from 'node:fs';
const root = new URL('../', import.meta.url);
const pkg = new URL('packages/cli/', root);
mkdirSync(new URL('dist/', pkg), { recursive: true });
await build({ entryPoints: [new URL('src/cli.mjs', pkg).pathname], outfile: new URL('dist/cli.mjs', pkg).pathname,
  bundle: true, platform: 'node', format: 'esm', target: 'node22', legalComments: 'eof' });
await build({ entryPoints: [new URL('apps/agent-tools/src/cli.ts', root).pathname], outfile: new URL('dist/agent-cli.mjs', pkg).pathname,
  bundle: true, platform: 'node', format: 'esm', target: 'node22', legalComments: 'eof' });
for (const part of ['hooks', 'skills', '.claude-plugin']) cpSync(new URL(`claude-mod/${part}/`, root), new URL(`claude-mod/${part}/`, pkg), { recursive: true });
copyFileSync(new URL('packages/decisions/THIRD_PARTY_LICENSES', root), new URL('THIRD_PARTY_LICENSES', pkg));
chmodSync(new URL('dist/cli.mjs', pkg), 0o755);
