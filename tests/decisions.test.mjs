import test from 'node:test';
import assert from 'node:assert/strict';
import { createDecisionClient } from '../packages/decisions/dist/index.js';

const questions = { route: { type: 'choice', criteria: { in: 'Relevant', out: 'Irrelevant' } }, flag: { type: 'noul' } };
const request = { definitionId: 'test', definitionVersion: '1', state: { message: 'synthetic' }, questions };
const reply = { model: 'jev-1.13.0', answers: { route: { type: 'choice', choice: 'in', confidence: .9, probabilities: { in: .95, out: .05 } }, flag: { type: 'noul', noul: .2 } } };
const client = fetchImpl => createDecisionClient({ apiKey: 'synthetic', model: 'jev-1.13.0', fetch: fetchImpl });

test('typed protocol metadata stays local and unknown usage is preserved', async () => {
  const result = await client(async (_, init) => {
    assert.deepEqual(JSON.parse(init.body), { model: 'jev-1.13.0', state: request.state, questions });
    return Response.json(reply, { headers: { 'x-typesafe-request-id': 'test-request' } });
  }).decide(request);
  assert.equal(result.ok, true); assert.equal(result.meta.requestId, 'test-request');
  assert.equal(result.meta.inputTokens, null); assert.equal(result.meta.definitionVersion, '1');
});

test('invalid labels, probabilities, missing questions and score contradictions are rejected', async () => {
  for (const answers of [
    { ...reply.answers, route: { ...reply.answers.route, choice: 'foreign' } },
    { ...reply.answers, route: { ...reply.answers.route, probabilities: { in: .1, out: .9 } } },
    { ...reply.answers, route: { ...reply.answers.route, probabilities: { in: .9, out: .9 } } },
    { route: reply.answers.route },
  ]) {
    const result = await client(async () => Response.json({ ...reply, answers })).decide(request);
    assert.equal(result.error.kind, 'invalid_response');
  }
  const result = await client(async () => Response.json({ answers: { s: { type: 'score', score: 0, confidence: 1, probabilities: { 0: 0, 1: 1 } } } }))
    .decide({ ...request, questions: { s: { type: 'score', criteria: ['low', 'high'] } } });
  assert.equal(result.error.kind, 'invalid_response');
});

test('deadline aborts fetch and body delivery, cancellation is distinct and no retry occurs', async () => {
  for (const body of [false, true]) {
    let calls = 0;
    const result = await client(async (_, init) => {
      calls++;
      if (body) return new Response(new ReadableStream({ start(c) { init.signal.addEventListener('abort', () => c.error(new Error('aborted'))); } }));
      return new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted'))));
    }).decide(request, { timeoutMs: 15 });
    assert.equal(result.error.kind, 'timeout'); assert.equal(calls, 1);
  }
  const controller = new AbortController(); controller.abort();
  const result = await client(async () => { throw new Error('must not call'); }).decide(request, { signal: controller.signal });
  assert.equal(result.error.kind, 'aborted');
  let calls = 0;
  const http = await client(async () => { calls++; return Response.json({ secret: 'do-not-log' }, { status: 429 }); }).decide(request);
  assert.deepEqual(http.error, { kind: 'http', status: 429 }); assert.equal(calls, 1);
  assert.equal(JSON.stringify(http).includes('do-not-log'), false);
});
