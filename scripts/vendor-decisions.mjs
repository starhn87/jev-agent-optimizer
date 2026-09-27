import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';

const target = process.argv[2];
if (!target) throw new Error('Usage: node scripts/vendor-decisions.mjs /absolute/consumer/vendor/jev-decisions');
const root = new URL('../', import.meta.url);
const { version } = JSON.parse(readFileSync(new URL('packages/decisions/package.json', root), 'utf8'));
const staging = mkdtempSync(resolve(tmpdir(), 'jev-pack-'));
execFileSync('tar', ['-xzf', new URL(`artifacts/starhn87-jev-decisions-${version}.tgz`, root).pathname, '-C', staging]);
const source = new URL(`file://${staging}/package/`);
mkdirSync(target, { recursive: true });
const files = ['dist/index.js', 'dist/index.d.ts', 'dist/types.d.ts', 'dist/validation.d.ts', 'package.json', 'LICENSE', 'THIRD_PARTY_LICENSES', 'README.md'];
const hashes = {};
for (const file of files) {
  const dest = resolve(target, file);
  mkdirSync(resolve(dest, '..'), { recursive: true });
  copyFileSync(new URL(file, source), dest);
  hashes[file] = createHash('sha256').update(readFileSync(dest)).digest('hex');
}
const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
writeFileSync(resolve(target, 'provenance.json'), JSON.stringify({ package: '@starhn87/jev-decisions', version, sourceCommit, files: hashes }, null, 2) + '\n');

rmSync(staging, { recursive: true, force: true });
