import test from 'node:test';
import assert from 'node:assert/strict';
import { TypeSafeClient } from '@typesafe-ai/sdk';
import { toObservation, validateAnswers } from '../packages/decisions/dist/index.js';

const questions = { route: { type: 'choice', criteria: { in: 'Relevant', out: 'Irrelevant' } }, flag: { type: 'noul' } };
const wire = { state: { message: 'synthetic' }, model: 'jev-1.13.0', questions };
const context = { definitionId: 'test', definitionVersion: '1', requestedModel: wire.model, durationMs: 10 };
const reply = { model: wire.model, answers: { route: { type: 'choice', choice: 'in', confidence: .9, probabilities: { in: .95, out: .05 } }, flag: { type: 'noul', noul: .2 } } };
async function observe(fetchImpl, options = {}) {
  const client = new TypeSafeClient({ apiKey: 'synthetic', fetch: fetchImpl, retry: { maxRetries: 0 }, logLevel: 'off' });
  let outcome;
  try { outcome = await client.systemOne(wire, options).withResponse(); }
  catch (error) { outcome = { error }; }
  return toObservation(questions, outcome, context);
}

test('official SDK requests and metadata work with utilities and preserve unknown usage', async () => {
  const result = await observe(async (_, init) => {
    assert.deepEqual(JSON.parse(init.body), wire);
    assert.equal(init.headers['X-App-Trace'], 'caller-owned');
    return Response.json(reply, { headers: { 'x-typesafe-request-id': 'test-request' } });
  }, { headers: { 'X-App-Trace': 'caller-owned' } });
  assert.equal(result.ok, true); assert.equal(result.meta.requestId, 'test-request');
  assert.equal(result.meta.inputTokens, null); assert.equal(result.meta.definitionVersion, '1');
  const withUsage = toObservation(questions, { data: { ...reply, usage: { input_tokens: 0, output_tokens: -1 } } }, { ...context, state: 'private-state' });
  assert.equal(withUsage.meta.inputTokens, 0); assert.equal(withUsage.meta.outputTokens, null);
  assert.equal(JSON.stringify(withUsage).includes('private-state'), false);
});

test('invalid labels, distributions, missing questions and score/legend contradictions are rejected', () => {
  for (const answers of [
    { ...reply.answers, route: { ...reply.answers.route, choice: 'foreign' } },
    { ...reply.answers, route: { ...reply.answers.route, probabilities: { in: .1, out: .9 } } },
    { ...reply.answers, route: { ...reply.answers.route, probabilities: { in: .9, out: .9 } } },
    { route: reply.answers.route },
  ]) assert.equal(toObservation(questions, { data: { ...reply, answers } }, context).error.kind, 'invalid_response');
  const scoreQuestions = { s: { type: 'score', criteria: ['low', 'high'] } };
  const score = { type: 'score', score: 1, confidence: 1, probabilities: { 0: 0, 1: 1 }, legend: { 0: 'low', 1: 'high' } };
  assert.ok(validateAnswers(scoreQuestions, { s: score }));
  assert.equal(validateAnswers(scoreQuestions, { s: { ...score, score: 0 } }), null);
  assert.equal(validateAnswers(scoreQuestions, { s: { ...score, legend: { 0: 'wrong', 1: 'high' } } }), null);
  assert.equal(validateAnswers(scoreQuestions, { s: { ...score, legend: undefined } }), null);
  assert.ok(validateAnswers({ one: { type: 'choice', criteria: { only: null } } }, { one: { type: 'choice', choice: 'only', confidence: 1, probabilities: { only: 1 } } }));
});

test('SDK controls deadlines, body delivery, cancellation and retry; observations classify its real errors', async () => {
  for (const body of [false, true]) {
    let calls = 0;
    const result = await observe(async (_, init) => {
      calls++;
      if (body) return new Response(new ReadableStream({ start(c) { init.signal.addEventListener('abort', () => c.error(new Error('aborted'))); } }));
      return new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted'))));
    }, { timeout: 15 });
    assert.equal(result.error.kind, 'timeout'); assert.equal(calls, 1);
  }
  const result = await observe(async () => assert.fail('must not call'), { signal: AbortSignal.abort() });
  assert.equal(result.error.kind, 'aborted');
  let calls = 0;
  const http = await observe(async () => { calls++; return Response.json({ secret: 'do-not-log' }, { status: 429, headers: { 'x-typesafe-request-id': 'failed-request' } }); });
  assert.deepEqual(http.error, { kind: 'http', status: 429 }); assert.equal(calls, 1);
  assert.equal(http.meta.requestId, 'failed-request'); assert.equal(JSON.stringify(http).includes('do-not-log'), false);
});

test('pure observation conversion never starts a provider call or stores arbitrary exception content', () => {
  const observation = toObservation(questions, { error: new Error('private-error') }, context);
  assert.deepEqual(observation.error, { kind: 'unknown' });
  assert.equal(JSON.stringify(observation).includes('private-error'), false);
});
