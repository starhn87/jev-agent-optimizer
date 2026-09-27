---
name: jev-decision-kit
description: Run or evaluate project-owned Jev decision questions with the jev-decision-kit CLI when testing or integrating Jev decisions.
---

# Jev Decision Kit

Use the CLI to execute a defined Jev question and inspect its validated result. Start from the project's existing questions, labels and application policy.

Use the local clone. In its root, invoke commands with `npm run --silent cli -- <command>`. An installed skill includes `nodeFile` and `cliFile` below: use those absolute paths with argument arrays to call the CLI from the consuming project's working directory. This preserves relative paths to that project's question and observation files. For the repository or marketplace skill, resolve the existing clone's `packages/cli/dist/cli.mjs` before invoking it.

Check the key configuration with `doctor`. If setup is needed, the user can enter their TypeSafe key through `npm run setup` in the clone; the key stays in the private user configuration. Never include a key in command arguments or generated artifacts.

For execution checks, `npm run demo -- --offline` and `npm run cli -- eval --demo` use prepared data without provider calls.

For a real decision, pass the authorized input, question and labels:

```sh
npm run --silent cli -- decide --text "Change my account settings" --question "Is this a support request?" --choices "yes,no,uncertain" --json
```

Use `run questions.json --json` for an existing project question definition. The `--model` option selects the Jev decision model. Check `ok` before using answers and retain reported errors or uncertainty for the caller's fallback policy.

Use `eval observations.jsonl` to aggregate existing decision observations. Unknown usage and unlabelled cases remain distinct from zero and correct answers. Distribution and confidence alone do not establish task accuracy.
