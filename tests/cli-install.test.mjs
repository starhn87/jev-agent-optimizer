import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync, spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync, statSync, lstatSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { stageCliPackage } from '../scripts/publish-cli-branch.mjs';

let staging, cli, archive;
before(() => {
  staging = mkdtempSync(join(tmpdir(), 'jev-cli-install-'));
  const [pack] = JSON.parse(execFileSync('npm', ['pack', '--ignore-scripts', '--workspace', '@starhn87/jev-decision-kit', '--json', '--pack-destination', staging], { encoding: 'utf8' }));
  assert.ok(pack.files.every(file => !/(^|\/)(?:\.env|\.local|tests|src|apps|claude-mod|hooks)(?:\/|$)/.test(file.path)));
  assert.deepEqual(pack.files.filter(file => file.path.startsWith('dist/')).map(file => file.path), ['dist/cli.mjs']);
  assert.ok(pack.files.some(file => file.path === 'skills/jev-decision-kit/SKILL.md'));
  archive = join(staging, pack.filename);
  writeFileSync(join(staging, 'package.json'), '{"private":true}');
  execFileSync('npm', ['install', '--no-audit', '--no-fund', join(staging, pack.filename)], { cwd: staging, stdio: 'pipe' });
  cli = join(staging, 'node_modules/.bin/jev-decision-kit');
});
after(() => { if (staging) rmSync(staging, { recursive: true, force: true }); });
function fixture(t) {
  const home = mkdtempSync(join(staging, 'home-'));
  const env = { ...process.env, HOME: home };
  for (const name of ['TYPESAFE_API_KEY', 'JEV_KIT_MODEL', 'CODEX_HOME', 'CLAUDE_CONFIG_DIR']) delete env[name];
  const run = (args, input) => spawnSync(process.execPath, [cli, ...args], { cwd: staging, env, input, encoding: 'utf8' });
  const put = (path, text) => { mkdirSync(join(home, path, '..'), { recursive: true }); writeFileSync(join(home, path), text); };
  const get = path => readFileSync(join(home, path), 'utf8');
  return { home, env, run, put, get };
}

test('packaged CLI runs init, examples, decisions and evaluation independently', async t => {
  const h = fixture(t);
  let result = h.run(['demo']);
  assert.equal(result.status, 1); assert.match(result.stderr, /init/);
  result = h.run(['demo', '--offline']); assert.equal(result.status, 0, result.stderr); assert.match(result.stdout, /모의 실행/);
  assert.match(result.stdout, /입력 문장: 계정 설정을 변경하고 싶어요/);
  assert.match(result.stdout, /질문: 이 문장은 계정 지원 문의인가요\?/);
  assert.match(result.stdout, /선택지: 예 \/ 아니오 \/ 판단보류/);
  assert.match(result.stdout, /판단 결과: 예 — 계정 지원 문의에 해당합니다\./);
  assert.match(result.stdout, /모델 신뢰도: 97.0%/);
  assert.match(result.stdout, /처리 시간: \d+ms \(모의 응답 처리\)/);
  result = h.run(['demo', '--offline', '--json']); assert.equal(result.status, 0);
  assert.equal(JSON.parse(result.stdout).answers.decision.choice, '예');
  assert.equal(existsSync(join(h.home, '.jev-decision-kit')), false);
  result = h.run(['init', '--stdin'], 'synthetic-key\n'); assert.equal(result.status, 0, result.stderr); assert.ok(!result.stdout.includes('synthetic-key'));
  const secret = join(h.home, '.jev-decision-kit/.env');
  assert.equal(statSync(secret).mode & 0o777, 0o600); assert.match(readFileSync(secret, 'utf8'), /synthetic-key/);
  result = h.run(['doctor']); assert.equal(result.status, 0); assert.match(result.stdout, /설정됨/); assert.ok(!result.stdout.includes('synthetic-key'));
  result = h.run(['eval', '--demo']); assert.equal(JSON.parse(result.stdout).total, 1);
  const server = createServer((req, res) => {
    let body = ''; req.on('data', part => { body += part; });
    req.on('end', () => {
      const payload = JSON.parse(body);
      const demo = payload.state.message === '계정 설정을 변경하고 싶어요';
      assert.equal(req.headers.authorization, 'Bearer synthetic-key');
      if (!demo) assert.equal(payload.state.message, 'hello');
      const choices = demo ? ['예', '아니오', '판단보류'] : ['yes', 'no'];
      assert.deepEqual(Object.keys(payload.questions.decision.criteria), choices);
      const choice = demo && req.url.startsWith('/deferred') ? '판단보류' : demo && req.url.startsWith('/no') ? '아니오' : choices[0];
      const probabilities = Object.fromEntries(choices.map(label => [label, label === choice ? 0.9 : 0.1 / (choices.length - 1)]));
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ model: 'jev-1.13.0', answers: { decision: { type: 'choice', choice, confidence: 0.9, probabilities } } }));
    });
  });
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const baseURL = `http://127.0.0.1:${server.address().port}`;
    const run = args => new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [cli, ...args], { cwd: staging, env: h.env });
      let stdout = '', stderr = ''; child.stdout.on('data', part => { stdout += part; }); child.stderr.on('data', part => { stderr += part; });
      child.on('error', reject); child.on('close', code => code === 0 ? resolve(stdout) : reject(new Error(stderr)));
    });
    const output = await run(['decide', '--text', 'hello', '--question', 'Is this relevant?', '--choices', 'yes,no', '--json', '--base-url', baseURL]);
    assert.equal(JSON.parse(output).answers.decision.choice, 'yes');
    const demo = await run(['demo', '--base-url', baseURL]);
    assert.match(demo, /Jev 판단 예제 — 실제 API 호출/); assert.match(demo, /계정 지원 문의에 해당합니다\./);
    assert.match(demo, /처리 시간: \d+ms \(API 요청부터 응답 검증 완료까지\)/);
    assert.match(await run(['demo', '--base-url', `${baseURL}/no`]), /판단 결과: 아니오 — 계정 지원 문의에 해당하지 않습니다\./);
    assert.match(await run(['demo', '--base-url', `${baseURL}/deferred`]), /판단 결과: 판단보류 — 계정 지원 문의인지 판단을 보류했습니다\./);
    assert.equal(existsSync(join(h.home, '.codex/config.toml')), false); assert.equal(existsSync(join(h.home, '.claude/settings.json')), false);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('Git installation runs the standalone CLI and skill without build scripts or workspace dependencies', t => {
  const h = fixture(t), source = join(staging, 'git-package'), client = join(staging, 'git-client');
  const version = stageCliPackage(archive, source);
  const manifest = JSON.parse(readFileSync(join(source, 'package.json'), 'utf8'));
  assert.equal(manifest.scripts, undefined); assert.equal(manifest.workspaces, undefined);
  const git = args => execFileSync('git', args, { cwd: source, stdio: 'pipe' });
  git(['init', '--initial-branch=cli']); git(['add', '.']);
  git(['-c', 'user.name=Codex', '-c', 'user.email=noreply@openai.com', 'commit', '-m', 'test(cli): stage install fixture\n\nCo-authored-by: Codex <noreply@openai.com>']);
  mkdirSync(client); writeFileSync(join(client, 'package.json'), '{"private":true}');
  execFileSync('npm', ['install', '--no-audit', '--no-fund', `git+file://${source}#cli`], { cwd: client, env: h.env, stdio: 'pipe' });
  const installed = join(client, 'node_modules/@starhn87/jev-decision-kit');
  assert.equal(JSON.parse(readFileSync(join(installed, 'package.json'), 'utf8')).version, version);
  const run = args => execFileSync(process.execPath, [join(installed, 'dist/cli.mjs'), ...args], { env: h.env, encoding: 'utf8' });
  assert.match(run(['demo', '--offline']), /판단 결과: 예 — 계정 지원 문의에 해당합니다/);
  run(['agent', 'install', 'codex']);
  assert.match(h.get('.agents/skills/jev-decision-kit/SKILL.md'), /jev-decision-kit decide/);
});

test('agent help, diagnostics and uninstalled removal have no side effects; removed commands fail', t => {
  const h = fixture(t);
  for (const args of [['agent', '--help'], ['agent', 'doctor'], ['agent', 'uninstall']]) {
    const result = h.run(args); assert.equal(result.status, 0, result.stderr);
  }
  assert.equal(existsSync(join(h.home, '.jev-decision-kit')), false);
  for (const command of ['serve', 'codex', 'search', 'memory-filter']) {
    const result = h.run(['agent', command]); assert.equal(result.status, 1); assert.match(result.stderr, /사용법/);
  }
  assert.equal(existsSync(join(h.home, '.jev-decision-kit')), false);
});

test('agent install only links decision skills and preserves app settings without launching apps', t => {
  const h = fixture(t); h.env.PATH = '';
  const codex = 'model = "user-selected-model"\nmodel_provider = "existing"\n';
  const claude = '{"env":{"KEEP":"value"},"permissions":{"allow":["Read"]}}\n';
  h.put('.codex/config.toml', codex); h.put('.claude/settings.json', claude);
  let result = h.run(['agent', 'install']); assert.equal(result.status, 0, result.stderr);
  assert.equal(h.get('.codex/config.toml'), codex); assert.equal(h.get('.claude/settings.json'), claude);
  assert.equal(existsSync(join(h.home, 'Library/LaunchAgents')), false);
  assert.equal(existsSync(join(h.home, '.jev-decision-kit/agent')), false);
  assert.equal(existsSync(join(h.home, '.jev-decision-kit/.env')), false);
  for (const path of ['.agents/skills/jev-decision-kit', '.claude/skills/jev-decision-kit']) {
    assert.ok(lstatSync(join(h.home, path)).isSymbolicLink()); assert.match(h.get(`${path}/SKILL.md`), /jev-decision-kit decide/);
  }
  result = h.run(['agent', 'install']); assert.equal(result.status, 0, result.stderr);
  result = h.run(['agent', 'doctor']); assert.equal(result.status, 0); assert.match(result.stdout, /codex 판단 스킬: 설치됨/); assert.match(result.stdout, /claude 판단 스킬: 설치됨/);
  result = h.run(['agent', 'uninstall', 'claude']); assert.equal(result.status, 0, result.stderr);
  assert.equal(existsSync(join(h.home, '.claude/skills/jev-decision-kit')), false);
  assert.ok(existsSync(join(h.home, '.agents/skills/jev-decision-kit/SKILL.md')));
  result = h.run(['agent', 'uninstall']); assert.equal(result.status, 0, result.stderr);
  assert.equal(existsSync(join(h.home, '.agents/skills/jev-decision-kit')), false);
  assert.equal(existsSync(join(h.home, '.jev-decision-kit/skills.json')), false);
  assert.equal(h.get('.codex/config.toml'), codex); assert.equal(h.get('.claude/settings.json'), claude);
});

test('a foreign skill prevents partial installation and remains unchanged', t => {
  const h = fixture(t); h.put('.claude/skills/jev-decision-kit/SKILL.md', 'user skill');
  const result = h.run(['agent', 'install']); assert.equal(result.status, 1); assert.match(result.stderr, /다른 파일/);
  assert.equal(h.get('.claude/skills/jev-decision-kit/SKILL.md'), 'user skill');
  assert.equal(existsSync(join(h.home, '.agents')), false); assert.equal(existsSync(join(h.home, '.jev-decision-kit')), false);
});

test('edited installed skills are preserved on refresh and uninstall', t => {
  const h = fixture(t); assert.equal(h.run(['agent', 'install', 'codex']).status, 0);
  h.put('.jev-decision-kit/skills/jev-decision-kit/SKILL.md', 'user edit');
  for (const command of ['install', 'uninstall']) {
    const result = h.run(['agent', command, 'codex']); assert.equal(result.status, 1); assert.match(result.stderr, /수정/);
    assert.equal(h.get('.agents/skills/jev-decision-kit/SKILL.md'), 'user edit');
  }
});
