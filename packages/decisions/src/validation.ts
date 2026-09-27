import type { Answers, Questions } from "./types.js";

export const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const probability = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
const sameKeys = (value: Record<string, unknown>, keys: string[]) =>
  Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));

export function validQuestions(value: unknown): value is Questions {
  if (!record(value) || !Object.keys(value).length) return false;
  return Object.values(value).every((q) => record(q) && (
    q.type === "noul" ||
    (q.type === "choice" && record(q.criteria) && Object.keys(q.criteria).length >= 2) ||
    (q.type === "score" && Array.isArray(q.criteria) && q.criteria.length >= 2)
  ));
}

export function validateAnswers<const Q extends Questions>(questions: Q, value: unknown): Answers<Q> | null {
  if (!record(value) || !sameKeys(value, Object.keys(questions))) return null;
  for (const [id, question] of Object.entries(questions)) {
    const answer = value[id];
    if (!record(answer) || answer.type !== question.type) return null;
    if (question.type === "noul") {
      if (!probability(answer.noul)) return null;
      continue;
    }
    if (!probability(answer.confidence) || !record(answer.probabilities)) return null;
    const keys = question.type === "choice" ? Object.keys(question.criteria) : question.criteria.map((_, i) => String(i));
    if (!sameKeys(answer.probabilities, keys)) return null;
    const probs = keys.map((key) => answer.probabilities && (answer.probabilities as Record<string, unknown>)[key]);
    if (!probs.every(probability)) return null;
    // Jev rounds each probability to two decimals independently.
    if (Math.abs(probs.reduce((sum, p) => sum + p, 0) - 1) > keys.length * 0.005 + 1e-8) return null;
    if (question.type === "choice") {
      if (typeof answer.choice !== "string" || !keys.includes(answer.choice)) return null;
      if (answer.probabilities[answer.choice] !== Math.max(...probs)) return null;
    } else {
      if (typeof answer.score !== "number" || !Number.isFinite(answer.score) || answer.score < 0 || answer.score > keys.length - 1) return null;
      const expected = probs.reduce((sum, p, i) => sum + p * i, 0);
      const tolerance = 0.005 + keys.reduce((sum, _, i) => sum + i * 0.005, 0);
      if (Math.abs(expected - answer.score) > tolerance + 1e-8) return null;
    }
  }
  return value as Answers<Q>;
}
