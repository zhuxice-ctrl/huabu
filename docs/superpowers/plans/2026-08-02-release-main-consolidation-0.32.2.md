# Release Main Consolidation 0.32.2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate all current Git branch histories into the local latest mainline, build zeroxB 0.32.2, install the NSIS package locally, and push the verified release.

**Architecture:** The Canvas branch is the authoritative code source. Branches already reachable from it need no action; divergent old origin branches receive explicit `-s ours` merge commits so their history remains reachable while their stale code cannot replace the newer local implementation. Tauri remains the package owner and NSIS performs an in-place update.

**Tech Stack:** Git, PowerShell, Node.js, Next.js, TypeScript, Rust, Tauri 2, NSIS.

---

### Task 1: Record release inputs and configure the patch version

**Files:**
- Modify: `.adworkflow/task_spec.json`, `.adworkflow/context_manifest.json`, `.adworkflow/context_preflight.json`
- Modify: `src-tauri/tauri.conf.json`

- [x] Record branch ancestry, remote divergence, worktree ownership, release commands and the accepted manual L2 fallback.
- [x] Set `src-tauri/tauri.conf.json` from `"version": "0.32.1"` to `"version": "0.32.2"`.
- [ ] Validate every modified JSON file with `ConvertFrom-Json` and inspect `git diff --check`.
- [ ] Commit the release metadata before merging branch histories.

### Task 2: Consolidate histories without replacing locally verified code

**Files:**
- Modify: Git ref `main`

- [ ] Confirm `codex/canvas-growth-zoom-minimap-tags` is clean and `main` equals `origin/main`.
- [ ] Fast-forward `main` to `codex/canvas-growth-zoom-minimap-tags`.
- [ ] Merge `origin/dev`, `origin/feat/agent-permission-policy` and `origin/feat/canvas-workspace` with `git merge --no-ff -s ours --no-edit <branch>`.
- [ ] Confirm `origin/release`, `origin/foundation/notegen-636d4f8`, `upstream/dev` and the local foundation branch are already ancestors or safely preserved without editing their worktree.
- [ ] Run `git log main..<branch>` for every named branch and verify zero remaining unique commits.

### Task 3: Verify and package the Windows release

**Files:**
- Create: `src-tauri/target/release/bundle/nsis/zeroxB_0.32.2_x64-setup.exe` (generated, not committed)

- [ ] Run the complete Canvas suite, `node node_modules/typescript/bin/tsc --noEmit`, the locked Next.js production build, and `cargo check --manifest-path src-tauri/Cargo.toml --locked`.
- [ ] Build only NSIS with `node_modules/.bin/tauri.CMD build --bundles nsis`.
- [ ] Locate the generated installer with `Get-ChildItem src-tauri/target/release/bundle/nsis -Filter *.exe` and compute SHA-256 with `Get-FileHash`.
- [ ] Start the installer using `Start-Process -Wait -WindowStyle Hidden -ArgumentList '/S'` and require exit code 0.

### Task 4: Publish and close the release

**Files:**
- Modify: `.adworkflow/impact_report.json`, `.adworkflow/worker_state.json`, `.adworkflow/verification_result.json`, `.adworkflow/review_findings.json`

- [ ] Perform a final read-only audit of branch reachability, version, installer hash, install exit status and unexpected file list.
- [ ] Commit task evidence and merge metadata on `main`.
- [ ] Push `main` with a standard fast-forward `git push origin main`; do not force-push.
- [ ] Push the 0.32.2 tag only after `main` is confirmed at the release commit.
