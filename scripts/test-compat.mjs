// 배포할 archive를 풀어 Node의 Workers harness와 Deno가 같은 ESM을 검증한다.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const staging = mkdtempSync(join(tmpdir(), 'jev-compat-'));
try {
  let archive = process.argv[2];
  if (!archive) {
    execFileSync('npm', ['run', 'build', '--workspace', '@starhn87/jev-decisions'], { stdio: 'inherit' });
    const [packed] = JSON.parse(execFileSync('npm', ['pack', '--ignore-scripts', '--workspace', '@starhn87/jev-decisions', '--json', '--pack-destination', staging], { encoding: 'utf8' }));
    archive = join(staging, packed.filename);
  }
  execFileSync('tar', ['-xzf', archive, '-C', staging]);
  const sdkVersion = JSON.parse(readFileSync(join(staging, 'package/package.json'), 'utf8')).peerDependencies['@typesafe-ai/sdk'];
  writeFileSync(join(staging, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
  execFileSync('npm', ['install', `@typesafe-ai/sdk@${sdkVersion}`, '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: staging, stdio: 'pipe' });
  const module = pathToFileURL(join(staging, 'package/dist/index.js')).href;
  execFileSync(process.execPath, ['--test', 'tests/compat/worker.test.mjs'], {
    stdio: 'inherit', env: { ...process.env, JEV_COMPAT_MODULE: module, JEV_COMPAT_SDK_MODULE: join(staging, 'node_modules/@typesafe-ai/sdk/dist/index.mjs') },
  });
  const test = readFileSync('tests/compat/deno.test.ts', 'utf8').replace('../../packages/decisions/dist/index.js', module);
  const testPath = join(staging, 'deno.test.ts');
  writeFileSync(testPath, test);
  writeFileSync(join(staging, 'deno.json'), JSON.stringify({ imports: { '@typesafe-ai/sdk': `npm:@typesafe-ai/sdk@${sdkVersion}` }, nodeModulesDir: 'none' }));
  execFileSync('npx', ['--yes', '--package=deno@2.9.5', '--', 'deno', 'test', '--config', join(staging, 'deno.json'), testPath], { stdio: 'inherit' });
} finally { rmSync(staging, { recursive: true, force: true }); }
