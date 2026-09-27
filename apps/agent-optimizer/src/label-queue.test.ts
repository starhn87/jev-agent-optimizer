import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { captureSink } from "./capture.js";
import { buildLabelQueue } from "./label-queue.js";
import { applyLabels } from "./labels.js";

function withTempRoot(run: (root: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "jao-label-"));
  try { run(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}

const questions = { tier: { type: "choice", instructions: "pick one", criteria: { fast: "..", strong: ".." } } };

test("the queue groups two classifiers' answers for the same request under one item, newest first", () => {
  withTempRoot((root) => {
    const sink = captureSink("route", { root, env: { JAO_CAPTURE: "1" }, now: () => new Date("2026-09-27T00:00:00Z") })!;
    sink({ model: "jev-latest", state: { user_turn: "a" }, questions },
      { answers: { tier: { type: "choice", choice: "fast", confidence: 0.9 } } });
    sink({ model: "kev-latest", state: { user_turn: "a" }, questions },
      { answers: { tier: { type: "choice", choice: "strong", confidence: 0.6 } } });
    const laterSink = captureSink("route", { root, env: { JAO_CAPTURE: "1" }, now: () => new Date("2026-09-27T01:00:00Z") })!;
    laterSink({ model: "jev-latest", state: { user_turn: "b" }, questions },
      { answers: { tier: { type: "choice", choice: "balanced", confidence: 0.85 } } });

    const queue = buildLabelQueue("route", { root });
    assert.equal(queue.length, 2);
    assert.deepEqual((queue[0]!.state as { user_turn: string }).user_turn, "b");
    const a = queue[1]!;
    assert.deepEqual(Object.keys(a.classifiers).sort(), ["jev-latest", "kev-latest"]);
    assert.equal((a.classifiers["jev-latest"]!.tier as { choice: string }).choice, "fast");
    assert.equal((a.classifiers["kev-latest"]!.tier as { choice: string }).choice, "strong");
    assert.deepEqual(a.label, { tier: null });
    assert.deepEqual(a.questions.tier, { type: "choice", instructions: "pick one", criteria: { fast: "..", strong: ".." } });
  });
});

test("an already-labeled key drops out of the queue", () => {
  withTempRoot((root) => {
    const sink = captureSink("route", { root, env: { JAO_CAPTURE: "1" } })!;
    sink({ model: "jev-latest", state: { user_turn: "a" }, questions }, { answers: { tier: { type: "choice", choice: "fast", confidence: 0.9 } } });
    const queue = buildLabelQueue("route", { root });
    applyLabels("route", queue.map((item) => ({ ...item, label: { tier: "fast" } })), { root });
    assert.deepEqual(buildLabelQueue("route", { root }), []);
  });
});

test("the queue respects --limit", () => {
  withTempRoot((root) => {
    const sink = captureSink("route", { root, env: { JAO_CAPTURE: "1" } })!;
    for (const turn of ["a", "b", "c"]) {
      sink({ model: "jev-latest", state: { user_turn: turn }, questions }, { answers: { tier: { type: "choice", choice: "fast", confidence: 0.9 } } });
    }
    assert.equal(buildLabelQueue("route", { root, limit: 2 }).length, 2);
    assert.throws(() => buildLabelQueue("route", { root, limit: 0 }), /positive integer/);
  });
});
