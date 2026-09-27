import { existsSync, mkdirSync, copyFileSync, cpSync, readFileSync, chmodSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { stateDir, configuration, privateWrite } from './config.mjs';

export function agent(args) {
  const [requested, ...rest] = args;
  const command = !requested || requested === '--help' ? 'help' : requested;
  const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const { apiKey } = configuration();
  const env = { ...process.env, ...(apiKey ? { TYPESAFE_API_KEY: apiKey } : {}) };
  const execute = file => {
    const result = spawnSync(process.execPath, [file, command === 'help' ? '--help' : command, ...rest], { stdio: 'inherit', env });
    if (result.error) throw new Error('에이전트 도구를 실행할 수 없습니다.');
    process.exitCode = result.status ?? 1;
  };
  if (!['install', 'doctor', 'uninstall'].includes(command)) return execute(join(packageRoot, 'dist/agent-cli.mjs'));
  if (rest.length > 1 || (command === 'doctor' && rest.length) || (rest[0] && !['codex', 'claude', 'both'].includes(rest[0]))) {
    throw new Error('사용법: jev-decision-kit agent install|uninstall [codex|claude|both], agent doctor');
  }
  if (command === 'install' && !apiKey) throw new Error('먼저 jev-decision-kit init으로 API 키를 설정하세요.');
  const dataRoot = join(stateDir(), 'agent');
  let root = dataRoot;
  if (existsSync(join(stateDir(), 'install.json'))) {
    const saved = JSON.parse(readFileSync(join(stateDir(), 'install.json'), 'utf8'));
    if (saved.version !== 1 || typeof saved.repo !== 'string') throw new Error('에이전트 설치 기록을 확인하세요.');
    root = saved.repo;
  }
  if (root !== dataRoot && !existsSync(join(root, 'dist/cli.js'))) throw new Error('에이전트 설치 경로가 없습니다. 기존 연결을 해제한 뒤 다시 설치하세요.');
  if (root === dataRoot && command === 'install') {
    mkdirSync(join(root, 'dist'), { recursive: true, mode: 0o700 });
    copyFileSync(join(packageRoot, 'dist/agent-cli.mjs'), join(root, 'dist/cli.js'));
    privateWrite(join(root, 'package.json'), '{"type":"module"}\n');
    cpSync(join(packageRoot, 'claude-mod'), join(root, 'claude-mod'), { recursive: true });
  }
  if (command === 'install') {
    const envPath = join(root, '.env');
    const previous = existsSync(envPath) ? readFileSync(envPath, 'utf8') : '';
    const remaining = previous.split('\n').filter(line => !/^\s*(?:export\s+)?TYPESAFE_API_KEY\s*=/.test(line)).join('\n').trim();
    privateWrite(envPath, `${remaining ? remaining + '\n' : ''}TYPESAFE_API_KEY=${JSON.stringify(apiKey)}\n`);
    chmodSync(envPath, 0o600);
  }
  if (!existsSync(join(root, 'dist/cli.js'))) {
    if (command === 'doctor') return console.log('에이전트 연결 없음. 연결하려면 jev-decision-kit agent install을 실행하세요.');
    if (command === 'uninstall') return console.log('해제할 에이전트 연결이 없습니다.');
    throw new Error('설치된 에이전트 도구가 없습니다.');
  }
  execute(join(root, 'dist/cli.js'));
}
