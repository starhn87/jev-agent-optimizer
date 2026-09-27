---
name: jev-utils
description: Run sample questions with the local Jev Utils CLI or summarize existing labelled observation files. Use for trying explicit questions and labels on bounded samples, inspecting CLI results, or reviewing existing decision observations. For TypeSafe API integration and question design, use the official typesafe-ai skill.
---

# Jev Utils

Use the official `typesafe-ai` skill for API integration, question design and TypeSafe architecture. This skill covers the local CLI and observation-file evaluation. It adds no provider, model-routing or background service configuration.

Use the CLI to execute a defined Jev question and inspect its validated result. Start from the project's existing questions, labels and application policy. This skill can be selected from the task context; the user does not need to name it. Use it for bounded CLI experiments and reviewing recorded results.

If the project has a `jev` npm script calling `jev-utils`, run `npm run --silent jev -- <command>` from that project's root. For example, `npm run --silent jev -- eval observations.jsonl` reads the project's own data. Prefer this portable project command when available.

Otherwise use the local clone. In its root, invoke commands with `npm run --silent cli -- <command>`. An installed skill includes `nodeFile` and `cliFile` below: use those absolute paths with argument arrays to call the CLI from the consuming project's working directory. This preserves relative paths to that project's question and observation files. For the repository or marketplace skill, resolve the existing clone's `packages/cli/dist/cli.mjs` before invoking it.

To connect an npm project, run `npm run connect -- /path/to/project` from the clone. This command uses prepared packages and needs no toolkit dependency installation or build. It installs the official SDK, response utilities, a project-local CLI, and project skills. In server code, call the official `TypeSafeClient.systemOne()` with its own questions and options, then use `validateAnswers` or `toObservation` from `@starhn87/jev-decisions` when needed. Follow the project's error/deferred policy; see the clone's `docs/integration.md`. Connecting packages alone does not change the app's request handling. If the project is already connected, reuse its command and library.

Check the key configuration with `doctor`. If setup is needed, the user can enter their TypeSafe key through `npm run jev -- init` in a connected project or `npm run setup` in the clone; the key stays in the private user configuration. Never include a key in command arguments or generated artifacts. An application's server supplies its own secret to the official SDK client; it does not read the CLI's private key file.

For execution checks in a connected project, `npm run jev -- demo --offline` and `npm run jev -- eval --demo` use prepared data without provider calls. With a standalone clone, build its CLI first and run these subcommands through its `cli` script instead.

For a real decision, pass the authorized input, question and labels:

```sh
npm run --silent jev -- decide --text "Change my account settings" --question "Is this a support request?" --choices "yes,no,uncertain" --json
```

Use `run questions.json --json` for an existing project question definition. The `--model` option selects the Jev decision model. Check `ok` before using answers and retain reported errors or uncertainty for the caller's fallback policy.

Use `eval observations.jsonl` to aggregate existing decision observations. Unknown usage and unlabelled cases remain distinct from zero and correct answers. Distribution and confidence alone do not establish task accuracy.
