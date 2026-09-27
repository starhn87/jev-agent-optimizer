import { APIError, APIConnectionError, APITimeoutError, APIUserAbortError, TypeSafeError } from '@typesafe-ai/sdk';
import type { Questions, SystemOneResult } from '@typesafe-ai/sdk';

export type ObservationContext = {
  definitionId: string;
  definitionVersion: string;
  requestedModel: string;
  durationMs: number;
};
export type ObservationMeta = ObservationContext & {
  model: string | null;
  requestId: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
};
export type ObservationError = {
  kind: 'invalid_request' | 'invalid_response' | 'timeout' | 'aborted' | 'network' | 'http' | 'unknown';
  status?: number;
};
export type DecisionObservation<Q extends Questions> =
  | { ok: true; answers: SystemOneResult<Q>['answers']; meta: ObservationMeta }
  | { ok: false; error: ObservationError; meta: ObservationMeta };

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const probability = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
const sameKeys = (value: Record<string, unknown>, keys: string[]) =>
  Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const tokenCount = (value: unknown) =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
const sameJson = (expected: unknown, value: unknown): boolean => {
  if (expected === value) return true;
  if (Array.isArray(expected) && Array.isArray(value)) return expected.length === value.length && expected.every((item, i) => sameJson(item, value[i]));
  return record(expected) && record(value) && sameKeys(value, Object.keys(expected)) && Object.keys(expected).every(key => sameJson(expected[key], value[key]));
};

export function validateAnswers<const Q extends Questions>(questions: Q, value: unknown): SystemOneResult<Q>['answers'] | null {
  if (!record(value) || !Object.keys(questions).length || !sameKeys(value, Object.keys(questions))) return null;
  for (const [id, question] of Object.entries(questions)) {
    const answer = value[id];
    if (!record(answer) || answer.type !== question.type) return null;
    if (question.type === 'noul') {
      if (!probability(answer.noul)) return null;
      continue;
    }
    if (question.type !== 'choice' && question.type !== 'score') return null;
    if (question.type === 'choice' && (!record(question.criteria) || !Object.keys(question.criteria).length)) return null;
    if (question.type === 'score' && (!Array.isArray(question.criteria) || question.criteria.length < 2)) return null;
    if (!probability(answer.confidence) || !record(answer.probabilities)) return null;
    const keys = question.type === 'choice' ? Object.keys(question.criteria) : question.criteria.map((_, i) => String(i));
    if (!sameKeys(answer.probabilities, keys)) return null;
    const probs = keys.map(key => (answer.probabilities as Record<string, unknown>)[key]);
    if (!probs.every(probability)) return null;
    // Jev rounds each probability to two decimals independently.
    if (Math.abs(probs.reduce((sum, p) => sum + p, 0) - 1) > keys.length * 0.005 + 1e-8) return null;
    if (question.type === 'choice') {
      if (typeof answer.choice !== 'string' || !keys.includes(answer.choice)) return null;
      if (answer.probabilities[answer.choice] !== Math.max(...probs)) return null;
    } else {
      if (!record(answer.legend) || !sameKeys(answer.legend, keys) || !keys.every((key, i) => sameJson(question.criteria[i], (answer.legend as Record<string, unknown>)[key]))) return null;
      if (typeof answer.score !== 'number' || !Number.isFinite(answer.score) || answer.score < 0 || answer.score > keys.length - 1) return null;
      const expected = probs.reduce((sum, p, i) => sum + p * i, 0);
      const tolerance = 0.005 + keys.reduce((sum, _, i) => sum + i * 0.005, 0);
      if (Math.abs(expected - answer.score) > tolerance + 1e-8) return null;
    }
  }
  return value as SystemOneResult<Q>['answers'];
}

export function toObservation<const Q extends Questions>(
  questions: Q,
  outcome: { data: unknown; requestId?: string | null } | { error: unknown },
  context: ObservationContext,
): DecisionObservation<Q> {
  const meta: ObservationMeta = {
    definitionId: context.definitionId, definitionVersion: context.definitionVersion,
    requestedModel: context.requestedModel, durationMs: context.durationMs,
    model: null, requestId: null, inputTokens: null, outputTokens: null,
  };
  if ('error' in outcome) {
    const error = outcome.error;
    if (error instanceof APIError) meta.requestId = error.requestId ?? null;
    const details: ObservationError = error instanceof APIUserAbortError ? { kind: 'aborted' }
      : error instanceof APITimeoutError ? { kind: 'timeout' }
      : error instanceof APIError ? { kind: 'http', status: error.status }
      : error instanceof APIConnectionError ? { kind: 'network' }
      : error instanceof TypeSafeError ? { kind: 'invalid_request' }
      : { kind: 'unknown' };
    return { ok: false, error: details, meta };
  }
  meta.requestId = outcome.requestId ?? null;
  const raw = outcome.data;
  if (record(raw)) {
    meta.model = typeof raw.model === 'string' ? raw.model : null;
    if (record(raw.usage)) {
      meta.inputTokens = tokenCount(raw.usage.input_tokens);
      meta.outputTokens = tokenCount(raw.usage.output_tokens);
    }
  }
  const answers = record(raw) ? validateAnswers(questions, raw.answers) : null;
  return answers ? { ok: true, answers, meta } : { ok: false, error: { kind: 'invalid_response' }, meta };
}
