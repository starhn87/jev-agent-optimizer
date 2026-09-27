import { summarize } from '../eval/index.mjs';

export function reportWindow(now = new Date()) {
  const end = now.toISOString();
  const start = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const local = new Date(now.getTime() + 9 * 3_600_000);
  const monday = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - (local.getUTCDay() + 6) % 7));
  return { start, end, week: monday.toISOString().slice(0, 10) };
}

export function summarizeAudits(reports) {
  const rows = [], classifications = {}, artifactStatuses = {};
  for (const report of reports) {
    const status = ['complete', 'partial', 'skipped', 'invalid_input'].includes(report.status) ? report.status : 'unknown';
    artifactStatuses[status] = (artifactStatuses[status] ?? 0) + 1;
    for (const [index, row] of (report.rows ?? []).entries()) {
      const result = row.result;
      const label = result?.ok === true ? result.answers?.link?.choice : null;
      const valid = ['direct', 'base_only', 'contradictory', 'insufficient'].includes(label);
      if (valid) classifications[label] = (classifications[label] ?? 0) + 1;
      const meta = result?.meta;
      const number = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
      rows.push({ caseId: `${report.runId}:${index}`, groupId: `${report.proposalHash}:${row.subjectId}`,
        status: valid ? 'deferred' : 'failed', correct: null,
        meta: { durationMs: number(meta?.durationMs), inputTokens: number(meta?.inputTokens), outputTokens: number(meta?.outputTokens) } });
    }
  }
  return { ...summarize(rows), classifications, artifactStatuses, qualityReviewedCases: 0 };
}

const fmt = value => value == null ? '미상' : Number(value).toLocaleString('ko-KR', { maximumFractionDigits: 1 });
export function renderWeekly({ window, blog, moto, sources = [], sourceCollectionStatus = 'available', collectionProblems = [] }) {
  const motoLine = sourceCollectionStatus === 'available'
    ? `| moto-kr | shadow artifact | ${fmt(moto.total)} | ${fmt(moto.failed)} | ${fmt(moto.p50Ms)} / ${fmt(moto.p95Ms)} |`
    : '| moto-kr | 수집 불가 | 미상 | 미상 | 미상 |';
  const lines = [
    `<!-- jev-weekly:${window.week} -->`, '<!-- jev-generated:start -->',
    `관측 구간: ${window.start} ≤ 시각 < ${window.end} (UTC, 최근 7일)`, '',
    '| 적용 지점 | 상태 | 수집된 관측 수 | 실패 | p50 / p95 (ms) |', '|---|---|---:|---:|---:|',
  ];
  if (blog.status === 'available') {
    const t = blog.data.totals;
    lines.push(`| sw-blog | shadow | ${fmt(t.observations)} | ${fmt(t.failed ?? 0)} | ${fmt(t.p50Ms)} / ${fmt(t.p95Ms)} |`);
    lines.push(motoLine);
    lines.push('| Motomap 채팅·심사 | 운영 중단, off | — | — | — |', '',
      `블로그 토큰: 입력 ${fmt(t.inputTokens)} / 출력 ${fmt(t.outputTokens)}. 사용량 미상 관측: 입력 ${fmt(t.unknownInputTokens ?? 0)} / 출력 ${fmt(t.unknownOutputTokens ?? 0)}.`,
      '', '블로그 질문별 판단 조합:', '');
    for (const c of blog.data.choices ?? []) lines.push(`- 작성자 ${c.about}, 코드 ${c.code}, 게시글 ${c.posts}: ${fmt(c.observations)}회`);
    if (!(blog.data.choices ?? []).length) lines.push('- 관측된 판단 없음');
  } else {
    lines.push('| sw-blog | 수집 불가 | 미상 | 미상 | 미상 |',
      motoLine,
      '| Motomap 채팅·심사 | 운영 중단, off | — | — | — |', '');
  }
  lines.push('', `moto-kr 분류: 직접 연결 ${fmt(moto.classifications.direct ?? 0)}, 기본 플랫폼만 확인 ${fmt(moto.classifications.base_only ?? 0)}, 충돌 ${fmt(moto.classifications.contradictory ?? 0)}, 근거 부족 ${fmt(moto.classifications.insufficient ?? 0)}.`,
    `moto-kr 입력 토큰 합계(알려진 값): ${fmt(moto.inputTokens.knownTotal)}; 미상 ${fmt(moto.inputTokens.unknownRows)}건. 출력: ${fmt(moto.outputTokens.knownTotal)}; 미상 ${fmt(moto.outputTokens.unknownRows)}건.`,
    `수집된 감사 artifact: ${Object.entries(moto.artifactStatuses).map(([status, count]) => `${status} ${count}건`).join(', ') || '없음'}.`,
    '', '자동 집계에 연결된 정답 라벨: 0건. 사람이 검토한 사례와 결론은 아래 검토 기록·코멘트에 남긴다. 분포·확신·실패율은 의미 정확도나 비용 절감의 증거가 아니다. enforce 전환 기준은 아직 정하지 않는다.', '');
  if (collectionProblems.length) {
    lines.push('수집 공백:', '');
    for (const p of collectionProblems) lines.push(`- ${p}`);
    lines.push('');
  }
  lines.push('근거 실행:', '');
  for (const s of sources) lines.push(`- [moto-kr 동기화 실행 ${s.id}](https://github.com/starhn87/moto-kr/actions/runs/${s.id}): ${s.status}`);
  if (!sources.length) lines.push(sourceCollectionStatus === 'available' ? '- 해당 구간의 동기화 실행 없음' : '- 동기화 실행 목록 수집 불가');
  lines.push('', '<!-- jev-generated:end -->');
  return lines.join('\n');
}

export function mergeGenerated(previous, fresh) {
  const begin = '<!-- jev-generated:start -->', end = '<!-- jev-generated:end -->';
  const a = previous.indexOf(begin), b = previous.indexOf(end, a);
  if (a < 0 || b < 0) throw new Error('weekly-issue-marker-missing');
  return previous.slice(0, a) + fresh.slice(fresh.indexOf(begin), fresh.indexOf(end) + end.length) + previous.slice(b + end.length);
}
export const REVIEW_CHECKLIST = `

검토 항목:

- [ ] 수집 공백·timeout·잘못된 응답의 원인을 확인한다.
- [ ] 블로그 혼합 질문·후속 질문의 자료 누락 사례를 별도로 평가한다.
- [ ] moto-kr 시장 접미사·트림·세대 연결을 사람이 검토한다.
- [ ] 검토한 평가 사례와 근거를 별도 코멘트로 남긴다.
- [ ] 운영 재개 조건을 충족한 뒤 Motomap 실측 여부를 결정한다.
`;
