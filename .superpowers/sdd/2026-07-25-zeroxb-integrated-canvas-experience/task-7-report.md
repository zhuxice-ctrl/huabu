# Task 7 report — permanent canvas workspace

## RED

`node --experimental-strip-types --test scripts/tests/canvas-workspace-layout.test.mjs scripts/tests/canvas-shell-contract.test.mjs` failed first as intended: the workspace policy and workspace shell were absent, and the editor still owned canvas tabs.

## GREEN

- Focused shell tests: 5/5 passed.
- Existing canvas suite: `npm run test:canvas` passed 107/107.
- `npx tsc --noEmit` passed.
- `git diff --check` passed.

## Changed files

The twelve Task 7 source/test files from the brief: permanent workspace and policy, shell/editor/sidebar/article migration, canvas selection handlers, legacy parser compatibility, and the two shell tests.

## Concerns

The Node test runner emits existing module-type warnings for TypeScript modules; they do not affect results. An independent-review handoff was attempted twice, but the collaboration service rejected the thread, so independent review evidence is unavailable and recorded in `.adworkflow/review_findings.json`.

## Review-fix follow-up

- Fixed all four Important findings: clamped resize persistence, manual-left layout space, automatic-collapse preference isolation, and current-store canvas deletion authority.
- Accounted for both 4px dividers and removed the last `createCanvasTab` producers from search and TipTap; `canvas-tab.ts` is now parser-only.
- Added causal cases to both Task 7 shell tests.

Commands: `node --experimental-strip-types --test scripts/tests/canvas-workspace-layout.test.mjs scripts/tests/canvas-shell-contract.test.mjs` (7/7 pass); `npx tsc --noEmit` (pass); `npm run test:canvas` (109/109 pass); `git diff --check` (pass).

Changed source/tests: `src/lib/canvas/workspace-layout-policy.ts`, `src/stores/sidebar.ts`, `src/app/core/main/canvas/canvas-workspace.tsx`, `src/app/core/main/canvas/canvas-sidebar.tsx`, `src/app/core/main/canvas/canvas-tab.ts`, `src/components/search-dialog.tsx`, `src/app/core/main/editor/markdown/tiptap-editor.tsx`, `scripts/tests/canvas-workspace-layout.test.mjs`, `scripts/tests/canvas-shell-contract.test.mjs`.

## Structural correction — 2026-07-27

- Removed redundant canvas activation after create/open/duplicate actions; the canvas store already activates those projects. Restore remains explicit because its store action does not activate the restored project.
- Replaced the workspace-local resize state with `usehooks-ts` `useWindowSize`, bound click/effect/resize entrypoints directly, and moved named pointer-resize and sidebar-loading entrypoints into the sidebar store.
- Replaced the startup and page anonymous async IIFEs with named helpers, preserving startup cancellation and current-page persistence.
- Added source-contract coverage for those graph-resolvable forms and updated the startup recovery contract for the named initialization helper.

Evidence: focused Task 7 tests 7/7, `npx tsc --noEmit`, `npm run test:canvas` 109/109, and `git diff --check` all passed. The environment lacks the configured ADworkflo `prepare_context.py` and `codegraph_post_edit.py` runners, so the required L2 post-edit impact report could not be refreshed; the existing report remains failed solely on the prior 11 dynamic-dispatch edges. This report entry and all `.adworkflow/` state are intentionally left uncommitted.

## Final L2 gate — 2026-07-27

- The ADworkflo runner became available and rebuilt the real post-edit L2 graph from accepted baseline `02a1e523f2174d01b782b3c6`.
- The first refreshed graph exposed 13 real new production dynamic-dispatch edges. Commit `1073bff5` fixed their cause by keeping Zustand/React dynamic state dispatch inside the existing controller and anonymous store-action boundaries while leaving named helpers responsible for statically resolvable preference/persistence work.
- The final graph revision is `7a6d9f539fd8dacb183be9e0`; impact status passed with unexpected impact 0, new production/test critical edges 0/0, propagation not truncated, and no reused baseline.
- Independent structural re-review of `dde9c474..1073bff5` approved the correction with no Critical, Important, or Minor regression.

Final evidence: focused Task 7/startup recovery tests 10/10, complete Canvas suite 109/109, `npx tsc --noEmit`, `git diff --check`, and the project ADworkflo validator all passed. The only residual note is the existing Node module-type warning for TypeScript test modules.
