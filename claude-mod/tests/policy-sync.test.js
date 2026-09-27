import assert from "node:assert/strict";
import { test } from "node:test";
// The plugin must stay dependency-free, so it carries copies of the router's policy.
// These checks fail when one copy changes without the other. Run after `npm run build`.
import { continuationRoute as routerContinuation, defaultSettings, isContinuation as routerContinues,
  isSimpleTurn as routerSimpleTurn, SENSITIVE_PATTERN as routerSensitive } from "../../dist/policy.js";
import { CONTINUATION_NOTE as routerNote, EFFORT_CRITERIA, TIER_CRITERIA } from "../../dist/jev.js";
import { CONTINUATION_NOTE, continuationRoute, isContinuation, isSimpleTurn, jevRequest, SENSITIVE_PATTERN } from "../hooks/register.js";

test("the plugin screens sensitive prompts with the router's pattern", () => {
  assert.equal(SENSITIVE_PATTERN.source, routerSensitive.source);
  assert.equal(SENSITIVE_PATTERN.flags, routerSensitive.flags);
});

test("the plugin sends Jev the router's tier and effort criteria", () => {
  const { questions } = jevRequest("example");
  assert.deepEqual(questions.tier.criteria, TIER_CRITERIA);
  assert.deepEqual(questions.effort.criteria, EFFORT_CRITERIA);
});

test("the plugin's local simple-turn rule matches the router's", () => {
  const prompts = ["안녕", "안녕하세요!", "hello", "hi there", '"좋내요" 맞춤법 고쳐줘', "i has apple 맞춤법 고쳐줘",
    "Fix the spelling: i has an apple", "fix grammar: this is wrong", "그 문장 맞춤법 고쳐줘", "Refactor the router",
    "Fix the spelling: \"goodd morning\"", `${"a ".repeat(130)}맞춤법 고쳐줘`, "line one\nline two 맞춤법 고쳐줘"];
  for (const prompt of prompts) assert.equal(isSimpleTurn(prompt), routerSimpleTurn(prompt), prompt);
});

test("the plugin recognizes the router's continuations and asks Jev about them the same way", () => {
  for (const prompt of ["계속", "계속해", "응 계속 진행해줘", "이어서 진행해요", "다시 해줘", "그거 고쳐줘", "ok, go ahead",
    "please continue", "Continue.", "계속해서 테스트도 추가해줘", "진행 상황 알려줘", "continue with the tests"]) {
    assert.equal(isContinuation(prompt), routerContinues(prompt), prompt);
  }
  assert.equal(CONTINUATION_NOTE, routerNote);
});

test("the plugin's continuation switch rule matches the router's", () => {
  const models = { fast: "f", balanced: "b", strong: "s" };
  const settings = { ...defaultSettings("auto"), models };
  for (const current of ["f", "b", "s", "other"]) {
    for (const contextTokens of [5_000, 50_000]) {
      for (const tier of ["fast", "balanced", "strong"]) {
        for (const confidence of [0.6, 0.85]) {
          const choice = { tier, confidence };
          const ours = continuationRoute(current, contextTokens, choice, models);
          const router = routerContinuation({ prompt: "계속", currentModel: current, contextTokens }, choice, settings);
          assert.deepEqual(ours && { model: ours.model, direction: ours.direction },
            router && { model: router.model, direction: router.direction }, `${current} ${contextTokens} ${tier} ${confidence}`);
        }
      }
    }
  }
});
