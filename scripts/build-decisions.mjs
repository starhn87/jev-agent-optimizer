import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const pkg = new URL('packages/decisions/', root);
mkdirSync(new URL('dist/', pkg), { recursive: true });
execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'packages/decisions/tsconfig.json'], { cwd: root, stdio: 'inherit' });
for (const file of readdirSync(new URL('dist/', pkg)).filter(file => file.endsWith('.d.ts'))) {
  const path = new URL(`dist/${file}`, pkg);
  writeFileSync(path, readFileSync(path, 'utf8').replace(/(\.\/[^"']+)\.js(["'])/g, '$1.d.ts$2'));
}
// 단일 ESM의 선언도 합쳐 TypeScript와 Deno에서 값 export의 .d.ts 재수출을 피한다.
const indexPath = new URL('dist/index.d.ts', pkg);
const index = readFileSync(indexPath, 'utf8').split('\n').filter(line =>
  !line.startsWith('import type ') && !line.startsWith('export type * ') && !line.startsWith('export { validateAnswers }')).join('\n');
const validator = readFileSync(new URL('dist/validation.d.ts', pkg), 'utf8').match(/^export declare function validateAnswers[^\n]+/m)?.[0];
if (!validator) throw new Error('Missing validation declaration');
writeFileSync(indexPath, readFileSync(new URL('dist/types.d.ts', pkg), 'utf8') + '\n' + index + '\n' + validator + '\n');
await build({ entryPoints: [new URL('src/index.ts', pkg).pathname], outfile: new URL('dist/index.js', pkg).pathname,
  bundle: true, format: 'esm', platform: 'neutral', target: 'es2022',
  banner: { js: '// @ts-self-types="./index.d.ts"' }, legalComments: 'eof',
});
copyFileSync(new URL('node_modules/@typesafe-ai/sdk/LICENSE', root), new URL('THIRD_PARTY_LICENSES', pkg));
const manifest = JSON.parse(readFileSync(new URL('package.json', pkg)));
writeFileSync(new URL('dist/build.json', pkg), JSON.stringify({ name: manifest.name, version: manifest.version, sdk: '0.6.0' }, null, 2) + '\n');
