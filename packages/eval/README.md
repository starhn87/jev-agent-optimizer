# Jev Eval

Node 22+ evaluation and reporting utilities. Collection, labels, thresholds and actions belong to the caller. There are no runtime dependencies or automatic provider calls.

```sh
git clone https://github.com/starhn87/jev-utils.git
mkdir -p vendor
cp jev-utils/artifacts/starhn87-jev-eval-0.1.2.tgz vendor/
npm install ./vendor/starhn87-jev-eval-0.1.2.tgz
npx jev-eval observations.jsonl
```

Run these commands from your application folder to install the prepared package. Commit the vendor archive, manifest and lockfile. npm registry publication is pending. `observations.jsonl` contains one JSON object per line. For a first run, save this single line in that file:

```json
{"caseId":"case-1","groupId":"scenario-1","status":"deferred","correct":null,"meta":{"durationMs":120,"inputTokens":null,"outputTokens":20}}
```

`npx jev-eval observations.jsonl` prints a JSON summary; it does not call Jev or require an API key.

```js
import { evaluateCases, summarize } from '@starhn87/jev-eval';

const summary = summarize([
  { caseId: 'case-1', groupId: 'scenario-1', status: 'deferred', correct: null,
    meta: { durationMs: 120, inputTokens: null, outputTokens: 20 } },
]);
```

`evaluateCases(cases, { run, judge, concurrency: 1 })` preserves failures, abstentions, unlabelled cases and correlated groups. `run` invokes the caller's decision function; `judge` compares its output with caller-owned reviewed labels. Unknown token usage remains distinct from zero.

## Weekly issues

```js
import { reportWindow, writeWeeklyIssue } from '@starhn87/jev-eval/weekly';

const window = reportWindow();
const markdown = `<!-- jev-weekly:${window.week} -->
<!-- jev-generated:start -->
Your own observations and collection gaps.
<!-- jev-generated:end -->`;

writeWeeklyIssue({ repo: 'owner/consumer-repository', window, markdown,
  checklist: '\n\n- [ ] Review labelled cases\n', publish: true });
```

The issue target is explicit. This helper never chooses a consumer repository, endpoint, credential file or schedule. It uses the caller's existing GitHub CLI authentication. Without `publish: true`, it only writes a local draft under `.local/weekly-jev/`, which callers should exclude from Git. Regeneration preserves content outside the generated block, including human checklists and notes. The reporting window is the last seven days; the issue's week key uses Monday in Korea Standard Time.
