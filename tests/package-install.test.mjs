import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('published packages install independently with typed imports, no agent hooks and an executable evaluation CLI', () => {
  const root = process.cwd(), dir = mkdtempSync(join(tmpdir(), 'jev-install-'));
  const run = (command, args, cwd = root) => execFileSync(command, args, { cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  try {
    const archives = ['decisions', 'eval'].map(name => {
      const [pack] = JSON.parse(run('npm', ['pack', '--ignore-scripts', '--workspace', `@starhn87/jev-${name}`, '--json', '--pack-destination', dir]));
      assert.ok(pack.files.every(f => !/(^|\/)(?:\.env|\.local|apps|claude-mod|tests)(?:\/|$)/.test(f.path)));
      return join(dir, pack.filename);
    });
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ type: 'module', private: true }));
    run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', ...archives], dir);
    for (const name of ['decisions', 'eval']) {
      const pkg = JSON.parse(readFileSync(join(dir, `node_modules/@starhn87/jev-${name}/package.json`)));
      assert.notEqual(pkg.private, true); assert.equal(pkg.publishConfig.access, 'public');
      assert.equal(pkg.scripts?.postinstall, undefined); assert.equal(pkg.scripts?.install, undefined);
    }
    writeFileSync(join(dir, 'smoke.mjs'), `import { TypeSafeClient, choice } from '@typesafe-ai/sdk';
import { validateAnswers, toObservation } from '@starhn87/jev-decisions';
import { summarize } from '@starhn87/jev-eval';
import { reportWindow } from '@starhn87/jev-eval/weekly';
const questions = { scope: choice('Relevant?', { yes: null, no: null }) };
const client = new TypeSafeClient({ apiKey: 'synthetic', logLevel: 'off', fetch: async () => Response.json({ answers: { scope: { type: 'choice', choice: 'yes', confidence: 1, probabilities: { yes: 1, no: 0 } } } }) });
const response = await client.systemOne({ state: 'x', questions }).withResponse();
const result = toObservation(questions, response, { definitionId: 'test', definitionVersion: '1', requestedModel: client.defaultModel, durationMs: 1 });
if (!result.ok || !validateAnswers(questions, response.data.answers) || summarize([]).total !== 0 || !reportWindow().week) throw new Error('independent import failed');`);
    run(process.execPath, ['smoke.mjs'], dir);
    writeFileSync(join(dir, 'types.mts'), `import { choice, score, TypeSafeClient } from '@typesafe-ai/sdk';
import { validateAnswers, toObservation } from '@starhn87/jev-decisions';
import { summarize, evaluateCases } from '@starhn87/jev-eval';
import { reportWindow } from '@starhn87/jev-eval/weekly';
const questions = { scope: choice('Relevant?', { yes: null, no: null }), severity: score('Severity?', ['low', 'high']) };
const response = await new TypeSafeClient({ apiKey: 'synthetic' }).systemOne({ state: 'x', questions });
const answers = validateAnswers(questions, response.answers);
if (answers) { const label: 'yes' | 'no' = answers.scope.choice;
const legend: 'low' = answers.severity.legend[0];
// @ts-expect-error Choice labels must remain literal after installation.
const invalid: 'foreign' = answers.scope.choice; }
const r = toObservation(questions, { data: response }, { definitionId: 'test', definitionVersion: '1', requestedModel: 'jev-latest', durationMs: 1 });
const n: number = summarize([]).total;
const s: string = reportWindow().week;
await evaluateCases([{ caseId: '1', groupId: 'g' }], { run: async () => r, judge: () => ({ status: 'deferred', correct: null }) });`);
    run(process.execPath, [join(root, 'node_modules/typescript/bin/tsc'), '--noEmit', '--strict', '--target', 'ES2022', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', 'types.mts'], dir);
    writeFileSync(join(dir, 'types.deno.ts'), `import { choice } from '@typesafe-ai/sdk';
// @deno-types="./node_modules/@starhn87/jev-decisions/dist/index.d.ts"
import { validateAnswers } from './node_modules/@starhn87/jev-decisions/dist/index.js';
const questions = { scope: choice('Relevant?', { yes: null, no: null }) };
const answers = validateAnswers(questions, {});
if (answers) { const typed: 'yes' | 'no' = answers.scope.choice;
// @ts-expect-error Installed Deno imports must retain literal labels too.
const invalid: 'foreign' = answers.scope.choice; }`);
    run('npx', ['--yes', '--package=deno@2.9.5', '--', 'deno', 'check', 'types.deno.ts'], dir);
    writeFileSync(join(dir, 'observations.jsonl'), JSON.stringify({ caseId: '1', groupId: 'g', status: 'deferred', correct: null, meta: { durationMs: 10, inputTokens: null, outputTokens: 2 } }) + '\n');
    const summary = JSON.parse(run(process.execPath, ['node_modules/@starhn87/jev-eval/cli.mjs', 'observations.jsonl'], dir));
    assert.equal(summary.deferred, 1); assert.equal(summary.inputTokens.unknownRows, 1);
  } catch (error) {
    throw new Error(`Independent package verification failed: ${error.stdout?.toString() || error.stderr?.toString() || error.message}`);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
