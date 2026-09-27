import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { captureFile, captureSink, readJsonl, type Capture } from "./capture.js";
import { applyLabels } from "./labels.js";
import { exportTrainingRows, toJsonl } from "./export-training.js";
import type { QueueItem } from "./label-queue.js";

function withTempRoot(run: (root: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "jev-decision-kit-export-"));
  try { run(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}

const questions = { tier: { type: "choice" as const, instructions: "pick", criteria: { fast: "", strong: "" } } };

function capturedKeys(root: string): string[] {
  return readJsonl<Capture>(captureFile("route", root)).map((capture) => capture.key);
}

test("an unlabeled capture is skipped, and a labeled one exports in Kev's shape with no capture metadata", () => {
  withTempRoot((root) => {
    const sink = captureSink("route", { root, env: { JEV_KIT_CAPTURE: "1" } })!;
    sink({ model: "jev-latest", state: { user_turn: "fix the typo" }, questions },
      { answers: { tier: { type: "choice", choice: "fast", confidence: 0.9 } } });

    const before = exportTrainingRows("route", { root });
    assert.deepEqual(before, { train: [], holdout: [], skippedUnlabeled: 1 });

    const [key] = capturedKeys(root);
    const item: QueueItem = { key: key!, decision: "route", at: "2026-09-27T00:00:00Z",
      state: { user_turn: "fix the typo" }, questions, classifiers: {}, label: { tier: "fast" } };
    applyLabels("route", [item], { root });

    const after = exportTrainingRows("route", { root, holdoutPercent: 0 });
    assert.equal(after.skippedUnlabeled, 0);
    assert.deepEqual(after.train, [{ state: { user_turn: "fix the typo" },
      questions: { tier: { type: "choice", instructions: "pick", criteria: { fast: "", strong: "" }, label: "fast" } } }]);
    assert.equal(after.holdout.length, 0);
    assert.match(toJsonl(after.train), /"label":"fast"/);
    assert.equal(toJsonl([]), "");
  });
});

test("labeled rows split deterministically by key and never repeat across train/holdout", () => {
  withTempRoot((root) => {
    const sink = captureSink("route", { root, env: { JEV_KIT_CAPTURE: "1" } })!;
    for (let index = 0; index < 40; index += 1) {
      sink({ model: "jev-latest", state: { user_turn: `case ${index}` }, questions },
        { answers: { tier: { type: "choice", choice: "fast", confidence: 0.9 } } });
    }
    const items: QueueItem[] = [...new Set(capturedKeys(root))].map((key) => ({
      key, decision: "route", at: "2026-09-27T00:00:00Z", state: {}, questions, classifiers: {}, label: { tier: "fast" } }));
    applyLabels("route", items, { root });

    const first = exportTrainingRows("route", { root, holdoutPercent: 20 });
    assert.equal(first.train.length + first.holdout.length, 40);
    assert.equal(first.skippedUnlabeled, 0);
    const second = exportTrainingRows("route", { root, holdoutPercent: 20 });
    assert.deepEqual(second.train, first.train);
    assert.deepEqual(second.holdout, first.holdout);
  });
});

test("holdoutPercent must be within 0-100", () => {
  assert.throws(() => exportTrainingRows("route", { holdoutPercent: 101 }), /holdout percent/);
});
