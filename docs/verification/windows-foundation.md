# Windows foundation verification

Run from the zeroxB repository root in PowerShell on Windows 10 or Windows 11.

## Prerequisites

- Node.js 24
- pnpm 9.15.9
- Current stable Rust toolchain for `x86_64-pc-windows-msvc`
- Visual Studio 2022 Build Tools with **Desktop development with C++**, or the verified portable MSVC environment at `F:\toolchains\portable-msvc`
- Microsoft Edge WebView2 Runtime

For the portable environment, prefix Rust and Tauri commands with:

```powershell
cmd /d /s /c "call F:\toolchains\portable-msvc\msvc\setup_x64.bat && <command>"
```

## Automated checks

The following form pins pnpm without requiring `corepack enable`, which can need
administrator access when Node.js is installed under `C:\Program Files`:

```powershell
npx -y pnpm@9.15.9 install --frozen-lockfile
npx -y pnpm@9.15.9 verify:foundation
npx -y pnpm@9.15.9 test:canvas
npx -y pnpm@9.15.9 build
cargo check --manifest-path src-tauri/Cargo.toml --locked
npx -y pnpm@9.15.9 tauri build --debug --bundles nsis
Get-ChildItem -Recurse 'src-tauri\target\debug\bundle\nsis' -Filter 'zeroxB*.exe'
```

Expected results on a fully provisioned machine:

- The frozen install completes without changing `pnpm-lock.yaml`.
- The foundation contract prints `zeroxB foundation contract passed`.
- The canvas suite reports 36 passing tests.
- Next.js creates `out/` and completes `build:prune-maps`.
- Cargo completes without errors and does not update `src-tauri/Cargo.lock`.
- `src-tauri/target/debug/bundle/nsis/` contains a `zeroxB*.exe` installer.

## Latest local result (2026-07-25, editable canvas relations)

- Canvas tests: passed, 36/36. Coverage includes exact-area block drawing, partial-overlap marquee selection, short/long right-button routing, relation draft transactions, exact persisted handles, context-menu suppression, waypoint deletion and 24-pixel obstacle clearance.
- Foundation contract and TypeScript no-emit check: passed.
- Frontend production build: passed with pnpm 9.15.9, including static export and map pruning.
- Portable MSVC Cargo check with `--locked`: passed; `src-tauri/Cargo.lock` remains unchanged.
- Independent full review found seven Important interaction defects. Commit `9940c7f3` fixed all of them; the scoped re-review of `e66858ff..60c3d5ed` marked every finding ADDRESSED with no new Critical or Important breakage.
- Current L2 preflight is accepted at graph revision `e081fcbc7669732a10d632b8` with confidence `1.0`. Shared canvas-type propagation and React/React Flow dynamic dispatch were independently assessed with no unexpected behavioral impact.
- A fresh debug NSIS installer was generated with upstream hash validation and copied to `F:\zeroxB-builds\zeroxB_0.32.1_x64-setup.exe`.
- Installer SHA-256: `4D95A12BF445FBFE008F80A0837AB40CA0D559FC85C37B00C35ABD680DEF0A57`.
- The installer completed silently with exit code `0` into `F:\zeroxBApp`. The installed executable exactly matches the packaged debug executable.
- Installed executable SHA-256: `2E6A252704D0673B846E275B3B7901A5F560C46F67AC4178CEC583F49E6EC517`.
- Responsive launch passed with window title `zeroxB`. The persisted active tab is a `canvas://project/...` tab; the SQLite `canvases` table exists with one canvas.
- The visible-dot-grid React Flow contract, canvas-first startup contract and removal of obsolete quick-create controls pass the installed source revision's test/build gates.
- Local OpenAI-compatible configuration persisted with one provider and ten models. A minimal localhost chat request returned a non-empty reply; no canvas content was transmitted and no credential value was printed.
- `F:\HuabuApp` and both obsolete `com.huabu.desktop` application-data paths remain absent.
- The default Tauri cache root remains a junction to `F:\toolchains\tauri-bundler-cache\cache-root`.

## Manual smoke check

After the automated checks pass:

1. Launch `F:\zeroxBApp\zeroxb.exe`.
2. Confirm one Windows application window opens with title `zeroxB` (verified locally; process remained responsive).
3. Confirm the installed path and NSIS installer use the zeroxB product identity.
4. Confirm no request targets `download.notegen.top` or the NoteGen GitHub updater (source contract verified; no live network model request made).
5. Close the application and confirm it exits cleanly.
