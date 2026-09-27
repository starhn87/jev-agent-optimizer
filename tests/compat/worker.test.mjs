import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Miniflare } from 'miniflare';

test('core runs in an actual Workers isolate with mock transport', async () => {
  const entry = readFileSync('tests/compat/worker.mjs', 'utf8')
    .replace('../../packages/decisions/dist/index.js', process.env.JEV_COMPAT_MODULE ? fileURLToPath(process.env.JEV_COMPAT_MODULE) : '../../packages/decisions/dist/index.js')
    .replace('@typesafe-ai/sdk', process.env.JEV_COMPAT_SDK_MODULE ?? '@typesafe-ai/sdk');
  const bundled = await build({ stdin: { contents: entry, resolveDir: new URL('./', import.meta.url).pathname }, bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022' });
  const mf = new Miniflare({ workers: [{ config: {
    name: 'compat', compatibilityDate: '2026-09-27',
    manifest: { mainModule: 'worker.mjs', modulesRoot: process.cwd(),
      modules: { 'worker.mjs': { type: 'esm', contents: bundled.outputFiles[0].text } } },
  } }] });
  try {
    const response = await mf.dispatchFetch('https://example.test/');
    const result = await response.json();
    assert.equal(result.ok, true); assert.equal(result.answers.relevant.noul, .9);
    const failure = await (await mf.dispatchFetch('https://example.test/failure')).json();
    assert.equal(failure.ok, false); assert.equal(failure.error.kind, 'http');
  } finally { await mf.dispose(); }
});
