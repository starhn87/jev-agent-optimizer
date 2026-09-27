import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const vendor = 'vendor/jev-decision-kit';
const skillPaths = ['.agents/skills/jev-decision-kit/SKILL.md', '.claude/skills/jev-decision-kit/SKILL.md'];
const packages = { dependencies: '@starhn87/jev-decisions', devDependencies: '@starhn87/jev-decision-kit' };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const present = path => { try { lstatSync(path); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; } };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const allowedFile = path => skillPaths.includes(path) || /^vendor\/jev-decision-kit\/starhn87-jev-(?:decisions|decision-kit)-\d+\.\d+\.\d+\.tgz$/.test(path);

function connect(args) {
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) {
    console.log('사용법: npm run connect -- <npm 프로젝트 폴더>\n판단 라이브러리·로컬 CLI·Codex/Claude Code 프로젝트 스킬을 연결합니다.');
    return;
  }
  if (args.length !== 1 || args[0].startsWith('-')) throw new Error('사용법: npm run connect -- <npm 프로젝트 폴더>');
  const target = realpathSync(resolve(args[0]));
  if (target === realpathSync(root) || target.startsWith(realpathSync(root) + '/')) throw new Error('Jev Decision Kit 외부의 애플리케이션 폴더를 지정하세요.');
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
  if (manifest.scripts?.jev !== undefined && !(state && manifest.scripts.jev === 'jev-decision-kit')) throw new Error('기존 jev npm 명령이 있어 덮어쓰지 않았습니다.');
  for (const [field, name] of Object.entries(packages)) {
    for (const bucket of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
      if (manifest[bucket]?.[name] !== undefined && !(state && bucket === field && manifest[bucket][name] === state.packages[name])) throw new Error(`기존 ${name} 의존성이 있어 변경하지 않았습니다.`);
    }
  }
  for (const path of skillPaths) {
    if (present(safe(path)) && !state?.files[path]) throw new Error(`${path}: 기존 스킬이 있어 덮어쓰지 않았습니다.`);
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
    const specs = {};
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
    const skill = readFileSync(join(root, 'skills/jev-decision-kit/SKILL.md'));
    for (const path of skillPaths) files[path] = skill;
    // All conflicts are checked before the first target write.
    for (const [path, bytes] of Object.entries(files)) put(safe(path), bytes);
    manifest.scripts = { ...manifest.scripts, jev: 'jev-decision-kit' };
    put(manifestFile, JSON.stringify(manifest, null, 2) + '\n');
    const lockFile = join(target, 'package-lock.json');
    snapshots.set(lockFile, existsSync(lockFile) ? readFileSync(lockFile) : null);
    const install = spawnSync('npm', ['install', '--global=false', '--package-lock=true', '--include=dev', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: target, stdio: 'inherit' });
    if (install.error || install.status !== 0) throw new Error('npm 설치가 실패했습니다. 연결 파일과 package.json·lockfile을 복원했습니다. node_modules를 복구하려면 기존 프로젝트의 설치 명령을 실행하세요.');
    put(stateFile, JSON.stringify({ version: 1, packages: specs, files: { ...state?.files, ...Object.fromEntries(Object.entries(files).map(([path, bytes]) => [path, hash(bytes)])) } }, null, 2) + '\n');
    console.log(`\n연결 완료: ${target}\n이 프로젝트에서 실행하세요:\n  npm run jev -- demo --offline\n  npm run jev -- init  (API 키가 아직 없을 때)\n  npm run jev -- decide --text "계정 설정을 변경하고 싶어요" --question "계정 지원 문의인가요?" --choices "예,아니오,판단보류"\n\nCodex·Claude Code 프로젝트 스킬도 준비했습니다. 새 세션에서 분류·관련성 판단 실험을 요청할 수 있습니다.\n서버 코드에서는 @starhn87/jev-decisions의 createDecisionClient를 사용하세요.\npackage.json·package-lock.json·vendor/jev-decision-kit·두 프로젝트 스킬을 함께 커밋하면 다른 환경에서도 npm ci로 설치됩니다.`);
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
