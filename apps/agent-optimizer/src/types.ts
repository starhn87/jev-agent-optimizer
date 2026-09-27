export type Tier = "fast" | "balanced" | "strong";
export type Mode = "pass" | "force" | "shadow" | "auto";
export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export type RouteChoice = {
  tier: Tier;
  confidence: number;
  effortScore?: number;
  effortConfidence?: number;
  inputTokens?: number;
  jevModel?: string;
};

export type RouteQuery = {
  prompt: string;
  currentModel: string;
  contextTokens: number;
  // Earlier exchange, sent only when judging a continuation.
  previousRequest?: string;
  previousReply?: string;
};

export type RouteResult = {
  model: string;
  effort?: Effort;
  tier?: Tier;
  confidence?: number;
  reason: string;
};

export type RouterSettings = {
  mode: Mode;
  // Client model ID used as the Auto selector; not the default execution model.
  baselineModel: string;
  forceModel?: string;
  models: Record<Tier, string>;
  minimumConfidence: number;
  autoEffort: boolean;
  minimumDowngradeConfidence?: number;
  // Per-tier confidence to evaluate in the log only; the applied route is unchanged.
  shadowConfidence?: Partial<Record<Tier, number>>;
  // Judge continuations with the earlier exchange and log the route; the model is kept.
  continuationShadow?: boolean;
};

export type DecisionEvent = {
  at: string;
  client: "codex" | "claude";
  mode: Mode;
  result: "routed" | "kept" | "manual" | "shadow" | "error";
  model: string;
  effort?: string;
  recommendedEffort?: Effort;
  recommendedTier?: Tier;
  confidence?: number;
  latencyMs?: number;
  jevInputTokens?: number;
  requestId?: string;
  taskId?: string;
  reason: string;
  // What the route would have been under settings.shadowConfidence, when it differs.
  shadowModel?: string;
  shadowEffort?: string;
};

export type ResponseObservationEvent = {
  at: string;
  client: "codex" | "claude";
  kind: "response";
  requestId: string;
  taskId?: string;
  requestDurationMs?: number;
  requestedModel: string;
  requestedEffort?: string;
  servedModel: string;
  inputTokens?: number;
  cachedInputTokens?: number;
  outputTokens?: number;
};

// A continuation judged with the earlier exchange, logged only: the applied route kept the model.
export type ContinuationShadowEvent = {
  at: string;
  client: "codex" | "claude";
  kind: "continuation-shadow";
  requestId?: string;
  taskId?: string;
  currentModel: string;
  contextTokens: number;
  recommendedTier?: Tier;
  confidence?: number;
  recommendedEffort?: Effort;
  shadowModel?: string;
  shadowEffort?: string;
  direction?: "upgrade" | "downgrade";
  latencyMs?: number;
  jevInputTokens?: number;
  reason: string;
};

// The same new turn classified by a second System One server (e.g. a local Kev) beside Jev.
export type ClassifierShadowEvent = {
  at: string;
  client: "codex" | "claude";
  kind: "classifier-shadow";
  requestId?: string;
  taskId?: string;
  classifier: string;
  primaryTier?: Tier;
  primaryConfidence?: number;
  primaryEffort?: Effort;
  primaryModel?: string;
  shadowTier?: Tier;
  shadowConfidence?: number;
  shadowEffort?: Effort;
  shadowModel?: string;
  latencyMs?: number;
  reason: "compared" | "shadow-unavailable" | "primary-unavailable";
};

export type MetricsEvent = DecisionEvent | ResponseObservationEvent | ContinuationShadowEvent | ClassifierShadowEvent;
