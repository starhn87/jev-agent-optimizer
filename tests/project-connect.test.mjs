import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const connector = fileURLToPath(new URL('../scripts/connect-project.mjs', import.meta.url));
const kitRoot = fileURLToPath(new URL('../', import.meta.url));
function fixture(t, extra = {}) {
  const temp = mkdtempSync(join(tmpdir(), 'jev-project-connect-'));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  const project = join(temp, 'my app'); mkdirSync(project);
  const home = join(temp, 'home'); mkdirSync(home);
  const env = { ...process.env, HOME: home, NPM_CONFIG_OFFLINE: 'true' };
  for (const name of ['TYPESAFE_API_KEY', 'JEV_KIT_MODEL', 'CODEX_HOME', 'CLAUDE_CONFIG_DIR']) delete env[name];
  const manifest = { name: 'consumer', private: true, type: 'module', scripts: { keep: 'echo existing', preinstall: 'node -e "require(\'node:fs\').writeFileSync(\'unexpected-hook\', \'ran\')"' }, custom: { preserved: true }, ...extra };
  writeFileSync(join(project, 'package.json'), JSON.stringify(manifest, null, 2) + '\n');
  const connect = () => spawnSync(process.execPath, [connector, project], { env, encoding: 'utf8' });
  const get = path => readFileSync(join(project, path), 'utf8');
  return { project, temp, home, env, manifest, connect, get };
}

test('a clone with no installed toolkit dependencies or build connects through npm run connect', t => {
  const h = fixture(t);
  h.env.NODE_ENV = 'production'; h.env.NPM_CONFIG_PACKAGE_LOCK = 'false';
  const clone = join(h.temp, 'bare toolkit'); mkdirSync(clone);
  for (const path of ['package.json', 'scripts/connect-project.mjs', 'skills/jev-decision-kit/SKILL.md', 'packages/cli/package.json', 'packages/decisions/package.json']) {
    mkdirSync(join(clone, path, '..'), { recursive: true }); cpSync(join(kitRoot, path), join(clone, path));
  }
  mkdirSync(join(clone, 'artifacts'));
  for (const path of ['packages/cli/package.json', 'packages/decisions/package.json']) {
    const pkg = JSON.parse(readFileSync(join(kitRoot, path), 'utf8'));
    const filename = `${pkg.name.replace('@', '').replace('/', '-')}-${pkg.version}.tgz`;
    cpSync(join(kitRoot, 'artifacts', filename), join(clone, 'artifacts', filename));
  }
  const result = spawnSync('npm', ['run', 'connect', '--', h.project], { cwd: clone, env: h.env, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(existsSync(join(clone, 'node_modules')), false);
  assert.equal(existsSync(join(clone, 'packages/cli/dist')), false);
  const output = execFileSync('npm', ['run', '--silent', 'jev', '--', 'demo', '--offline', '--json'], { cwd: h.project, env: h.env, encoding: 'utf8' });
  assert.equal(JSON.parse(output).answers.decision.choice, '예');
});

test('one command connects portable library, local CLI and project skills with no install hooks', t => {
  const h = fixture(t);
  writeFileSync(join(h.project, '.env'), 'PRIVATE_APP_SETTING=preserve\n');
  mkdirSync(join(h.project, '.codex')); writeFileSync(join(h.project, '.codex/config.toml'), 'model = "existing-model"\n');
  mkdirSync(join(h.project, '.claude')); writeFileSync(join(h.project, '.claude/settings.json'), '{"permissions":{"allow":["Read"]}}\n');
  let result = h.connect(); assert.equal(result.status, 0, result.stderr);
  const manifest = JSON.parse(h.get('package.json'));
  assert.equal(manifest.scripts.jev, 'jev-decision-kit');
  assert.equal(manifest.dependencies['@typesafe-ai/sdk'], '0.6.0');
  assert.equal(manifest.scripts.keep, h.manifest.scripts.keep); assert.deepEqual(manifest.custom, h.manifest.custom);
  assert.match(manifest.dependencies['@starhn87/jev-decisions'], /^file:vendor\/jev-decision-kit\//);
  assert.match(manifest.devDependencies['@starhn87/jev-decision-kit'], /^file:vendor\/jev-decision-kit\//);
  assert.equal(existsSync(join(h.project, 'unexpected-hook')), false);
  assert.equal(h.get('.env'), 'PRIVATE_APP_SETTING=preserve\n');
  assert.equal(h.get('.codex/config.toml'), 'model = "existing-model"\n');
  assert.equal(h.get('.claude/settings.json'), '{"permissions":{"allow":["Read"]}}\n');
  assert.equal(existsSync(join(h.home, '.jev-decision-kit')), false);
  assert.equal(h.get('.agents/skills/jev-decision-kit/SKILL.md'), h.get('.claude/skills/jev-decision-kit/SKILL.md'));
  const oldManifest = h.get('package.json'), oldLock = h.get('package-lock.json'), oldState = h.get('vendor/jev-decision-kit/connection.json');
  result = h.connect(); assert.equal(result.status, 0, result.stderr);
  assert.equal(h.get('package.json'), oldManifest); assert.equal(h.get('package-lock.json'), oldLock); assert.equal(h.get('vendor/jev-decision-kit/connection.json'), oldState);

  const fresh = join(h.temp, 'fresh deployment'); mkdirSync(fresh);
  for (const path of ['package.json', 'package-lock.json', 'vendor', '.agents', '.claude']) cpSync(join(h.project, path), join(fresh, path), { recursive: true });
  rmSync(h.project, { recursive: true });
  execFileSync('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: fresh, env: h.env, stdio: 'pipe' });
  const output = execFileSync('npm', ['run', '--silent', 'jev', '--', 'demo', '--offline', '--json'], { cwd: fresh, env: h.env, encoding: 'utf8' });
  assert.equal(JSON.parse(output).answers.decision.choice, '예');
  const initialized = execFileSync('npm', ['run', '--silent', 'jev', '--', 'init', '--stdin'], { cwd: fresh, env: h.env, input: 'test-only-key\n', encoding: 'utf8' });
  assert.match(initialized, /npm run jev -- demo/);
  const decision = execFileSync(process.execPath, ['--input-type=module', '-e', `
    import { TypeSafeClient } from '@typesafe-ai/sdk';
    import { toObservation } from '@starhn87/jev-decisions';
    const client = new TypeSafeClient({ apiKey: 'test-only', defaultModel: 'jev-1.13.0', logLevel: 'off', fetch: async () => new Response(JSON.stringify({ model: 'jev-1.13.0', answers: { kind: { type: 'choice', choice: 'yes', confidence: 0.9, probabilities: { yes: 0.9, no: 0.1 } } } }), { headers: { 'content-type': 'application/json' } }) });
    const questions = { kind: { type: 'choice', instructions: 'Relevant?', criteria: { yes: 'relevant', no: 'irrelevant' } } };
    const response = await client.systemOne({ state: { message: 'sample' }, questions }).withResponse();
    console.log(JSON.stringify(toObservation(questions, response, { definitionId: 'test', definitionVersion: '1', requestedModel: client.defaultModel, durationMs: 1 })));
  `], { cwd: fresh, env: h.env, encoding: 'utf8' });
  assert.equal(JSON.parse(decision).answers.kind.choice, 'yes');
  rmSync(join(fresh, 'node_modules'), { recursive: true });
  execFileSync('npm', ['ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: fresh, env: h.env, stdio: 'pipe' });
  assert.ok(existsSync(join(fresh, 'node_modules/@starhn87/jev-decisions/dist/index.js')));
  assert.ok(existsSync(join(fresh, 'node_modules/@typesafe-ai/sdk/dist/index.mjs')));
  assert.equal(existsSync(join(fresh, 'node_modules/@starhn87/jev-decision-kit')), false);
});

test('foreign commands, skills, managers and edited connection files are preserved before writes', t => {
  const scenarios = [
    { extra: { scripts: { jev: 'user-tool' } }, expected: /기존 jev/ },
    { extra: { dependencies: { '@starhn87/jev-decisions': '0.1.0' } }, expected: /기존 .*의존성/ },
    { extra: { dependencies: { '@typesafe-ai/sdk': '0.5.0' } }, expected: /기존 SDK/ },
    { extra: { packageManager: 'pnpm@10.0.0' }, expected: /npm\/package-lock/ },
    { extra: {}, file: '.claude/skills/jev-decision-kit/SKILL.md', expected: /기존 스킬/ },
  ];
  for (const scenario of scenarios) {
    const h = fixture(t, scenario.extra);
    if (scenario.file) { mkdirSync(join(h.project, '.claude/skills/jev-decision-kit'), { recursive: true }); writeFileSync(join(h.project, scenario.file), 'user skill'); }
    const original = h.get('package.json');
    const result = h.connect(); assert.equal(result.status, 1); assert.match(result.stderr, scenario.expected);
    assert.equal(h.get('package.json'), original); assert.equal(existsSync(join(h.project, 'vendor')), false); assert.equal(existsSync(join(h.project, '.agents')), false);
    if (scenario.file) assert.equal(h.get(scenario.file), 'user skill');
  }
  const h = fixture(t); assert.equal(h.connect().status, 0);
  const original = h.get('package.json'), lock = h.get('package-lock.json');
  writeFileSync(join(h.project, '.agents/skills/jev-decision-kit/SKILL.md'), 'user edit');
  const result = h.connect(); assert.equal(result.status, 1); assert.match(result.stderr, /수정/);
  assert.equal(h.get('.agents/skills/jev-decision-kit/SKILL.md'), 'user edit');
  assert.equal(h.get('package.json'), original); assert.equal(h.get('package-lock.json'), lock);
});

test('failed npm installation restores connection files and the original manifest and lockfile', t => {
  const h = fixture(t, { dependencies: { missing: 'file:./does-not-exist.tgz' } });
  writeFileSync(join(h.project, 'package-lock.json'), JSON.stringify({ name: 'consumer', lockfileVersion: 3, packages: { '': { name: 'consumer', dependencies: { missing: 'file:./does-not-exist.tgz' } } } }) + '\n');
  const original = h.get('package.json'), lock = h.get('package-lock.json');
  const result = h.connect(); assert.equal(result.status, 1); assert.match(result.stderr, /npm 설치가 실패/);
  assert.equal(h.get('package.json'), original); assert.equal(h.get('package-lock.json'), lock);
  for (const path of ['vendor', '.agents', '.claude', 'unexpected-hook']) assert.equal(existsSync(join(h.project, path)), false);
});
