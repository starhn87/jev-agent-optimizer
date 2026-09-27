#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const [mode, input] = process.argv.slice(2);
if (!(["search", "memory"].includes(mode) && input && process.argv.length === 4)) {
  process.stderr.write("usage: gate.mjs search|memory INPUT.json\n");
  process.exit(2);
}

const scriptDir = dirname(fileURLToPath(import.meta.url));
const sourceRoot = resolve(scriptDir, "../../../..");
const configuredEnv = process.env.JEV_KIT_ENV_FILE || process.env.JAO_ENV_FILE || process.env.AMR_ENV_FILE;
const envFile = configuredEnv || join(sourceRoot, ".env");
const root = configuredEnv ? dirname(resolve(envFile)) : sourceRoot;
const cli = join(root, "dist/cli.js");
if (!existsSync(cli) || !existsSync(envFile)) {
  process.stderr.write("[jev-decision-kit] Router build or local key file unavailable; continue without Jev gate.\n");
  process.exit(2);
}

const command = mode === "search" ? "search" : "memory-filter";
const metrics = join(root, ".local", mode === "search" ? "search.jsonl" : "memory.jsonl");
const result = spawnSync(process.execPath, [`--env-file=${envFile}`, cli, command, input, "--metrics", metrics], {
  encoding: "utf8", maxBuffer: 8 * 1024 * 1024, timeout: 15_000,
});
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
if (result.error) process.stderr.write("[jev-decision-kit] Jev gate could not start; continue normally.\n");
process.exit(result.status ?? 1);
