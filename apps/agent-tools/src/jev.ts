import { createDecisionClient } from "@starhn87/jev-decisions";
import type { RouteChoice, RouteQuery, Tier } from "./types.js";
import { MAX_CLASSIFIER_PROMPT_CHARS } from "./policy.js";
import type { ExchangeSink } from "./capture.js";

export type JevOptions = {
  apiKey?: string;
  endpoint?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  // A Jev-compatible System One server such as a local Kev names its own model.
  model?: string;
  // Receives each successful request and reply, e.g. for opt-in local capture.
  onExchange?: ExchangeSink;
};

// claude-mod/hooks/register.js sends the same criteria; claude-mod/tests/policy-sync.test.js checks it.
export const TIER_CRITERIA = {
  fast: "Simple formatting, direct facts, small unambiguous edits, or routine replies with low risk.",
  balanced: "Typical coding, writing, analysis, and multi-step tasks requiring sound judgment.",
  strong: "Hard debugging, architecture, high-stakes reasoning, complex cross-file changes, or ambiguous trade-offs.",
};
export const EFFORT_CRITERIA = [
  "Immediate answer or mechanical edit; little reasoning.",
  "A few simple steps or a small choice.",
  "Several steps, ordinary coding, or a meaningful judgment.",
  "Complex debugging, planning, or interacting constraints.",
  "Open-ended or high-stakes work requiring the deepest reasoning.",
];

export const CONTINUATION_NOTE = " The user turn continues earlier work: judge the work that remains, using previous_request (what was asked) and previous_reply_end (where the last answer stopped).";

// The exact request production sends; export-training reuses it so a fine-tune learns these questions.
export function routingRequest(query: RouteQuery, model = "jev-latest") {
  return {
    model,
    state: {
      user_turn: query.prompt.slice(0, MAX_CLASSIFIER_PROMPT_CHARS),
      approximate_context_tokens: query.contextTokens,
      current_model: query.currentModel,
      ...(query.previousRequest ? { previous_request: query.previousRequest } : {}),
      ...(query.previousReply ? { previous_reply_end: query.previousReply } : {}),
    },
    questions: {
      tier: {
        type: "choice" as const,
        instructions: `Choose the least expensive model tier that can reliably complete this user turn. Assess the current requested work. Conversation length and the previous model are not evidence of task difficulty. Use strong only when the current task clearly requires it. If context is insufficient to judge, choose balanced.${query.previousRequest || query.previousReply ? CONTINUATION_NOTE : ""}`,
        criteria: TIER_CRITERIA,
      },
      effort: {
        type: "score" as const,
        instructions: "How much reasoning does this user turn require? Judge the work independently of the model tier.",
        criteria: EFFORT_CRITERIA as [string, string, ...string[]],
      },
    },
  };
}

export async function askJev(query: RouteQuery, options: JevOptions = {}): Promise<RouteChoice> {
  const apiKey = options.apiKey ?? process.env.TYPESAFE_API_KEY ?? process.env.JEV_API_KEY;
  if (!apiKey) throw new Error("jev-key-missing");
  const request = routingRequest(query, options.model);
  const result = await createDecisionClient({ apiKey, model: request.model,
    baseURL: options.endpoint?.replace(/\/v1\/systemone\/?$/, ""), fetch: options.fetchImpl,
  }).decide({ definitionId: "agent-model-effort", definitionVersion: "1", state: request.state, questions: request.questions },
    { timeoutMs: options.timeoutMs ?? 1200 });
  if (!result.ok) throw new Error(result.error.kind === "invalid_response" ? "jev-choice-invalid" : `jev-${result.error.kind}`);
  const { tier, effort } = result.answers;
  try { options.onExchange?.(request, { model: result.meta.model, answers: result.answers,
    usage: { input_tokens: result.meta.inputTokens, output_tokens: result.meta.outputTokens } }); } catch { /* Capture never fails a route. */ }
  return { tier: tier.choice as Tier, confidence: tier.confidence,
    inputTokens: result.meta.inputTokens ?? undefined, effortScore: effort.score, effortConfidence: effort.confidence,
    ...(result.meta.model ? { jevModel: result.meta.model } : {}) };
}
