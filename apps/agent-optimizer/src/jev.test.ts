import assert from "node:assert/strict";
import test from "node:test";
import { askJev } from "./jev.js";

const query = { prompt: "이 함수의 오류를 분석해줘", currentModel: "gpt-6-sol", contextTokens: 450 };

test("Jev request uses the documented choice schema and bounds prompt size", async () => {
  let requestBody: Record<string, unknown> | undefined;
  const fetchImpl: typeof fetch = async (_url, init) => {
    requestBody = JSON.parse(String(init?.body));
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer test-only-key");
    return Response.json({ model: "jev-1.13.0", answers: {
      tier: { type: "choice", choice: "strong", confidence: 0.93, probabilities: { fast: .02, balanced: .05, strong: .93 } },
      effort: { type: "score", score: 2.6, confidence: 0.88, probabilities: { 0: 0, 1: 0, 2: .4, 3: .6, 4: 0 } },
    }, usage: { input_tokens: 123 } });
  };
  const choice = await askJev({ ...query, prompt: "x".repeat(5000) }, { apiKey: "test-only-key", fetchImpl });
  assert.ok(requestBody);
  assert.deepEqual(choice, { tier: "strong", confidence: 0.93, effortScore: 2.6,
    effortConfidence: 0.88, inputTokens: 123, jevModel: "jev-1.13.0" });
  assert.equal(requestBody.model, "jev-latest");
  const state = requestBody.state as Record<string, string>;
  const questions = requestBody.questions as Record<string, Record<string, unknown>>;
  assert.equal(state.user_turn?.length, 1600);
  assert.equal(questions.tier?.type, "choice");
  assert.equal(questions.effort?.type, "score");
  assert.equal((questions.effort?.criteria as string[]).length, 5);
});

test("invalid effort answer defers the complete decision", async () => {
  const fetchImpl: typeof fetch = async () => Response.json({ answers: {
    tier: { type: "choice", choice: "fast", confidence: 0.98, probabilities: { fast: .98, balanced: .01, strong: .01 } },
    effort: { type: "score", score: 99 },
  } });
  await assert.rejects(askJev(query, { apiKey: "test-only-key", fetchImpl }), /jev-choice-invalid/);
});

test("invalid or missing choice fails closed", async () => {
  const fetchImpl: typeof fetch = async () => Response.json({ answers: { tier: { type: "choice", choice: "other", confidence: 0.99 } } });
  await assert.rejects(askJev(query, { apiKey: "test-only-key", fetchImpl }), /jev-choice-invalid/);
});
