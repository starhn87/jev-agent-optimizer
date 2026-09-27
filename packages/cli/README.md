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

`npm run connect -- ../my-app`, run from the clone, **installs packages and development tools; it does not integrate decisions into application request handling**. No toolkit dependency installation or build is required. It supports independent npm projects and workspace roots; it does not migrate other package managers or existing Jev integrations.

It adds the official SDK, validation utilities and local CLI to `package.json`, creates a `jev` script, runs `npm install` to update the lockfile and `node_modules` with lifecycle scripts disabled, stores versioned packages and `connection.json` in `vendor/jev-decision-kit/`, and creates Codex/Claude Code project skills. Commit the manifest, lockfile, vendor files and skills for portable `npm ci` installation.

After installation, use `npm run jev -- demo --offline` to test execution or `npm run jev -- decide ...` for a real API call. Server API keys, application questions, fallback policy and caller code still need to be implemented. Shadow collection, weekly issues/PRs and deployment are separate work. The CLI's saved key is not loaded by application servers. See [project integration](https://github.com/starhn87/jev-decision-kit/blob/main/docs/integration.md).

For JSON output, use `npm run --silent cli -- decide ... --json` to hide npm's script banner. Run a question-definition JSON file with `npm run cli -- run FILE.json` or aggregate observations with `npm run cli -- eval FILE.jsonl`.

The optional agent commands install a personal skill and record the local CLI path so it can be called from another project. A connected project already has its own skills, so it does not need this additional installation. Skills can be selected when a task matches their description; naming the skill is optional. Re-run `agent install` after updating or moving a personal skill's clone. Skill installation preserves app settings and model selection.

Update with `git pull --ff-only`, `npm ci` and `npm run build`. To stop using the toolkit, uninstall any linked skills and remove the clone. The saved key is preserved.

For automation, supply the key through `TYPESAFE_API_KEY` or `npm run cli -- init --stdin`. Do not put the key in a command argument. `JEV_KIT_MODEL` overrides the default `jev-1.13.0`.

Full documentation: [Jev Decision Kit](https://github.com/starhn87/jev-decision-kit#readme).
