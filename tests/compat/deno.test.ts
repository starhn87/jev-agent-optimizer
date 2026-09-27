import { TypeSafeClient } from '@typesafe-ai/sdk';
import { toObservation } from '../../packages/decisions/dist/index.js';

Deno.test('official SDK and packaged utilities share types and errors in Deno', async () => {
  const questions = { relevant: { type: 'noul' as const } };
  for (const failure of [false, true]) {
    const client = new TypeSafeClient({ apiKey: 'synthetic', baseURL: 'https://api.typesafe.ai', defaultModel: 'jev-1.13.0', logLevel: 'off', retry: { maxRetries: 0 },
      fetch: async () => failure ? Response.json({}, { status: 500 }) : Response.json({ answers: { relevant: { type: 'noul', noul: .9 } } }),
    });
    let outcome;
    try { outcome = await client.systemOne({ state: 'mock', questions }).withResponse(); }
    catch (error) { outcome = { error }; }
    const result = toObservation(questions, outcome, { definitionId: 'runtime', definitionVersion: '1', requestedModel: client.defaultModel, durationMs: 1 });
    if (failure ? result.ok || result.error.kind !== 'http' : !result.ok || result.answers.relevant.noul !== .9) throw new Error('Deno compatibility failed');
  }
});
