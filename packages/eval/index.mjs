export async function evaluateCases(cases, { run, judge, concurrency = 1 }) {
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 16) throw new Error('invalid-concurrency');
  const ids = new Set();
  for (const item of cases) {
    if (!item.caseId || !item.groupId || ids.has(item.caseId)) throw new Error('invalid-case-id');
    ids.add(item.caseId);
  }
  const rows = new Array(cases.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, cases.length) }, async () => {
    while (next < cases.length) {
      const index = next++;
      const item = cases[index];
      try {
        const result = await run(item);
        const decision = result.ok ? judge(result, item) : { status: 'failed', correct: false };
        if (!['applied', 'deferred', 'failed'].includes(decision.status) || ![true, false, null].includes(decision.correct)) throw new Error('invalid-judgment');
        rows[index] = { caseId: item.caseId, groupId: item.groupId, ...decision,
          error: result.ok ? null : result.error.kind, meta: result.meta };
      } catch {
        rows[index] = { caseId: item.caseId, groupId: item.groupId, status: 'failed', correct: false, error: 'evaluation-failed', meta: null };
      }
    }
  }));
  return { rows, summary: summarize(rows) };
}

export function summarize(rows) {
  const groups = new Map();
  for (const row of rows) {
    const group = groups.get(row.groupId) ?? [];
    group.push(row); groups.set(row.groupId, group);
  }
  const durations = rows.map(r => r.meta?.durationMs).filter(v => typeof v === 'number' && Number.isFinite(v)).sort((a, b) => a - b);
  const percentile = p => durations.length ? durations[Math.ceil(durations.length * p) - 1] : null;
  const tokens = key => ({ knownTotal: rows.reduce((sum, r) => sum + (r.meta?.[key] ?? 0), 0),
    unknownRows: rows.filter(r => r.meta?.[key] == null).length });
  return { total: rows.length, applied: rows.filter(r => r.status === 'applied').length,
    deferred: rows.filter(r => r.status === 'deferred').length, failed: rows.filter(r => r.status === 'failed').length,
    correct: rows.filter(r => r.correct === true).length,
    unlabeled: rows.filter(r => r.correct === null).length,
    allCorrectGroups: [...groups.values()].filter(rs => rs.every(r => r.correct === true)).length,
    groups: groups.size, p50Ms: percentile(0.5), p95Ms: percentile(0.95),
    inputTokens: tokens('inputTokens'), outputTokens: tokens('outputTokens') };
}
