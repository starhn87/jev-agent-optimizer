import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const vendor = 'vendor/jev-utils';
const skillPaths = ['.agents/skills/jev-utils/SKILL.md', '.claude/skills/jev-utils/SKILL.md'];
const packages = { dependencies: '@starhn87/jev-decisions', devDependencies: '@starhn87/jev-utils' };
const sdkName = '@typesafe-ai/sdk';
const sdkVersion = JSON.parse(readFileSync(join(root, 'packages/decisions/package.json'), 'utf8')).peerDependencies[sdkName];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const present = path => { try { lstatSync(path); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; } };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const officialDirs = { codex: '.agents/skills/typesafe-ai', claude: '.claude/skills/typesafe-ai' };
const officialStatus = { project: '프로젝트에 설치·갱신', 'existing-project': '기존 프로젝트 스킬 사용', user: '기존 개인 스킬 사용', plugin: '기존 활성 플러그인 사용' };
const file = path => { try { return statSync(path).isFile(); } catch (error) { if (error.code === 'ENOENT') return false; throw error; } };
function json(filePath) {
  if (!existsSync(filePath)) return {};
  try {
    const value = JSON.parse(readFileSync(filePath, 'utf8'));
    if (!object(value)) throw new Error('invalid-object');
    return value;
  }
  catch { throw new Error(`${filePath}: 설정 파일을 읽을 수 없습니다.`); }
}

function officialBundle() {
  const directory = join(root, 'third-party/typesafe-ai');
  const source = json(join(directory, 'source.json'));
  if (source.repository !== 'https://github.com/typesafe-ai/skills' || !/^[a-f0-9]{40}$/.test(source.revision ?? '') || source.path !== 'skills/typesafe-ai' || !object(source.files) || !source.files['SKILL.md'] || !source.files.LICENSE) throw new Error('TypeSafe 공식 스킬의 원본 기록을 확인하세요.');
  const files = {};
  for (const [path, checksum] of Object.entries(source.files)) {
    if (!/^(?:[\w.-]+\/)*[\w.-]+$/.test(path) || path.split('/').some(part => ['.', '..'].includes(part))) throw new Error('TypeSafe 공식 스킬의 파일 경로를 확인하세요.');
    const bytes = readFileSync(join(directory, source.path, path));
    if (hash(bytes) !== checksum) throw new Error(`${path}: 보관된 TypeSafe 공식 스킬이 원본 기록과 다릅니다.`);
    files[path] = bytes;
  }
  return { source, files };
}

function personalOfficialSkill(agent, target) {
  if (agent === 'codex') {
    const paths = [join(homedir(), '.agents/skills/typesafe-ai/SKILL.md'), join(process.env.CODEX_HOME || join(homedir(), '.codex'), 'skills/typesafe-ai/SKILL.md')];
    return paths.some(file) ? 'user' : null;
  }
  const config = process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude');
  if (file(join(config, 'skills/typesafe-ai/SKILL.md'))) return 'user';
  const settings = [join(config, 'settings.json'), join(target, '.claude/settings.json'), join(target, '.claude/settings.local.json')];
  const enabled = Object.assign({}, ...settings.map(path => json(path).enabledPlugins));
  if (enabled['typesafe@typesafe-ai'] !== true) return null;
  const installed = json(join(config, 'plugins/installed_plugins.json')).plugins?.['typesafe@typesafe-ai'];
  if (!Array.isArray(installed)) return null;
  return installed.some(plugin => ['user', 'project', 'local'].includes(plugin.scope)
    && (plugin.scope === 'user' || (typeof plugin.projectPath === 'string' && (target === resolve(plugin.projectPath) || target.startsWith(resolve(plugin.projectPath) + '/'))))
    && typeof plugin.installPath === 'string' && file(join(plugin.installPath, 'skills/typesafe-ai/SKILL.md'))) ? 'plugin' : null;
}

function connect(args) {
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) {
    console.log('사용법: npm run connect -- <npm 프로젝트 폴더>\n\n공식 SDK·검증 유틸리티·로컬 CLI·Jev Utils 및 TypeSafe 공식 스킬을 연결합니다.\n변경: package.json·package-lock.json·node_modules·vendor/jev-utils·Codex/Claude Code 프로젝트 스킬\n공식 스킬은 원본·라이선스를 함께 설치하며 기존 프로젝트·개인 스킬 또는 활성 Claude 플러그인은 재사용합니다.\n지원: 독립 npm 프로젝트 또는 워크스페이스 루트. 다른 설치 방식은 자동 이전하지 않습니다.\n\n앱의 요청 처리는 바뀌지 않습니다. 서버 키·질문·실패 정책·실제 호출은 별도 구현입니다.\nShadow 수집·주간 이슈/PR·배포를 구성하거나 Jev API를 호출하지 않습니다.\n상세 안내: docs/integration.md');
    return;
  }
  if (args.length !== 1 || args[0].startsWith('-')) throw new Error('사용법: npm run connect -- <npm 프로젝트 폴더>');
  const target = realpathSync(resolve(args[0]));
  if (target === realpathSync(root) || target.startsWith(realpathSync(root) + '/')) throw new Error('Jev Utils 외부의 애플리케이션 폴더를 지정하세요.');
  const manifestFile = join(target, 'package.json');
  if (!existsSync(manifestFile)) throw new Error('대상 폴더에 package.json이 필요합니다. 기존 npm 프로젝트 폴더를 지정하세요.');
  const original = readFileSync(manifestFile);
  const manifest = JSON.parse(original);
  if (!object(manifest)) throw new Error('대상 package.json 형식을 확인하세요.');
  if ((manifest.packageManager && !manifest.packageManager.startsWith('npm@')) || ['pnpm-lock.yaml', 'yarn.lock', 'bun.lock', 'bun.lockb', 'npm-shrinkwrap.json'].some(file => present(join(target, file)))) {
    throw new Error('자동 연결은 npm/package-lock.json 프로젝트를 지원합니다. 다른 패키지 관리자는 docs/integration.md의 수동 연결 방법을 사용하세요.');
  }
  for (let parent = dirname(target); parent !== dirname(parent); parent = dirname(parent)) {
    if (existsSync(join(parent, 'package-lock.json')) && existsSync(join(parent, 'package.json'))) {
      throw new Error('상위 폴더에 npm 프로젝트가 있습니다. 자동 연결은 독립 프로젝트나 워크스페이스 루트에서 실행하세요.');
    }
  }
  // Reject symlinked write locations before creating any files in the target.
  function safe(path) {
    let current = target;
    for (const part of path.split('/')) {
      current = join(current, part);
      if (present(current) && lstatSync(current).isSymbolicLink()) throw new Error(`${path}: 심볼릭 링크가 있어 연결을 중단했습니다.`);
    }
    return join(target, path);
  }
  safe('package.json'); safe('package-lock.json');
  const bundle = officialBundle();
  const officialPaths = Object.values(officialDirs).flatMap(dir => Object.keys(bundle.files).map(path => `${dir}/${path}`));
  const allowedFile = path => skillPaths.includes(path) || officialPaths.includes(path) || /^vendor\/jev-utils\/starhn87-jev-(?:decisions|utils)-\d+\.\d+\.\d+\.tgz$/.test(path);
  const stateFile = safe(`${vendor}/connection.json`);
  const state = existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, 'utf8')) : null;
  if (existsSync(stateFile) && (!object(state) || state.version !== 1 || !object(state.files) || !object(state.packages) || Object.keys(state.files).some(path => !allowedFile(path)))) throw new Error('프로젝트 연결 기록을 확인하세요.');
  for (const [path, checksum] of Object.entries(state?.files ?? {})) {
    const file = safe(path);
    if (present(file) && (!lstatSync(file).isFile() || hash(readFileSync(file)) !== checksum)) throw new Error(`${path}: 연결 이후 수정된 파일이 있어 덮어쓰지 않았습니다.`);
  }
  for (const field of ['scripts', 'dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
    if (manifest[field] !== undefined && !object(manifest[field])) throw new Error(`package.json의 ${field} 형식을 확인하세요.`);
  }
  if (manifest.scripts?.jev !== undefined && !(state && manifest.scripts.jev === 'jev-utils')) throw new Error('기존 jev npm 명령이 있어 덮어쓰지 않았습니다.');
  for (const [field, name] of Object.entries(packages)) {
    for (const bucket of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
      if (manifest[bucket]?.[name] !== undefined && !(state && bucket === field && manifest[bucket][name] === state.packages[name])) throw new Error(`기존 ${name} 의존성이 있어 변경하지 않았습니다.`);
    }
  }
  for (const bucket of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
    const existing = manifest[bucket]?.[sdkName];
    if (existing !== undefined && !(bucket === 'dependencies' && (existing === sdkVersion || existing === state?.packages[sdkName]))) throw new Error(`공식 SDK ${sdkVersion} 운영 의존성이 필요합니다. 기존 SDK 설치는 docs/integration.md의 수동 설치 방법을 사용하세요.`);
  }
  for (const path of skillPaths) {
    if (present(safe(path)) && !state?.files[path]) throw new Error(`${path}: 기존 스킬이 있어 덮어쓰지 않았습니다.`);
  }
  const officialPlans = {};
  for (const [agent, dir] of Object.entries(officialDirs)) {
    if (state?.files[`${dir}/SKILL.md`]) { officialPlans[agent] = 'project'; continue; }
    if (file(join(target, dir, 'SKILL.md'))) { officialPlans[agent] = 'existing-project'; continue; }
    const existing = personalOfficialSkill(agent, target);
    if (existing) { officialPlans[agent] = existing; continue; }
    if (present(safe(dir))) throw new Error(`${dir}: 기존 폴더에 SKILL.md가 없어 덮어쓰지 않았습니다.`);
    officialPlans[agent] = 'project';
  }

  const snapshots = new Map();
  const createdDirs = [];
  function put(file, bytes) {
    if (!snapshots.has(file)) snapshots.set(file, present(file) ? readFileSync(file) : null);
    const missing = [];
    for (let parent = dirname(file); !existsSync(parent); parent = dirname(parent)) missing.push(parent);
    for (const parent of missing.reverse()) { mkdirSync(parent); createdDirs.push(parent); }
    writeFileSync(file, bytes);
  }
  try {
    const files = {};
    const specs = { [sdkName]: sdkVersion };
    for (const [field, name] of Object.entries(packages)) {
      const pkg = JSON.parse(readFileSync(join(root, 'packages', field === 'dependencies' ? 'decisions' : 'cli', 'package.json'), 'utf8'));
      const filename = `${pkg.name.replace('@', '').replace('/', '-')}-${pkg.version}.tgz`;
      const path = `${vendor}/${filename}`;
      if (!allowedFile(path)) throw new Error('패키지 파일 이름을 확인하세요.');
      const file = safe(path);
      if (present(file) && !state?.files[path]) throw new Error(`${path}: 기존 패키지 파일이 있어 덮어쓰지 않았습니다.`);
      const archive = join(root, 'artifacts', filename);
      if (!existsSync(archive)) throw new Error(`${filename}: 준비된 패키지가 없습니다. 저장소 개발 중이라면 npm run pack:${field === 'dependencies' ? 'decisions' : 'cli'}로 생성하세요.`);
      files[path] = readFileSync(archive);
      specs[name] = `file:${path}`;
      manifest[field] = { ...manifest[field], [name]: specs[name] };
    }
    manifest.dependencies[sdkName] = sdkVersion;
    const skill = readFileSync(join(root, 'skills/jev-utils/SKILL.md'));
    for (const path of skillPaths) files[path] = skill;
    for (const [agent, dir] of Object.entries(officialDirs)) {
      if (officialPlans[agent] !== 'project') continue;
      for (const [path, bytes] of Object.entries(bundle.files)) {
        const destination = `${dir}/${path}`;
        if (present(safe(destination)) && !state?.files[destination]) throw new Error(`${destination}: 기존 파일이 있어 덮어쓰지 않았습니다.`);
        files[destination] = bytes;
      }
    }
    // All conflicts are checked before the first target write.
    for (const [path, bytes] of Object.entries(files)) put(safe(path), bytes);
    manifest.scripts = { ...manifest.scripts, jev: 'jev-utils' };
    put(manifestFile, JSON.stringify(manifest, null, 2) + '\n');
    const lockFile = join(target, 'package-lock.json');
    snapshots.set(lockFile, existsSync(lockFile) ? readFileSync(lockFile) : null);
    const install = spawnSync('npm', ['install', '--global=false', '--package-lock=true', '--include=dev', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: target, stdio: 'inherit' });
    if (install.error || install.status !== 0) throw new Error('npm 설치가 실패했습니다. 연결 파일과 package.json·lockfile을 복원했습니다. node_modules를 복구하려면 기존 프로젝트의 설치 명령을 실행하세요.');
    put(stateFile, JSON.stringify({ version: 1, packages: specs, files: { ...state?.files, ...Object.fromEntries(Object.entries(files).map(([path, bytes]) => [path, hash(bytes)])) },
      officialSkill: { bundledSource: { repository: bundle.source.repository, revision: bundle.source.revision }, installations: officialPlans },
    }, null, 2) + '\n');
    console.log(`\n패키지·개발 도구 설치 완료: ${target}\n변경: package.json·package-lock.json·node_modules·vendor/jev-utils·Codex/Claude Code 프로젝트 스킬\nTypeSafe 공식 스킬 — Codex: ${officialStatus[officialPlans.codex]}, Claude Code: ${officialStatus[officialPlans.claude]}\n\n앱의 실제 요청 처리는 아직 연결되지 않았습니다.\n남은 작업: 서버 API 키 설정, 업무 질문·실패 정책 정의, TypeSafeClient.systemOne 호출과 응답 검증 구현, 관측 저장\nShadow 수집·주간 이슈/PR·배포는 별도로 구성합니다. 이 설치는 Jev API를 호출하지 않았습니다.\n\nCLI를 시험하려면 이 프로젝트에서 실행하세요:\n  npm run jev -- demo --offline\n  npm run jev -- init  (CLI API 키가 아직 없을 때; 서버 키 설정과 별개)\n  npm run jev -- decide --text "계정 설정을 변경하고 싶어요" --question "계정 지원 문의인가요?" --choices "예,아니오,판단보류"\n\nCodex·Claude Code 프로젝트 스킬은 새 세션에서 읽습니다.\npackage.json·package-lock.json·vendor/jev-utils·생성된 프로젝트 스킬을 함께 커밋하면 다른 환경에서도 npm ci로 설치됩니다.\n상세 안내: https://github.com/starhn87/jev-utils/blob/main/docs/integration.md`);
  } catch (error) {
    for (const [file, bytes] of [...snapshots].reverse()) {
      if (bytes === null) rmSync(file, { force: true }); else writeFileSync(file, bytes);
    }
    for (const dir of createdDirs.reverse()) if (existsSync(dir) && readdirSync(dir).length === 0) rmSync(dir, { recursive: true });
    throw error;
  }
}

try { connect(process.argv.slice(2)); }
catch (error) { console.error(error.message); process.exitCode = 1; }
