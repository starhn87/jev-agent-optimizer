import { createDecisionClient } from '../../packages/decisions/dist/index.js';

Deno.test('packaged ESM runs in Deno without Node imports or credentials', async () => {
  const result = await createDecisionClient({ apiKey: 'synthetic', model: 'jev-1.13.0',
    fetch: async () => Response.json({ answers: { relevant: { type: 'noul', noul: .9 } } }),
  }).decide({ definitionId: 'runtime', definitionVersion: '1', state: 'mock', questions: { relevant: { type: 'noul' } } });
  if (!result.ok || result.answers.relevant.noul !== .9) throw new Error('Deno compatibility failed');
});
