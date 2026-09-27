import { createDecisionClient } from '../../packages/decisions/dist/index.js';

export default {
  async fetch() {
    const result = await createDecisionClient({ apiKey: 'synthetic', model: 'jev-1.13.0',
      fetch: async () => Response.json({ answers: { relevant: { type: 'noul', noul: .9 } } }),
    }).decide({ definitionId: 'runtime', definitionVersion: '1', state: 'mock', questions: { relevant: { type: 'noul' } } });
    return Response.json(result);
  },
};
