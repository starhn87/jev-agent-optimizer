import { createHash } from "node:crypto";
import { captureFilesFor, readJsonl, type Capture } from "./capture.js";
import { readLabelStore } from "./labels.js";

// Kev's fine-tuning shape: https://github.com/jaredpalmer/kev#by-hand — the same request
// production sends, plus a `label` on every question. No id, classifier, capture time or
// decision name travels into the training file.
export type TrainingRow = { state: unknown; questions: Record<string, Record<string, unknown> & { label: unknown }> };
export type ExportResult = { train: TrainingRow[]; holdout: TrainingRow[]; skippedUnlabeled: number };

// Deterministic 0..99 split point from the key, so re-running the export without new
// labels reproduces the same train/holdout assignment.
function splitBucket(key: string): number {
  const digest = createHash("sha256").update(key).digest();
  return digest.readUInt16BE(0) % 100;
}

export function exportTrainingRows(decision: string, options: { root?: string; holdoutPercent?: number } = {}): ExportResult {
  const holdoutPercent = options.holdoutPercent ?? 15;
  if (!Number.isFinite(holdoutPercent) || holdoutPercent < 0 || holdoutPercent > 100) throw new Error("holdout percent must be 0-100");
  const labels = new Map(readLabelStore(decision, options.root).map((record) => [record.key, record.labels]));
  const byKey = new Map<string, Capture["request"]>();
  for (const path of captureFilesFor(decision, options.root)) {
    for (const capture of readJsonl<Capture>(path)) if (!byKey.has(capture.key)) byKey.set(capture.key, capture.request);
  }
  const train: TrainingRow[] = [];
  const holdout: TrainingRow[] = [];
  let skippedUnlabeled = 0;
  for (const [key, request] of byKey) {
    const rowLabels = labels.get(key);
    if (!rowLabels) { skippedUnlabeled += 1; continue; }
    const questions = Object.fromEntries(Object.entries(request.questions).map(([name, question]) =>
      [name, { ...question, label: rowLabels[name] }]));
    (splitBucket(key) < holdoutPercent ? holdout : train).push({ state: request.state, questions });
  }
  return { train, holdout, skippedUnlabeled };
}

export function toJsonl(rows: TrainingRow[]): string {
  return rows.length ? `${rows.map((row) => JSON.stringify(row)).join("\n")}\n` : "";
}
