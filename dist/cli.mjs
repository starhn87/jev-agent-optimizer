#!/usr/bin/env node

// packages/cli/src/cli.mjs
import { readFileSync as readFileSync3 } from "node:fs";

// packages/decisions/dist/index.js
var requestIdFrom = (headers) => headers.get("x-typesafe-request-id") ?? void 0;
var APIPromise = class APIPromise2 extends Promise {
  #responsePromise;
  #parseResponse;
  #parsed;
  constructor(responsePromise, parseResponse) {
    super((resolve2) => resolve2(void 0));
    this.#responsePromise = responsePromise;
    this.#parseResponse = parseResponse;
  }
  /**
  * Resolves to the raw `Response` without parsing the body. SDK requests buffer the full
  * body under the request timeout before handoff; reading it afterwards is caller-owned.
  * The caller owns the body; don't also `await` the parsed result on the same promise.
  */
  asResponse() {
    return this.#responsePromise;
  }
  /** Return the parsed result, HTTP response, and request ID. */
  async withResponse() {
    const [data, response] = await Promise.all([this.#parse(), this.#responsePromise]);
    return {
      data,
      response,
      requestId: requestIdFrom(response.headers)
    };
  }
  /** Transform the parsed result, sharing the HTTP response and a single body parse. */
  map(fn) {
    return new APIPromise2(this.#responsePromise, () => this.#parse().then(fn));
  }
  #parse() {
    this.#parsed ??= this.#responsePromise.then(this.#parseResponse);
    return this.#parsed;
  }
  then(onfulfilled, onrejected) {
    return this.#parse().then(onfulfilled, onrejected);
  }
  catch(onrejected) {
    return this.#parse().catch(onrejected);
  }
  finally(onfinally) {
    return this.#parse().finally(onfinally);
  }
};
var ENV = {
  /** Required API key; used when `apiKey` is omitted. */
  apiKey: "TYPESAFE_API_KEY",
  /** API root; defaults to `https://api.typesafe.ai`. */
  baseURL: "TYPESAFE_BASE_URL",
  /** Default model name; defaults to `jev-latest`. */
  defaultModel: "TYPESAFE_DEFAULT_MODEL",
  /** Log level; defaults to `warn`. */
  logLevel: "TYPESAFE_LOG_LEVEL"
};
var readEnv = (name) => {
  if (typeof process === "undefined" || !process.env) return void 0;
  return process.env[name]?.trim() || void 0;
};
var fromCodeOrEnv = (fromCode, envVar) => fromCode ?? readEnv(envVar);
var range = (from, to) => Array.from({ length: to - from }, (_, i) => from + i);
var DEFAULT_RETRY_POLICY = {
  maxRetries: 2,
  backoffInitialMs: 500,
  backoffMaxMs: 5e3,
  backoffJitter: 0.25,
  /** HTTP 408, 429, and 5xx responses. */
  httpStatuses: /* @__PURE__ */ new Set([
    408,
    429,
    ...range(500, 600)
  ]),
  respectRetryAfter: true,
  /** Maximum server retry delay before falling back to backoff. */
  maxRetryAfterMs: 6e4,
  apiConnectionError: true,
  apiTimeoutError: true
};
DEFAULT_RETRY_POLICY.maxRetries;
var isRetryableStatus = (status, policy = DEFAULT_RETRY_POLICY) => policy.httpStatuses.has(status);
var parseRetryAfter = (headers, now = Date.now()) => {
  const ms = Number(headers.get("retry-after-ms"));
  if (headers.has("retry-after-ms") && Number.isFinite(ms) && ms >= 0) return ms;
  const raw = headers.get("retry-after");
  if (raw === null) return void 0;
  const seconds = Number(raw);
  if (Number.isFinite(seconds)) return seconds >= 0 ? seconds * 1e3 : void 0;
  const date = Date.parse(raw);
  if (!Number.isNaN(date)) return Math.max(0, date - now);
};
var retryDelayMs = (attempt, headers, policy = DEFAULT_RETRY_POLICY, random = Math.random) => {
  if (policy.respectRetryAfter && headers !== void 0) {
    const retryAfter = parseRetryAfter(headers);
    if (retryAfter !== void 0 && retryAfter <= policy.maxRetryAfterMs) return retryAfter;
  }
  const exponential = Math.min(policy.backoffInitialMs * 2 ** attempt, policy.backoffMaxMs);
  return Math.round(exponential * (1 - random() * policy.backoffJitter));
};
var sleep = (ms, signal) => new Promise((resolve2, reject) => {
  if (signal?.aborted) return reject(signal.reason);
  const onAbort = () => {
    clearTimeout(timer);
    reject(signal?.reason);
  };
  const timer = setTimeout(() => {
    signal?.removeEventListener("abort", onAbort);
    resolve2();
  }, ms);
  signal?.addEventListener("abort", onAbort, { once: true });
});
var TypeSafeError = class extends Error {
  constructor(message, options2) {
    super(message, options2);
    this.name = new.target.name;
  }
};
var isRecord = (value) => typeof value === "object" && value !== null;
var extractMessage = (body) => {
  if (typeof body === "string") return body || void 0;
  if (!isRecord(body)) return void 0;
  const { error, message, detail } = body;
  if (typeof error === "string") return error;
  if (isRecord(error) && typeof error.message === "string") return error.message;
  if (typeof message === "string") return message;
  if (typeof detail === "string") return detail;
  if (isRecord(detail) && typeof detail.message === "string") return detail.message;
  if (Array.isArray(detail)) return describeValidationErrors(detail);
};
var describeValidationErrors = (errors) => {
  const parts = errors.flatMap((e) => {
    if (!isRecord(e) || typeof e.msg !== "string") return [];
    const loc = Array.isArray(e.loc) ? e.loc.filter((x) => x !== "body").join(".") : "";
    return [loc ? `${loc}: ${e.msg}` : e.msg];
  });
  return parts.length > 0 ? parts.join("; ") : void 0;
};
var MAX_RAW_BODY_IN_MESSAGE = 200;
var APIError = class APIError2 extends TypeSafeError {
  /** HTTP response status code. */
  status;
  /** HTTP response headers. */
  headers;
  /** Parsed JSON, response text, or `undefined` for an empty body. */
  body;
  /** Request ID from `x-typesafe-request-id`, or `undefined` when absent. */
  requestId;
  constructor(status, body, headers, message) {
    super(message ?? APIError2.describe(status, body));
    this.status = status;
    this.body = body;
    this.headers = headers;
    this.requestId = requestIdFrom(headers);
  }
  static describe(status, body) {
    const detail = extractMessage(body);
    if (detail) return `${status} ${detail}`;
    if (body === void 0) return `${status} status code (no body)`;
    const raw = typeof body === "string" ? body : JSON.stringify(body);
    return `${status} ${raw.length > MAX_RAW_BODY_IN_MESSAGE ? `${raw.slice(0, MAX_RAW_BODY_IN_MESSAGE)}\u2026` : raw}`;
  }
  /** Create the error subclass for an HTTP status code. */
  static fromResponse(status, body, headers) {
    if (status === 400) return new BadRequestError(status, body, headers);
    if (status === 401) return new AuthenticationError(status, body, headers);
    if (status === 403) return new PermissionDeniedError(status, body, headers);
    if (status === 404) return new NotFoundError(status, body, headers);
    if (status === 422) return new UnprocessableEntityError(status, body, headers);
    if (status === 429) return new RateLimitError(status, body, headers);
    if (status >= 500) return new InternalServerError(status, body, headers);
    return new APIError2(status, body, headers);
  }
};
var BadRequestError = class extends APIError {
};
var AuthenticationError = class extends APIError {
};
var PermissionDeniedError = class extends APIError {
};
var NotFoundError = class extends APIError {
};
var UnprocessableEntityError = class extends APIError {
};
var RateLimitError = class extends APIError {
  /** Server retry delay in milliseconds, or `undefined` when absent or invalid. */
  retryAfterMs = parseRetryAfter(this.headers);
};
var InternalServerError = class extends APIError {
};
var APIConnectionError = class extends TypeSafeError {
  constructor(message = "Connection error.", options2) {
    super(message, options2);
  }
};
var APITimeoutError = class extends APIConnectionError {
  /** Configured timeout in milliseconds. */
  timeoutMs;
  constructor(timeoutMs, options2) {
    super(`Request timed out after ${timeoutMs}ms.`, options2);
    this.timeoutMs = timeoutMs;
  }
};
var APIUserAbortError = class extends TypeSafeError {
  constructor(message = "Request was aborted.", options2) {
    super(message, options2);
  }
};
var LOG_LEVELS = [
  "debug",
  "info",
  "warn",
  "error",
  "off"
];
var DEFAULT_LOG_LEVEL = "warn";
var isLogLevel = (value) => LOG_LEVELS.includes(value);
var parseLogLevel = (value, source) => {
  if (isLogLevel(value)) return value;
  throw new TypeSafeError(`Invalid log level "${value}" from ${source}. Expected one of: ${LOG_LEVELS.join(", ")}.`);
};
var PREFIX = "[typesafe-sdk]";
var consoleLogger = {
  debug: (message, ...args) => console.debug(`${PREFIX} ${message}`, ...args),
  info: (message, ...args) => console.info(`${PREFIX} ${message}`, ...args),
  warn: (message, ...args) => console.warn(`${PREFIX} ${message}`, ...args),
  error: (message, ...args) => console.error(`${PREFIX} ${message}`, ...args)
};
var RANK = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  off: 4
};
var drop = () => {
};
var withLevel = (sink, level) => {
  const enabled = (at) => RANK[at] >= RANK[level];
  return {
    debug: enabled("debug") ? (message, ...args) => sink.debug(message, ...args) : drop,
    info: enabled("info") ? (message, ...args) => sink.info(message, ...args) : drop,
    warn: enabled("warn") ? (message, ...args) => sink.warn(message, ...args) : drop,
    error: enabled("error") ? (message, ...args) => sink.error(message, ...args) : drop
  };
};
var KEY_HEADERS = /* @__PURE__ */ new Set([
  "authorization",
  "proxy-authorization",
  "x-api-key"
]);
var OPAQUE_HEADERS = /* @__PURE__ */ new Set(["cookie", "set-cookie"]);
var redactKey = (value) => {
  const [scheme, secret] = value.includes(" ") ? value.split(/\s+/, 2) : [void 0, value];
  const tail = secret && secret.length > 8 ? secret.slice(-4) : "";
  return `${scheme ? `${scheme} ` : ""}***${tail}`;
};
var redact = (name, value) => {
  const lower = name.toLowerCase();
  if (KEY_HEADERS.has(lower)) return redactKey(value);
  if (OPAQUE_HEADERS.has(lower)) return "***";
  return value;
};
var redactHeaders = (headers) => Object.fromEntries(Object.entries(headers).map(([name, value]) => [name, redact(name, value)]));
var validateQuestions = (questions) => {
  if (Object.keys(questions).length === 0) throw new TypeSafeError("At least one question is required.");
  for (const [name, question] of Object.entries(questions)) {
    if (question.type !== "score") continue;
    if (!Array.isArray(question.criteria)) throw new TypeSafeError(`Score question "${name}" has criteria that are not a list; score criteria must be a list of descriptions indexed by score from zero.`);
    if (question.criteria.length < 2) throw new TypeSafeError(`Score question "${name}" has ${question.criteria.length} criteria; at least two scores are required.`);
  }
};
var Models = class {
  #transport;
  constructor(transport) {
    this.#transport = transport;
  }
  /** List the models available to the account. */
  list(options2 = {}) {
    return this.#transport.request("GET", "/v1/models", options2).map(unwrapModels);
  }
};
var unwrapModels = (wire) => {
  if (Array.isArray(wire?.models)) return wire.models;
  throw new TypeSafeError("Unexpected response shape from GET /v1/models; expected { models: [...] }.");
};
var g = globalThis;
var isBrowser = () => typeof g.window !== "undefined" && typeof g.window.document !== "undefined" && typeof g.navigator !== "undefined";
var describeRuntime = () => {
  const platform = g.process?.platform && g.process?.arch ? ` (${g.process.platform}; ${g.process.arch})` : "";
  if (g.Bun?.version) return `bun/${g.Bun.version}${platform}`;
  if (g.Deno?.version?.deno) return `deno/${g.Deno.version.deno}${platform}`;
  if (g.EdgeRuntime !== void 0) return "vercel-edge";
  if (g.navigator?.userAgent === "Cloudflare-Workers") return "cloudflare-workers";
  if (g.process?.versions?.node) return `node/${g.process.versions.node}${platform}`;
  if (isBrowser()) return "browser";
  return "unknown";
};
var VERSION = "0.6.0";
var missingApiKey = () => {
  throw new TypeSafeError(`No API key was provided. Pass \`apiKey\` to the TypeSafeClient constructor or set the ${ENV.apiKey} environment variable.`);
};
var missingFetch = () => {
  throw new TypeSafeError("No global `fetch` is available in this runtime. Pass a `fetch` implementation to the TypeSafeClient constructor.");
};
var refuseBrowser = () => {
  throw new TypeSafeError("TypeSafeClient is running in a browser, which would expose your API key to anyone using the page. Call the API from a server instead, or pass `dangerouslyAllowBrowser: true` if you understand the risk.");
};
var defaultFetch = (input, init) => globalThis.fetch(input, init);
var assertNonNegativeInteger = (name, value) => {
  if (!Number.isInteger(value) || value < 0) throw new TypeSafeError(`\`${name}\` must be a non-negative integer, got ${String(value)}.`);
  return value;
};
var assertPositiveMs = (name, value) => {
  if (!Number.isFinite(value) || value <= 0) throw new TypeSafeError(`\`${name}\` must be a positive number of milliseconds, got ${String(value)}.`);
  return value;
};
var assertNonNegativeMs = (name, value) => {
  if (!Number.isFinite(value) || value < 0) throw new TypeSafeError(`\`${name}\` must be a non-negative number of milliseconds, got ${String(value)}.`);
  return value;
};
var assertFraction = (name, value) => {
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new TypeSafeError(`\`${name}\` must be between 0 and 1, got ${String(value)}.`);
  return value;
};
var assertStatusSet = (name, statuses) => {
  for (const status of statuses) if (!Number.isInteger(status) || status < 100 || status > 999) throw new TypeSafeError(`\`${name}\` must contain HTTP status codes, got ${String(status)}.`);
  return statuses;
};
var resolveRetryPolicy = (base, overrides) => {
  const o = overrides ?? {};
  return {
    maxRetries: o.maxRetries === void 0 ? base.maxRetries : assertNonNegativeInteger("retry.maxRetries", o.maxRetries),
    backoffInitialMs: o.backoffInitialMs === void 0 ? base.backoffInitialMs : assertNonNegativeMs("retry.backoffInitialMs", o.backoffInitialMs),
    backoffMaxMs: o.backoffMaxMs === void 0 ? base.backoffMaxMs : assertNonNegativeMs("retry.backoffMaxMs", o.backoffMaxMs),
    backoffJitter: o.backoffJitter === void 0 ? base.backoffJitter : assertFraction("retry.backoffJitter", o.backoffJitter),
    httpStatuses: new Set(o.httpStatuses === void 0 ? base.httpStatuses : assertStatusSet("retry.httpStatuses", o.httpStatuses)),
    respectRetryAfter: o.respectRetryAfter ?? base.respectRetryAfter,
    maxRetryAfterMs: o.maxRetryAfterMs === void 0 ? base.maxRetryAfterMs : assertNonNegativeMs("retry.maxRetryAfterMs", o.maxRetryAfterMs),
    apiConnectionError: o.apiConnectionError ?? base.apiConnectionError,
    apiTimeoutError: o.apiTimeoutError ?? base.apiTimeoutError
  };
};
var isRetryableError = (err, policy) => {
  if (err instanceof APITimeoutError) return policy.apiTimeoutError;
  if (err instanceof APIConnectionError) return policy.apiConnectionError;
  return false;
};
var resolveLogLevel = (fromCode) => {
  if (fromCode !== void 0) return parseLogLevel(fromCode, "the `logLevel` option");
  const fromEnv = readEnv(ENV.logLevel);
  if (fromEnv !== void 0) return parseLogLevel(fromEnv, ENV.logLevel);
  return DEFAULT_LOG_LEVEL;
};
var stripTrailingSlashes = (url) => url.replace(/\/+$/, "");
var mergeHeaders = (...sources) => {
  const entries = /* @__PURE__ */ new Map();
  for (const source of sources) for (const [name, value] of Object.entries(source)) if (value === void 0) entries.delete(name.toLowerCase());
  else entries.set(name.toLowerCase(), [name, value]);
  return Object.fromEntries(entries.values());
};
var bufferResponse = async (response, signal) => {
  const reader = response.clone().body?.getReader();
  if (!reader) return;
  const cancel = () => {
    reader.cancel(signal.reason).catch(() => {
    });
    response.body?.cancel(signal.reason).catch(() => {
    });
  };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    if (signal.aborted) cancel();
    signal.throwIfAborted();
    while (!(await reader.read()).done) signal.throwIfAborted();
    signal.throwIfAborted();
  } finally {
    signal.removeEventListener("abort", cancel);
    reader.releaseLock();
  }
};
var RUNTIME = describeRuntime();
var TypeSafeClient = class {
  /** API key excluded from serialization and public properties. */
  #apiKey;
  /** API root with trailing slashes removed. */
  baseURL;
  /** Model used when a request omits `model`. */
  defaultModel;
  /** Configured log verbosity. */
  logLevel;
  /** The configured logger, filtered to `logLevel`. */
  logger;
  /** Retry settings with constructor overrides applied. */
  retry;
  /** Timeout per attempt in milliseconds. */
  timeout;
  /** Additional headers sent with each request. */
  defaultHeaders;
  /** HTTP fetch implementation. */
  fetch;
  /** The models available to the account. */
  models;
  #requestCount = 0;
  /**
  * Create a client for the TypeSafe AI API.
  *
  * Explicit options take precedence over environment variables, then SDK defaults.
  * Empty or whitespace-only environment values are ignored.
  *
  * @throws {TypeSafeError} The API key is missing, configuration is invalid, or the runtime is unsupported.
  */
  constructor(config = {}) {
    if (isBrowser() && !config.dangerouslyAllowBrowser) refuseBrowser();
    this.#apiKey = fromCodeOrEnv(config.apiKey, ENV.apiKey) ?? missingApiKey();
    this.baseURL = stripTrailingSlashes(fromCodeOrEnv(config.baseURL, ENV.baseURL) ?? "https://api.typesafe.ai");
    this.defaultModel = fromCodeOrEnv(config.defaultModel, ENV.defaultModel) ?? "jev-latest";
    this.logLevel = resolveLogLevel(config.logLevel);
    this.logger = withLevel(config.logger ?? consoleLogger, this.logLevel);
    this.retry = resolveRetryPolicy(DEFAULT_RETRY_POLICY, config.retry);
    this.timeout = assertPositiveMs("timeout", config.timeout ?? 1e4);
    this.defaultHeaders = { ...config.defaultHeaders };
    if (config.fetch === void 0 && typeof globalThis.fetch !== "function") missingFetch();
    this.fetch = config.fetch ?? defaultFetch;
    const transport = {
      request: (method, path, options2) => this.#request(method, path, options2),
      defaultModel: this.defaultModel
    };
    this.models = new Models(transport);
  }
  /**
  * Answer named questions about text or structured state.
  *
  * @param request - State, questions, and an optional model override.
  * @param options - Per-call timeout, retry, headers, and cancellation settings.
  * @returns Answers typed by question name and criteria, with model and token usage.
  * @throws {TypeSafeError} Questions are empty, or score criteria are not a list of at least two entries.
  * @throws {APIError} The server returns a non-2xx response after retries.
  * @throws {APIConnectionError} The request cannot connect or times out after retries.
  * @throws {APIUserAbortError} The caller aborts the request.
  *
  * @example
  * ```ts
  * const { answers } = await client.systemOne({
  *   state: "I was charged twice. Please help.",
  *   questions: { billing: noul("Is this about billing?") },
  * });
  * console.log(answers.billing.noul);
  * ```
  */
  systemOne(request2, options2 = {}) {
    validateQuestions(request2.questions);
    const body = {
      ...request2,
      model: request2.model ?? this.defaultModel
    };
    return this.#request("POST", "/v1/systemone", {
      ...options2,
      body
    });
  }
  /** Send a request and parse its response body. */
  #request(method, path, options2 = {}) {
    const resolved = {
      method,
      path,
      body: options2.body,
      headers: mergeHeaders(this.defaultHeaders, options2.headers ?? {}),
      signal: options2.signal,
      timeout: options2.timeout === void 0 ? this.timeout : assertPositiveMs("timeout", options2.timeout),
      retry: resolveRetryPolicy(this.retry, options2.retry)
    };
    const tag = `#${++this.#requestCount} ${method} ${path}`;
    return new APIPromise(this.fetchWithRetries(tag, resolved), async (res) => {
      const parsed = await parseBody(res);
      this.logger.debug(`${tag} <- body`, parsed);
      return parsed;
    });
  }
  /** Retry eligible failures, logging attempt summaries at `info` and headers and bodies at `debug`. */
  async fetchWithRetries(tag, req) {
    const url = `${this.baseURL}${req.path}`;
    const headers = mergeHeaders(req.headers, {
      Authorization: `Bearer ${this.#apiKey}`,
      Accept: "application/json",
      "User-Agent": `typesafe-sdk/${VERSION}`,
      "X-TypeSafe-SDK": `typesafe-sdk/${VERSION}`,
      "X-TypeSafe-Runtime": RUNTIME,
      "Content-Type": req.body === void 0 ? void 0 : "application/json",
      "X-TypeSafe-Retry-Count": void 0
    });
    const body = req.body === void 0 ? void 0 : JSON.stringify(req.body);
    for (let attempt = 0; ; attempt++) {
      const retriesLeft = req.retry.maxRetries - attempt;
      const attemptHeaders = attempt === 0 ? headers : {
        ...headers,
        "X-TypeSafe-Retry-Count": String(attempt)
      };
      this.logger.debug(`${tag} -> ${url}`, {
        headers: redactHeaders(attemptHeaders),
        body: req.body
      });
      const started = Date.now();
      let res;
      try {
        res = await this.attempt(tag, url, {
          method: req.method,
          headers: attemptHeaders,
          body
        }, req);
      } catch (err) {
        if (err instanceof APIUserAbortError || retriesLeft <= 0) throw err;
        if (!isRetryableError(err, req.retry)) throw err;
        await this.backOff(tag, attempt, retriesLeft, err.message, void 0, req);
        continue;
      }
      const requestId = requestIdFrom(res.headers);
      this.logger.info(`${tag} <- ${res.status} in ${Date.now() - started}ms${requestId ? ` (request ${requestId})` : ""}`);
      if (res.ok) return res;
      const errorBody = await parseBody(res);
      this.logger.debug(`${tag} <- error body`, errorBody);
      const error = APIError.fromResponse(res.status, errorBody, res.headers);
      if (retriesLeft <= 0 || !isRetryableStatus(res.status, req.retry)) throw error;
      await this.backOff(tag, attempt, retriesLeft, `${res.status}`, res.headers, req);
    }
  }
  /**
  * One HTTP round trip, including body delivery, with a timeout. The caller's signal and our
  * timer both abort the same controller; we check which fired to choose the error class.
  */
  async attempt(tag, url, init, { signal, timeout }) {
    const controller = new AbortController();
    const abortFromCaller = () => controller.abort(signal?.reason);
    if (signal?.aborted) abortFromCaller();
    signal?.addEventListener("abort", abortFromCaller, { once: true });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeout);
    const started = Date.now();
    const elapsed = () => `${Date.now() - started}ms`;
    try {
      const response = await this.fetch(url, {
        ...init,
        signal: controller.signal
      });
      await bufferResponse(response, controller.signal);
      return response;
    } catch (err) {
      if (signal?.aborted) {
        this.logger.info(`${tag} aborted by caller after ${elapsed()}`);
        throw new APIUserAbortError(void 0, { cause: err });
      }
      if (timedOut) {
        this.logger.info(`${tag} timed out after ${elapsed()}`);
        throw new APITimeoutError(timeout, { cause: err });
      }
      this.logger.info(`${tag} connection error after ${elapsed()}`, err);
      throw new APIConnectionError(err instanceof Error ? `Connection error: ${err.message}` : void 0, { cause: err });
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abortFromCaller);
    }
  }
  /** Wait before retrying; caller cancellation throws `APIUserAbortError`. */
  async backOff(tag, attempt, retriesLeft, reason, headers, { retry, signal }) {
    const delay = retryDelayMs(attempt, headers, retry);
    const nth = attempt + 1;
    const total = attempt + retriesLeft;
    this.logger.info(`${tag} retrying in ${delay}ms (retry ${nth}/${total}) after ${reason}`);
    try {
      await sleep(delay, signal);
    } catch (err) {
      this.logger.info(`${tag} aborted by caller while waiting to retry`);
      throw new APIUserAbortError(void 0, { cause: err });
    }
  }
};
var parseBody = async (res) => {
  const text = await res.text();
  if (text.length === 0) return void 0;
  if ((res.headers.get("content-type") ?? "").includes("application/json")) try {
    return JSON.parse(text);
  } catch {
    return text;
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};
var record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
var probability = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
var sameKeys = (value, keys) => Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
function validQuestions(value) {
  if (!record(value) || !Object.keys(value).length) return false;
  return Object.values(value).every((q) => record(q) && (q.type === "noul" || q.type === "choice" && record(q.criteria) && Object.keys(q.criteria).length >= 2 || q.type === "score" && Array.isArray(q.criteria) && q.criteria.length >= 2));
}
function validateAnswers(questions, value) {
  if (!record(value) || !sameKeys(value, Object.keys(questions))) return null;
  for (const [id, question] of Object.entries(questions)) {
    const answer = value[id];
    if (!record(answer) || answer.type !== question.type) return null;
    if (question.type === "noul") {
      if (!probability(answer.noul)) return null;
      continue;
    }
    if (!probability(answer.confidence) || !record(answer.probabilities)) return null;
    const keys = question.type === "choice" ? Object.keys(question.criteria) : question.criteria.map((_, i) => String(i));
    if (!sameKeys(answer.probabilities, keys)) return null;
    const probs = keys.map((key) => answer.probabilities && answer.probabilities[key]);
    if (!probs.every(probability)) return null;
    if (Math.abs(probs.reduce((sum, p) => sum + p, 0) - 1) > keys.length * 5e-3 + 1e-8) return null;
    if (question.type === "choice") {
      if (typeof answer.choice !== "string" || !keys.includes(answer.choice)) return null;
      if (answer.probabilities[answer.choice] !== Math.max(...probs)) return null;
    } else {
      if (typeof answer.score !== "number" || !Number.isFinite(answer.score) || answer.score < 0 || answer.score > keys.length - 1) return null;
      const expected = probs.reduce((sum, p, i) => sum + p * i, 0);
      const tolerance = 5e-3 + keys.reduce((sum, _, i) => sum + i * 5e-3, 0);
      if (Math.abs(expected - answer.score) > tolerance + 1e-8) return null;
    }
  }
  return value;
}
function createDecisionClient(config) {
  return {
    async decide(request2, options2 = {}) {
      const start = performance.now();
      const meta = {
        definitionId: request2.definitionId,
        definitionVersion: request2.definitionVersion,
        requestedModel: config.model,
        model: null,
        requestId: null,
        durationMs: 0,
        inputTokens: null,
        outputTokens: null
      };
      const fail = (kind, status) => ({
        ok: false,
        error: { kind, ...status === void 0 ? {} : { status } },
        meta: { ...meta, durationMs: performance.now() - start }
      });
      if (options2.signal?.aborted) return fail("aborted");
      if (typeof config.apiKey !== "string" || !config.apiKey.trim()) return fail("missing_key");
      const timeout = options2.timeoutMs ?? 1200;
      if (!request2.definitionId || !request2.definitionVersion || !config.model || !Number.isFinite(timeout) || timeout <= 0 || !validQuestions(request2.questions)) return fail("invalid_request");
      const wire = { model: config.model, state: request2.state, questions: request2.questions };
      try {
        if (new TextEncoder().encode(JSON.stringify(wire)).byteLength > (config.maxRequestBytes ?? 256e3)) return fail("invalid_request");
      } catch {
        return fail("invalid_request");
      }
      const deadline = new AbortController();
      const cancel = () => deadline.abort();
      options2.signal?.addEventListener("abort", cancel, { once: true });
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        deadline.abort();
      }, timeout);
      try {
        const sdk = new TypeSafeClient({
          apiKey: config.apiKey,
          baseURL: config.baseURL ?? "https://api.typesafe.ai",
          defaultModel: config.model,
          logLevel: "off",
          retry: { maxRetries: 0 },
          fetch: config.fetch ?? globalThis.fetch
        });
        const { data, requestId } = await sdk.systemOne(wire, { signal: deadline.signal, timeout }).withResponse();
        meta.requestId = requestId ?? null;
        const raw = data;
        if (!record(raw)) return fail("invalid_response");
        meta.model = typeof raw.model === "string" ? raw.model : null;
        if (record(raw.usage)) {
          for (const [key, field] of [["inputTokens", "input_tokens"], ["outputTokens", "output_tokens"]]) {
            const value = raw.usage[field];
            meta[key] = typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
          }
        }
        const answers = validateAnswers(request2.questions, raw.answers);
        if (!answers) return fail("invalid_response");
        return { ok: true, answers, meta: { ...meta, durationMs: performance.now() - start } };
      } catch (error) {
        if (options2.signal?.aborted) return fail("aborted");
        if (timedOut || error instanceof APITimeoutError) return fail("timeout");
        if (error instanceof APIUserAbortError) return fail("aborted");
        if (error instanceof APIError) {
          meta.requestId = error.requestId ?? null;
          return fail("http", error.status);
        }
        if (error instanceof APIConnectionError) return fail("network");
        return fail("invalid_response");
      } finally {
        clearTimeout(timer);
        options2.signal?.removeEventListener("abort", cancel);
      }
    }
  };
}

// packages/eval/index.mjs
function summarize(rows) {
  const groups = /* @__PURE__ */ new Map();
  for (const row of rows) {
    const group = groups.get(row.groupId) ?? [];
    group.push(row);
    groups.set(row.groupId, group);
  }
  const durations = rows.map((r) => r.meta?.durationMs).filter((v) => typeof v === "number" && Number.isFinite(v)).sort((a, b) => a - b);
  const percentile = (p) => durations.length ? durations[Math.ceil(durations.length * p) - 1] : null;
  const tokens = (key) => ({
    knownTotal: rows.reduce((sum, r) => sum + (r.meta?.[key] ?? 0), 0),
    unknownRows: rows.filter((r) => r.meta?.[key] == null).length
  });
  return {
    total: rows.length,
    applied: rows.filter((r) => r.status === "applied").length,
    deferred: rows.filter((r) => r.status === "deferred").length,
    failed: rows.filter((r) => r.status === "failed").length,
    correct: rows.filter((r) => r.correct === true).length,
    unlabeled: rows.filter((r) => r.correct === null).length,
    allCorrectGroups: [...groups.values()].filter((rs) => rs.every((r) => r.correct === true)).length,
    groups: groups.size,
    p50Ms: percentile(0.5),
    p95Ms: percentile(0.95),
    inputTokens: tokens("inputTokens"),
    outputTokens: tokens("outputTokens")
  };
}

// packages/cli/src/config.mjs
import { readFileSync, mkdirSync, writeFileSync, renameSync, chmodSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { parseEnv } from "node:util";
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
var stateDir = () => join(homedir(), ".jev-decision-kit");
var keyFile = () => join(stateDir(), ".env");
var defaultModel = "jev-1.13.0";
function readEnv2(path) {
  try {
    return parseEnv(readFileSync(path, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw new Error("\uC124\uC815 \uD30C\uC77C\uC744 \uC77D\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4. \uD30C\uC77C \uAD8C\uD55C\uC744 \uD655\uC778\uD558\uC138\uC694.");
  }
}
function configuration() {
  const saved = readEnv2(keyFile());
  return {
    apiKey: process.env.TYPESAFE_API_KEY || saved.TYPESAFE_API_KEY || "",
    model: process.env.JEV_KIT_MODEL || saved.JEV_KIT_MODEL || defaultModel
  };
}
function privateWrite(path, contents) {
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, contents, { mode: 384, flag: "wx" });
  renameSync(tmp, path);
  chmodSync(path, 384);
}
async function promptKey() {
  if (!process.stdin.isTTY) throw new Error("\uD130\uBBF8\uB110\uC5D0\uC11C jev-decision-kit init\uC744 \uC2E4\uD589\uD558\uC138\uC694. \uC790\uB3D9\uD654\uC5D0\uC11C\uB294 init --stdin\uC73C\uB85C \uD0A4\uB97C \uC804\uB2EC\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.");
  const output = new Writable({ write(_chunk, _encoding, done) {
    done();
  } });
  const input = createInterface({ input: process.stdin, output, terminal: true });
  try {
    const answer = input.question("");
    process.stdout.write("TypeSafe API \uD0A4: ");
    return await answer;
  } finally {
    input.close();
    output.end();
    process.stdout.write("\n");
  }
}
async function initialize(args) {
  if (args.length > 1 || args[0] && args[0] !== "--stdin") throw new Error("\uC0AC\uC6A9\uBC95: jev-decision-kit init [--stdin]");
  let key;
  if (args[0] === "--stdin") {
    const chunks = [];
    let size = 0;
    for await (const chunk of process.stdin) {
      size += chunk.length;
      if (size > 8192) throw new Error("\uD0A4 \uC785\uB825\uC774 \uB108\uBB34 \uAE41\uB2C8\uB2E4.");
      chunks.push(chunk);
    }
    key = Buffer.concat(chunks).toString("utf8").trim();
  } else key = process.env.TYPESAFE_API_KEY || await promptKey();
  key = key.trim();
  if (!key || key.length > 4096 || /[\s\x00-\x1f]/u.test(key)) throw new Error("\uBE44\uC5B4 \uC788\uC9C0 \uC54A\uC740 API \uD0A4\uB97C \uC785\uB825\uD558\uC138\uC694.");
  mkdirSync(stateDir(), { recursive: true, mode: 448 });
  const previous = existsSync(keyFile()) ? readFileSync(keyFile(), "utf8") : "";
  const remaining = previous.split("\n").filter((line) => !/^\s*(?:export\s+)?(?:TYPESAFE_API_KEY|JEV_KIT_MODEL)\s*=/.test(line)).join("\n").trim();
  privateWrite(keyFile(), `${remaining ? remaining + "\n" : ""}TYPESAFE_API_KEY=${JSON.stringify(key)}
JEV_KIT_MODEL=${defaultModel}
`);
  console.log("\uC124\uC815 \uC644\uB8CC. \uB2E4\uC74C \uBA85\uB839: jev-decision-kit demo");
}

// packages/cli/src/agent.mjs
import { existsSync as existsSync2, lstatSync, mkdirSync as mkdirSync2, readFileSync as readFileSync2, readlinkSync, readdirSync, rmSync, symlinkSync } from "node:fs";
import { join as join2, dirname, resolve } from "node:path";
import { homedir as homedir2 } from "node:os";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
var usage = "jev-decision-kit agent install|uninstall [codex|claude|both], agent doctor";
var hash = (text) => createHash("sha256").update(text).digest("hex");
var present = (path) => {
  try {
    lstatSync(path);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
};
var sameLink = (path, target) => present(path) && lstatSync(path).isSymbolicLink() && resolve(dirname(path), readlinkSync(path)) === target;
function agent(args) {
  const [command = "help", ...rest] = args;
  if (command === "help" || command === "--help") return console.log(`\uD310\uB2E8 CLI\uB97C \uD638\uCD9C\uD558\uB294 \uC5D0\uC774\uC804\uD2B8 \uC2A4\uD0AC
  ${usage}`);
  if (!["install", "doctor", "uninstall"].includes(command) || rest.length > 1 || command === "doctor" && rest.length || rest[0] && !["codex", "claude", "both"].includes(rest[0])) throw new Error(`\uC0AC\uC6A9\uBC95: ${usage}`);
  const root = join2(stateDir(), "skills/jev-decision-kit");
  const file = join2(root, "SKILL.md");
  const stateFile = join2(stateDir(), "skills.json");
  const links = { codex: join2(homedir2(), ".agents/skills/jev-decision-kit"), claude: join2(homedir2(), ".claude/skills/jev-decision-kit") };
  const state = existsSync2(stateFile) ? JSON.parse(readFileSync2(stateFile, "utf8")) : { version: 1, clients: [] };
  if (state.version !== 1 || !Array.isArray(state.clients) || state.clients.some((client) => !Object.hasOwn(links, client))) throw new Error("\uC2A4\uD0AC \uC124\uCE58 \uAE30\uB85D\uC744 \uD655\uC778\uD558\uC138\uC694.");
  if (command === "doctor") {
    for (const [client, path] of Object.entries(links)) console.log(`${client} \uD310\uB2E8 \uC2A4\uD0AC: ${sameLink(path, root) && existsSync2(file) ? "\uC124\uCE58\uB428" : "\uC124\uCE58 \uC548 \uB428"} (${path})`);
    return;
  }
  const selected = rest[0] && rest[0] !== "both" ? [rest[0]] : Object.keys(links);
  if (command === "install") {
    for (const client of selected) if (present(links[client]) && !sameLink(links[client], root)) throw new Error(`${client} \uC2A4\uD0AC \uC704\uCE58\uC5D0 \uB2E4\uB978 \uD30C\uC77C\uC774 \uC788\uC5B4 \uB36E\uC5B4\uC4F0\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4.`);
    const source = resolve(dirname(fileURLToPath(import.meta.url)), "../skills/jev-decision-kit/SKILL.md");
    const text = readFileSync2(source, "utf8");
    if (existsSync2(file) && hash(readFileSync2(file, "utf8")) !== (state.skillHash ?? hash(text))) throw new Error("\uC124\uCE58\uD55C \uC2A4\uD0AC \uD30C\uC77C\uC774 \uC218\uC815\uB418\uC5B4 \uAC31\uC2E0\uC744 \uC911\uB2E8\uD588\uC2B5\uB2C8\uB2E4.");
    mkdirSync2(root, { recursive: true, mode: 448 });
    privateWrite(file, text);
    for (const client of selected) {
      mkdirSync2(dirname(links[client]), { recursive: true, mode: 448 });
      if (!present(links[client])) symlinkSync(root, links[client], process.platform === "win32" ? "junction" : "dir");
    }
    privateWrite(stateFile, JSON.stringify({ version: 1, clients: [.../* @__PURE__ */ new Set([...state.clients, ...selected])], skillHash: hash(text) }, null, 2) + "\n");
    console.log(`${selected.join("\xB7")} \uD310\uB2E8 \uC2A4\uD0AC \uC124\uCE58 \uC644\uB8CC. \uC0C8 \uC5D0\uC774\uC804\uD2B8 \uC138\uC158\uC5D0\uC11C jev-decision-kit \uC2A4\uD0AC\uC744 \uC0AC\uC6A9\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.`);
    return;
  }
  const managed = selected.filter((client) => state.clients.includes(client));
  for (const client of managed) if (present(links[client]) && !sameLink(links[client], root)) throw new Error(`${client} \uC2A4\uD0AC \uC5F0\uACB0\uC774 \uBCC0\uACBD\uB418\uC5B4 \uD574\uC81C\uB97C \uC911\uB2E8\uD588\uC2B5\uB2C8\uB2E4.`);
  if (managed.length && existsSync2(file) && hash(readFileSync2(file, "utf8")) !== state.skillHash) throw new Error("\uC2A4\uD0AC \uD30C\uC77C\uC774 \uC218\uC815\uB418\uC5B4 \uD574\uC81C\uB97C \uC911\uB2E8\uD588\uC2B5\uB2C8\uB2E4.");
  for (const client of managed) if (present(links[client])) rmSync(links[client]);
  const remaining = state.clients.filter((client) => !managed.includes(client));
  if (remaining.length) privateWrite(stateFile, JSON.stringify({ ...state, clients: remaining }, null, 2) + "\n");
  else if (managed.length) {
    rmSync(stateFile);
    if (existsSync2(file)) rmSync(file);
    if (existsSync2(root) && !readdirSync(root).length) rmSync(root, { recursive: true });
  }
  console.log(managed.length ? "\uD310\uB2E8 \uC2A4\uD0AC\uC744 \uD574\uC81C\uD588\uC2B5\uB2C8\uB2E4." : "\uD574\uC81C\uD560 \uD310\uB2E8 \uC2A4\uD0AC\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.");
}

// packages/cli/src/cli.mjs
var help = `Jev Decision Kit \u2014 \uC124\uC815, \uD310\uB2E8 \uC2E4\uD589, \uD3C9\uAC00

  jev-decision-kit init                    API \uD0A4 \uC124\uC815 (\uD654\uBA74\uC5D0 \uD45C\uC2DC\uD558\uC9C0 \uC54A\uC74C)
  jev-decision-kit demo                    \uC900\uBE44\uB41C Jev \uD310\uB2E8 \uC608\uC81C \uC2E4\uD589
  jev-decision-kit demo --offline          \uD0A4 \uC5C6\uC774 \uBAA8\uC758 \uC608\uC81C \uC2E4\uD589
  jev-decision-kit decide --text "..." --question "..." --choices "\uC608,\uC544\uB2C8\uC624,\uD310\uB2E8\uBCF4\uB958"
  jev-decision-kit run FILE.json           \uC815\uC758\uD55C \uC9C8\uBB38 \uC2E4\uD589
  jev-decision-kit eval FILE.jsonl          \uAD00\uCE21 \uACB0\uACFC \uC9D1\uACC4
  jev-decision-kit eval --demo              \uC900\uBE44\uB41C \uD3C9\uAC00 \uC608\uC81C \uC2E4\uD589
  jev-decision-kit doctor                  API \uD0A4 \uC124\uC815 \uC0C1\uD0DC \uD655\uC778
  jev-decision-kit agent install [codex|claude|both]  \uD310\uB2E8 CLI \uD638\uCD9C \uC2A4\uD0AC \uC124\uCE58
  jev-decision-kit agent doctor
  jev-decision-kit agent uninstall [codex|claude|both]
`;
function options(args, allowed) {
  const parsed = {};
  for (let index = 0; index < args.length; index++) {
    const name = args[index];
    if (!allowed.includes(name) || Object.hasOwn(parsed, name)) throw new Error("\uC635\uC158\uC744 \uD655\uC778\uD558\uC138\uC694. jev-decision-kit --help\uB85C \uC0AC\uC6A9\uBC95\uC744 \uBCFC \uC218 \uC788\uC2B5\uB2C8\uB2E4.");
    if (name === "--offline" || name === "--json") parsed[name] = true;
    else {
      const value = args[++index];
      if (!value || value.startsWith("--")) throw new Error(`${name} \uAC12\uC744 \uC785\uB825\uD558\uC138\uC694.`);
      parsed[name] = value;
    }
  }
  return parsed;
}
function request(text = "\uACC4\uC815 \uC124\uC815\uC744 \uBCC0\uACBD\uD558\uACE0 \uC2F6\uC5B4\uC694", question = "\uC774 \uBB38\uC7A5\uC740 \uACC4\uC815 \uC9C0\uC6D0 \uBB38\uC758\uC778\uAC00\uC694?", choices = ["\uC608", "\uC544\uB2C8\uC624", "\uD310\uB2E8\uBCF4\uB958"]) {
  return {
    definitionId: "cli-choice",
    definitionVersion: "1",
    state: { message: text },
    questions: { decision: { type: "choice", instructions: question, criteria: Object.fromEntries(choices.map((choice) => [choice, choice])) } }
  };
}
async function decide(input, flags, demo = false) {
  const config = configuration();
  if (flags["--model"]) config.model = flags["--model"];
  if (flags["--base-url"]) config.baseURL = flags["--base-url"];
  if (flags["--offline"]) {
    config.apiKey = "offline-example";
    config.fetch = async () => new Response(JSON.stringify({ model: config.model, answers: {
      decision: {
        type: "choice",
        choice: "\uC608",
        confidence: 0.97,
        probabilities: { \uC608: 0.97, \uC544\uB2C8\uC624: 0.02, \uD310\uB2E8\uBCF4\uB958: 0.01 }
      }
    } }), { headers: { "content-type": "application/json" } });
  } else if (!config.apiKey) throw new Error("\uBA3C\uC800 jev-decision-kit init\uC744 \uC2E4\uD589\uD558\uC138\uC694. \uD0A4 \uC5C6\uC774 \uD655\uC778\uD558\uB824\uBA74 demo --offline\uC744 \uC0AC\uC6A9\uD558\uC138\uC694.");
  if (demo && !flags["--json"]) {
    console.log(`Jev \uD310\uB2E8 \uC608\uC81C \u2014 ${flags["--offline"] ? "\uBAA8\uC758 \uC2E4\uD589 (\uB124\uD2B8\uC6CC\uD06C \uD638\uCD9C \uC5C6\uC74C)" : "\uC2E4\uC81C API \uD638\uCD9C"}
`);
    console.log(`\uC785\uB825 \uBB38\uC7A5: ${input.state.message}
\uC9C8\uBB38: ${input.questions.decision.instructions}
\uC120\uD0DD\uC9C0: ${Object.keys(input.questions.decision.criteria).join(" / ")}
`);
  }
  const timeoutMs = flags["--timeout-ms"] ? Number(flags["--timeout-ms"]) : 1200;
  const result = await createDecisionClient(config).decide(input, { timeoutMs });
  if (flags["--json"]) console.log(JSON.stringify(result, null, 2));
  else if (result.ok) {
    if (demo) {
      const answer = result.answers.decision;
      const meaning = { \uC608: "\uACC4\uC815 \uC9C0\uC6D0 \uBB38\uC758\uC5D0 \uD574\uB2F9\uD569\uB2C8\uB2E4.", \uC544\uB2C8\uC624: "\uACC4\uC815 \uC9C0\uC6D0 \uBB38\uC758\uC5D0 \uD574\uB2F9\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.", \uD310\uB2E8\uBCF4\uB958: "\uACC4\uC815 \uC9C0\uC6D0 \uBB38\uC758\uC778\uC9C0 \uD310\uB2E8\uC744 \uBCF4\uB958\uD588\uC2B5\uB2C8\uB2E4." };
      console.log(`\uD310\uB2E8 \uACB0\uACFC: ${answer.choice} \u2014 ${meaning[answer.choice]}
\uBAA8\uB378 \uC2E0\uB8B0\uB3C4: ${(answer.confidence * 100).toFixed(1)}%`);
      console.log(`\uCC98\uB9AC \uC2DC\uAC04: ${Math.round(result.meta.durationMs)}ms (${flags["--offline"] ? "\uBAA8\uC758 \uC751\uB2F5 \uCC98\uB9AC" : "API \uC694\uCCAD\uBD80\uD130 \uC751\uB2F5 \uAC80\uC99D \uC644\uB8CC\uAE4C\uC9C0"})
Jev \uBAA8\uB378: ${result.meta.model ?? result.meta.requestedModel}`);
    } else {
      for (const [name, answer] of Object.entries(result.answers)) console.log(`${name}: ${answer.type === "choice" ? answer.choice : answer.type === "score" ? answer.score : answer.noul}`);
      console.log(`\uCC98\uB9AC \uC2DC\uAC04: ${Math.round(result.meta.durationMs)}ms`);
    }
  } else console.error(`Jev \uC694\uCCAD \uC2E4\uD328: ${result.error.kind}${result.error.status ? ` (HTTP ${result.error.status})` : ""}`);
  if (!result.ok) process.exitCode = 1;
}
async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (!command || command === "--help" || command === "help") return console.log(help);
  if (command === "init") return initialize(args);
  if (command === "doctor") {
    if (args.length) throw new Error("\uC0AC\uC6A9\uBC95: jev-decision-kit doctor");
    const { apiKey, model } = configuration();
    console.log(`API \uD0A4: ${apiKey ? "\uC124\uC815\uB428 (\uAC12\uC740 \uD45C\uC2DC\uD558\uC9C0 \uC54A\uC74C)" : "\uC124\uC815 \uD544\uC694 \u2014 jev-decision-kit init"}
Jev \uBAA8\uB378: ${model}
\uC124\uC815 \uC704\uCE58: ${keyFile()}`);
    return;
  }
  if (command === "demo") return decide(request(), options(args, ["--offline", "--json", "--model", "--timeout-ms", "--base-url"]), true);
  if (command === "decide") {
    const flags = options(args, ["--text", "--question", "--choices", "--json", "--model", "--timeout-ms", "--base-url"]);
    const choices = flags["--choices"]?.split(",").map((choice) => choice.trim());
    if (!flags["--text"] || !flags["--question"] || !choices || choices.length < 2 || choices.some((choice) => !choice) || new Set(choices).size !== choices.length) throw new Error("text\xB7question\uACFC \uC11C\uB85C \uB2E4\uB978 \uC120\uD0DD\uC9C0 \uB450 \uAC1C \uC774\uC0C1\uC744 \uC785\uB825\uD558\uC138\uC694. \uC0AC\uC6A9\uBC95: jev-decision-kit --help");
    return decide(request(flags["--text"], flags["--question"], choices), flags);
  }
  if (command === "run") {
    if (!args[0] || args[0].startsWith("--")) throw new Error("\uC0AC\uC6A9\uBC95: jev-decision-kit run FILE.json");
    let input;
    try {
      input = JSON.parse(readFileSync3(args[0], "utf8"));
    } catch {
      throw new Error("\uC9C8\uBB38 JSON \uD30C\uC77C\uC744 \uC77D\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
    }
    if (!input || typeof input !== "object" || !input.definitionId || !input.definitionVersion || !input.questions || !Object.hasOwn(input, "state")) throw new Error("\uC9C8\uBB38 \uC815\uC758\uC5D0 definitionId, definitionVersion, state, questions\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4.");
    return decide(input, options(args.slice(1), ["--json", "--model", "--timeout-ms", "--base-url"]));
  }
  if (command === "eval") {
    if (args.length !== 1) throw new Error("\uC0AC\uC6A9\uBC95: jev-decision-kit eval FILE.jsonl \uB610\uB294 eval --demo");
    let rows;
    if (args[0] === "--demo") rows = [{ caseId: "demo", groupId: "demo", status: "deferred", correct: null, meta: { durationMs: 120, inputTokens: null, outputTokens: 20 } }];
    else try {
      rows = readFileSync3(args[0], "utf8").split("\n").filter((line) => line.trim()).map((line) => JSON.parse(line));
    } catch {
      throw new Error("\uD3C9\uAC00 \uD30C\uC77C\uC744 \uC77D\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4. \uD55C \uC904\uC5D0 JSON \uD558\uB098\uC529 \uC788\uB294 \uD30C\uC77C\uC744 \uC9C0\uC815\uD558\uC138\uC694.");
    }
    console.log(JSON.stringify(summarize(rows), null, 2));
    return;
  }
  if (command === "agent") return agent(args);
  throw new Error("\uC54C \uC218 \uC5C6\uB294 \uBA85\uB839\uC785\uB2C8\uB2E4. jev-decision-kit --help\uB85C \uC0AC\uC6A9\uBC95\uC744 \uBCFC \uC218 \uC788\uC2B5\uB2C8\uB2E4.");
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
