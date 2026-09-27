import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { reportWindow, mergeGenerated, writeWeeklyIssue } from './weekly.mjs';

test('KST week boundaries preserve an exact seven-day UTC window', () => {
  const w = reportWindow(new Date('2026-09-27T16:00:00Z'));
  assert.equal(w.week, '2026-09-28'); assert.equal(w.start, '2026-09-20T16:00:00.000Z');
});
test('weekly regeneration preserves human notes and refuses missing markers', () => {
  const generated = '<!-- jev-generated:start -->new data<!-- jev-generated:end -->';
  const old = '<!-- jev-generated:start -->old data<!-- jev-generated:end -->\n- [x] reviewed\nhuman note';
  assert.equal(mergeGenerated(old, generated), `${generated}\n- [x] reviewed\nhuman note`);
  assert.throws(() => mergeGenerated('human text', generated));
  assert.throws(() => mergeGenerated(old, 'unmarked output'));
});
test('publication uses the explicit consumer target and updates only generated content', () => {
  const cwd = process.cwd(), dir = mkdtempSync(join(tmpdir(), 'jev-issue-'));
  process.chdir(dir);
  try {
    const window = reportWindow(new Date('2026-09-27T10:00:00Z'));
    const markdown = `<!-- jev-weekly:${window.week} -->\n<!-- jev-generated:start -->new data<!-- jev-generated:end -->`;
    const calls = [];
    const run = args => {
      calls.push(args);
      if (args[0] === 'api') return JSON.stringify([[{ number: 4, html_url: 'https://github.com/owner/consumer/issues/4', body: markdown.replace('new data', 'old data') + '\nhuman note' }]]);
      return '';
    };
    assert.match(writeWeeklyIssue({ repo: 'owner/consumer', window, markdown }), /\.md$/);
    assert.equal(calls.length, 0);
    assert.equal(writeWeeklyIssue({ repo: 'owner/consumer', window, markdown, publish: true }, run), 'https://github.com/owner/consumer/issues/4');
    assert.equal(calls[1][4], 'owner/consumer');
    assert.match(readFileSync(`.local/weekly-jev/${window.week}.md`, 'utf8'), /new data.*\nhuman note/);
  } finally { process.chdir(cwd); rmSync(dir, { recursive: true, force: true }); }
});
