import { existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, readdirSync, rmSync, symlinkSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { stateDir, privateWrite } from './config.mjs';

const usage = 'jev-decision-kit agent install|uninstall [codex|claude|both], agent doctor';
const hash = text => createHash('sha256').update(text).digest('hex');
const present = path => { try { lstatSync(path); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; } };
const sameLink = (path, target) => present(path) && lstatSync(path).isSymbolicLink() && resolve(dirname(path), readlinkSync(path)) === target;

export function agent(args) {
  const [command = 'help', ...rest] = args;
  if (command === 'help' || command === '--help') return console.log(`판단 CLI를 호출하는 에이전트 스킬\n  ${usage}`);
  if (!['install', 'doctor', 'uninstall'].includes(command) || rest.length > 1 ||
      (command === 'doctor' && rest.length) || (rest[0] && !['codex', 'claude', 'both'].includes(rest[0]))) throw new Error(`사용법: ${usage}`);
  const root = join(stateDir(), 'skills/jev-decision-kit');
  const file = join(root, 'SKILL.md');
  const stateFile = join(stateDir(), 'skills.json');
  const links = { codex: join(homedir(), '.agents/skills/jev-decision-kit'), claude: join(homedir(), '.claude/skills/jev-decision-kit') };
  const state = existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, 'utf8')) : { version: 1, clients: [] };
  if (state.version !== 1 || !Array.isArray(state.clients) || state.clients.some(client => !Object.hasOwn(links, client))) throw new Error('스킬 설치 기록을 확인하세요.');
  if (command === 'doctor') {
    for (const [client, path] of Object.entries(links)) console.log(`${client} 판단 스킬: ${sameLink(path, root) && existsSync(file) ? '설치됨' : '설치 안 됨'} (${path})`);
    return;
  }
  const selected = rest[0] && rest[0] !== 'both' ? [rest[0]] : Object.keys(links);
  if (command === 'install') {
    for (const client of selected) if (present(links[client]) && !sameLink(links[client], root)) throw new Error(`${client} 스킬 위치에 다른 파일이 있어 덮어쓰지 않았습니다.`);
    const source = resolve(dirname(fileURLToPath(import.meta.url)), '../skills/jev-decision-kit/SKILL.md');
    const text = readFileSync(source, 'utf8') + `\n## Installed CLI location\n\nUse these absolute paths to call the local CLI from the consuming project's working directory:\n\n\`\`\`json\n${JSON.stringify({ nodeFile: process.execPath, cliFile: fileURLToPath(import.meta.url) }, null, 2)}\n\`\`\`\n`;
    if (existsSync(file) && hash(readFileSync(file, 'utf8')) !== (state.skillHash ?? hash(text))) throw new Error('설치한 스킬 파일이 수정되어 갱신을 중단했습니다.');
    mkdirSync(root, { recursive: true, mode: 0o700 });
    privateWrite(file, text);
    for (const client of selected) {
      mkdirSync(dirname(links[client]), { recursive: true, mode: 0o700 });
      if (!present(links[client])) symlinkSync(root, links[client], process.platform === 'win32' ? 'junction' : 'dir');
    }
    privateWrite(stateFile, JSON.stringify({ version: 1, clients: [...new Set([...state.clients, ...selected])], skillHash: hash(text) }, null, 2) + '\n');
    console.log(`${selected.join('·')} 판단 스킬 설치 완료. 새 에이전트 세션에서 jev-decision-kit 스킬을 사용할 수 있습니다.`);
    return;
  }
  const managed = selected.filter(client => state.clients.includes(client));
  for (const client of managed) if (present(links[client]) && !sameLink(links[client], root)) throw new Error(`${client} 스킬 연결이 변경되어 해제를 중단했습니다.`);
  if (managed.length && existsSync(file) && hash(readFileSync(file, 'utf8')) !== state.skillHash) throw new Error('스킬 파일이 수정되어 해제를 중단했습니다.');
  for (const client of managed) if (present(links[client])) rmSync(links[client]);
  const remaining = state.clients.filter(client => !managed.includes(client));
  if (remaining.length) privateWrite(stateFile, JSON.stringify({ ...state, clients: remaining }, null, 2) + '\n');
  else if (managed.length) {
    rmSync(stateFile);
    if (existsSync(file)) rmSync(file);
    if (existsSync(root) && !readdirSync(root).length) rmSync(root, { recursive: true });
  }
  console.log(managed.length ? '판단 스킬을 해제했습니다.' : '해제할 판단 스킬이 없습니다.');
}
