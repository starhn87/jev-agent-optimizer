import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { captureEnabled, captureFile, captureSink, readJsonl, requestKey, type Capture } from "./capture.js";

test("capture is off unless JAO_CAPTURE=1", () => {
  assert.equal(captureEnabled({}), false);
  assert.equal(captureEnabled({ JAO_CAPTURE: "0" }), false);
  assert.equal(captureEnabled({ JAO_CAPTURE: "1" }), true);
  assert.equal(captureSink("route", { env: {} }), undefined);
});

test("requestKey is stable for identical input and differs when the state changes", () => {
  const a = requestKey({ state: { b: 1, a: 2 }, questions: { x: {} } });
  const b = requestKey({ state: { b: 1, a: 2 }, questions: { x: {} } });
  assert.equal(a, b);
  assert.match(a, /^[0-9a-f]{24}$/);
  assert.notEqual(a, requestKey({ state: { b: 1, a: 3 }, questions: { x: {} } }));
});

test("captureSink writes only requests that got an answer, never a raw filesystem or network error", () => {
  const dir = mkdtempSync(join(tmpdir(), "jao-capture-"));
  try {
    const sink = captureSink("route", { root: dir, env: { JAO_CAPTURE: "1" }, now: () => new Date("2026-09-27T00:00:00Z") })!;
    sink({ model: "jev-latest", state: { user_turn: "fix the typo" }, questions: { tier: { type: "choice" } } },
      { answers: { tier: { type: "choice", choice: "fast", confidence: 0.9 } }, usage: { input_tokens: 12 } });
    sink({ model: "jev-latest", state: {}, questions: {} }, {}); // no answers: dropped
    const file = captureFile("route", dir);
    const rows = readJsonl<Capture>(file);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.at, "2026-09-27T00:00:00.000Z");
    assert.equal(rows[0]!.classifier, "jev-latest");
    assert.deepEqual(rows[0]!.answers, { tier: { type: "choice", choice: "fast", confidence: 0.9 } });
    assert.match(rows[0]!.id, /^[0-9a-f-]{36}$/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("captureFile rejects a decision name that is not a plain lowercase word", () => {
  assert.throws(() => captureFile("../escape"), /invalid decision name/);
  assert.throws(() => captureFile("Route"), /invalid decision name/);
});

test("readJsonl skips unparsable lines instead of throwing", () => {
  const dir = mkdtempSync(join(tmpdir(), "jao-capture-"));
  try {
    const path = join(dir, "mixed.jsonl");
    writeFileSync(path, '{"a":1}\n not json\n{"a":2}\n');
    assert.deepEqual(readJsonl(path), [{ a: 1 }, { a: 2 }]);
    assert.deepEqual(readJsonl(join(dir, "missing.jsonl")), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
