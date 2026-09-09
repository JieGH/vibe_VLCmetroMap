# Agent Guidelines

## Agent skills

### Issue tracker

GitHub issues at `JieGH/vib_metroValencia` using the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Five canonical roles (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context (`CONTEXT.md` and `docs/adr/` at repo root). See `docs/agents/domain.md`.

### Workflow Completion Protocol

When returning completed work to the user:
1. Run all tests and verify linting passes (`npm test -- --run && npm run lint`).
2. Run `npm run build` to compile production assets and automatically trigger an **iOS Sync** (`postbuild: npx cap sync ios`).
3. Always include `test done` in the final response to the user.
The user runs the native app on their connected device directly via Xcode's Run (Play) button.
