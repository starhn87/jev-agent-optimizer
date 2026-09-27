// 운영 통계만 집계한다. Jev/답변 LLM을 호출하거나 정책을 바꾸지 않는다.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { reportWindow, summarizeAudits, renderWeekly, mergeGenerated, REVIEW_CHECKLIST } from '../packages/reporting/weekly.mjs';

const repo = 'starhn87/jev-agent-optimizer';
const args = process.argv.slice(2);
const envAt = args.indexOf('--blog-env');
if (envAt >= 0) process.loadEnvFile(args[envAt + 1]); // 명시한 관리용 파일만 읽는다.
const gh = command => execFileSync('gh', command, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 60_000, maxBuffer: 8_000_000 });
const api = path => JSON.parse(gh(['api', '--method', 'GET', path]));
const window = reportWindow();
const collectionProblems = [], sources = [], reports = [];
const staging = mkdtempSync(join(tmpdir(), 'jev-weekly-'));
let blog = { status: 'unavailable' };
let sourceCollectionStatus = 'available';
try {
  if (process.env.ADMIN_PASSWORD) {
    try {
      const url = new URL('https://www.seung-woo.me/api/admin/jev-shadow');
      url.searchParams.set('start', window.start); url.searchParams.set('end', window.end);
      const response = await fetch(url, { headers: { 'x-admin-password': process.env.ADMIN_PASSWORD }, redirect: 'error', signal: AbortSignal.timeout(30_000) });
      if (!response.ok) throw new Error(`http-${response.status}`);
      const data = await response.json();
      if (data.version !== 1 || typeof data.totals?.observations !== 'number' || !Array.isArray(data.choices)) throw new Error('invalid-report');
      const labels = new Set(['needed', 'not_needed', 'uncertain']);
      if (!data.choices.every(c => ['about','code','posts'].every(key => labels.has(c[key])))) throw new Error('invalid-label');
      blog = { status: 'available', data };
      const retention = await fetch('https://www.seung-woo.me/api/admin/jev-shadow', { method: 'POST', headers: { 'x-admin-password': process.env.ADMIN_PASSWORD }, redirect: 'error', signal: AbortSignal.timeout(30_000) });
      if (!retention.ok) collectionProblems.push('블로그 90일 보관 정리를 완료하지 못함');
    } catch { collectionProblems.push('블로그 관리자 집계 API를 읽지 못함. 미상 값을 0으로 처리하지 않음'); }
  } else collectionProblems.push('블로그 집계용 관리자 자격 증명 없음');
  const created = encodeURIComponent(`${window.start.slice(0,10)}..${window.end.slice(0,10)}`);
  let runs = [];
  try {
    runs = api(`repos/starhn87/moto-kr/actions/workflows/sync.yml/runs?per_page=100&branch=main&created=${created}`).workflow_runs;
    if (!Array.isArray(runs)) throw new Error('invalid-runs');
  } catch {
    runs = []; sourceCollectionStatus = 'unavailable';
    collectionProblems.push('moto-kr 동기화 실행 목록을 읽지 못함. 관측 전체 건수는 미상');
  }
  for (const run of runs.filter(r => Date.parse(r.created_at) >= Date.parse(window.start) && Date.parse(r.created_at) < Date.parse(window.end))) {
    sources.push({ id: run.id, status: run.status === 'completed' ? run.conclusion : 'in-progress' });
    let artifacts;
    try {
      artifacts = api(`repos/starhn87/moto-kr/actions/runs/${run.id}/artifacts?per_page=100`).artifacts;
      if (!Array.isArray(artifacts)) throw new Error('invalid-artifacts');
    } catch {
      collectionProblems.push(`moto-kr 실행 ${run.id}: artifact 목록을 읽지 못함`);
      continue;
    }
    const artifact = artifacts.find(a => a.name === 'jev-mapping-audit');
    if (!artifact || artifact.expired) {
      collectionProblems.push(`moto-kr 실행 ${run.id}: 감사 artifact ${artifact?.expired ? '만료' : '없음 (후보 없음·이전 코드·수집 실패·진행 중 여부는 실행 링크에서 확인)'}`);
      continue;
    }
    try {
      const dir = join(staging, String(run.id)); mkdirSync(dir);
      gh(['run', 'download', String(run.id), '--repo', 'starhn87/moto-kr', '--name', 'jev-mapping-audit', '--dir', dir]);
      const report = JSON.parse(readFileSync(join(dir, 'jev-mapping-audit.json'), 'utf8'));
      if (report.version !== 1 || report.headSha !== run.head_sha || !Array.isArray(report.rows)) throw new Error('unbound-artifact');
      reports.push({ ...report, runId: String(run.id) });
    } catch { collectionProblems.push(`moto-kr 실행 ${run.id}: artifact의 HEAD·형식·다운로드를 검증하지 못함`); }
  }
  const report = { window, blog, moto: summarizeAudits(reports), sources, sourceCollectionStatus, collectionProblems };
  const markdown = renderWeekly(report);
  mkdirSync('.local/weekly-shadow', { recursive: true });
  const bodyPath = `.local/weekly-shadow/${window.week}.md`;
  writeFileSync(bodyPath, markdown + REVIEW_CHECKLIST);
  writeFileSync(`.local/weekly-shadow/${window.week}.json`, JSON.stringify(report, null, 2) + '\n');
  if (args.includes('--publish')) {
    const issues = api(`repos/${repo}/issues?state=all&per_page=100`);
    const existing = issues.find(i => !i.pull_request && i.body?.includes(`<!-- jev-weekly:${window.week} -->`));
    if (existing) {
      writeFileSync(bodyPath, mergeGenerated(existing.body, markdown));
      gh(['issue', 'edit', String(existing.number), '--repo', repo, '--body-file', bodyPath]);
      console.log(existing.html_url);
    } else console.log(gh(['issue', 'create', '--repo', repo, '--title', `[Jev shadow] ${window.week} 주간 관측`, '--body-file', bodyPath]).trim());
  } else console.log(`Draft: ${bodyPath}`);
} finally { rmSync(staging, { recursive: true, force: true }); }
