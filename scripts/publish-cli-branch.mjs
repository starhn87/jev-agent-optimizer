import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Use the tested release archive for Git installation, without workspace build scripts.
export function stageCliPackage(archive, destination) {
  const members = execFileSync('tar', ['-tzf', archive], { encoding: 'utf8' }).trim().split('\n');
  const files = new Set(['package/LICENSE', 'package/THIRD_PARTY_LICENSES', 'package/package.json',
    'package/README.md', 'package/skills/jev-decision-kit/SKILL.md', 'package/dist/cli.mjs']);
  if (members.length !== files.size || members.some(member => !files.has(member))) throw new Error('Unexpected CLI archive contents.');
  mkdirSync(destination, { recursive: true });
  execFileSync('tar', ['-xzf', archive, '--strip-components=1', '-C', destination]);
  const file = join(destination, 'package.json');
  const manifest = JSON.parse(readFileSync(file, 'utf8'));
  if (manifest.name !== '@starhn87/jev-decision-kit' || manifest.dependencies || manifest.devDependencies || manifest.workspaces) throw new Error('The CLI package must be standalone.');
  delete manifest.scripts;
  writeFileSync(file, JSON.stringify(manifest, null, 2) + '\n');
  return manifest.version;
}

function publish(args) {
  if (args.length !== 2 || args[1] !== '--push') throw new Error('Usage: node scripts/publish-cli-branch.mjs ARCHIVE.tgz --push');
  const archive = resolve(args[0]);
  const root = fileURLToPath(new URL('../', import.meta.url));
  const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  const temporary = mkdtempSync(join(tmpdir(), 'jev-cli-branch-'));
  try {
    const destination = join(temporary, 'package');
    const version = stageCliPackage(archive, destination);
    const gitDir = git(['rev-parse', '--absolute-git-dir']);
    const buildTree = args => execFileSync('git', ['--git-dir', gitDir, '--work-tree', destination, ...args], {
      cwd: destination, env: { ...process.env, GIT_INDEX_FILE: join(temporary, 'index') }, encoding: 'utf8',
    }).trim();
    buildTree(['read-tree', '--empty']);
    buildTree(['add', '--force', '--all', '--', '.']);
    const tree = buildTree(['write-tree']);
    let parent;
    if (git(['ls-remote', 'origin', 'refs/heads/cli'])) {
      git(['fetch', '--no-tags', 'origin', 'refs/heads/cli']);
      parent = git(['rev-parse', 'FETCH_HEAD']);
      if (tree === git(['rev-parse', `${parent}^{tree}`])) return console.log(`CLI ${version} is already published.`);
    }
    const message = `build(cli): publish standalone version ${version}\n\nCo-authored-by: Codex <noreply@openai.com>\n`;
    const commit = git(['commit-tree', tree, ...(parent ? ['-p', parent] : []), '-m', message]);
    git(['push', 'origin', `${commit}:refs/heads/cli`]);
    console.log(`Published CLI ${version}: npm install -g github:starhn87/jev-decision-kit#cli`);
  } finally { rmSync(temporary, { recursive: true, force: true }); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { publish(process.argv.slice(2)); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
