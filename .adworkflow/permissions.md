# ADworkflo Permissions

This file defines the project-local operating boundary for AI-assisted engineering tasks.

## Default Allowed

- Read project files needed by `task_spec` and `context_manifest`.
- Edit files explicitly required by the current task.
- Run local build, lint, typecheck, unit test, and smoke test commands.
- Update ADworkflo artifacts under `.adworkflow/`.

## Require User Confirmation

- Installing or upgrading dependencies.
- Changing public API contracts, database schemas, auth, billing, permissions, deployment, or secrets handling.
- Deleting files, moving large directories, or applying broad formatting across unrelated files.
- Running commands that call external production services or mutate remote state.

## Current Foundation Authorization

The user selected the reviewed foundation execution plan. For task IDs
`foundation-01-import` through `foundation-07-final-review`, this authorizes:

- Fetching the public NoteGen GitHub repository.
- Installing the pinned project dependencies with `pnpm install --frozen-lockfile`.
- Running local frontend, Rust, Tauri, and NSIS build commands.
- Creating the isolated `F:\huabu-worktrees\foundation` worktree.

It does not authorize publishing releases, pushing Git remotes, configuring
secrets, or merging the foundation branch into `main`.

## Encoding Baseline

All foundation workers and reviewers must load and follow the installed
`fixed-io-encoding` skill when handling Chinese or non-ASCII text. Encoding
repairs must remain scoped to affected content and must not trigger repository-
wide encoding or line-ending normalization.

## Forbidden By Default

- Reverting unrelated user changes.
- Using long chat history as task handoff material.
- Editing files outside the project root unless the user explicitly asks.
- Claiming completion without writing `verification_result.json`.
