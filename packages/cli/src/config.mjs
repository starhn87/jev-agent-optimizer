import { readFileSync, mkdirSync, writeFileSync, renameSync, chmodSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { parseEnv } from 'node:util';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';

export const stateDir = () => join(homedir(), '.jev-utils');
export const keyFile = () => join(stateDir(), '.env');
export const defaultModel = 'jev-1.13.0';
export const cliCommand = command => `${process.env.npm_lifecycle_event === 'jev' ? 'npm run jev --' : process.env.npm_lifecycle_event === 'cli' ? 'npm run cli --' : 'jev-utils'} ${command}`;
export function readEnv(path) {
  try { return parseEnv(readFileSync(path, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return {}; throw new Error('설정 파일을 읽을 수 없습니다. 파일 권한을 확인하세요.'); }
}
export function configuration() {
  const saved = readEnv(keyFile());
  return { apiKey: process.env.TYPESAFE_API_KEY || saved.TYPESAFE_API_KEY || '',
    model: process.env.JEV_UTILS_MODEL || saved.JEV_UTILS_MODEL || defaultModel };
}
export function privateWrite(path, contents) {
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, contents, { mode: 0o600, flag: 'wx' });
  renameSync(tmp, path); chmodSync(path, 0o600);
}
async function promptKey() {
  if (!process.stdin.isTTY) throw new Error(`터미널에서 ${cliCommand('init')}을 실행하세요. 자동화에서는 init --stdin으로 키를 전달할 수 있습니다.`);
  const output = new Writable({ write(_chunk, _encoding, done) { done(); } });
  const input = createInterface({ input: process.stdin, output, terminal: true });
  try {
    const answer = input.question('');
    process.stdout.write('TypeSafe API 키: ');
    return await answer;
  }
  finally { input.close(); output.end(); process.stdout.write('\n'); }
}
export async function initialize(args) {
  if (args.length > 1 || (args[0] && args[0] !== '--stdin')) throw new Error(`사용법: ${cliCommand('init [--stdin]')}`);
  let key;
  if (args[0] === '--stdin') {
    const chunks = []; let size = 0;
    for await (const chunk of process.stdin) {
      size += chunk.length;
      if (size > 8192) throw new Error('키 입력이 너무 깁니다.');
      chunks.push(chunk);
    }
    key = Buffer.concat(chunks).toString('utf8').trim();
  } else key = process.env.TYPESAFE_API_KEY || await promptKey();
  key = key.trim();
  if (!key || key.length > 4096 || /[\s\x00-\x1f]/u.test(key)) throw new Error('비어 있지 않은 API 키를 입력하세요.');
  mkdirSync(stateDir(), { recursive: true, mode: 0o700 });
  const previous = existsSync(keyFile()) ? readFileSync(keyFile(), 'utf8') : '';
  const remaining = previous.split('\n').filter(line => !/^\s*(?:export\s+)?(?:TYPESAFE_API_KEY|JEV_UTILS_MODEL)\s*=/.test(line)).join('\n').trim();
  privateWrite(keyFile(), `${remaining ? remaining + '\n' : ''}TYPESAFE_API_KEY=${JSON.stringify(key)}\nJEV_UTILS_MODEL=${defaultModel}\n`);
  console.log(`설정 완료. 다음 명령: ${['setup', 'cli'].includes(process.env.npm_lifecycle_event) ? 'npm run demo' : cliCommand('demo')}`);
}
