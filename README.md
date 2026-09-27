# Jev Decision Kit CLI

Configure an API key, run validated Jev decisions and evaluate observations from one command. Node.js 22+, npm and Git are required.

```sh
npm install -g github:starhn87/jev-decision-kit#cli
jev-decision-kit init
jev-decision-kit demo
```

Keep `#cli` in the installation command to install the ready-to-run package from GitHub. npm login is not required.

`init` prompts for your TypeSafe API key without echoing it and stores it in `~/.jev-decision-kit/.env` with owner-only permissions. `demo` asks whether a sample sentence is an account-support inquiry, showing the input, question, choices, explained result, model confidence and elapsed time. `예` means yes, `아니오` means no, and `판단보류` means deferred. No JavaScript files or repository checkout are needed.

```sh
jev-decision-kit demo --offline
jev-decision-kit eval --demo
jev-decision-kit decide --text "Change my account settings" --question "Is this a support request?" --choices "yes,no,uncertain"
jev-decision-kit doctor
jev-decision-kit --help
```

`demo --offline` and `eval --demo` do not call external APIs. Add `--json` to a decision command for structured output. Advanced callers can run a question-definition JSON file with `run FILE.json` or aggregate observations with `eval FILE.jsonl`.

```sh
jev-decision-kit agent install codex
jev-decision-kit agent install claude
jev-decision-kit agent doctor
jev-decision-kit agent uninstall
```

The optional agent commands install or remove a skill that calls this decision CLI. They manage only skill files and links; app settings, model selection and background services are outside this installer. Re-run `agent install` after a CLI update to refresh the skill.

For automation, pass an API key in `TYPESAFE_API_KEY`, or supply it to `init --stdin`. Do not put the key in a command argument. `JEV_KIT_MODEL` overrides the default `jev-1.13.0`.

Full documentation: [Jev Decision Kit](https://github.com/starhn87/jev-decision-kit#readme).
