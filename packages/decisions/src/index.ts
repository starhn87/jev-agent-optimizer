import { APIError, APIConnectionError, APITimeoutError, APIUserAbortError, TypeSafeError } from '@typesafe-ai/sdk';
import type { Questions, SystemOneResult, WithResponse } from '@typesafe-ai/sdk';

export type ValidationIssueCode =
  | 'invalid_answers' | 'missing_answer' | 'unexpected_answer' | 'invalid_question'
  | 'invalid_answer_type' | 'invalid_confidence' | 'invalid_probabilities'
  | 'invalid_probability' | 'invalid_probability_sum' | 'invalid_choice'
  | 'choice_probability_mismatch' | 'invalid_legend' | 'invalid_score' | 'score_probability_mismatch';
export type ValidationIssue = { path: readonly (string | number)[]; code: ValidationIssueCode };
export type ValidationResult<Q extends Questions> =
  | { ok: true; answers: SystemOneResult<Q>['answers'] }
  | { ok: false; issues: readonly ValidationIssue[] };

export type ObservationContext = {
  definitionId?: string;
  definitionVersion?: string;
  requestedModel?: string;
  durationMs?: number;
};
export type ObservationMeta = {
  definitionId: string | null;
  definitionVersion: string | null;
  requestedModel: string | null;
  durationMs: number | null;
  model: string | null;
  requestId: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
};
export type ObservationError =
  | { kind: 'invalid_response'; issues: readonly ValidationIssue[] }
  | { kind: 'http'; status: number }
  | { kind: 'invalid_request' | 'timeout' | 'aborted' | 'network' | 'unknown' };
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

export function validateAnswers<const Q extends Questions>(questions: Q, value: unknown): ValidationResult<Q> {
  const issues: ValidationIssue[] = [];
  const issue = (path: (string | number)[], code: ValidationIssueCode) => { issues.push({ path, code }); };
  if (!Object.keys(questions).length) return { ok: false, issues: [{ path: [], code: 'invalid_question' }] };
  if (!record(value)) return { ok: false, issues: [{ path: [], code: 'invalid_answers' }] };
  // Only known question IDs and fields enter diagnostics; never echo provider content or foreign keys.
  if (Object.keys(value).some(id => !Object.hasOwn(questions, id))) issue([], 'unexpected_answer');
  for (const [id, question] of Object.entries(questions)) {
    if (!Object.hasOwn(value, id)) { issue([id], 'missing_answer'); continue; }
    const answer = value[id];
    if (!record(answer) || answer.type !== question.type) { issue([id, 'type'], 'invalid_answer_type'); continue; }
    if (question.type === 'noul') {
      if (!probability(answer.noul)) issue([id, 'noul'], 'invalid_probability');
      continue;
    }
    if ((question.type !== 'choice' && question.type !== 'score')
      || (question.type === 'choice' && (!record(question.criteria) || !Object.keys(question.criteria).length))
      || (question.type === 'score' && (!Array.isArray(question.criteria) || question.criteria.length < 2))) {
      issue([id], 'invalid_question'); continue;
    }
    if (!probability(answer.confidence)) issue([id, 'confidence'], 'invalid_confidence');
    const keys = question.type === 'choice' ? Object.keys(question.criteria) : question.criteria.map((_, i) => String(i));
    if (!record(answer.probabilities) || !sameKeys(answer.probabilities, keys)) {
      issue([id, 'probabilities'], 'invalid_probabilities'); continue;
    }
    const probs = keys.map(key => (answer.probabilities as Record<string, unknown>)[key]);
    keys.forEach((key, i) => { if (!probability(probs[i])) issue([id, 'probabilities', key], 'invalid_probability'); });
    if (!probs.every(probability)) continue;
    // Jev rounds each probability to two decimals independently.
    if (Math.abs(probs.reduce((sum, p) => sum + p, 0) - 1) > keys.length * 0.005 + 1e-8) issue([id, 'probabilities'], 'invalid_probability_sum');
    if (question.type === 'choice') {
      if (typeof answer.choice !== 'string' || !keys.includes(answer.choice)) issue([id, 'choice'], 'invalid_choice');
      else if (answer.probabilities[answer.choice] !== Math.max(...probs)) issue([id, 'choice'], 'choice_probability_mismatch');
    } else {
      if (!record(answer.legend) || !sameKeys(answer.legend, keys) || !keys.every((key, i) => sameJson(question.criteria[i], (answer.legend as Record<string, unknown>)[key]))) issue([id, 'legend'], 'invalid_legend');
      if (typeof answer.score !== 'number' || !Number.isFinite(answer.score) || answer.score < 0 || answer.score > keys.length - 1) {
        issue([id, 'score'], 'invalid_score'); continue;
      }
      const expected = probs.reduce((sum, p, i) => sum + p * i, 0);
      const tolerance = 0.005 + keys.reduce((sum, _, i) => sum + i * 0.005, 0);
      if (Math.abs(expected - answer.score) > tolerance + 1e-8) issue([id, 'score'], 'score_probability_mismatch');
    }
  }
  return issues.length ? { ok: false, issues } : { ok: true, answers: value as SystemOneResult<Q>['answers'] };
}

export function toObservation<const Q extends Questions>(
  questions: Q,
  outcome: { data: unknown; requestId?: string | null } | { error: unknown },
  context: ObservationContext = {},
): DecisionObservation<Q> {
  const meta: ObservationMeta = {
    definitionId: context.definitionId ?? null, definitionVersion: context.definitionVersion ?? null,
    requestedModel: context.requestedModel ?? null,
    durationMs: typeof context.durationMs === 'number' && Number.isFinite(context.durationMs) && context.durationMs >= 0 ? context.durationMs : null,
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
  const checked = validateAnswers(questions, record(raw) ? raw.answers : undefined);
  return checked.ok ? { ok: true, answers: checked.answers, meta }
    : { ok: false, error: { kind: 'invalid_response', issues: checked.issues }, meta };
}

export async function observe<const Q extends Questions>({ questions, run, context = {} }: {
  questions: Q;
  run: () => PromiseLike<WithResponse<SystemOneResult<Q>>>;
  context?: Omit<ObservationContext, 'durationMs'>;
}): Promise<DecisionObservation<Q> & { meta: ObservationMeta & { durationMs: number } }> {
  const started = performance.now();
  let outcome: WithResponse<SystemOneResult<Q>> | { error: unknown };
  try { outcome = await run(); }
  catch (error) { outcome = { error }; }
  const result = toObservation(questions, outcome, context);
  return { ...result, meta: { ...result.meta, durationMs: performance.now() - started } };
}
