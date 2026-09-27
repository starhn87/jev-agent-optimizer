# Jev Decision Kit CLI

Configure an API key, run Jev decisions, evaluate observations and connect Codex or Claude from one command. Node.js 22+ and npm are required.

```sh
npm install -g https://github.com/starhn87/jev-decision-kit/releases/latest/download/jev-decision-kit.tgz
jev-decision-kit init
jev-decision-kit demo
```

`init` prompts for your TypeSafe API key without echoing it and stores it in `~/.jev-decision-kit/.env` with owner-only permissions. `demo` uses a ready-made question. No JavaScript files or repository checkout are needed.

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

Agent integration requires the selected app; Codex background installation supports macOS. Agent runtime files are stored under the user directory, so replacing the CLI package does not remove them. Only explicit agent commands change desktop settings.

For automation, pass an API key in `TYPESAFE_API_KEY`, or supply it to `init --stdin`. Do not put the key in a command argument. `JEV_KIT_MODEL` overrides the default `jev-1.13.0`.

Full documentation: [Jev Decision Kit](https://github.com/starhn87/jev-decision-kit#readme).
