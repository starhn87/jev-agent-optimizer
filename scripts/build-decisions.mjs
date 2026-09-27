import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const pkg = new URL('packages/decisions/', root);
rmSync(new URL('dist/', pkg), { recursive: true, force: true });
mkdirSync(new URL('dist/', pkg), { recursive: true });
execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'packages/decisions/tsconfig.json'], { cwd: root, stdio: 'inherit' });
await build({ entryPoints: [new URL('src/index.ts', pkg).pathname], outfile: new URL('dist/index.js', pkg).pathname,
  bundle: true, format: 'esm', platform: 'neutral', target: 'es2022',
  external: ['@typesafe-ai/sdk'],
  banner: { js: '// @ts-self-types="./index.d.ts"' }, legalComments: 'eof',
});
const manifest = JSON.parse(readFileSync(new URL('package.json', pkg)));
writeFileSync(new URL('dist/build.json', pkg), JSON.stringify({ name: manifest.name, version: manifest.version, sdk: manifest.peerDependencies['@typesafe-ai/sdk'] }, null, 2) + '\n');
