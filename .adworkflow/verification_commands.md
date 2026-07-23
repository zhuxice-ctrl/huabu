# ADworkflo Verification Commands

Use this file to define the commands the verifier should prefer for this project.

## Default Commands

```powershell
pnpm verify:foundation
pnpm build
cargo check --manifest-path src-tauri/Cargo.toml
pnpm tauri build --debug --bundles nsis
```

## Verification Policy

- Run the smallest deterministic checks that prove the acceptance criteria.
- Prefer project-native commands from `package.json`, `pyproject.toml`, `Makefile`, CI config, or framework docs.
- If a command is skipped, record the reason in `.adworkflow/verification_result.json`.
- Do not report "passed" unless the command actually ran and succeeded.
