import { TypeSafeClient } from '@typesafe-ai/sdk';
import { toObservation } from '../../packages/decisions/dist/index.js';

export default {
  async fetch(request) {
    const questions = { relevant: { type: 'noul' } };
    const client = new TypeSafeClient({ apiKey: 'synthetic', defaultModel: 'jev-1.13.0', retry: { maxRetries: 0 }, logLevel: 'off',
      fetch: async () => request.url.includes('failure') ? Response.json({}, { status: 500 }) : Response.json({ answers: { relevant: { type: 'noul', noul: .9 } } }),
    });
    let outcome;
    try { outcome = await client.systemOne({ state: 'mock', questions }).withResponse(); }
    catch (error) { outcome = { error }; }
    return Response.json(toObservation(questions, outcome, { definitionId: 'runtime', definitionVersion: '1', requestedModel: client.defaultModel, durationMs: 1 }));
  },
};
