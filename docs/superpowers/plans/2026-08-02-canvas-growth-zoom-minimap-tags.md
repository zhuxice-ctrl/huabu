# Canvas Growth, Zoom, Minimap and Tags Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop runaway text-node growth, clamp canvas zoom to 0.1%–100%, add a minimap center reset and deterministic tag-color markers, and remove visible layer-order actions.

**Architecture:** Keep measurement and zoom bounds in pure policy modules. React Flow remains the viewport and minimap owner; the editor supplies clamped bounds, the center action and node-color projection. Generic node `tags` coexist with legacy image-only `imageTags`.

**Tech Stack:** TypeScript, React 19, React Flow 12, Zustand, Node test runner, Next.js.

---

### Task 1: Overflow-driven text growth

**Files:** `src/lib/canvas/text-node-sizing.ts`, `src/app/core/main/canvas/nodes/canvas-nodes.tsx`, `scripts/tests/canvas-text-node-sizing.test.mjs`

- [x] Add tests asserting a fitting measurement returns the current node height, overflowing content grows once, and a pathological measurement caps at `20000`.
- [x] Run `node --experimental-strip-types --test scripts/tests/canvas-text-node-sizing.test.mjs` and observe the old policy fail.
- [x] Add optional `currentHeight` and `MAX_AUTO_TEXT_NODE_HEIGHT = 20000` to the policy. Return the current/manual height when measured content plus chrome fits; cap only new growth and preserve finite current heights.
- [x] In `TextCanvasNode`, stop setting textarea height to `0px`; read `scrollHeight` at the current size and pass `currentHeight: bounds.height` with fixed chrome `16 * contentScale(data) + 2`.
- [x] Run sizing/editor contracts and `tsc --noEmit`, then commit `fix(canvas): grow text nodes only after overflow`.

### Task 2: Unified 0.1%–100% zoom bounds

**Files:** `src/lib/canvas/viewport-sizing.ts`, `src/types/canvas.ts`, `src/stores/canvas-view.ts`, `src/app/core/main/canvas/canvas-editor.tsx`, `src/app/core/main/canvas/canvas-footer.tsx`, `scripts/tests/canvas-viewport-sizing.test.mjs`, `scripts/tests/canvas-node-visual-contract.test.mjs`

- [x] Change focused tests to expect `MIN_CANVAS_ZOOM === 0.001` and `MAX_CANVAS_ZOOM === 1`, including normalization of `0` and `12`.
- [x] Run the focused viewport contracts and observe the old `0.1–6` assertions fail.
- [x] Define shared `CANVAS_MIN_ZOOM = 0.001` and `CANVAS_MAX_ZOOM = 1`; use them in document normalization, viewport-store publication/animation, React Flow `minZoom`/`maxZoom`, and the footer slider (`min={0.001}`, `max={1}`, `step={0.001}`). Cap visual border compensation at 10.
- [x] Run viewport/editor contracts and TypeScript, then commit `fix(canvas): clamp zoom to a predictable range`.

### Task 3: Center reset and colored tag minimap markers

**Files:** create `src/lib/canvas/minimap.ts` and `scripts/tests/canvas-minimap-contract.test.mjs`; modify `src/types/canvas.ts`, `src/app/core/main/canvas/canvas-node-style-menu.tsx`, `src/app/core/main/canvas/canvas-editor.tsx`, `scripts/tests/canvas-node-visual-contract.test.mjs`

- [x] Add failing tests for deterministic case-insensitive tag colors, legacy `imageTags` compatibility, node-color fallback, a `回到中心` action, `fitView`, and `MiniMap nodeColor`.
- [x] Run the new minimap contract and confirm the module/UI assertions fail.
- [x] Implement `normalizeCanvasTags`, `canvasTagColor` and `minimapNodeColor` with a fixed palette. Add optional `tags?: string[]` to node data and a comma-separated `节点标签` input to the existing style menu. Pass `nodeColor={minimapNodeColor}` to `MiniMap`; add a panel button with `aria-label="回到中心"` calling `fitView({ padding: 0.2, duration: 300 })`.
- [x] Run minimap/image-tag/node-visual contracts and TypeScript, then commit `feat(canvas): center minimap and color tag markers`.

### Task 4: Remove visible layer-order actions

**Files:** `src/app/core/main/canvas/canvas-editor.tsx`, `scripts/tests/canvas-editor-contract.test.mjs`

- [x] Add absence assertions for `t('layer.front')`, `t('layer.forward')`, `t('layer.backward')`, `t('layer.back')` and `updateSelectedNodeLayer(` while retaining delete/duplicate actions.
- [x] Run the editor contract and confirm the old layer menu is detected.
- [x] Delete the handler and four context-menu items/separator only; retain internal `zIndex` serialization, group ordering and static export compatibility.
- [x] Run editor contract and TypeScript, then commit `remove(canvas): drop visible layer ordering actions`.

### Task 5: Full verification and handoff

**Files:** `.adworkflow/context_manifest.json`, `.adworkflow/context_preflight.json`, `.adworkflow/impact_report.json`, `.adworkflow/worker_state.json`, `.adworkflow/verification_result.json`, `.adworkflow/review_findings.json`

- [x] Run `node --experimental-strip-types --test scripts/tests/canvas-*.test.mjs`, `node_modules/.bin/tsc.cmd --noEmit` and a production Next.js build with the locked local dependency runtime. `pnpm build` was attempted but blocked by its dependency build-approval guard; the equivalent direct commands passed.
- [x] Independently inspect `git diff main...HEAD`; verify only declared Canvas files/tests changed and rerun all focused contracts.
- [x] Record the accepted manual `prepare_context.py` fallback, post-edit impact, test counts, build result, review findings and remaining manual UI acceptance.
- [x] Commit workflow evidence and plan, push `codex/canvas-growth-zoom-minimap-tags`, and report the root cause, files, tests, branch and TV evidence paths.

## Self-review

- Text overflow, zoom bounds, minimap center, tag classification/color projection and layer removal each have a dedicated task.
- No internal z-index data is removed; only visible actions are removed.
- Existing image tags remain compatible while generic node tags gain a minimal editor and minimap projection.
- The only known environment fallback is the unavailable `prepare_context.py`; it is recorded rather than hidden.
