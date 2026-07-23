# Huabu Windows Fork Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import the exact NoteGen canvas commit into Huabu with full upstream history, establish a legally correct GPL-3.0 Windows-only product identity, and produce a reproducible Windows build baseline.

**Architecture:** Keep NoteGen as an `upstream` Git remote and merge commit `636d4f8` into a dedicated foundation branch without rewriting either history. Make only identity, bundling, updater, CI, and attribution changes in this phase; defer UI and feature changes until the imported application builds unchanged on Windows.

**Tech Stack:** Git, PowerShell 7, Node.js 24, pnpm 9, Next.js 15, React 19, Tauri 2, Rust stable, Windows WebView2, NSIS

---

## Scope and file map

This plan creates or changes only these responsibilities:

- `.git/config` — records the NoteGen `upstream` remote; not committed.
- `package.json` — Huabu package name and foundation verification command.
- `src-tauri/tauri.conf.json` — Windows product name, identifier, bundle targets, and removal of NoteGen updater endpoints.
- `src-tauri/Cargo.toml` — Rust package identity and removal of the macOS-only Tauri feature.
- `.github/workflows/release.yml` — removed because it publishes NoteGen Android/macOS/Linux/Windows artifacts and uses NoteGen release endpoints.
- `.github/workflows/windows-ci.yml` — Windows-only build verification; it does not publish artifacts.
- `scripts/verify-huabu-foundation.mjs` — deterministic product identity, license, updater, and CI assertions.
- `NOTICE.md` — upstream attribution and modification notice required for a clear GPL derivative history.
- `docs/architecture/fork-baseline.md` — records preserved upstream seams and the files future plans must change.
- `docs/verification/windows-foundation.md` — reproducible local verification checklist.

This phase does **not** rename every visible NoteGen string, remove dormant mobile source files, change the canvas UI, or implement any AI permission behavior.

### Task 1: Create an isolated worktree and import the exact upstream commit

**Files:**
- Modify: `.git/config` (Git remote metadata, not committed)
- Import: NoteGen repository tree at commit `636d4f896850dfadfb7a5f74e1f9bd9a583c8096`

- [ ] **Step 1: Verify the Huabu documentation branch is clean**

Run from `F:\huabu`:

```powershell
git status --short --branch
git log -2 --oneline
```

Expected: branch `main`, no modified or untracked files, and the approved design/plan commits are visible.

- [ ] **Step 2: Register and fetch NoteGen upstream**

```powershell
git remote add upstream https://github.com/codexu/note-gen.git
git fetch upstream dev --tags
git remote -v
```

Expected: `upstream` fetch/push URLs point to `codexu/note-gen`, and `upstream/dev` exists.

- [ ] **Step 3: Verify the pinned commit is present and belongs to upstream/dev**

```powershell
git cat-file -t 636d4f896850dfadfb7a5f74e1f9bd9a583c8096
git merge-base --is-ancestor 636d4f896850dfadfb7a5f74e1f9bd9a583c8096 upstream/dev
```

Expected: the first command prints `commit`; the second exits with code `0`.

- [ ] **Step 4: Create a dedicated foundation worktree**

```powershell
New-Item -ItemType Directory -Force -Path 'F:\huabu-worktrees' | Out-Null
git worktree add -b foundation/notegen-636d4f8 'F:\huabu-worktrees\foundation' main
```

Expected: Git reports a new worktree on `foundation/notegen-636d4f8`.

- [ ] **Step 5: Merge upstream without rewriting either history**

Run from `F:\huabu-worktrees\foundation`:

```powershell
git merge --allow-unrelated-histories --no-ff 636d4f896850dfadfb7a5f74e1f9bd9a583c8096 -m 'chore: import NoteGen canvas foundation'
git status --short --branch
git log --graph --oneline -5
```

Expected: merge succeeds without content conflicts; both the Huabu documentation root and NoteGen upstream are parents of the merge commit; the worktree is clean.

### Task 2: Prove the unmodified upstream baseline builds on Windows

**Files:**
- Read: `package.json`
- Read: `pnpm-lock.yaml`
- Read: `src-tauri/Cargo.toml`
- Read: `src-tauri/tauri.conf.json`

- [ ] **Step 1: Verify required toolchains**

```powershell
node --version
corepack --version
rustc --version
cargo --version
```

Expected: Node.js `v24.x`, Corepack is available, and Rust/Cargo use a current stable toolchain. If WebView2 or Visual Studio C++ Build Tools are missing, install them before continuing.

- [ ] **Step 2: Activate the upstream pnpm major version**

```powershell
corepack enable
corepack prepare pnpm@9.15.9 --activate
pnpm --version
```

Expected: pnpm reports `9.15.9`.

- [ ] **Step 3: Install dependencies without changing the lockfile**

```powershell
pnpm install --frozen-lockfile
git status --short
```

Expected: install succeeds and `git status --short` remains empty.

- [ ] **Step 4: Build the imported frontend before any Huabu changes**

```powershell
pnpm build
```

Expected: Next.js static build succeeds and produces `out/`.

- [ ] **Step 5: Check the imported Rust desktop application**

```powershell
cargo check --manifest-path src-tauri/Cargo.toml
```

Expected: Rust compilation completes without errors. Record any warnings for later cleanup, but do not change code in this task.

### Task 3: Add a failing Huabu foundation contract

**Files:**
- Create: `scripts/verify-huabu-foundation.mjs`
- Modify: `package.json`

- [ ] **Step 1: Create the foundation verification script**

Create `scripts/verify-huabu-foundation.mjs` with exactly:

```javascript
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (path) => readFileSync(join(root, path), 'utf8')
const readJson = (path) => JSON.parse(read(path))

const packageJson = readJson('package.json')
const tauriConfig = readJson('src-tauri/tauri.conf.json')
const cargoToml = read('src-tauri/Cargo.toml')
const license = read('LICENSE')
const notice = read('NOTICE.md')
const windowsCi = read('.github/workflows/windows-ci.yml')

assert.equal(packageJson.name, 'huabu')
assert.equal(packageJson.scripts['verify:foundation'], 'node scripts/verify-huabu-foundation.mjs')
assert.equal(tauriConfig.productName, 'Huabu')
assert.equal(tauriConfig.identifier, 'com.huabu.desktop')
assert.deepEqual(tauriConfig.bundle.targets, ['nsis', 'msi'])
assert.equal(tauriConfig.bundle.createUpdaterArtifacts, false)
assert.ok(!JSON.stringify(tauriConfig).includes('download.notegen.top'))
assert.ok(!JSON.stringify(tauriConfig).includes('codexu/note-gen/releases'))
assert.match(cargoToml, /^name = "huabu"$/m)
assert.match(cargoToml, /^description = "AI-native spatial notes for Windows"$/m)
assert.match(license, /GNU GENERAL PUBLIC LICENSE/)
assert.match(notice, /derived from NoteGen/i)
assert.match(notice, /636d4f896850dfadfb7a5f74e1f9bd9a583c8096/)
assert.ok(!existsSync(join(root, '.github/workflows/release.yml')))
assert.match(windowsCi, /runs-on: windows-latest/)
assert.doesNotMatch(windowsCi, /ubuntu-|macos-|android/i)

console.log('Huabu foundation contract passed')
```

- [ ] **Step 2: Add the verification command to `package.json`**

Add this script without changing dependencies:

```json
"verify:foundation": "node scripts/verify-huabu-foundation.mjs"
```

- [ ] **Step 3: Run the contract and verify it fails for the upstream identity**

```powershell
pnpm verify:foundation
```

Expected: FAIL before reaching the success message. The first failure is acceptable as either missing `NOTICE.md` or `packageJson.name` still being `note-gen`; the test must not pass.

- [ ] **Step 4: Commit the failing contract**

```powershell
git add package.json scripts/verify-huabu-foundation.mjs
git commit -m 'test: define Huabu fork foundation contract'
```

Expected: one commit containing only the contract and package script.

### Task 4: Implement the Huabu Windows identity and attribution

**Files:**
- Modify: `package.json`
- Modify: `src-tauri/tauri.conf.json`
- Modify: `src-tauri/Cargo.toml`
- Delete: `.github/workflows/release.yml`
- Create: `.github/workflows/windows-ci.yml`
- Create: `NOTICE.md`

- [ ] **Step 1: Change the JavaScript package identity and remove mobile-only scripts**

Change `name` to `huabu`, then replace the final mobile-oriented script entries with this exact tail:

```json
"tauri": "tauri",
"docs:build": "npm --prefix ./docs run build",
"verify:foundation": "node scripts/verify-huabu-foundation.mjs"
```

Remove `sync-version` and `ios-build`. Preserve every other script and dependency exactly; do not add a second `verify:foundation` entry because Task 3 already introduced it.

- [ ] **Step 2: Change the Tauri Windows product identity and disable NoteGen publishing**

Apply these changes to `src-tauri/tauri.conf.json`:

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "Huabu",
  "version": "0.32.1",
  "identifier": "com.huabu.desktop",
  "build": {
    "beforeDevCommand": "pnpm dev",
    "devUrl": "http://localhost:3456",
    "beforeBuildCommand": "pnpm build",
    "frontendDist": "../out"
  },
  "app": {
    "withGlobalTauri": true,
    "security": {
      "csp": null,
      "assetProtocol": {
        "enable": true,
        "scope": ["**"]
      }
    },
    "windows": [
      {
        "title": "",
        "label": "main",
        "width": 1360,
        "height": 720,
        "dragDropEnabled": false,
        "titleBarStyle": "Overlay"
      }
    ]
  },
  "bundle": {
    "active": true,
    "createUpdaterArtifacts": false,
    "targets": ["nsis", "msi"],
    "resources": ["icons", "resources/ocr/*"],
    "fileAssociations": [
      {
        "ext": ["md", "markdown"],
        "name": "Markdown Document",
        "description": "Markdown document",
        "mimeType": "text/markdown",
        "role": "Editor"
      }
    ],
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.ico"
    ]
  },
  "plugins": {}
}
```

The resulting file must match the complete JSON above and contain no `iOS`, `macOS`, NoteGen updater endpoint, updater public key, or `createUpdaterArtifacts: true` entry.

- [ ] **Step 3: Change the Rust package metadata without deleting dormant platform code**

Apply this diff to `src-tauri/Cargo.toml`:

```diff
 [package]
-name = "note-gen"
+name = "huabu"
 version = "0.1.0"
-description = "A Tauri App"
-authors = ["codexu"]
+description = "AI-native spatial notes for Windows"
+authors = ["Huabu contributors"]
@@
-tauri = { version = "2", features = [ "macos-private-api", "protocol-asset", "image-png", "devtools", "tray-icon" ] }
+tauri = { version = "2", features = [ "protocol-asset", "image-png", "devtools", "tray-icon" ] }
```

Do not remove Android/macOS conditional modules or dependencies in this phase; they are dormant on Windows and removing them would mix cleanup with the import baseline.

- [ ] **Step 4: Replace the upstream release workflow with Windows-only CI**

Delete `.github/workflows/release.yml`. Create `.github/workflows/windows-ci.yml`:

```yaml
name: windows-ci

on:
  push:
    branches: [main, 'foundation/**']
  pull_request:

jobs:
  verify:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9.15.9
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: pnpm
      - uses: dtolnay/rust-toolchain@stable
      - name: Install dependencies
        run: pnpm install --frozen-lockfile
      - name: Verify Huabu foundation
        run: pnpm verify:foundation
      - name: Build frontend
        run: pnpm build
      - name: Check Rust application
        run: cargo check --manifest-path src-tauri/Cargo.toml
```

- [ ] **Step 5: Add explicit GPL derivative attribution**

Create `NOTICE.md`:

```markdown
# Huabu attribution notice

Huabu is an independent GPL-3.0 open-source product derived from NoteGen.

- Upstream project: https://github.com/codexu/note-gen
- Pinned foundation commit: `636d4f896850dfadfb7a5f74e1f9bd9a583c8096`
- Upstream license: GNU General Public License v3.0

Huabu preserves the upstream copyright and license notices. Modifications include
the Huabu Windows product identity and, in later commits, a canvas-first interface,
AI permission modes, reversible AI operations, spatial memory retrieval, and AI
relationship overlays.

The Huabu source code and derivative distributions remain licensed under GPL-3.0.
```

- [ ] **Step 6: Run the foundation contract**

```powershell
pnpm verify:foundation
```

Expected: `Huabu foundation contract passed`.

- [ ] **Step 7: Verify only the intended files changed**

```powershell
git status --short
git diff --check
git diff --stat
```

Expected: only the files listed in this task are added, modified, or deleted; `git diff --check` prints nothing.

- [ ] **Step 8: Commit the Windows identity**

```powershell
git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml .github/workflows NOTICE.md
git commit -m 'chore: establish Huabu Windows product identity'
```

Expected: one commit containing the identity, attribution, and CI changes.

### Task 5: Rebuild and package the renamed Windows application

**Files:**
- Modify if generated: `pnpm-lock.yaml` only if `pnpm install --frozen-lockfile` proves the imported lockfile is inconsistent
- Create: `docs/verification/windows-foundation.md`

- [ ] **Step 1: Reinstall from the unchanged dependency lock**

```powershell
pnpm install --frozen-lockfile
```

Expected: success with no lockfile changes. If it fails because the imported lockfile is internally inconsistent, stop and report the exact error rather than running a non-frozen install.

- [ ] **Step 2: Run the identity contract and production frontend build**

```powershell
pnpm verify:foundation
pnpm build
```

Expected: foundation contract passes and Next.js produces `out/`.

- [ ] **Step 3: Check the Rust application after rebranding**

```powershell
cargo check --manifest-path src-tauri/Cargo.toml
```

Expected: PASS without Rust errors.

- [ ] **Step 4: Build a debug NSIS installer**

```powershell
pnpm tauri build --debug --bundles nsis
Get-ChildItem -Recurse 'src-tauri\target\debug\bundle\nsis' -Filter 'Huabu*.exe'
```

Expected: Tauri completes and the second command lists one Huabu NSIS installer.

- [ ] **Step 5: Create the reproducible verification checklist**

Create `docs/verification/windows-foundation.md`:

````markdown
# Windows foundation verification

Run from the Huabu repository root in PowerShell:

```powershell
corepack prepare pnpm@9.15.9 --activate
pnpm install --frozen-lockfile
pnpm verify:foundation
pnpm build
cargo check --manifest-path src-tauri/Cargo.toml
pnpm tauri build --debug --bundles nsis
```

Expected results:

- The foundation contract prints `Huabu foundation contract passed`.
- Next.js creates `out/`.
- Cargo completes without errors.
- `src-tauri/target/debug/bundle/nsis/` contains a `Huabu*.exe` installer.

Manual smoke check:

1. Launch the debug application with `pnpm tauri dev`.
2. Confirm one Windows application window opens.
3. Confirm the process and installer use the Huabu product identity.
4. Confirm no request targets `download.notegen.top` or the NoteGen GitHub updater.
5. Close the application and confirm it exits cleanly.
````

- [ ] **Step 6: Run Markdown and diff checks**

```powershell
git diff --check
git status --short
```

Expected: only `docs/verification/windows-foundation.md` is uncommitted.

- [ ] **Step 7: Commit the verification documentation**

```powershell
git add docs/verification/windows-foundation.md
git commit -m 'docs: record Windows foundation verification'
```

### Task 6: Record the imported architecture seams for the next plans

**Files:**
- Create: `docs/architecture/fork-baseline.md`

- [ ] **Step 1: Create the baseline architecture map**

Create `docs/architecture/fork-baseline.md`:

```markdown
# Huabu fork baseline

## Pinned upstream

- Repository: `https://github.com/codexu/note-gen`
- Commit: `636d4f896850dfadfb7a5f74e1f9bd9a583c8096`
- Import branch: `foundation/notegen-636d4f8`

## Preserved seams

| Responsibility | Upstream path | Huabu follow-up phase |
|---|---|---|
| Canvas schema | `src/types/canvas.ts` | permission and overlay plans |
| Canvas UI | `src/app/core/main/canvas/canvas-editor.tsx` | canvas shell and AI dock plans |
| Canvas node renderers | `src/app/core/main/canvas/nodes/canvas-nodes.tsx` | media node plan |
| Canvas persistence | `src/db/canvases.ts`, `src/stores/canvas.ts` | transaction plan |
| AI canvas tools | `src/lib/agent/tools/canvas-tools.ts` | permission gateway plan |
| Direct canvas mutation | `src/lib/canvas/operations.ts` | transaction plan |
| Agent approval UI | `src/app/core/main/chat/agent-approval-panel.tsx` | preview plan |
| Vector storage | `src/db/vector.ts` | memory navigation plan |
| RAG pipeline | `src/lib/rag.ts`, `src/lib/rag-sync.ts` | memory navigation plan |
| Model configuration | `src/app/core/setting/config.tsx`, `src/stores/setting.ts` | provider/security plan |
| Tauri desktop entry | `src-tauri/src/main.rs` | Windows recovery plan |

## Explicit deferrals

- No canvas-first layout changes in the foundation phase.
- No global removal of NoteGen UI strings in the foundation phase.
- No deletion of dormant mobile/macOS conditional source in the foundation phase.
- No AI permission or data migration changes in the foundation phase.
- No release publishing or updater endpoint is configured until Huabu owns signing keys and a release repository.
```

- [ ] **Step 2: Verify every referenced path exists**

```powershell
$paths = @(
  'src/types/canvas.ts',
  'src/app/core/main/canvas/canvas-editor.tsx',
  'src/app/core/main/canvas/nodes/canvas-nodes.tsx',
  'src/db/canvases.ts',
  'src/stores/canvas.ts',
  'src/lib/agent/tools/canvas-tools.ts',
  'src/lib/canvas/operations.ts',
  'src/app/core/main/chat/agent-approval-panel.tsx',
  'src/db/vector.ts',
  'src/lib/rag.ts',
  'src/lib/rag-sync.ts',
  'src/app/core/setting/config.tsx',
  'src/stores/setting.ts',
  'src-tauri/src/main.rs'
)
$missing = $paths | Where-Object { -not (Test-Path -LiteralPath $_) }
if ($missing) { throw "Missing baseline paths: $($missing -join ', ')" }
Write-Output 'Fork baseline paths verified'
```

Expected: `Fork baseline paths verified`.

- [ ] **Step 3: Commit the architecture map**

```powershell
git add docs/architecture/fork-baseline.md
git commit -m 'docs: map NoteGen seams for Huabu development'
```

### Task 7: Final branch verification and review handoff

**Files:**
- Verify all files changed in Tasks 1–6

- [ ] **Step 1: Run the complete automated baseline**

```powershell
pnpm verify:foundation
pnpm build
cargo check --manifest-path src-tauri/Cargo.toml
```

Expected: all commands pass.

- [ ] **Step 2: Confirm the branch has no accidental generated files**

```powershell
git status --short --branch
git log --oneline --decorate -8
```

Expected: clean `foundation/notegen-636d4f8` branch with separate import, contract, identity, verification, and architecture-map commits. Build output remains ignored.

- [ ] **Step 3: Compare the branch with Huabu main**

```powershell
git diff --stat main...HEAD
git diff --name-status main...HEAD
```

Expected: the full NoteGen tree plus the explicitly listed Huabu foundation changes; no feature implementation beyond foundation scope.

- [ ] **Step 4: Hand off for review without merging**

Report:

```text
Branch: foundation/notegen-636d4f8
Pinned upstream: 636d4f896850dfadfb7a5f74e1f9bd9a583c8096
Verification: foundation contract, frontend build, cargo check, NSIS debug build
Next plan: Huabu canvas-first shell
```

Do not merge into `main` until the user reviews the imported application and foundation diff.
