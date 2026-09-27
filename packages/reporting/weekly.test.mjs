import test from 'node:test';
import assert from 'node:assert/strict';
import { reportWindow, summarizeAudits, renderWeekly, mergeGenerated, REVIEW_CHECKLIST } from './weekly.mjs';

test('KST 주차와 최근 7일의 명확한 UTC 경계를 유지한다', () => {
  const w = reportWindow(new Date('2026-09-27T16:00:00Z'));
  assert.equal(w.week, '2026-09-28');
  assert.equal(w.start, '2026-09-20T16:00:00.000Z');
});
test('반복 관측도 호출량에는 포함하고 미상 토큰·실패·미라벨을 보존한다', () => {
  const row = { subjectId: 'candidate:1', result: { ok: true, answers: { link: { choice: 'base_only' } }, meta: { durationMs: 100, inputTokens: null, outputTokens: 2 } } };
  const report = { status: 'complete', proposalHash: 'same', runId: '1', rows: [row] };
  const data = summarizeAudits([report, { ...report, runId: '2', rows: [row, { ...row, result: { ok: false, error: { kind: 'timeout' }, meta: { durationMs: 2000 } } }] }]);
  assert.equal(data.total, 3); assert.equal(data.failed, 1); assert.equal(data.unlabeled, 3);
  assert.equal(data.groups, 1); assert.equal(data.inputTokens.unknownRows, 3);
  assert.equal(data.classifications.base_only, 2); assert.equal(data.qualityReviewedCases, 0);
});
test('수집 불가는 0건 성공으로 표현하지 않고 사람의 검토 기록을 덮어쓰지 않는다', () => {
  const window = reportWindow(new Date('2026-09-27T10:00:00Z'));
  const fresh = renderWeekly({ window, blog: { status: 'unavailable' }, moto: summarizeAudits([]), sourceCollectionStatus: 'unavailable', collectionProblems: ['수집 공백'] });
  assert.match(fresh, /sw-blog \| 수집 불가 \| 미상/);
  assert.match(fresh, /moto-kr \| 수집 불가 \| 미상/);
  assert.match(fresh, /동기화 실행 목록 수집 불가/);
  assert.match(fresh, /의미 정확도/);
  const old = fresh + REVIEW_CHECKLIST.replace('- [ ] 수집 공백', '- [x] 수집 공백') + '\n사람의 추가 검토';
  const updated = mergeGenerated(old, fresh.replace('수집 공백', '수집 복구'));
  assert.match(updated, /\[x\] 수집 공백/); assert.match(updated, /사람의 추가 검토/);
  assert.throws(() => mergeGenerated('사용자 원문', fresh));
});
