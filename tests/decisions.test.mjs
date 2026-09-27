import test from 'node:test';
import assert from 'node:assert/strict';
import { TypeSafeClient, TypeSafeError, APIConnectionError } from '@typesafe-ai/sdk';
import { observe, toObservation, validateAnswers } from '../packages/decisions/dist/index.js';

const questions = { route: { type: 'choice', criteria: { in: 'Relevant', out: 'Irrelevant' } }, flag: { type: 'noul' } };
const wire = { state: { message: 'synthetic' }, model: 'jev-1.13.0', questions };
const context = { definitionId: 'test', definitionVersion: '1', requestedModel: wire.model, durationMs: 10 };
const reply = { model: wire.model, answers: { route: { type: 'choice', choice: 'in', confidence: .9, probabilities: { in: .95, out: .05 } }, flag: { type: 'noul', noul: .2 } } };
async function observeRequest(fetchImpl, options = {}) {
  const client = new TypeSafeClient({ apiKey: 'synthetic', fetch: fetchImpl, retry: { maxRetries: 0 }, logLevel: 'off' });
  return observe({ questions, run: () => client.systemOne(wire, options).withResponse(), context });
}

test('official SDK requests and metadata work with utilities and preserve unknown usage', async () => {
  const result = await observeRequest(async (_, init) => {
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
  assert.equal(validateAnswers(scoreQuestions, { s: score }).ok, true);
  assert.deepEqual(validateAnswers(scoreQuestions, { s: { ...score, score: 0 } }), { ok: false, issues: [{ path: ['s', 'score'], code: 'score_probability_mismatch' }] });
  for (const legend of [{ 0: 'wrong', 1: 'high' }, undefined]) assert.deepEqual(validateAnswers(scoreQuestions, { s: { ...score, legend } }), { ok: false, issues: [{ path: ['s', 'legend'], code: 'invalid_legend' }] });
  assert.equal(validateAnswers({ one: { type: 'choice', criteria: { only: null } } }, { one: { type: 'choice', choice: 'only', confidence: 1, probabilities: { only: 1 } } }).ok, true);
});

test('SDK controls deadlines, body delivery, cancellation and retry; observations classify its real errors', async () => {
  for (const body of [false, true]) {
    let calls = 0;
    const result = await observeRequest(async (_, init) => {
      calls++;
      if (body) return new Response(new ReadableStream({ start(c) { init.signal.addEventListener('abort', () => c.error(new Error('aborted'))); } }));
      return new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted'))));
    }, { timeout: 15 });
    assert.equal(result.error.kind, 'timeout'); assert.equal(calls, 1);
  }
  const result = await observeRequest(async () => assert.fail('must not call'), { signal: AbortSignal.abort() });
  assert.equal(result.error.kind, 'aborted');
  let calls = 0;
  const http = await observeRequest(async () => { calls++; return Response.json({ secret: 'do-not-log' }, { status: 429, headers: { 'x-typesafe-request-id': 'failed-request' } }); });
  assert.deepEqual(http.error, { kind: 'http', status: 429 }); assert.equal(calls, 1);
  assert.equal(http.meta.requestId, 'failed-request'); assert.equal(JSON.stringify(http).includes('do-not-log'), false);
});

test('pure observation conversion never starts a provider call or stores arbitrary exception content', () => {
  const observation = toObservation(questions, { error: new Error('private-error') }, context);
  assert.deepEqual(observation.error, { kind: 'unknown' });
  assert.equal(JSON.stringify(observation).includes('private-error'), false);
});

test('validation reports known paths and reasons without echoing rejected values or foreign keys', () => {
  const checked = validateAnswers(questions, {
    route: { ...reply.answers.route, choice: 'private-choice', confidence: NaN },
    'private-provider-key': { raw: 'private-data' },
  });
  assert.deepEqual(checked, { ok: false, issues: [
    { path: [], code: 'unexpected_answer' },
    { path: ['route', 'confidence'], code: 'invalid_confidence' },
    { path: ['route', 'choice'], code: 'invalid_choice' },
    { path: ['flag'], code: 'missing_answer' },
  ] });
  assert.equal(JSON.stringify(checked).includes('private-'), false);
  const malformed = toObservation(questions, { data: { answers: { ...reply.answers,
    route: { ...reply.answers.route, probabilities: { in: -1, out: 2 } } } } });
  assert.deepEqual(malformed.error, { kind: 'invalid_response', issues: [
    { path: ['route', 'probabilities', 'in'], code: 'invalid_probability' },
    { path: ['route', 'probabilities', 'out'], code: 'invalid_probability' },
  ] });
  assert.deepEqual(validateAnswers(questions, null), { ok: false, issues: [{ path: [], code: 'invalid_answers' }] });
});

test('rounded distributions and structured Score legends remain valid', () => {
  const q = { s: { type: 'score', criteria: [{ label: 'low' }, ['medium'], null] } };
  const answer = { s: { type: 'score', score: .99, confidence: .1,
    probabilities: { 0: .33, 1: .33, 2: .33 }, legend: { 0: { label: 'low' }, 1: ['medium'], 2: null } } };
  assert.equal(validateAnswers(q, answer).ok, true);
  assert.equal(validateAnswers(q, { s: { ...answer.s, probabilities: { 0: .5, 1: .5, 2: .5 } } }).ok, false);
});

test('observe runs once, includes validation in timing and classifies synchronous and asynchronous errors', async () => {
  let calls = 0;
  const client = new TypeSafeClient({ apiKey: 'synthetic', retry: { maxRetries: 0 }, logLevel: 'off',
    fetch: async () => { await new Promise(resolve => setTimeout(resolve, 10)); return Response.json(reply); },
  });
  const result = await observe({ questions, run: () => { calls++; return client.systemOne(wire).withResponse(); } });
  assert.equal(result.ok, true); assert.equal(calls, 1);
  assert.ok(result.meta.durationMs >= 8);
  assert.equal(result.meta.definitionId, null); assert.equal(result.meta.requestedModel, null);
  assert.equal(result.meta.inputTokens, null);
  assert.equal(toObservation(questions, { data: reply }).meta.durationMs, null);
  for (const [error, kind] of [[new TypeSafeError('private'), 'invalid_request'], [new APIConnectionError('private'), 'network'], [new Error('private'), 'unknown']]) {
    for (const asyncFailure of [false, true]) {
      calls = 0;
      const failed = await observe({ questions, run: () => { calls++; if (asyncFailure) return Promise.reject(error); throw error; } });
      assert.equal(calls, 1); assert.deepEqual(failed.error, { kind });
      assert.ok(failed.meta.durationMs >= 0); assert.equal(JSON.stringify(failed).includes('private'), false);
    }
  }
});
