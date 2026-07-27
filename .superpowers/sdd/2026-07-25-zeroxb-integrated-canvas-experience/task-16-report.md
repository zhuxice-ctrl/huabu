# Task 16 report — current-canvas knowledge retrieval

## Delivered

- Added recoverable, per-range `CanvasKnowledgeAnchor` extraction for text, references, image OCR, PDF/Office text, web snapshots, video metadata/subtitles/notes, and attachment metadata.
- Extended the Task 15 index worker with transactional replacement in `canvas_knowledge_anchors`. A node's stale ranges are deleted only as part of the successful revision replacement; extraction errors use redacted messages and the existing bounded retry schedule without changing the saved source document.
- Added local fusion retrieval (keyword, semantic token overlap, entity, and time) with optional reranking, offline operation, evidence anchors, and the exact no-result language `没有找到与当前画布相关的证据。`.
- Routed canvas-chat evidence to `retrieveCanvasEvidence({ canvasId: capturedContext.sourceCanvasId, query })`; retrieval filters to that captured canvas before scoring. The only cross-canvas path is the separately named `canvas_search_other_canvases` tool, which requires an explicit target canvas ID.
- Added fail-closed cloud-context protection. Raw sensitive values are permitted only for direct, non-proxied HTTP(S) loopback (`localhost`, `127/8`, `[::1]`); malformed, LAN, redirected, inherited/custom-proxy, and unknown endpoint state are redacted. Credentials, API keys, passwords, identity numbers, and user-marked sensitive nodes receive stable typed placeholders.

## Verification

- Focused Task 16 tests: PASS (6 tests).
- `npm run test:canvas`: PASS (199 tests).
- `node_modules/.bin/tsc.cmd --noEmit`: PASS.
- `npm run build`: Next/Turbopack compilation, type validation, static generation, and export all completed successfully. The final `pnpm build:prune-maps` wrapper returned exit 1 because this workspace's pnpm policy rejects ignored native dependency build scripts (`@parcel/watcher`, `esbuild`, `sharp`, `unrs-resolver`); no application build error was reported.
- `git diff --check`: PASS before commit.

## Review

- Confirmed default retrieval never accepts an anchor from another canvas, including mixed input data.
- Confirmed sensitive content is redacted before evidence is put into either chat context or the explicit cross-canvas tool result.
- Preserved Task 15 revision dedupe, tombstone, retry, rebuild, and clean-stop behavior. Failed extraction jobs are not sent to overlay classification until a complete indexing outcome.
- Controller-owned `.adworkflow/` and `progress.md` changes were preserved and not modified.

## Fix round 1

Addressed the controller pre-review findings:

- Kept production canvas evidence fail-closed until the native transport can prove its redirect policy; an unverified redirect state can no longer qualify for raw sensitive context.
- Restored the existing workspace/folder RAG path for non-canvas and mobile chats, while captured canvas chats and steering remain strictly current-canvas scoped.
- Moved extraction-failure retry before the anchor/index transaction so a transient extractor failure retains the prior complete revision instead of publishing a partial replacement.
- Revalidated reranked results against original allowed anchor IDs and rebound their original anchor payloads, preventing foreign-canvas injection or text rewriting.
- Extended credential detection to authorization headers, client secrets, credential/secret-key assignments and private-key blocks.

Covering verification:

- Focused Task 15/16 lifecycle, overlay, extraction, retrieval and sensitive-boundary tests: PASS, 25/25.
- Complete Canvas regression: PASS, 202/202.
- `node_modules/.bin/tsc.cmd --noEmit`: PASS.
- `node_modules/.bin/next.cmd build --turbopack`: PASS, 53/53 static pages.
- `git diff --check -- src scripts/tests`: PASS; existing CRLF notices are informational.
