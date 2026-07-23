# Windows foundation verification

Run from the Huabu repository root in PowerShell on Windows 10 or Windows 11.

## Prerequisites

- Node.js 24
- pnpm 9.15.9
- Current stable Rust toolchain for `x86_64-pc-windows-msvc`
- Visual Studio 2022 Build Tools with **Desktop development with C++**, MSVC, and a Windows SDK
- Microsoft Edge WebView2 Runtime

Confirm that `link.exe` is available from the active developer environment before
running the Rust and installer checks.

## Automated checks

The following form pins pnpm without requiring `corepack enable`, which can need
administrator access when Node.js is installed under `C:\Program Files`:

```powershell
npx -y pnpm@9.15.9 install --frozen-lockfile
npx -y pnpm@9.15.9 verify:foundation
npx -y pnpm@9.15.9 build
cargo check --manifest-path src-tauri/Cargo.toml --locked
npx -y pnpm@9.15.9 tauri build --debug --bundles nsis
Get-ChildItem -Recurse 'src-tauri\target\debug\bundle\nsis' -Filter 'Huabu*.exe'
```

Expected results on a fully provisioned machine:

- The frozen install completes without changing `pnpm-lock.yaml`.
- The foundation contract prints `Huabu foundation contract passed`.
- Next.js creates `out/` and completes `build:prune-maps`.
- Cargo completes without errors and does not update `src-tauri/Cargo.lock`.
- `src-tauri/target/debug/bundle/nsis/` contains a `Huabu*.exe` installer.

## Latest local result (2026-07-24)

- Frozen dependency install: passed with pnpm 9.15.9; the lockfile was unchanged.
- Foundation contract: passed.
- Frontend production build: passed, including static export and map pruning.
- Cargo check with `--locked`: lock validation passed, then compilation was blocked
  because the current machine does not have the MSVC linker `link.exe`.
- Debug NSIS build: the frontend pre-build passed, then Rust compilation stopped at
  the same missing `link.exe` prerequisite; no installer was produced.

The Rust and NSIS results above are an environment prerequisite gap, not a passing
package verification. Re-run both commands from a Visual Studio Developer PowerShell
after the C++ build tools are installed.

## Manual smoke check

After the automated checks pass:

1. Launch the debug application with `npx -y pnpm@9.15.9 tauri dev`.
2. Confirm one Windows application window opens.
3. Confirm the process and installer use the Huabu product identity.
4. Confirm no request targets `download.notegen.top` or the NoteGen GitHub updater.
5. Close the application and confirm it exits cleanly.
