# zeroxB Windows MVP acceptance checklist

Record the tested commit, Windows version, installer path, tester, and date before checking any manual item. A checked item means it was exercised in a packaged Windows build, not inferred from source or automated tests.

## Recorded build

- Commit: `9ddbb77` — `fix(build): decouple Tauri build from pnpm` (one commit after the release-verification commit `89f3509 test(release): verify zeroxB Windows MVP`)
- Windows version: _pending — Linux sandbox only; requires Windows 10/11 to exercise_
- Installer: _pending NSIS build — requires MSVC `link.exe` to compile the Tauri Rust crate, not available on the Linux verification host_
- Tester/date: aily agent `小策` (autonomous Linux verification) — 2026-07-29

### Linux re-verification of the automated gate (this run)

| Item | Status | Evidence |
| --- | --- | --- |
| `verify:foundation` | passed | `node scripts/verify-zeroxb-foundation.mjs` → `zeroxB foundation contract passed` |
| Canvas, chat, recovery, credential, permission, collision, retrieval, voice, workspace tests | passed (248/248) | `node --experimental-strip-types --test scripts/tests/canvas-*.test.mjs` |
| Direct TypeScript compiler | passed (no diagnostics) | `node node_modules/typescript/bin/tsc --noEmit --pretty false` |
| Production Next build (53 static pages) | passed | `node node_modules/next/dist/bin/next build --turbopack` → all 53 static routes generated |
| Production browser source maps removed after build | passed | `node scripts/prune-production-source-maps.mjs`; no `.map` files in `.next/static` |
| Independent source review | passed | `.adworkflow/review_findings.json` (`status: approved`, zero blocking findings) |
| Locked Cargo tests / check / NSIS installer | **blocked** | Linux host has no MSVC `link.exe`; Rust build scripts and the NSIS bundler require it. These gates must be re-run on a Windows 10/11 machine with the Visual Studio Build Tools installed. |

## Hands-on Windows 10/11 gate

- [ ] Fresh install opens the permanent 65% dot-grid canvas without a blank or black screen.
- [ ] Left rail and right document panel restore across close/reopen without remounting the canvas.
- [ ] Two-axis draw creates viewport-normalized blocks; click and single-axis drag create nothing.
- [ ] Snap, invalid preview, resize rollback, swept movement, rigid multi-select, and legacy-overlap recovery pass at 10%, 65%, 100%, and 600%.
- [ ] Right-click glow, partial-overlap right-drag selection, relation hold preview, and editable relation routes pass.
- [ ] Text, image, PDF, video, link, file, and note references ingest and reopen locally; missing sources fail locally.
- [ ] Note hover, click-to-panel, and drag-to-reference remain distinct.
- [ ] HUD collapse, full history, streaming-switch protection, and fixed pan/zoom placement pass.
- [ ] Keyboard prompts stay silent; microphone prompts auto-read once; all stop events stop TTS.
- [ ] Management mode cannot mutate content; editing mode previews, confirms, commits, and rolls back atomically.
- [ ] Current-canvas retrieval cites and navigates local evidence, returns to the old view, and says “没有找到” without evidence.
- [ ] AI tags and relations toggle independently; rejection suppresses equivalent regeneration; linear view never moves nodes.
- [ ] Offline/no-model editing and keyword search pass; corrupt indexes rebuild; interrupted AI work exposes no partial mutation.
- [ ] Settings expose no database export action and application/database/log inspection reveals no plaintext credential.

## Packaging result

Do not mark the Windows MVP accepted until every automated and hands-on item is checked against one recorded commit and the NSIS artifact path is attached here. The 14 hands-on items above still require a Windows 10/11 run; the three Windows-only automated items (locked Cargo test, locked Cargo check, NSIS installer) require a Windows host with MSVC `link.exe` to be checked. Re-run this checklist on a Windows runner and attach the produced `.exe` path under "Installer".
