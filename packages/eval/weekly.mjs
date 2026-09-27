import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

export function reportWindow(now = new Date()) {
  const end = now.toISOString();
  const start = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const local = new Date(now.getTime() + 9 * 3_600_000);
  const monday = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - (local.getUTCDay() + 6) % 7));
  return { start, end, week: monday.toISOString().slice(0, 10) };
}

export const formatMetric = value => value == null ? '미상' : Number(value).toLocaleString('ko-KR', { maximumFractionDigits: 1 });

export function mergeGenerated(previous, fresh) {
  const begin = '<!-- jev-generated:start -->', end = '<!-- jev-generated:end -->';
  const a = previous.indexOf(begin), b = previous.indexOf(end, a);
  const x = fresh.indexOf(begin), y = fresh.indexOf(end, x);
  if (a < 0 || b < 0 || x < 0 || y < 0) throw new Error('weekly-issue-marker-missing');
  return previous.slice(0, a) + fresh.slice(x, y + end.length) + previous.slice(b + end.length);
}

export function github(args) {
  return execFileSync('gh', args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 60_000, maxBuffer: 8_000_000 });
}

// 자료 수집과 업무별 해석은 소비자가 소유한다. 게시 대상은 반드시 명시한다.
export function writeWeeklyIssue({ repo, window, markdown, checklist = '', publish = false }, run = github) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo) || !/^\d{4}-\d{2}-\d{2}$/.test(window.week)) throw new Error('invalid-issue-target');
  const marker = `<!-- jev-weekly:${window.week} -->`;
  if (!markdown.includes(marker)) throw new Error('weekly-marker-missing');
  const dir = '.local/weekly-jev';
  mkdirSync(dir, { recursive: true });
  const path = `${dir}/${window.week}.md`;
  writeFileSync(path, markdown + checklist);
  if (!publish) return path;
  const pages = JSON.parse(run(['api', '--paginate', '--slurp', `repos/${repo}/issues?state=all&per_page=100`]));
  const existing = pages.flat().find(i => !i.pull_request && i.body?.includes(marker));
  if (existing) {
    writeFileSync(path, mergeGenerated(existing.body, markdown));
    run(['issue', 'edit', String(existing.number), '--repo', repo, '--body-file', path]);
    return existing.html_url;
  }
  return run(['issue', 'create', '--repo', repo, '--title', `[Jev shadow] ${window.week} 주간 관측`, '--body-file', path]).trim();
}
