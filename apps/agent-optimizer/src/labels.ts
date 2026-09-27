import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { readJsonl, REPO_ROOT } from "./capture.js";
import type { LabelValue, QueueItem } from "./label-queue.js";

export type LabelRecord = { key: string; decision: string; at: string; labels: Record<string, LabelValue> };

function labelDirectory(root = REPO_ROOT): string {
  return join(root, ".local", "labels");
}

export function labelStoreFile(decision: string, root = REPO_ROOT): string {
  if (!/^[a-z][a-z0-9-]{0,40}$/.test(decision)) throw new Error(`invalid decision name: ${decision}`);
  return join(labelDirectory(root), `${decision}.jsonl`);
}

export function readLabelStore(decision: string, root = REPO_ROOT): LabelRecord[] {
  return readJsonl<LabelRecord>(labelStoreFile(decision, root));
}

// A queue item's label object, one value per question key; every key must be filled.
function fullyLabeled(item: QueueItem): Record<string, LabelValue> | null {
  const filled: Record<string, LabelValue> = {};
  for (const key of Object.keys(item.questions)) {
    const value = item.label[key];
    if (value === null || value === undefined) return null;
    filled[key] = value;
  }
  return filled;
}

export function validateLabel(question: QueueItem["questions"][string], value: LabelValue): string | null {
  if (question.type === "noul") return typeof value === "boolean" ? null : "must be true or false";
  if (question.type === "choice") {
    const options = question.criteria && typeof question.criteria === "object" && !Array.isArray(question.criteria)
      ? Object.keys(question.criteria as Record<string, unknown>) : [];
    return typeof value === "string" && options.includes(value) ? null : `must be one of ${options.join(", ")}`;
  }
  if (question.type === "score") {
    const count = Array.isArray(question.criteria) ? question.criteria.length : 0;
    return Number.isInteger(value) && (value as number) >= 0 && (value as number) < count
      ? null : `must be an integer from 0 to ${Math.max(0, count - 1)}`;
  }
  return `unknown question type: ${question.type}`;
}

export type ApplyResult = { merged: number; skippedIncomplete: number; rejected: { key: string; reason: string }[] };

// Merges reviewed queue items into decision's label store. An item missing any label, or
// with an out-of-range one, is skipped rather than partially applied. A later apply for
// the same key replaces the earlier one.
export function applyLabels(decision: string, items: QueueItem[], options: { root?: string; now?: () => Date } = {}): ApplyResult {
  const byKey = new Map(readLabelStore(decision, options.root).map((record) => [record.key, record]));
  const result: ApplyResult = { merged: 0, skippedIncomplete: 0, rejected: [] };
  for (const item of items) {
    if (item.decision !== decision) { result.rejected.push({ key: item.key, reason: `decision is ${item.decision}, expected ${decision}` }); continue; }
    const labels = fullyLabeled(item);
    if (!labels) { result.skippedIncomplete += 1; continue; }
    const problems = Object.entries(labels).map(([name, value]) => {
      const problem = validateLabel(item.questions[name]!, value);
      return problem ? `${name} ${problem}` : null;
    }).filter((problem): problem is string => problem !== null);
    if (problems.length) { for (const problem of problems) result.rejected.push({ key: item.key, reason: problem }); continue; }
    byKey.set(item.key, { key: item.key, decision, at: (options.now?.() ?? new Date()).toISOString(), labels });
    result.merged += 1;
  }
  if (!result.merged) return result;
  const path = labelStoreFile(decision, options.root);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const text = [...byKey.values()].map((record) => JSON.stringify(record)).join("\n");
  const temp = `${path}.${process.pid}.tmp`;
  writeFileSync(temp, text ? `${text}\n` : "", { mode: 0o600 });
  renameSync(temp, path);
  return result;
}
