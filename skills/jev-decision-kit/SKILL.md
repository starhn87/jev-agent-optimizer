---
name: jev-decision-kit
description: Run or evaluate project-owned Jev decision questions with the jev-decision-kit CLI when testing or integrating Jev decisions.
---

# Jev Decision Kit

Use the CLI to execute a defined Jev question and inspect its validated result. Start from the project's existing questions, labels and application policy.

Check the key configuration with `jev-decision-kit doctor`. If setup is needed, the user can enter their TypeSafe key through `jev-decision-kit init`; the key stays in the private user configuration. Never include a key in command arguments or generated artifacts.

For installation checks, `jev-decision-kit demo --offline` and `jev-decision-kit eval --demo` use prepared data without provider calls.

For a real decision, pass the authorized input, question and labels:

```sh
jev-decision-kit decide --text "Change my account settings" --question "Is this a support request?" --choices "yes,no,uncertain" --json
```

Use `jev-decision-kit run questions.json --json` for an existing project question definition. The `--model` option selects the Jev decision model. Check `ok` before using answers and retain reported errors or uncertainty for the caller's fallback policy.

Use `jev-decision-kit eval observations.jsonl` to aggregate existing decision observations. Unknown usage and unlabelled cases remain distinct from zero and correct answers. Distribution and confidence alone do not establish task accuracy.
