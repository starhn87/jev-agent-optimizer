// 배포할 archive를 풀어 Node의 Workers harness와 Deno가 같은 ESM을 검증한다.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const staging = mkdtempSync(join(tmpdir(), 'jev-compat-'));
try {
  execFileSync('tar', ['-xzf', 'artifacts/starhn87-jev-decisions-0.1.0.tgz', '-C', staging]);
  const module = pathToFileURL(join(staging, 'package/dist/index.js')).href;
  execFileSync(process.execPath, ['--test', 'tests/compat/worker.test.mjs'], {
    stdio: 'inherit', env: { ...process.env, JEV_COMPAT_MODULE: module },
  });
  const test = readFileSync('tests/compat/deno.test.ts', 'utf8').replace('../../packages/decisions/dist/index.js', module);
  const testPath = join(staging, 'deno.test.ts');
  writeFileSync(testPath, test);
  execFileSync('npx', ['--yes', '--package=deno@2.9.5', '--', 'deno', 'test', testPath], { stdio: 'inherit' });
} finally { rmSync(staging, { recursive: true, force: true }); }
