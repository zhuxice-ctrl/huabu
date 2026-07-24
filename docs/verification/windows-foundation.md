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
npx -y pnpm@9.15.9 build
cargo check --manifest-path src-tauri/Cargo.toml --locked
npx -y pnpm@9.15.9 tauri build --debug --bundles nsis
Get-ChildItem -Recurse 'src-tauri\target\debug\bundle\nsis' -Filter 'zeroxB*.exe'
```

Expected results on a fully provisioned machine:

- The frozen install completes without changing `pnpm-lock.yaml`.
- The foundation contract prints `zeroxB foundation contract passed`.
- Next.js creates `out/` and completes `build:prune-maps`.
- Cargo completes without errors and does not update `src-tauri/Cargo.lock`.
- `src-tauri/target/debug/bundle/nsis/` contains a `zeroxB*.exe` installer.

## Latest local result (2026-07-24)

- Frozen dependency install: passed with pnpm 9.15.9; the lockfile was unchanged.
- Foundation contract: passed.
- Frontend production build: passed, including static export and map pruning.
- Portable MSVC 14.44.35207: installed under `F:\toolchains\portable-msvc`; `cl.exe`
  and `link.exe` are available through `setup_x64.bat`.
- Cargo check with `--locked`: passed without warnings.
- Debug NSIS build: passed.
- Installer: `F:\huabu-builds\zeroxB_0.32.1_x64-setup.exe`.
- Installer SHA-256: `9129926328DF9936ABBB6AD3AF344783D30C357EA71BCCDD1FBA4D2B2672B26C`.
- Installed application: `F:\zeroxBApp\huabu.exe`; product identity `zeroxB`; responsive launch passed.
- Installed UI smoke test: canvas creation, text block creation, bottom AI dock,
  breathing status strip, and all three Agent permission modes passed.
- Runtime independence check: inherited API key, analytics endpoint, upstream model
  service, and upstream release lookups were removed.

## Manual smoke check

After the automated checks pass:

1. Launch the debug application with `npx -y pnpm@9.15.9 tauri dev`.
2. Confirm one Windows application window opens.
3. Confirm the process and installer use the zeroxB product identity.
4. Confirm no request targets `download.notegen.top` or the NoteGen GitHub updater.
5. Close the application and confirm it exits cleanly.
