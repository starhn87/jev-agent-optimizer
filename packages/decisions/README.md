# Jev Decisions

Validated Jev decisions for Workers, Deno and Node. The official TypeSafe SDK 0.6.0 is bundled; there are no external runtime imports or installation hooks. The package imports no Node modules and reads no environment variables.

```sh
npm install https://github.com/starhn87/jev-decision-kit/releases/download/packages-v0.1.2/starhn87-jev-decisions-0.1.2.tgz
```

This installs the packaged GitHub release through npm. npm registry publication is pending. Node examples require Node 22+; the same ESM also works in Workers and Deno.

## Node / TypeScript

This section is for embedding the library in application code. For a terminal quick start, use the [CLI](https://github.com/starhn87/jev-decision-kit#readme).

Use this inside your existing JavaScript or TypeScript server code:

```js
import { createDecisionClient } from '@starhn87/jev-decisions';

const client = createDecisionClient({ apiKey: process.env.TYPESAFE_API_KEY ?? '', model: 'jev-1.13.0' });
const result = await client.decide({
  definitionId: 'support-scope', definitionVersion: '1',
  state: { message: 'Can I change my account settings?' },
  questions: { scope: { type: 'choice', criteria: {
    relevant: 'The request concerns account support',
    unrelated: 'The request is unrelated to account support',
    uncertain: 'There is not enough context to decide',
  } } },
}, { timeoutMs: 1200 });

if (result.ok) {
  // Inferred as "relevant" | "unrelated" | "uncertain".
  console.log(result.answers.scope.choice, result.answers.scope.probabilities);
} else console.log(result.error.kind);
```

Pass the server-side API key from your application configuration.

## Cloudflare Workers

```ts
import { createDecisionClient } from '@starhn87/jev-decisions';

export default {
  async fetch(request: Request, env: { TYPESAFE_API_KEY: string }) {
    const result = await createDecisionClient({ apiKey: env.TYPESAFE_API_KEY, model: 'jev-1.13.0' })
      .decide({ definitionId: 'relevance', definitionVersion: '1', state: await request.text(),
        questions: { relevant: { type: 'noul', instructions: 'Is this request relevant to account support?' } } },
        { signal: request.signal, timeoutMs: 1200 });
    return Response.json(result);
  },
};
```

Set `TYPESAFE_API_KEY` as a server secret. Keep it out of frontend bundles.

## Deno

```ts
// @deno-types="./node_modules/@starhn87/jev-decisions/dist/index.d.ts"
import { createDecisionClient } from './node_modules/@starhn87/jev-decisions/dist/index.js';

const client = createDecisionClient({ apiKey: Deno.env.get('TYPESAFE_API_KEY') ?? '', model: 'jev-1.13.0' });
```

Run the npm install command above in the same project first. Deno imports the installed ESM and its adjacent TypeScript declaration from the local filesystem; it does not resolve an unpublished npm registry package. Run your application with `deno run --env-file=.env --allow-env=TYPESAFE_API_KEY --allow-net decision.ts`. Grant only the environment/network permissions needed by your caller and commit its lockfile. This package does not manage permissions.

## Contract

`createDecisionClient({ apiKey, model, baseURL?, fetch? }).decide({ definitionId, definitionVersion, state, questions }, { signal?, timeoutMs? })` returns validated answers or a classified error. Default total deadline is 1200ms; retries are disabled. Definition metadata stays local and is not added to the provider wire contract.

Choice labels and Choice/Score probability keys must match their question. Rounded probability sums and score expectations are checked with per-entry rounding tolerance. Low certainty is a valid answer. Missing token usage remains `null`. Errors distinguish `invalid_request`, `missing_key`, `timeout`, `aborted`, `network`, `http` and `invalid_response`.

Each caller owns thresholds, abstention, actions, observation storage and background lifetime. An aborted user request must not start fallback work. Protocol guarantees do not establish semantic accuracy; calibrate your task before enforcement. Source and release instructions: [Jev Decision Kit](https://github.com/starhn87/jev-decision-kit).
