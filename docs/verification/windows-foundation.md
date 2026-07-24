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
- The canvas policy suite reports 19 passing tests.
- Next.js creates `out/` and completes `build:prune-maps`.
- Cargo completes without errors and does not update `src-tauri/Cargo.lock`.
- `src-tauri/target/debug/bundle/nsis/` contains a `zeroxB*.exe` installer.

## Latest local result (2026-07-24, black-screen recovery)

- Canvas policy tests: passed, 19/19, including database initialization, loading-state and dot-grid regression contracts.
- Foundation contract: passed (`zeroxB foundation contract passed`).
- TypeScript no-emit check: passed.
- Frontend production build: passed with pnpm 9.15.9, including static export and map pruning.
- Portable MSVC 14.44.35207 remains under `F:\toolchains\portable-msvc`.
- Cargo check with `--locked`: passed without warnings or lockfile changes.
- The latest debug executable compiled successfully and was installed to `F:\zeroxBApp\zeroxb.exe`.
- Installed executable SHA-256: `CE0F5F5FC275F4BC0A88026D5F3EA16EB8FFA642F51E229C84FEF0B68627BB6E`.
- Responsive launch passed. The active tab is a `canvas://project/...` tab; the SQLite `canvases` table exists with one canvas.
- Visual smoke verification showed the infinite canvas on first load, a visible white-gray dot grid, canvas tools, bottom AI composer and breathing indicator.
- Local OpenAI-compatible configuration persisted after restart with one provider and ten models. A minimal `gpt-5.6-sol` chat request returned `OK`; no canvas content was transmitted.
- The obsolete `F:\HuabuApp` installation and both `com.huabu.desktop` application-data directories were removed.
- Tauri bundle-tool downloads are redirected to `F:\toolchains\tauri-bundler-cache` through a junction at the default cache path.
- A fresh NSIS installer was not generated because GitHub and SourceForge connections were closed by the local network while Tauri downloaded NSIS. The previously generated installer remains at `F:\zeroxB-builds\zeroxB_0.32.1_x64-setup.exe`; it predates this recovery, so the installed executable above is the authoritative tested artifact.

## Manual smoke check

After the automated checks pass:

1. Launch `F:\zeroxBApp\zeroxb.exe`.
2. Confirm one Windows application window opens with title `zeroxB` (verified locally; process remained responsive).
3. Confirm the installed path and NSIS installer use the zeroxB product identity.
4. Confirm no request targets `download.notegen.top` or the NoteGen GitHub updater (source contract verified; no live network model request made).
5. Close the application and confirm it exits cleanly.
