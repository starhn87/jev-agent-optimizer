import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateCases } from './index.mjs';

test('failed and deferred cases stay in the denominator and groups preserve correlated cases', async () => {
  const cases = [{ caseId: 'a', groupId: 'one' }, { caseId: 'b', groupId: 'one' }, { caseId: 'c', groupId: 'two' }];
  const result = await evaluateCases(cases, { concurrency: 2,
    run: async item => item.caseId === 'b' ? { ok: false, error: { kind: 'timeout' }, meta: null }
      : { ok: true, meta: { durationMs: 10, inputTokens: 5, outputTokens: null } },
    judge: (_, item) => ({ status: item.caseId === 'c' ? 'deferred' : 'applied', correct: item.caseId === 'c' ? null : true }) });
  assert.deepEqual(result.rows.map(r => r.caseId), ['a', 'b', 'c']);
  assert.equal(result.summary.total, 3); assert.equal(result.summary.failed, 1);
  assert.equal(result.summary.unlabeled, 1); assert.equal(result.summary.allCorrectGroups, 0);
  assert.deepEqual(result.summary.inputTokens, { knownTotal: 10, unknownRows: 1 });
});
