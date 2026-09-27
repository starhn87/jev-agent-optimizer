import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';

test('core runs in an actual Workers isolate with mock transport', async () => {
  const bundled = await build({ entryPoints: ['tests/compat/worker.mjs'], bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022' });
  const mf = new Miniflare({ workers: [{ config: {
    name: 'compat', compatibilityDate: '2026-09-27',
    manifest: { mainModule: 'worker.mjs', modulesRoot: process.cwd(),
      modules: { 'worker.mjs': { type: 'esm', contents: bundled.outputFiles[0].text } } },
  } }] });
  try {
    const response = await mf.dispatchFetch('https://example.test/');
    const result = await response.json();
    assert.equal(result.ok, true); assert.equal(result.answers.relevant.noul, .9);
  } finally { await mf.dispose(); }
});
