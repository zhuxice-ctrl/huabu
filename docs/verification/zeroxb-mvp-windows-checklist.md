# zeroxB Windows MVP acceptance checklist

Record the tested commit, Windows version, installer path, tester, and date before checking any manual item. A checked item means it was exercised in a packaged Windows build, not inferred from source or automated tests.

## Recorded build

- Commit: _pending final verification commit_
- Windows version: _pending_
- Installer: _pending NSIS build_
- Tester/date: _pending_

## Automated gate

- [x] `verify:foundation`
- [x] Canvas, chat, recovery, credential, permission, collision, retrieval, voice, and workspace tests
- [x] Direct TypeScript compiler
- [x] Production Next build (53 static pages)
- [x] Production browser source maps removed after build
- [ ] Locked Cargo tests — blocked on this machine because the MSVC `link.exe` toolchain is not installed
- [ ] Locked Cargo check — blocked on this machine because Rust build scripts require the missing MSVC `link.exe`
- [ ] NSIS installer — blocked by the same missing MSVC linker
- [x] Independent source review completed; Critical and Important findings were fixed and regression-tested

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

Do not mark the Windows MVP accepted until every automated and hands-on item is checked against one recorded commit and the NSIS artifact path is attached here.
