const ENDPOINT = "https://api.typesafe.ai/v1/systemone";
const MODELS = {
  fast: "claude-haiku-4-5",
  balanced: "claude-sonnet-5",
  strong: "claude-opus-5",
};
const EFFORTS = ["low", "medium", "high", "xhigh", "max"];
const CONFIDENCE_FLOOR = 0.8;
const TIMEOUT_MS = 1500;
const MAX_PROMPT_CHARS = 1600;
const MAX_CACHED_TURNS = 64;
const METRICS_MAX_BYTES = 3 * 1024 * 1024;
// A model switch forfeits the session's warm prompt cache, so the local fast path
// only applies while the re-sent context is small.
const FAST_PATH_MAX_CONTEXT_TOKENS = 20_000;
export const SENSITIVE_PATTERN = /(?:-----BEGIN [A-Z ]*PRIVATE KEY-----|(?:api[_ -]?key|access[_ -]?token|bearer|password|secret)\s*[:=]\s*\S+|\.env\b)/i;

// A dated snapshot (claude-…-20251001) is the requested model; a longer version number (…-5 vs …-5-5) is not.
const DATED_SUFFIX = /^(?:\d{8}|\d{4}-\d{2}-\d{2})$/;
function sameModel(served, requested) {
  return served === requested || (served.startsWith(`${requested}-`) && DATED_SUFFIX.test(served.slice(requested.length + 1)));
}

// Mirrors isSimpleTurn in src/policy.ts; claude-mod/tests/policy-sync.test.js keeps them in step.
export function isSimpleTurn(prompt) {
  if (/^(?:안녕(?:하세요|하십니까)?|반가워(?:요)?|hello|hi|hey)[.!~\s]*$/iu.test(prompt)) return true;
  if (prompt.length > 240 || /[\r\n]/u.test(prompt)) return false;
  const korean = prompt.match(/^(.+?)(?:의)?\s+(?:맞춤법|문법|오탈자)(?:을|를)?\s*(?:고쳐\s*줘|수정해\s*줘|교정해\s*줘)[.!?\s]*$/u);
  const english = prompt.match(/^(?:fix|correct) (?:the )?(?:spelling|grammar)(?: of| in)?\s*:\s*(.+)$/iu);
  const supplied = korean?.[1] ?? english?.[1];
  if (!supplied) return false;
  const quoted = supplied.match(/^(?:"([^"\r\n]+)"|'([^'\r\n]+)'|“([^”\r\n]+)”|‘([^’\r\n]+)’)$/u);
  if (quoted) {
    const prose = quoted.slice(1).find((part) => part !== undefined);
    return /\p{L}/u.test(prose) && /^[\p{L}\p{N}\s,.!?…'’“-]+$/u.test(prose);
  }
  if (/^(?:this|that|it|the above|previous|above)(?:\s|$)/iu.test(supplied)) return false;
  return /^[a-z][a-z ',.!?’-]*$/iu.test(supplied) && supplied.trim().split(/\s+/u).length >= 3;
}

export function keyFromEnvFile(contents) {
  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?TYPESAFE_API_KEY\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    const raw = match[1] ?? "";
    if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
      return raw.slice(1, -1);
    }
    return raw.split(/\s+#/)[0]?.trim() ?? "";
  }
  return "";
}

export function choiceFromJev(body) {
  const answer = body?.answers?.tier;
  if (answer?.type !== "choice" || !Object.hasOwn(MODELS, answer.choice)) return null;
  if (typeof answer.confidence !== "number" || !Number.isFinite(answer.confidence) ||
      answer.confidence < 0 || answer.confidence > 1) return null;
  const score = body?.answers?.effort;
  const effort = score?.type === "score" && typeof score.score === "number" &&
    Number.isFinite(score.score) && score.score >= 0 && score.score <= 4
    ? EFFORTS[Math.round(score.score)] : undefined;
  return { tier: answer.choice, confidence: answer.confidence, ...(effort ? { effort } : {}) };
}

async function kitEnv($, name) {
  for (const prefix of ["JEV_KIT_", "JAO_", "AMR_"]) {
    const value = await $.env.get(prefix + name);
    if (value !== undefined && value !== null && value !== "") return value;
  }
}

async function envFile($) {
  return await kitEnv($, "ENV_FILE") || `${$.plugin.root}/../.env`;
}

async function apiKey($) {
  const direct = await $.env.get("TYPESAFE_API_KEY");
  if (direct) return direct;
  const file = await envFile($);
  try {
    return keyFromEnvFile(await $.fs.read(file));
  } catch {
    return "";
  }
}

async function modelFor($, tier) {
  const name = { fast: "JEV_KIT_CLAUDE_FAST_MODEL", balanced: "JEV_KIT_CLAUDE_BALANCED_MODEL", strong: "JEV_KIT_CLAUDE_STRONG_MODEL" }[tier];
  return await kitEnv($, name.slice("JEV_KIT_".length)) || MODELS[tier];
}

// Mirrors CONTINUATION_NOTE in src/jev.ts.
export const CONTINUATION_NOTE = " The user turn continues earlier work: judge the work that remains, using previous_request (what was asked) and previous_reply_end (where the last answer stopped).";

export function jevRequest(prompt, previous = {}) {
  const continued = Boolean(previous.previousRequest || previous.previousReply);
  return {
    model: "jev-latest",
    state: { user_turn: prompt.slice(0, MAX_PROMPT_CHARS),
      ...(previous.previousRequest ? { previous_request: previous.previousRequest } : {}),
      ...(previous.previousReply ? { previous_reply_end: previous.previousReply } : {}) },
    questions: {
      tier: {
        type: "choice",
        instructions: `Choose the least expensive Claude model tier that can reliably complete this user turn. Assess the requested work, not message length. If context is insufficient, choose balanced.${continued ? CONTINUATION_NOTE : ""}`,
        criteria: {
          fast: "Simple formatting, direct facts, small unambiguous edits, or routine replies with low risk.",
          balanced: "Typical coding, writing, analysis, and multi-step tasks requiring sound judgment.",
          strong: "Hard debugging, architecture, high-stakes reasoning, complex cross-file changes, or ambiguous trade-offs.",
        },
      },
      effort: {
        type: "score",
        instructions: "How much reasoning does this user turn require? Judge the work independently of the model tier.",
        criteria: [
          "Immediate answer or mechanical edit; little reasoning.",
          "A few simple steps or a small choice.",
          "Several steps, ordinary coding, or a meaningful judgment.",
          "Complex debugging, planning, or interacting constraints.",
          "Open-ended or high-stakes work requiring the deepest reasoning.",
        ],
      },
    },
  };
}

// Mirrors isContinuation in src/policy.ts.
const ACKNOWLEDGEMENTS = new Set(["응", "네", "예", "좋아", "좋아요", "오케이", "알겠어", "ok", "okay", "yes"]);
const CONTINUATIONS = [
  /^(?:(?:그대로|이어서|계속) )?(?:계속|진행)(?:해(?:\s?줘|주세요|요)?)?$/u,
  /^(?:(?:그대로|이어서) )?(?:해\s?줘|다시\s?해(?:\s?줘|주세요|요)?)$/u,
  /^(?:그|그거|그 문장|이전 답변|위 문장)(?:을|를)? (?:고쳐줘|수정해줘)$/u,
  /^(?:please )?(?:continue|go ahead|proceed|do it|try again)(?: please)?$/u,
];

export function isContinuation(prompt) {
  const words = prompt.toLowerCase().replace(/[.!?,。！？\s]+/gu, " ").trim().split(" ");
  while (words.length && ACKNOWLEDGEMENTS.has(words[0])) words.shift();
  return words.length === 0 || CONTINUATIONS.some((pattern) => pattern.test(words.join(" ")));
}

const TIER_ORDER = ["fast", "balanced", "strong"];

// Mirrors continuationRoute in src/policy.ts (without the Codex-only downgrade confidence).
export function continuationRoute(currentModel, contextTokens, choice, models = MODELS) {
  if (choice.confidence < CONFIDENCE_FLOOR) return null;
  const model = models[choice.tier];
  if (model === currentModel) return null;
  const current = TIER_ORDER.findIndex((tier) => models[tier] === currentModel);
  const direction = current < 0 || TIER_ORDER.indexOf(choice.tier) > current ? "upgrade" : "downgrade";
  if (direction === "downgrade" && contextTokens > FAST_PATH_MAX_CONTEXT_TOKENS) return null;
  return { model, tier: choice.tier, direction, ...(choice.effort ? { effort: choice.effort } : {}) };
}

const CAPTURE_MAX_BYTES = 16 * 1024 * 1024;

// Same key formula as requestKey in src/capture.ts (SHA-256 of [state, questions], hex, 24 chars),
// so a request classified by both Jev and a local Kev lines up under one key when exported.
async function requestKey(body) {
  const bytes = new TextEncoder().encode(JSON.stringify([body.state, body.questions]));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, 24);
}

// Opt-in (JEV_KIT_CAPTURE=1): appends the exact request/answer pair to .local/capture/<decision>-claude.jsonl,
// separate from the Codex-side file the same decision writes, so the two runtimes never race on one file.
async function captureWriter($, decision) {
  if ((await kitEnv($, "CAPTURE")) !== "1") return undefined;
  const file = (await envFile($)).replace(/[^/\\]*$/, `.local/capture/${decision}-claude.jsonl`);
  return async (body, reply) => {
    if (!reply?.answers || typeof reply.answers !== "object") return;
    try {
      const capture = { id: crypto.randomUUID(), at: new Date(await now($)).toISOString(), decision,
        key: await requestKey(body), classifier: body.model ?? "unknown",
        request: { state: body.state, questions: body.questions }, answers: reply.answers };
      let text = "";
      try { text = await $.fs.read(file); } catch { /* A missing capture file starts empty. */ }
      text += `${JSON.stringify(capture)}\n`;
      if (text.length > CAPTURE_MAX_BYTES) text = text.slice(text.indexOf("\n", text.length - CAPTURE_MAX_BYTES) + 1);
      await $.fs.write(file, text);
    } catch { /* Capture must never fail a route. */ }
  };
}

async function callJev($, request, onExchange) {
  const key = await apiKey($);
  if (!key) return { error: "TypeSafe key unavailable" };
  const endpoint = await kitEnv($, "TYPESAFE_ENDPOINT") || ENDPOINT;
  const started = await now($);
  try {
    const timeout = Symbol("timeout");
    const response = await Promise.race([
      $.http.fetch(endpoint, {
        method: "POST",
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
        body: JSON.stringify(request),
      }),
      $.clock.sleep(TIMEOUT_MS).then(() => timeout),
    ]);
    const latencyMs = (await now($)) - started;
    if (response === timeout) return { error: "Jev timeout", latencyMs };
    if (!response.ok) return { error: `Jev HTTP ${response.status}`, latencyMs };
    const body = JSON.parse(response.text);
    void onExchange?.(request, body);
    const tokens = body?.usage?.input_tokens;
    const measured = { latencyMs, ...(Number.isSafeInteger(tokens) && tokens >= 0 ? { jevInputTokens: tokens } : {}) };
    const choice = choiceFromJev(body);
    return choice ? { choice, ...measured } : { error: "Jev answer invalid", ...measured };
  } catch {
    return { error: "Jev request failed" };
  }
}

async function routeTurn($, text, contextTokens) {
  const prompt = text.trim();
  if (SENSITIVE_PATTERN.test(prompt)) return { reason: "sensitive prompt" };
  if (isSimpleTurn(prompt)) {
    if (contextTokens > FAST_PATH_MAX_CONTEXT_TOKENS) return { reason: "simple turn; kept warm cache" };
    return { tier: "fast", confidence: 1, effort: "low", model: await modelFor($, "fast"), reason: "simple turn" };
  }
  if (isContinuation(prompt)) return { reason: "continuation" };
  if (prompt.length < 12) return { reason: "short or empty prompt" };

  const { choice, error, ...measured } = await callJev($, jevRequest(prompt), await captureWriter($, "route"));
  if (error) return { reason: error, ...(error === "TypeSafe key unavailable" ? {} : { jevError: true }), ...measured };
  if (choice.confidence < CONFIDENCE_FLOOR) {
    return { tier: choice.tier, confidence: choice.confidence, effort: choice.effort,
      reason: "Jev tier confidence below 0.8", ...measured };
  }
  return { ...choice, model: await modelFor($, choice.tier), reason: "Jev choice", ...measured };
}

async function now($) {
  return typeof $.clock.now === "function" ? $.clock.now() : Date.now();
}

// Appends one JSONL event per call in the same shape `jev-decision-kit report` reads for Codex.
// Only models, reasons, counts and timings are written, never prompt or answer text.
function metricsWriter($) {
  let chain = Promise.resolve();
  return (event) => {
    chain = chain.then(async () => {
      if ((await kitEnv($, "CLAUDE_METRICS")) === "0") return;
      const file = (await envFile($)).replace(/[^/\\]*$/, ".local/claude.jsonl");
      let text = "";
      try { text = await $.fs.read(file); } catch { /* A missing log starts empty. */ }
      text += `${JSON.stringify(event)}\n`;
      if (text.length > METRICS_MAX_BYTES) text = text.slice(text.indexOf("\n", text.length - METRICS_MAX_BYTES) + 1);
      await $.fs.write(file, text);
    }).catch(() => { /* Metrics must never block a turn. */ });
    return chain;
  };
}

function decisionEvent(at, turnId, route) {
  const result = route.jevError ? "error" : route.model ? "routed" : "kept";
  return { at, client: "claude", mode: "auto", result, model: route.model ?? "claude-session",
    ...(route.effort ? { effort: route.effort, recommendedEffort: route.effort } : {}),
    ...(route.tier ? { recommendedTier: route.tier } : {}),
    ...(typeof route.confidence === "number" ? { confidence: route.confidence } : {}),
    ...(typeof route.latencyMs === "number" ? { latencyMs: route.latencyMs } : {}),
    ...(typeof route.jevInputTokens === "number" ? { jevInputTokens: route.jevInputTokens } : {}),
    requestId: `${turnId}:decision`, taskId: turnId, reason: route.reason };
}

const PREVIOUS_CHARS = 600;

// Runs beside the turn, which keeps its model: logs what the earlier exchange suggests.
async function shadowContinuation($, record, { turnId, prompt, previous, currentModel, contextTokens }) {
  const at = async () => new Date(await now($)).toISOString();
  const base = { client: "claude", kind: "continuation-shadow", requestId: `${turnId}:continuation`, taskId: turnId,
    currentModel: currentModel ?? "claude-session", contextTokens };
  const emit = async (event) => record?.({ at: await at(), ...base, ...event });
  if ((await kitEnv($, "CLAUDE_CONTINUATION_SHADOW")) === "0") return;
  if (!previous.previousRequest && !previous.previousReply) return emit({ reason: "no-previous-exchange" });
  if ([previous.previousRequest, previous.previousReply].some((text) => text && SENSITIVE_PATTERN.test(text))) {
    return emit({ reason: "sensitive-previous-exchange" });
  }
  const { choice, error, ...measured } = await callJev($, jevRequest(prompt, previous), await captureWriter($, "route"));
  if (error) return emit({ ...measured, reason: error === "TypeSafe key unavailable" ? "key-unavailable" : "jev-unavailable" });
  const models = { fast: await modelFor($, "fast"), balanced: await modelFor($, "balanced"), strong: await modelFor($, "strong") };
  const route = currentModel ? continuationRoute(currentModel, contextTokens, choice, models) : null;
  return emit({ recommendedTier: choice.tier, confidence: choice.confidence,
    ...(choice.effort ? { recommendedEffort: choice.effort } : {}),
    ...(route ? { shadowModel: route.model, direction: route.direction, ...(route.effort ? { shadowEffort: route.effort } : {}) } : {}),
    ...measured, reason: route ? "would-switch" : "would-keep" });
}

function statusOf(enabled, last) {
  if (!enabled) return "Jev Decision Kit: off (set JEV_KIT_CLAUDE_AUTO=1 and restart Claude Code).";
  if (!last) return "Jev Decision Kit: on; no user turn classified yet.";
  const picked = last.model ? `${last.tier} → ${last.model} (${last.confidence})` : last.reason;
  const recommended = last.effort ? `; Jev recommended effort ${last.effort}` : "";
  const requested = last.requestedEffort ? `; requested effort ${last.requestedEffort}` : "";
  const mismatch = last.model && last.servedModel && !sameModel(last.servedModel, last.model) ? ` ≠ ${last.model}` : "";
  const served = last.servedModel ? `; API served ${last.servedModel}${mismatch}` : "";
  return `Jev Decision Kit: ${picked}${recommended}${requested}${served}.`;
}

const SAFE_MODEL = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;

// What the prompt footer and the turn's closing notice show: the model and effort the
// plugin actually requested, and the served model only when it differs.
function routeLabel(route, { served = false } = {}) {
  const model = typeof route.requestedModel === "string" && SAFE_MODEL.test(route.requestedModel) ? route.requestedModel : "확인 불가";
  const requested = route.requestedEffort;
  const effort = typeof requested === "number" && Number.isFinite(requested) ? String(requested)
    : typeof requested === "string" && /^[a-z]+$/.test(requested) ? requested : "기본값";
  const mismatch = served && typeof route.servedModel === "string" && SAFE_MODEL.test(route.servedModel) &&
    model !== "확인 불가" && !sameModel(route.servedModel, model) ? ` ≠ ${route.servedModel}` : "";
  return `Jev Auto · ${model} · effort ${effort}${mismatch}`;
}

export function register(on) {
  const routes = new Map();
  let enabled = false;
  let footerEnabled = true;
  let last = null;
  let contextTokens = 0;
  let record = null;
  const previous = {};

  // Drawn only: the prompt footer's mode label never enters the transcript, so the
  // model cannot imitate it on a later turn. (Terminal and desktop surfaces.)
  on("ui.render", { component: "SessionMode" }, ($, e, next) => {
    if (!enabled || !footerEnabled) return next(e);
    const label = last?.requestedModel ? routeLabel(last, { served: true }) : "Jev Auto";
    return next({ ...e, props: { ...e.props, modes: [...e.props.modes, label] } });
  });

  on("session.start", async ($, e, next) => {
    enabled = (await kitEnv($, "CLAUDE_AUTO")) === "1";
    footerEnabled = (await kitEnv($, "RESPONSE_FOOTER")) !== "0";
    record = metricsWriter($);
    await $.command.register({ name: "jev-decision-kit-route", description: "Show the last Jev route and API model" });
    return next(e);
  });

  on("command.run", { command: "jev-decision-kit-route" }, () => ({ text: statusOf(enabled, last) }));

  on("turn.start", async ($, e, next) => {
    if (enabled) {
      let route;
      try {
        route = await routeTurn($, e.text, contextTokens);
      } catch {
        route = { reason: "router error" };
      }
      const prompt = e.text.trim();
      if (route.reason === "continuation") {
        void shadowContinuation($, record, { turnId: e.turnId, prompt, previous: { ...previous },
          currentModel: last?.requestedModel, contextTokens }).catch(() => {});
      } else if (prompt) {
        previous.previousRequest = prompt.slice(0, PREVIOUS_CHARS);
        delete previous.previousReply;
      }
      route.startedAt = await now($);
      route.steps = 0;
      routes.set(e.turnId, route);
      void record?.(decisionEvent(new Date(route.startedAt).toISOString(), e.turnId, route));
      last = route;
      while (routes.size > MAX_CACHED_TURNS) routes.delete(routes.keys().next().value);
    }
    return next(e);
  });

  on("turn.step", async function* ($, e, next) {
    const route = e.agentId === undefined ? routes.get(e.turnId) : undefined;
    const request = route?.model || route?.effort
      ? { ...e, ...(route.model ? { model: route.model } : {}), ...(route.effort ? { effort: route.effort } : {}) } : e;
    if (route) {
      route.requestedModel = request.model;
      route.requestedEffort = request.effort;
      $.ui.invalidate("ui.render");
    }
    const stepStarted = route ? await now($) : 0;
    for await (const chunk of next(request)) {
      if (chunk.kind === "stop" && chunk.usage && e.agentId === undefined) {
        const usage = chunk.usage;
        const cached = usage.cache_read_input_tokens ?? 0;
        const input = (usage.input_tokens ?? 0) + cached + (usage.cache_creation_input_tokens ?? 0);
        contextTokens = input + (usage.output_tokens ?? 0);
        if (route && typeof usage.model === "string") {
          route.servedModel = usage.model;
          $.ui.invalidate("ui.render");
          const at = await now($);
          void record?.({ at: new Date(at).toISOString(), client: "claude", kind: "response",
            requestId: `${e.turnId}:${route.steps++}`, taskId: e.turnId, requestDurationMs: at - stepStarted,
            requestedModel: request.model, ...(typeof request.effort === "string" ? { requestedEffort: request.effort } : {}),
            servedModel: usage.model, inputTokens: input, cachedInputTokens: cached, outputTokens: usage.output_tokens ?? 0 });
        }
      }
      yield chunk;
    }
  });

  on("turn.complete", async ($, e, next) => {
    const result = await next(e);
    if (e.agentId !== undefined) return result;
    if (e.reason === "answer" && typeof e.answer === "string" && e.answer.trim()) {
      previous.previousReply = e.answer.trim().slice(-PREVIOUS_CHARS);
    }
    const route = routes.get(e.turnId);
    routes.delete(e.turnId);
    if (!enabled || !footerEnabled || !route || e.reason !== "answer" || !e.answer) return result;
    if (typeof e.usage?.model === "string") route.servedModel = e.usage.model;
    // turn.complete displays a synopsis beneath the answer without rewriting its transcript:
    // the one channel every surface shows (a stream-json host gets it as a system notice).
    const footer = routeLabel(route, { served: true });
    return { ...result, text: result.text && result.text !== e.answer ? `${result.text}\n\n${footer}` : footer };
  });
}
