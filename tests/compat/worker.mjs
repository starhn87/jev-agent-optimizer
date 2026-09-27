import { TypeSafeClient } from '@typesafe-ai/sdk';
import { observe } from '../../packages/decisions/dist/index.js';

export default {
  async fetch(request) {
    const questions = { relevant: { type: 'noul' } };
    const client = new TypeSafeClient({ apiKey: 'synthetic', defaultModel: 'jev-1.13.0', retry: { maxRetries: 0 }, logLevel: 'off',
      fetch: async () => request.url.includes('failure') ? Response.json({}, { status: 500 }) : Response.json({ answers: { relevant: { type: 'noul', noul: .9 } } }),
    });
    return Response.json(await observe({ questions, run: () => client.systemOne({ state: 'mock', questions }).withResponse() }));
  },
};
