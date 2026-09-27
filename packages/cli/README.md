# Jev Decision Kit CLI

Clone the repository and run the CLI in that folder. Node.js 22+, npm and Git are required.

```sh
git clone https://github.com/starhn87/jev-decision-kit.git
cd jev-decision-kit
npm ci
npm run setup
npm run demo
```

`npm ci` installs dependencies inside the clone. `setup` builds the CLI and prompts for your TypeSafe API key without echoing it. The key is stored in `~/.jev-decision-kit/.env` with owner-only permissions. Subsequent runs use `npm run demo` directly.

The demo asks whether a sample sentence is an account-support inquiry, showing the input, question, choices, explained result, model confidence and elapsed time. `예` means yes, `아니오` means no, and `판단보류` means deferred.

To check execution without an API key, use `npm run build` in place of `npm run setup`, then:

```sh
npm run demo -- --offline
npm run cli -- eval --demo
```

Other commands from the clone:

```sh
npm run cli -- decide --text "Change my account settings" --question "Is this a support request?" --choices "yes,no,uncertain"
npm run doctor
npm run cli -- --help
npm run cli -- agent install codex
npm run cli -- agent install claude
npm run cli -- agent doctor
npm run cli -- agent uninstall
```

For JSON output, use `npm run --silent cli -- decide ... --json` to hide npm's script banner. Run a question-definition JSON file with `npm run cli -- run FILE.json` or aggregate observations with `npm run cli -- eval FILE.jsonl`.

The optional agent commands install a skill and record the local CLI path so it can be called from another project. Re-run `agent install` after updating or moving the clone. Skill installation preserves app settings and model selection.

Update with `git pull --ff-only`, `npm ci` and `npm run build`. To stop using the toolkit, uninstall any linked skills and remove the clone. The saved key is preserved.

For automation, supply the key through `TYPESAFE_API_KEY` or `npm run cli -- init --stdin`. Do not put the key in a command argument. `JEV_KIT_MODEL` overrides the default `jev-1.13.0`.

Full documentation: [Jev Decision Kit](https://github.com/starhn87/jev-decision-kit#readme).
