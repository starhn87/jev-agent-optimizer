import { TypeSafeClient, APIError, APIConnectionError, APITimeoutError, APIUserAbortError } from "@typesafe-ai/sdk";
import { record, validQuestions, validateAnswers } from "./validation.js";
import type { DecisionClient, DecisionMeta, ErrorKind } from "./types.js";
export type * from "./types.js";
export { validateAnswers } from "./validation.js";

export function createDecisionClient(config: {
  apiKey: string;
  model: string;
  baseURL?: string;
  fetch?: typeof fetch;
  maxRequestBytes?: number;
}): DecisionClient {
  return {
    async decide(request, options = {}) {
      const start = performance.now();
      const meta: DecisionMeta = {
        definitionId: request.definitionId, definitionVersion: request.definitionVersion,
        requestedModel: config.model, model: null, requestId: null,
        durationMs: 0, inputTokens: null, outputTokens: null,
      };
      const fail = (kind: ErrorKind, status?: number) => ({
        ok: false as const, error: { kind, ...(status === undefined ? {} : { status }) },
        meta: { ...meta, durationMs: performance.now() - start },
      });
      if (options.signal?.aborted) return fail("aborted");
      if (!config.apiKey.trim()) return fail("missing_key");
      const timeout = options.timeoutMs ?? 1200;
      if (!request.definitionId || !request.definitionVersion || !config.model || !Number.isFinite(timeout) || timeout <= 0 || !validQuestions(request.questions)) return fail("invalid_request");
      const wire = { model: config.model, state: request.state, questions: request.questions };
      try {
        if (new TextEncoder().encode(JSON.stringify(wire)).byteLength > (config.maxRequestBytes ?? 256_000)) return fail("invalid_request");
      } catch { return fail("invalid_request"); }
      const deadline = new AbortController();
      const cancel = () => deadline.abort();
      options.signal?.addEventListener("abort", cancel, { once: true });
      let timedOut = false;
      const timer = setTimeout(() => { timedOut = true; deadline.abort(); }, timeout);
      try {
        const sdk = new TypeSafeClient({ apiKey: config.apiKey,
          baseURL: config.baseURL ?? "https://api.typesafe.ai", defaultModel: config.model,
          logLevel: "off", retry: { maxRetries: 0 }, fetch: config.fetch ?? globalThis.fetch,
        });
        const { data, requestId } = await sdk.systemOne(wire, { signal: deadline.signal, timeout }).withResponse();
        meta.requestId = requestId ?? null;
        const raw: unknown = data;
        if (!record(raw)) return fail("invalid_response");
        meta.model = typeof raw.model === "string" ? raw.model : null;
        if (record(raw.usage)) {
          for (const [key, field] of [["inputTokens", "input_tokens"], ["outputTokens", "output_tokens"]] as const) {
            const value = raw.usage[field];
            meta[key] = typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
          }
        }
        const answers = validateAnswers(request.questions, raw.answers);
        if (!answers) return fail("invalid_response");
        return { ok: true, answers, meta: { ...meta, durationMs: performance.now() - start } };
      } catch (error) {
        if (options.signal?.aborted) return fail("aborted");
        if (timedOut || error instanceof APITimeoutError) return fail("timeout");
        if (error instanceof APIUserAbortError) return fail("aborted");
        if (error instanceof APIError) { meta.requestId = error.requestId ?? null; return fail("http", error.status); }
        if (error instanceof APIConnectionError) return fail("network");
        return fail("invalid_response");
      } finally {
        clearTimeout(timer);
        options.signal?.removeEventListener("abort", cancel);
      }
    },
  };
}
