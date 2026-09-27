import assert from "node:assert/strict";
import { existsSync, lstatSync, mkdtempSync, mkdirSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { configureClaude, configureCodex, doctor, install, servicePlist, unconfigureClaude, unconfigureCodex, uninstall, type InstallContext } from "./install.js";

function fixture(t: TestContext) {
  const dir = mkdtempSync(join(tmpdir(), "jev-kit-install-"));
  t.after(() => rmSync(dir, { force: true, recursive: true }));
  const calls: string[][] = [];
  const context: InstallContext = { home: join(dir, "home"), repo: join(dir, "repo space & test"), platform: "darwin", node: process.execPath,
    run: (command, args) => { calls.push([command, ...args]); } };
  mkdirSync(context.repo, { recursive: true });
  mkdirSync(join(context.repo, "claude-mod/skills/agent-context-gates"), { recursive: true });
  writeFileSync(join(context.repo, ".env"), "TYPESAFE_API_KEY=synthetic-key\n");
  const put = (path: string, content: string) => { const file = join(context.home, path); mkdirSync(join(file, ".."), { recursive: true }); writeFileSync(file, content); };
  const get = (path: string) => readFileSync(join(context.home, path), "utf8");
  return { context, calls, put, get };
}

test("Codex setup preserves unrelated TOML sections, including later edits on removal", () => {
  const original = '# comment\nmodel = "custom"\nmodel_provider = "existing"\nmodel_reasoning_effort = "high"\n\n[model_providers.existing]\nname = "Existing"\n\n[projects."/work"]\ntrust_level = "trusted"\n';
  const changed = configureCodex(original);
  assert.match(changed, /model_reasoning_effort = "high"/);
  assert.match(changed, /\[model_providers.existing\]/);
  assert.equal((changed.match(/\[model_providers.jev_decision_kit\]/g) ?? []).length, 1);
  const removed = unconfigureCodex(`${changed}\n[new_feature]\nenabled = true\n`, original);
  assert.match(removed, /^model = "custom"\nmodel_provider = "existing"/);
  assert.match(removed, /\[new_feature\]\nenabled = true/);
  assert.equal(removed.includes("jev_decision_kit"), false);
  assert.equal(configureCodex(changed), changed);
});

test("adopted Codex install actually disables routing and conflicts never get overwritten", () => {
  const original = configureCodex('model = "gpt-6-astra"\n');
  assert.match(unconfigureCodex(original, original), /model_provider = "openai"/);
  assert.throws(() => unconfigureCodex(original.replace('model = "gpt-6-astra"', 'model = "manual"'), null), /変更|변경/);
  assert.throws(() => configureCodex('[model_providers.jev_decision_kit]\nbase_url = "https://other.example"\n'), /다른/);
  assert.throws(() => configureCodex('instructions = """\n[anything]\n"""\n'), /TOML/);
  assert.throws(() => configureCodex('"model" = "something"\n'), /수동/);
});

test("Claude install is idempotent, stores private backups and removes cleanly", async (t) => {
  const h = fixture(t);
  h.put(".claude/settings.json", '{"env":{"OTHER":"preserved"}}');
  await install("claude", h.context);
  const firstState = h.get(".jev-decision-kit/install.json");
  await install("claude", h.context);
  assert.equal(h.get(".jev-decision-kit/install.json"), firstState);
  assert.ok(lstatSync(join(h.context.home, ".claude/skills/jev-decision-kit")).isSymbolicLink());
  assert.ok(lstatSync(join(h.context.home, ".claude/skills/agent-context-gates")).isSymbolicLink());
  assert.equal(lstatSync(join(h.context.home, ".jev-decision-kit/install.json")).mode & 0o777, 0o600);
  const settings = JSON.parse(h.get(".claude/settings.json")); settings.theme = "dark";
  h.put(".claude/settings.json", JSON.stringify(settings));
  uninstall("claude", h.context);
  assert.deepEqual(JSON.parse(h.get(".claude/settings.json")), { env: { OTHER: "preserved" }, theme: "dark" });
  assert.equal(existsSync(join(h.context.home, ".claude/skills/jev-decision-kit")), false);
  assert.equal(existsSync(join(h.context.home, ".claude/skills/agent-context-gates")), false);
});

test("renamed checkouts update managed paths and remain removable through their old alias", async (t) => {
  const h = fixture(t);
  await install("claude", h.context);
  const original = h.context.repo, renamed = `${original}-renamed`;
  renameSync(original, renamed); symlinkSync(renamed, original, "dir");
  h.context.repo = renamed;
  await install("claude", h.context);
  assert.equal(JSON.parse(h.get(".jev-decision-kit/install.json")).repo, renamed);
  assert.equal(JSON.parse(h.get(".claude/settings.json")).env.JEV_KIT_ENV_FILE, join(renamed, ".env"));
  assert.match(await doctor(h.context), /플러그인 로컬 연결됨/);
  uninstall("claude", { ...h.context, repo: original });
  assert.equal(existsSync(join(h.context.home, ".claude/skills/jev-decision-kit")), false);
});

test("existing Codex setup gains the new skill link on reinstall", async (t) => {
  const h = fixture(t);
  let started = false;
  h.context.run = (_command, args) => { if (args[0] === "bootstrap") started = true; };
  t.mock.method(globalThis, "fetch", async () => {
    if (!started) throw new Error("offline");
    return new Response('{"service":"jev-decision-kit","status":"ok","responseFooter":true}');
  });
  await install("codex", h.context);
  const link = join(h.context.home, ".agents/skills/agent-context-gates");
  rmSync(link);
  const state = JSON.parse(h.get(".jev-decision-kit/install.json"));
  delete state.codex.skillLinkExisted;
  h.put(".jev-decision-kit/install.json", JSON.stringify(state));
  await install("codex", h.context);
  assert.ok(lstatSync(link).isSymbolicLink());
  uninstall("codex", h.context);
  assert.equal(existsSync(link), false);
});

test("a conflicting port or missing key fails before modifying user settings", async (t) => {
  const h = fixture(t);
  t.mock.method(globalThis, "fetch", async () => new Response('{"status":"ok"}'));
  await assert.rejects(install("codex", h.context), /다른 서버/);
  assert.equal(existsSync(join(h.context.home, ".codex/config.toml")), false);
  writeFileSync(join(h.context.repo, ".env"), "TYPESAFE_API_KEY=\n");
  await assert.rejects(install("claude", h.context), /키가 없습니다/);
});

test("custom config locations are rejected before editing the default location", async (t) => {
  const h = fixture(t);
  h.context.customConfig = { codex: "/custom/codex" };
  await assert.rejects(install("codex", h.context), /사용자 지정/);
  assert.equal(existsSync(join(h.context.home, ".codex/config.toml")), false);
  await install("claude", h.context);
  assert.ok(existsSync(join(h.context.home, ".claude/settings.json")));
});

test("foreign Claude files and install records are rejected without changing settings", async (t) => {
  const h = fixture(t);
  h.put(".claude/skills/jev-decision-kit/user-file", "preserve");
  await assert.rejects(install("both", h.context), /다른 파일/);
  assert.equal(h.get(".claude/skills/jev-decision-kit/user-file"), "preserve");
  assert.equal(existsSync(join(h.context.home, ".codex/config.toml")), false);
  rmSync(join(h.context.home, ".claude/skills/jev-decision-kit"), { recursive: true });
  h.put(".jev-decision-kit/install.json", JSON.stringify({ version: 1, repo: "/different" }));
  await assert.rejects(install("claude", h.context), /다른 경로/);
});

test("Claude configuration merges unrelated fields and disables adopted routing", () => {
  const before = JSON.stringify({ env: { OTHER: "keep", JEV_KIT_CLAUDE_AUTO: "1" }, theme: "dark" });
  const configured = configureClaude(before, "/repo");
  const removed = JSON.parse(unconfigureClaude(configured, before, "/repo"));
  assert.equal(removed.env.OTHER, "keep");
  assert.equal(removed.env.JEV_KIT_CLAUDE_AUTO, "0");
  assert.equal(removed.theme, "dark");
  assert.throws(() => configureClaude('{"enabledPlugins":{"jev-decision-kit@jev-decision-kit":true}}', "/repo"), /마켓플레이스/);
});

test("both install runs service before redirecting Codex, and disable preserves unrelated changes", async (t) => {
  const h = fixture(t);
  let started = false;
  h.context.run = (command, args) => {
    h.calls.push([command, ...args]);
    if (args[0] === "bootstrap") {
      assert.equal(existsSync(join(h.context.home, ".codex/config.toml")), false);
      started = true;
    }
  };
  t.mock.method(globalThis, "fetch", async () => {
    if (!started) throw new Error("offline");
    return new Response('{"service":"jev-decision-kit","status":"ok","responseFooter":true}');
  });
  await install("both", h.context);
  assert.match(h.get(".codex/config.toml"), /model_provider = "jev_decision_kit"/);
  assert.ok(lstatSync(join(h.context.home, ".agents/skills/agent-context-gates")).isSymbolicLink());
  assert.match(servicePlist(h.context), /repo space &amp; test/);
  assert.match(servicePlist(h.context), /<string>--shadow-fast-confidence<\/string><string>0.7<\/string><string>--continuation-shadow<\/string><string>on<\/string>/);
  assert.match(await doctor(h.context), /연결됨/);
  mkdirSync(join(h.context.repo, ".local"), { recursive: true });
  writeFileSync(join(h.context.repo, ".local/claude.jsonl"), [...Array(8).fill('{"client":"claude","result":"error","reason":"x"}'),
    ...Array(4).fill('{"client":"claude","result":"routed","latencyMs":5,"reason":"x"}')].join("\n"));
  assert.match(await doctor(h.context), /Claude 최근 Jev 호출: 8\/12 실패 — /);
  h.put(".codex/config.toml", `${h.get(".codex/config.toml")}\n[unrelated]\nvalue = 42\n`);
  uninstall("both", h.context);
  assert.match(h.get(".codex/config.toml"), /\[unrelated\]\nvalue = 42/);
  assert.equal(h.get(".codex/config.toml").includes("jev_decision_kit"), false);
  assert.equal(existsSync(join(h.context.home, "Library/LaunchAgents/com.jev-decision-kit.codex.plist")), false);
  assert.equal(existsSync(join(h.context.home, ".agents/skills/agent-context-gates")), false);
});


test("a failed service start rolls back configuration and leaves Claude untouched", async (t) => {
  const h = fixture(t);
  h.put(".codex/config.toml", 'model = "original"\n');
  h.put(".claude/settings.json", '{"theme":"original"}');
  h.context.run = (_command, args) => { if (args[0] === "bootstrap") throw new Error("synthetic failure"); };
  t.mock.method(globalThis, "fetch", async () => { throw new Error("offline"); });
  await assert.rejects(install("both", h.context), /synthetic failure/);
  assert.equal(h.get(".codex/config.toml"), 'model = "original"\n');
  assert.equal(h.get(".claude/settings.json"), '{"theme":"original"}');
  assert.equal(existsSync(join(h.context.home, "Library/LaunchAgents/com.jev-decision-kit.codex.plist")), false);
});
