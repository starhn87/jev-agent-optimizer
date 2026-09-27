import { createHash, randomUUID } from "node:crypto";
import { appendFileSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// One System One request as a classifier received it, with the answers it gave.
// Only what was already sent to that classifier is stored, and only on this machine.
export type SystemOneRequest = { model?: string; state: unknown; questions: Record<string, Record<string, unknown>> };
export type Capture = {
  id: string;
  at: string;
  decision: string;
  // Same request text and questions share a key, so two classifiers' answers line up.
  key: string;
  classifier: string;
  request: { state: unknown; questions: Record<string, Record<string, unknown>> };
  answers: Record<string, unknown>;
};
export type ExchangeSink = (request: SystemOneRequest, reply: Record<string, unknown>) => void;

const MAX_CAPTURE_BYTES = 16 * 1024 * 1024;
export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function requestKey(request: { state: unknown; questions: Record<string, unknown> }): string {
  return createHash("sha256").update(JSON.stringify([request.state, request.questions])).digest("hex").slice(0, 24);
}

export function captureDirectory(root = REPO_ROOT): string {
  return join(root, ".local", "capture");
}

export function captureFile(decision: string, root = REPO_ROOT): string {
  if (!/^[a-z][a-z0-9-]{0,40}$/.test(decision)) throw new Error(`invalid decision name: ${decision}`);
  return join(captureDirectory(root), `${decision}.jsonl`);
}

// Every runtime that writes this decision's captures, e.g. Codex/CLI (no suffix)
// and the Claude hook (-claude). Add a suffix here when another writer is added.
const CAPTURE_SUFFIXES = ["", "-claude"];

export function captureFilesFor(decision: string, root = REPO_ROOT): string[] {
  if (!/^[a-z][a-z0-9-]{0,40}$/.test(decision)) throw new Error(`invalid decision name: ${decision}`);
  return CAPTURE_SUFFIXES.map((suffix) => join(captureDirectory(root), `${decision}${suffix}.jsonl`));
}

// Opt-in: nothing is written unless JEV_KIT_CAPTURE=1 (set in .env, which serve and the skills load).
export function captureEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.JEV_KIT_CAPTURE ?? env.JAO_CAPTURE ?? env.AMR_CAPTURE) === "1";
}

function append(path: string, line: string): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  let size = 0;
  try { size = statSync(path).size; } catch { /* A new capture file. */ }
  if (size + line.length > MAX_CAPTURE_BYTES) {
    // Keep the newer half rather than growing without bound.
    const text = readFileSync(path, "utf8");
    writeFileSync(path, text.slice(text.indexOf("\n", Math.floor(text.length / 2)) + 1), { mode: 0o600 });
  }
  appendFileSync(path, line, { mode: 0o600 });
}

export function captureSink(decision: string, options: { root?: string; env?: NodeJS.ProcessEnv; now?: () => Date } = {}): ExchangeSink | undefined {
  if (!captureEnabled(options.env)) return undefined;
  const path = captureFile(decision, options.root);
  return (request, reply) => {
    const answers = reply.answers;
    if (!answers || typeof answers !== "object" || Array.isArray(answers)) return;
    const body = { state: request.state, questions: request.questions };
    const capture: Capture = { id: randomUUID(), at: (options.now?.() ?? new Date()).toISOString(), decision,
      key: requestKey(body), classifier: request.model ?? "unknown", request: body, answers: answers as Record<string, unknown> };
    try { append(path, `${JSON.stringify(capture)}\n`); }
    catch { process.stderr.write("[jev-decision-kit] capture file unavailable\n"); }
  };
}

export function readJsonl<T>(path: string): T[] {
  let text: string;
  try { text = readFileSync(path, "utf8"); } catch { return []; }
  return text.split("\n").flatMap((line) => {
    if (!line.trim()) return [];
    try { return [JSON.parse(line) as T]; } catch { return []; }
  });
}
