# Task 15 Implementation Report

## Status

Implementation is complete and locally verified. Independent high-risk review and the official L2 post-edit impact report remain controller-owned because the task explicitly required preserving the existing `.adworkflow/` controller changes.

## Implementation

- Added content-only node revisions, revision-deduplicated job drafts, exact retry delays (1s, 5s, 30s, 5m, then 30m capped), abandoned-job resume, and executable rebuild reconciliation.
- Added durable SQLite jobs, anchors, local sparse embeddings, entity/time metadata, delete tombstones, replay-safe completed-job reactivation, and corruption rebuild support.
- Made canvas create/update/delete/restore and Task 14 AI source commit/rollback enqueue index deltas in the same SQLite transaction as authoritative content changes.
- Kept extraction and candidate processing after the source commit. Worker errors become retry jobs and cannot roll back an acknowledged canvas save.
- Added one resumable, stoppable startup worker and a post-save non-awaited drain nudge. Processing is serial and uses no model or network.
- Added separate durable AI tag, relation, and semantic suppression tables. No derived record is written to `CanvasDocument.edges`.
- Enforced the existing nine approved relation types, finite confidence in `[0,1]`, and exact states: active `>= 0.85`, candidate `>= 0.60 && < 0.85`, retrieval-only `< 0.60`.
- Added deterministic candidate recall before an injected controlled classifier. Unavailable/failed index recall marks prior overlays stale and queues retry/rebuild; there is no exhaustive pair classification fallback.
- Added a toggleable React Flow viewport overlay with distinct active/candidate/stale styling and accept/reject controls. Rejection persists semantic suppression.

## TDD Evidence

RED:

`node --experimental-strip-types --test scripts/tests/canvas-index-lifecycle.test.mjs scripts/tests/canvas-ai-overlay.test.mjs`

Failed 0/2 with `ERR_MODULE_NOT_FOUND` for the two not-yet-created contract modules.

GREEN:

The same focused command passed 12/12 after implementation, covering create/update/delete deltas, geometry-only deduplication, exact backoff, abandoned running jobs, stale-anchor rebuild, offline vector/entity/time features, atomic source/enqueue contracts, save acknowledgement isolation, confidence thresholds, tags, nine relation types, stale transitions, semantic suppression, candidate-first recall, storage separation, and overlay controls.

## Verification

- `node --experimental-strip-types --test scripts/tests/canvas-index-lifecycle.test.mjs scripts/tests/canvas-ai-overlay.test.mjs`: PASS, 12/12.
- `node --experimental-strip-types --test --test-reporter=dot scripts/tests/canvas-*.test.mjs`: PASS, 189/189.
- `node_modules/.bin/tsc.cmd --noEmit`: PASS, zero diagnostics.
- `node_modules/.bin/next.cmd build --turbopack`: PASS, compile/type validation and 53/53 static pages.
- Direct execution of the repository's `build:prune-maps` Node command: PASS.
- `git diff --check -- src scripts/tests`: PASS; only informational existing CRLF notices.
- Credential scan of all Task 15 files for key/bearer patterns: no matches.

The mandated wrapper commands `pnpm exec tsc --noEmit` and `pnpm build` did not invoke TypeScript/Next: the environment's pnpm supply-chain hook stopped at `ERR_PNPM_IGNORED_BUILDS` for pre-existing ignored dependency scripts. No dependency policy was changed. The installed underlying commands above passed.

## Files Changed

- `src/lib/canvas/canvas-index-jobs.ts`
- `src/lib/canvas/ai-overlay.ts`
- `src/db/canvas-index.ts`
- `src/db/canvas-ai-overlay.ts`
- `src/db/canvases.ts`
- `src/db/canvas-ai-transactions.ts`
- `src/db/index.ts`
- `src/stores/canvas-index.ts`
- `src/stores/canvas-ai.ts`
- `src/stores/canvas.ts`
- `src/app/core/main/canvas/canvas-startup-controller.tsx`
- `src/app/core/main/canvas/canvas-ai-overlay.tsx`
- `src/app/core/main/canvas/canvas-editor.tsx`
- `scripts/tests/canvas-index-lifecycle.test.mjs`
- `scripts/tests/canvas-ai-overlay.test.mjs`

## Self-Review

- Confirmed index initializers depend on the leaf `src/db/client.ts` handle and introduce no new `src/db/index.ts` initializer cycle.
- Confirmed completed unique jobs are reactivated when content returns to an older revision or an unchanged canvas is rebuilt after corruption.
- Confirmed source persistence and job enqueue are atomic, while extraction/overlay processing is outside source transactions.
- Confirmed AI records, UI controls, hide/rebuild, and rejection never call manual document/history mutation APIs.
- Confirmed source changes stale related overlay records and suppression uses collision-safe JSON tuple identities, including symmetric identities for same-topic and possible-duplicate relations.
- Confirmed worker shutdown unregisters candidate recall and cancels its idle timer.
- Confirmed no credential values or user-facing export behavior were added.

## Concerns

- Official independent review and L2 post-edit impact evidence are still required before the controller claims the high-risk task fully closed.
- Real Tauri SQLite crash/restart timing and visual interaction should remain in the Task 21 Windows acceptance pass; Node tests exercise pure lifecycle behavior and source integration contracts.
- The pnpm wrapper policy issue is environmental and reproducible; direct installed TypeScript and production build commands passed.

## Fix Round 1

Addressed all four independent-review findings:

- Added a production job-completion trigger that obtains the persisted indexed source, uses the configured primary model only when available, performs deterministic candidate-first classification, persists derived records and refreshes only the matching active overlay. Missing models, unavailable recall and classifier failures remain non-blocking.
- Changed delete tombstone processing to re-read the authoritative active canvas inside the same transaction. A restored/current node suppresses stale deletion and re-enqueues its current upsert revision.
- Added persisted relation semantic identities, legacy backfill/deduplication and a unique semantic index. Tag/relation suppression checks and upserts now share `BEGIN IMMEDIATE`; rejection hides every equivalent record in the same transaction.
- Replaced the unconditional worker loop with a tested stop-aware drain. Shutdown clears the timer/provider, prevents the next claim and awaits the already-claimed job reaching complete/retry state.
- Added behavioral tests for candidate-first classification persistence, offline/classifier failure isolation, same-revision restore planning, directed/symmetric semantic identities and stop-during-first-job behavior.

Covering verification:

- `node --experimental-strip-types --test scripts/tests/canvas-index-lifecycle.test.mjs scripts/tests/canvas-ai-overlay.test.mjs`: PASS, 16/16.
- `node --experimental-strip-types --test scripts/tests/canvas-index-lifecycle.test.mjs scripts/tests/canvas-ai-overlay.test.mjs scripts/tests/canvas-black-screen-recovery.test.mjs scripts/tests/canvas-shell-contract.test.mjs`: PASS, 22/22.
- `node --experimental-strip-types --test scripts/tests/canvas-*.test.mjs`: PASS, 193/193.
- `node_modules/.bin/tsc.cmd --noEmit`: PASS, zero diagnostics.
- `node_modules/.bin/next.cmd build --turbopack`: PASS, compiled successfully and generated 53/53 static pages.
- `git diff --check`: PASS; only informational existing CRLF notices.
- Task 15 key/bearer credential scan: no matches.

## Fix Round 2

Removed the 18 production dynamic-dispatch edges recorded by the first Task 15 L2 impact run while preserving the Fix Round 1 lifecycle behavior:

- Replaced the startup classifier registry and asynchronous IIFE with direct static worker ownership. Startup now preserves the required `initAllDatabases().then(() => Promise.all([initOpenTabs(), loadProjects(), startCanvasIndexWorker()]))` ordering, and cleanup directly invokes the awaited-drain stop boundary.
- Replaced the injected classification executor with pure candidate filtering, response parsing and record planning. Production classification now statically invokes candidate recall, native JSON model transport, stale handling, persistence and active-overlay refresh.
- Replaced the injected queue drain and processed-job callback registry with a static serial drain that directly claims, processes, retries and classifies jobs. Stop sets the claim gate first, clears polling/recall, and awaits the active drain before releasing worker ownership.
- Replaced `useReactFlow()` and three `getNode()` calls in the overlay with an explicit readonly node list supplied from the editor's `displayNodes` authority.
- Removed the chained Zustand `getState().load` dispatch and the temporary setter TDZ boundary; overlay refresh now uses a named static loader and direct store publication.
- Added startup-reset failure cleanup so recall registration and worker-running state remain retryable after initialization failure.
- Reworked focused tests to exercise pure planners and static source contracts instead of the removed dependency-injected classifier and drain functions.

Verification on the Fix Round 2 candidate:

- `node --experimental-strip-types --test scripts/tests/canvas-index-lifecycle.test.mjs scripts/tests/canvas-ai-overlay.test.mjs`: PASS, 16/16.
- `node_modules/.bin/tsc.cmd --noEmit`: PASS, zero diagnostics.
- `node --experimental-strip-types --test --test-reporter=dot scripts/tests/canvas-*.test.mjs`: PASS, 193/193.
- `node_modules/.bin/next.cmd build --turbopack`: PASS, compiled successfully and generated 53/53 static pages.
- Direct execution of the repository's `build:prune-maps` Node command: PASS.
- Targeted scan for all 18 reported dynamic call shapes: no matches.
- `git diff --check` on the scoped Task 15 changes: PASS; only informational existing CRLF notices.

The controller-owned `.adworkflow/impact_report.json` was not modified in this fix round. Its next post-edit regeneration must confirm zero production critical edges against this committed revision.
