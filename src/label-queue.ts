import { captureFilesFor, readJsonl, type Capture } from "./capture.js";
import { readLabelStore } from "./labels.js";

export type QuestionDef = { type: "choice" | "noul" | "score"; instructions?: string; criteria?: unknown };
export type LabelValue = string | boolean | number;
export type QueueItem = {
  key: string;
  decision: string;
  // Most recent capture time among the classifiers that answered this exact request.
  at: string;
  state: unknown;
  questions: Record<string, QuestionDef>;
  // Each classifier's own answer, for the reviewer's reference only; never trusted as ground truth.
  classifiers: Record<string, Record<string, unknown>>;
  // One entry per question key, to fill in: null until reviewed.
  label: Record<string, LabelValue | null>;
};

function questionDefs(questions: Record<string, Record<string, unknown>>): Record<string, QuestionDef> {
  return Object.fromEntries(Object.entries(questions).map(([key, question]) => [key, {
    type: question.type as QuestionDef["type"],
    ...(typeof question.instructions === "string" ? { instructions: question.instructions } : {}),
    ...("criteria" in question ? { criteria: question.criteria } : {}),
  }]));
}

// Builds a review file from unlabeled captures: the newest N distinct requests for this
// decision, each request only once even when more than one classifier answered it.
export function buildLabelQueue(decision: string, options: { root?: string; limit?: number } = {}): QueueItem[] {
  const limit = options.limit ?? 50;
  if (!Number.isSafeInteger(limit) || limit < 1) throw new Error("label queue limit must be a positive integer");
  const captures = captureFilesFor(decision, options.root).flatMap((path) => readJsonl<Capture>(path));
  const labeled = new Set(readLabelStore(decision, options.root).map((record) => record.key));
  const byKey = new Map<string, QueueItem>();
  for (const capture of captures) {
    if (labeled.has(capture.key)) continue;
    const existing = byKey.get(capture.key);
    if (existing) {
      existing.classifiers[capture.classifier] = capture.answers;
      if (capture.at > existing.at) existing.at = capture.at;
      continue;
    }
    byKey.set(capture.key, { key: capture.key, decision, at: capture.at, state: capture.request.state,
      questions: questionDefs(capture.request.questions), classifiers: { [capture.classifier]: capture.answers },
      label: Object.fromEntries(Object.keys(capture.request.questions).map((name) => [name, null])) });
  }
  return [...byKey.values()].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)).slice(0, limit);
}
