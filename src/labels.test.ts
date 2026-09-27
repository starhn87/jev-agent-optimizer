import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { applyLabels, readLabelStore, validateLabel } from "./labels.js";
import type { QueueItem } from "./label-queue.js";

function withTempRoot(run: (root: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "jao-labels-"));
  try { run(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}

const item = (key: string, label: QueueItem["label"]): QueueItem => ({
  key, decision: "route", at: "2026-09-27T00:00:00Z", state: { user_turn: key },
  questions: {
    tier: { type: "choice", criteria: { fast: "", strong: "" } },
    angry: { type: "noul" },
    urgency: { type: "score", criteria: ["low", "mid", "high"] },
  },
  classifiers: {}, label,
});

test("validateLabel checks each question type's own shape", () => {
  const choice = { type: "choice" as const, criteria: { fast: "", strong: "" } };
  assert.equal(validateLabel(choice, "fast"), null);
  assert.match(validateLabel(choice, "medium")!, /must be one of fast, strong/);
  const noul = { type: "noul" as const };
  assert.equal(validateLabel(noul, true), null);
  assert.match(validateLabel(noul, "yes")!, /true or false/);
  const score = { type: "score" as const, criteria: ["low", "mid", "high"] };
  assert.equal(validateLabel(score, 2), null);
  assert.match(validateLabel(score, 3)!, /0 to 2/);
  assert.match(validateLabel(score, 1.5)!, /0 to 2/);
});

test("an item missing any label is skipped, not partially merged", () => {
  withTempRoot((root) => {
    const result = applyLabels("route", [item("a", { tier: "fast", angry: null, urgency: 1 })], { root });
    assert.deepEqual(result, { merged: 0, skippedIncomplete: 1, rejected: [] });
    assert.deepEqual(readLabelStore("route", root), []);
  });
});

test("an out-of-range label is rejected with a reason and nothing from that item is merged", () => {
  withTempRoot((root) => {
    const result = applyLabels("route", [item("a", { tier: "medium", angry: false, urgency: 1 })], { root });
    assert.equal(result.merged, 0);
    assert.deepEqual(result.rejected, [{ key: "a", reason: "tier must be one of fast, strong" }]);
  });
});

test("a later apply for the same key replaces the earlier label, and merges accumulate across calls", () => {
  withTempRoot((root) => {
    applyLabels("route", [item("a", { tier: "fast", angry: false, urgency: 0 })], { root, now: () => new Date("2026-09-27T00:00:00Z") });
    applyLabels("route", [item("b", { tier: "strong", angry: true, urgency: 2 })], { root, now: () => new Date("2026-09-27T00:01:00Z") });
    applyLabels("route", [item("a", { tier: "strong", angry: false, urgency: 0 })], { root, now: () => new Date("2026-09-27T00:02:00Z") });
    const store = readLabelStore("route", root);
    assert.equal(store.length, 2);
    assert.deepEqual(store.find((record) => record.key === "a")!.labels, { tier: "strong", angry: false, urgency: 0 });
  });
});

test("an item for the wrong decision is rejected without touching the store", () => {
  withTempRoot((root) => {
    const wrong = { ...item("a", { tier: "fast", angry: false, urgency: 0 }), decision: "search" };
    const result = applyLabels("route", [wrong], { root });
    assert.deepEqual(result, { merged: 0, skippedIncomplete: 0, rejected: [{ key: "a", reason: "decision is search, expected route" }] });
  });
});
