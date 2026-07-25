# zeroxB Integrated Canvas Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the Windows-only zeroxB MVP as a permanent, canvas-first workspace with viewport-normalized content sizing, solid non-overlapping blocks, linked notes and a screen-space AI chat HUD, while completing the earlier local-memory retrieval, reversible AI management/editing, AI overlay, evidence navigation, linear browsing and recovery requirements.

**Architecture:** Keep `CanvasDocument` as the authoritative user-authored graph, move geometry rules into pure canvas policy modules, and keep screen-space shell/HUD state outside the document. Store AI-derived tags/relations, retrieval anchors and AI transactions in separate SQLite tables. Route every AI mutation through one permission/transaction gateway, and route every personal-memory answer through a current-canvas retrieval service that returns evidence anchors. The permanent shell owns left navigation, a continuously mounted center canvas, an optional right document editor and the bottom chat HUD without allowing chat or editor state to recreate the canvas.

**Tech Stack:** Tauri 2, Next.js 15 static output, React 19, TypeScript 5, Zustand 5, React Flow (`@xyflow/react`), Tauri SQL/SQLite, Tauri Store, OpenAI-compatible APIs/Ollama, existing local RAG stack, Node test runner, Rust/Cargo, Windows NSIS.

---

## Scope and precedence

This plan is the implementation authority for the following approved documents:

- `docs/superpowers/specs/2026-07-24-huabu-product-design.md`
- `docs/superpowers/plans/2026-07-24-huabu-implementation-roadmap.md`
- `docs/superpowers/specs/2026-07-25-viewport-normalized-content-scaling-design.md`
- `docs/superpowers/specs/2026-07-25-solid-canvas-block-collision-design.md`
- `docs/superpowers/specs/2026-07-25-canvas-shell-chat-hud-design.md`

Later approved specifications override earlier UI or geometry wording:

1. The permanent collapsible left sidebar and optional right document panel supersede the early statement that no sidebar may remain visible. The retained principle is “no extra permanent analytics/status panels”; both work panels can collapse and the canvas remains central.
2. Batch ingest uses deterministic non-overlapping vertical placement with a 6-screen-pixel gap, not the earlier 28-pixel overlapping cascade.
3. The AI transcript is a screen-space HUD attached to the bottom composer, not a canvas node and not a right-side permanent chat panel.
4. Solid blocks never nest. Groups remain non-obstacle backgrounds whose referenced entity children move as a rigid set.

The imported/rebranded foundation is complete and must not be repeated. Preserve the current relation gestures, relation path editor, black dot-grid background, middle-button panning, right-drag partial-overlap selection, AI preview components and existing editor/chat rendering unless a task below explicitly replaces their orchestration.

## Delivery invariants

- Windows 10/11 only; do not add mobile, macOS, Linux or web distribution work.
- Local editing, search and canvas navigation continue without a model or network.
- Never write API credentials into source, SQLite, logs, fixtures or screenshots. Credential migration is one-way into Windows Credential Manager.
- User nodes and manual relations remain separate from AI-derived tags and relations.
- Management mode cannot mutate user text, geometry or manual relations. Editing mode is temporary, explicit and preview-first.
- One user gesture creates at most one manual history checkpoint. One AI proposal creates at most one atomic AI transaction.
- No user-facing export command is introduced. Internal snapshots and backup/restore are allowed.
- No model, account or cloud service is required to open or edit a canvas. Existing optional file-sync code may remain, but canvas AI data, credentials and recovery journals are local by default and are never silently enrolled in sync.
- Every content size, collision threshold and placement decision uses one captured `ViewportSnapshot` per operation.
- All Chinese/non-ASCII reads and writes follow the installed `fixed-io-encoding` baseline.

## Target module map

| Concern | Primary files |
|---|---|
| Viewport sizing | `src/lib/canvas/viewport-sizing.ts`, `src/types/canvas.ts`, `src/app/core/main/canvas/canvas-editor.tsx`, `src/app/core/main/canvas/canvas-footer.tsx` |
| Collision and placement | `src/lib/canvas/collision-policy.ts`, `src/lib/canvas/spatial-index.ts`, `src/lib/canvas/placement-policy.ts`, `canvas-editor.tsx` |
| Node visuals and rich media | `src/app/core/main/canvas/nodes/canvas-nodes.tsx`, `canvas-node-style-menu.tsx`, `src/lib/canvas/content-ingest.ts` |
| Permanent workspace | `src/app/core/main/page.tsx`, `src/app/core/main/canvas/canvas-workspace.tsx`, `src/stores/sidebar.ts`, `editor-layout.tsx` |
| Linked notes | `src/lib/canvas/note-reference.ts`, `src/app/core/main/mark/mark-item.tsx`, `src/stores/mark.ts`, `canvas-editor.tsx` |
| Chat source context/HUD | `src/db/chats.ts`, `src/stores/chat.ts`, `src/lib/chat/canvas-context.ts`, `src/app/core/main/chat/canvas-chat-hud.tsx` |
| AI mutation safety | `src/lib/canvas/ai-permission.ts`, `src/lib/canvas/ai-transaction.ts`, `src/db/canvas-ai-transactions.ts`, `canvas-tools.ts` |
| AI overlay | `src/lib/canvas/ai-overlay.ts`, `src/db/canvas-ai-overlay.ts`, `src/stores/canvas-ai.ts` |
| Retrieval/navigation | `src/lib/canvas/knowledge-extraction.ts`, `src/lib/canvas/canvas-retrieval.ts`, `src/db/canvas-index.ts`, `canvas-evidence-navigator.tsx` |
| Linear/saved views | `src/lib/canvas/linear-view.ts`, `src/db/canvas-views.ts`, `src/app/core/main/canvas/canvas-linear-view.tsx` |
| Recovery/security | `src/lib/security/*`, `src/db/workspace-recovery.ts`, `src-tauri/src/*` |

## Phase A — Geometry and interaction foundation

### Task 1: Add viewport snapshots and deterministic size conversion

**Files:**

- Create: `src/lib/canvas/viewport-sizing.ts`
- Modify: `src/types/canvas.ts`
- Modify: `src/lib/canvas/templates.ts`
- Modify: `src/app/core/main/canvas/canvas-footer.tsx`
- Test: `scripts/tests/canvas-viewport-sizing.test.mjs`

- [ ] **Step 1: Write failing conversion and normalization tests**

  Cover 65% initial zoom, the 10%–600% clamp, four-decimal canvas conversion, two-decimal display conversion, `contentScale`, finite numeric font sizes and a single immutable snapshot per operation.

  ```js
  test('screen dimensions round-trip through one captured 65% snapshot', () => {
    const snapshot = captureViewportSnapshot({ x: 12, y: 8, zoom: 0.65 })
    assert.deepEqual(screenSizeToCanvas({ width: 260, height: 130 }, snapshot), {
      width: 400,
      height: 200,
    })
    assert.deepEqual(canvasSizeToScreen({ width: 400, height: 200 }, snapshot), {
      width: 260,
      height: 130,
    })
    assert.equal(contentScaleForZoom(snapshot.zoom), 1.5385)
    assert.ok(Object.isFrozen(snapshot))
  })
  ```

- [ ] **Step 2: Run `node --experimental-strip-types --test scripts/tests/canvas-viewport-sizing.test.mjs`**

  Expected: FAIL because `viewport-sizing.ts` does not exist.

- [ ] **Step 3: Implement the pure sizing contract**

  Export exactly these entry points:

  ```ts
  export const INITIAL_CANVAS_ZOOM = 0.65
  export const MIN_CANVAS_ZOOM = 0.1
  export const MAX_CANVAS_ZOOM = 6

  export interface ViewportSnapshot {
    x: number
    y: number
    zoom: number
    capturedAt: number
  }

  export function captureViewportSnapshot(viewport: CanvasViewport): Readonly<ViewportSnapshot>
  export function screenSizeToCanvas(size: CanvasSize, snapshot: ViewportSnapshot): CanvasSize
  export function canvasSizeToScreen(size: CanvasSize, snapshot: ViewportSnapshot): CanvasSize
  export function screenDistanceToCanvas(value: number, snapshot: ViewportSnapshot): number
  export function contentScaleForZoom(zoom: number): number
  export function normalizeCanvasFontSize(value: unknown, fallback?: number): number
  ```

  Use `round4(screen / capturedZoom)`, `round2(canvas * zoom)`, and clamp zoom before division. Add `CanvasSize` to `src/types/canvas.ts`, change `fontSize?: 13 | 15 | 18 | 24` to `fontSize?: number`, add optional `contentScale?: number`, and normalize non-finite legacy values without rewriting otherwise valid documents. `contentScale` clamps to `0.1667–10`; a missing/invalid legacy value renders as `1` without rewriting the document.

- [ ] **Step 4: Apply the new defaults without rewriting imports**

  Set blank/template canvases and `DEFAULT_CANVAS_DOCUMENT.viewport.zoom` to `0.65`. Change the footer slider to `min={0.1}`, `max={6}`, and a stable step no larger than `0.05`. Preserve a full imported `CanvasDocument.viewport` and node dimensions exactly.

- [ ] **Step 5: Run the focused test and `pnpm exec tsc --noEmit`**

  Expected: PASS; no union-cast remains in `canvas-node-style-menu.tsx` consumers.

- [ ] **Step 6: Commit**

  ```powershell
  git add src/lib/canvas/viewport-sizing.ts src/types/canvas.ts src/lib/canvas/templates.ts src/app/core/main/canvas/canvas-footer.tsx scripts/tests/canvas-viewport-sizing.test.mjs
  git commit -m "feat(canvas): normalize content sizing to viewport"
  ```

### Task 2: Route every direct creation path through one captured viewport

**Files:**

- Modify: `src/lib/canvas/content-ingest.ts`
- Modify: `src/lib/canvas/operations.ts`
- Modify: `src/app/core/main/canvas/canvas-editor.tsx`
- Modify: `src/app/core/main/canvas/canvas-node-style-menu.tsx`
- Test: `scripts/tests/canvas-content-ingest.test.mjs`
- Test: `scripts/tests/canvas-creation-sizing.test.mjs`

- [ ] **Step 1: Replace the old ingest expectations with failing viewport-aware cases**

  Assert that drawn blocks, pasted text, links, files, images, pickers and external drops capture the zoom at pointer/paste/drop start and convert their screen-intent size once. Assert that internal paste/duplicate preserves stored canvas dimensions. Assert that full-canvas JSON/Mermaid import preserves imported geometry.

- [ ] **Step 2: Add explicit draft and AI sizing APIs**

  ```ts
  export type CanvasIngestDraft =
    | { kind: 'text'; text: string; screenSize: CanvasSize }
    | { kind: 'link'; url: string; label: string; screenSize: CanvasSize }
    | { kind: 'image'; file: File; label: string; screenSize: CanvasSize }
    | { kind: 'file'; file: File; label: string; screenSize: CanvasSize }
    | { kind: 'pdf'; file: File; label: string; screenSize: CanvasSize }
    | { kind: 'video'; file?: File; url?: string; label: string; screenSize: CanvasSize }

  export function materializeIngestDraft(
    draft: CanvasIngestDraft,
    snapshot: ViewportSnapshot,
  ): MaterializedCanvasDraft

  export function resolveAiNodeSize(input: {
    requestedType: CanvasNodeType
    requestedSize?: CanvasSize
    targetNode?: CanvasNode
    nearbySameType: CanvasNode[]
  }): CanvasSize
  ```

  `resolveAiNodeSize` must ignore the camera zoom, prefer the target node, then the median size of nearby same-type nodes, then the 100%-view fallback.

- [ ] **Step 3: Integrate captured snapshots in `canvas-editor.tsx`**

  Extend draw, paste, drop, picker and external-ingest session objects with `viewport: ViewportSnapshot`. Do not call `getViewport()` again during the same operation. Store exactly the converted width/height, converted default font size and `contentScale = round4(1 / capturedZoom)`. Render card icons, padding and media/text gaps through this persisted content scale; later camera zoom must not recalculate or rewrite it. Resizing an existing outer frame must not change its font size, image content or `contentScale`.

- [ ] **Step 4: Normalize font editing**

  Capture a style-edit viewport snapshot when the menu opens. Display `round2(actualCanvasFontSize × capturedZoom)` even when that value is outside 8–96px. Keep the existing four presets as screen-observation shortcuts; a submitted screen value must be finite and within 8–96px, then persist `round4(screenValue / capturedZoom)`. Mixed multi-selection displays “混合” and applies one converted actual value to all selected text-capable nodes. Invalid submission preserves the old values and writes no history.

- [ ] **Step 5: Run focused tests, the canvas suite and typecheck**

  ```powershell
  node --experimental-strip-types --test scripts/tests/canvas-content-ingest.test.mjs scripts/tests/canvas-creation-sizing.test.mjs
  pnpm test:canvas
  pnpm exec tsc --noEmit
  ```

  Expected: all PASS.

- [ ] **Step 6: Commit**

  ```powershell
  git add src/lib/canvas/content-ingest.ts src/lib/canvas/operations.ts src/app/core/main/canvas/canvas-editor.tsx src/app/core/main/canvas/canvas-node-style-menu.tsx scripts/tests/canvas-content-ingest.test.mjs scripts/tests/canvas-creation-sizing.test.mjs
  git commit -m "feat(canvas): apply captured zoom to content creation"
  ```

### Task 3: Implement pure solid-entity collision and snapping policies

**Files:**

- Create: `src/lib/canvas/collision-policy.ts`
- Create: `src/lib/canvas/spatial-index.ts`
- Test: `scripts/tests/canvas-collision-policy.test.mjs`
- Test: `scripts/tests/canvas-spatial-index.test.mjs`

- [ ] **Step 1: Write failing table-driven geometry tests**

  Cover entity classification, 6px safety expansion, 0.25px epsilon, 8px snap entry, 14px snap break, independent x/y snap state, deterministic ID tie-breaking, swept AABB earliest contact, four-pass axis sliding, rigid multi-select rectangles, finite-number rejection and index version changes.

- [ ] **Step 2: Run the focused tests**

  Expected: FAIL because the modules do not exist.

- [ ] **Step 3: Implement pure collision types and helpers**

  ```ts
  export const SAFETY_GAP_SCREEN = 6
  export const SNAP_ENTRY_SCREEN = 8
  export const SNAP_BREAK_SCREEN = 14
  export const COLLISION_EPSILON_SCREEN = 0.25

  export interface CollisionThresholds {
    safetyGap: number
    snapEntry: number
    snapBreak: number
    epsilon: number
  }

  export function thresholdsForSnapshot(snapshot: ViewportSnapshot): CollisionThresholds
  export function isSolidCanvasNode(node: CanvasNode): boolean
  export function normalizeAabb(rect: CanvasRect): CanvasRect | null
  export function conflicts(candidate: CanvasRect, obstacle: CanvasRect, thresholds: CollisionThresholds): boolean
  export function resolveActiveEdgeSnap(input: ActiveEdgeSnapInput): ActiveEdgeSnapResult
  export function sweepRigidSet(input: SweepRigidSetInput): SweepRigidSetResult
  export function scoreLegacyConflicts(input: LegacyConflictInput): LegacyConflictScore
  ```

  Decorative `freehand` and `group` nodes are not obstacles. Relations are never passed as nodes. Unknown future card types are solid unless registered as decorative.

- [ ] **Step 4: Implement a non-persistent versioned spatial index**

  `CanvasSpatialIndex` stores `{ id, rect, geometryVersion }`, supports `rebuild`, `upsert`, `remove`, `query`, and exposes a monotonically increasing `version`. A simple uniform-grid or RBush-like in-repo implementation is acceptable; do not add a dependency unless profiling proves necessary.

- [ ] **Step 5: Run focused tests and typecheck**

  Expected: PASS, including fast movement that cannot tunnel through a one-pixel-wide target corridor.

- [ ] **Step 6: Commit**

  ```powershell
  git add src/lib/canvas/collision-policy.ts src/lib/canvas/spatial-index.ts scripts/tests/canvas-collision-policy.test.mjs scripts/tests/canvas-spatial-index.test.mjs
  git commit -m "feat(canvas): add solid entity collision policies"
  ```

### Task 4: Implement deterministic nearest-free placement

**Files:**

- Create: `src/lib/canvas/placement-policy.ts`
- Modify: `src/lib/canvas/content-ingest.ts`
- Test: `scripts/tests/canvas-placement-policy.test.mjs`
- Test: `scripts/tests/canvas-content-ingest.test.mjs`

- [ ] **Step 1: Write failing placement tests**

  Cover original-position success, vertical batches with a 6-screen-pixel gap, rigid-copy relative geometry, 32-screen-pixel repeat offsets, up/right/down/left tie order, node-ID tie order, 2,400px radius, 4,096 candidate cap, resource-failure compaction and duplicate rejection when the source set already overlaps.

- [ ] **Step 2: Implement the deterministic best-first search**

  ```ts
  export interface PlacementResult {
    status: 'placed' | 'no-space' | 'invalid-source'
    translation?: { x: number; y: number }
    checkedCandidates: number
  }

  export function stackIngestDrafts(
    drafts: MaterializedCanvasDraft[],
    snapshot: ViewportSnapshot,
  ): PositionedCanvasDraft[]

  export function findNearestFreePlacement(input: {
    members: Array<{ id: string; rect: CanvasRect }>
    obstacles: Array<{ id: string; rect: CanvasRect }>
    targetTranslation: { x: number; y: number }
    snapshot: ViewportSnapshot
    maxScreenRadius?: 2400
    maxCandidates?: 4096
  }): PlacementResult
  ```

- [ ] **Step 3: Remove the 28px cascade helper**

  Delete `offsetIngestDrafts` or make it a compatibility wrapper over `stackIngestDrafts`; no call site may retain diagonal overlap placement.

- [ ] **Step 4: Run focused tests and `pnpm test:canvas`**

  Expected: PASS and no assertion mentions the old 28px cascade.

- [ ] **Step 5: Commit**

  ```powershell
  git add src/lib/canvas/placement-policy.ts src/lib/canvas/content-ingest.ts scripts/tests/canvas-placement-policy.test.mjs scripts/tests/canvas-content-ingest.test.mjs
  git commit -m "feat(canvas): place new blocks in deterministic free space"
  ```

### Task 5: Enforce collision sessions in draw, resize, move, group and paste

**Files:**

- Modify: `src/app/core/main/canvas/canvas-editor.tsx`
- Modify: `src/app/core/main/canvas/nodes/canvas-nodes.tsx`
- Modify: `src/types/canvas.ts`
- Test: `scripts/tests/canvas-editor-collision-contract.test.mjs`
- Test: `scripts/tests/canvas-collision-sessions.test.mjs`

- [ ] **Step 1: Add failing operation-session tests**

  Assert that invalid draw release creates nothing, invalid resize restores original geometry, normal movement slides without tunneling, multi-select preserves relative positions, group children use individual rectangles, stale index cancellation accepts the latest authoritative document and each successful gesture pushes one checkpoint.

- [ ] **Step 2: Add transient editor-only session state**

  ```ts
  type GeometrySession =
    | DrawGeometrySession
    | ResizeGeometrySession
    | MoveGeometrySession

  interface GeometrySessionBase {
    pointerId: number
    viewport: ViewportSnapshot
    indexVersion: number
    baselineDocumentRevision: number
    originalGeometry: Map<string, CanvasRect>
    lastAcceptedGeometry: Map<string, CanvasRect>
    baselineConflictPairs: Set<string>
  }
  ```

  Keep `invalid`, `snapGuides`, `legacyConflictIds` and selection-glow flags outside `CanvasNodeData`, serialized history and the database.

- [ ] **Step 3: Replace direct React Flow geometry acceptance**

  Intercept position and dimension changes before committing them to the controlled node state. Use the spatial index for broad phase and pure collision policy for exact checks. Rebuild/increment the index after load, create, move, resize, delete, undo, redo and document replacement.

  Draw and resize use independent x/y soft snap: enter within 8 screen pixels, stop at the 6-pixel safety boundary, and break only after the raw pointer crosses the snap point by 14 pixels. Breaking is permitted but produces the red invalid preview while overlapping. Invalid draw release creates nothing; invalid resize release restores the session-start geometry and writes no checkpoint.

- [ ] **Step 4: Implement stale-authority cancellation**

  Before release, validate against the latest index. If the active node received an external geometry update, cancel the local session and keep the external geometry. If only obstacles changed, accept only a still-legal candidate; otherwise restore the latest authoritative node geometry, not the session-start clone.

  For legacy conflicts, capture the unordered `baselineConflictPairs` involving the active rigid set. A candidate may contain only a subset of those pair identities, may introduce no new identity, and each retained pair’s MTD may not increase between accepted previews. Final commit requires the lexicographic score `(pairCount, round4(sumMTD))` to strictly decrease or reach zero. Internal conflicts inside an unchanged rigid selection do not block its movement, but external conflict MTD may not increase.

- [ ] **Step 5: Integrate paste, duplicate, picker and external drop**

  Run materialized drafts through `findNearestFreePlacement`, show the 120ms placement preview, revalidate against the newest index and only then push history/add nodes. Clean up newly persisted resources on placement failure.

- [ ] **Step 6: Run the focused tests, canvas suite and typecheck**

  Expected: PASS with no direct unvalidated `position`/`dimensions` mutation path for solid nodes.

- [ ] **Step 7: Commit**

  ```powershell
  git add src/app/core/main/canvas/canvas-editor.tsx src/app/core/main/canvas/nodes/canvas-nodes.tsx src/types/canvas.ts scripts/tests/canvas-editor-collision-contract.test.mjs scripts/tests/canvas-collision-sessions.test.mjs
  git commit -m "feat(canvas): enforce collision-safe geometry sessions"
  ```

### Task 6: Apply selected, invalid, snap and legacy-conflict visuals

**Files:**

- Create: `src/app/core/main/canvas/canvas-geometry-overlays.tsx`
- Modify: `src/app/core/main/canvas/nodes/canvas-nodes.tsx`
- Modify: `src/app/core/main/canvas/canvas-node-style-menu.tsx`
- Modify: `src/app/core/main/canvas/canvas-editor.tsx`
- Test: `scripts/tests/canvas-node-visual-contract.test.mjs`

- [ ] **Step 1: Add failing visual contract assertions**

  Assert the exact colors `#F7FBFF`, `#66D9FF`, `#FF5D5D`, `#F2B84B`, text default `#F2F1ED`, text color `#202321`, border `#D8D6CF`, and a screen-compensated selection treatment at 10%, 65%, 100% and 600%.

- [ ] **Step 2: Implement visual priority and zoom compensation**

  Render selection as 1px cold-white inner stroke, 2px cyan outer stroke and 12px/32% cyan glow. Invalid red overrides normal preview. Legacy conflict keeps an amber dashed inner stroke while selection adds the outer cyan glow. Render snap lines in a portal/viewport overlay and never persist them.

- [ ] **Step 3: Apply warm-white text defaults compatibly**

  New text blocks persist the new defaults. Legacy text blocks missing background use `#F2F1ED` at render time without document rewrite. User-saved transparency and custom colors always win.

- [ ] **Step 4: Run the visual contract, canvas suite and production build**

  Expected: PASS; production CSS contains no scale-dependent giant glow at 10% or hairline glow at 600%.

- [ ] **Step 5: Commit**

  ```powershell
  git add src/app/core/main/canvas/canvas-geometry-overlays.tsx src/app/core/main/canvas/nodes/canvas-nodes.tsx src/app/core/main/canvas/canvas-node-style-menu.tsx src/app/core/main/canvas/canvas-editor.tsx scripts/tests/canvas-node-visual-contract.test.mjs
  git commit -m "feat(canvas): clarify block selection and collision states"
  ```

## Phase B — Permanent workspace and linked content

### Task 7: Make the canvas a permanent center workspace

**Files:**

- Create: `src/app/core/main/canvas/canvas-workspace.tsx`
- Create: `src/lib/canvas/workspace-layout-policy.ts`
- Modify: `src/app/core/main/page.tsx`
- Modify: `src/app/core/main/editor/editor-layout.tsx`
- Modify: `src/stores/sidebar.ts`
- Modify: `src/app/core/main/left-sidebar.tsx`
- Test: `scripts/tests/canvas-workspace-layout.test.mjs`
- Test: `scripts/tests/canvas-shell-contract.test.mjs`

- [ ] **Step 1: Write failing shell-policy tests**

  Cover left default/limits `320/280–420px`, collapsed rail `48px`, right default/min/max `420/360px/55%`, canvas remaining width, narrow-window collapse order, persistence of widths/tabs and independence of `activeCanvasId` from `activeTabId`.

- [ ] **Step 2: Implement pure layout sizing and persisted UI preferences**

  ```ts
  export interface CanvasWorkspacePreferences {
    leftCollapsed: boolean
    leftWidth: number
    leftTab: 'files' | 'notes' | 'canvases'
    documentPanelCollapsed: boolean
    documentPanelWidth: number
  }

  export function normalizeWorkspaceLayout(
    preferences: Partial<CanvasWorkspacePreferences>,
    windowWidth: number,
  ): ResolvedWorkspaceLayout
  ```

  Persist preferences through Tauri Store. Do not enforce “one panel must remain” because the center canvas is always mounted and cannot be collapsed.

- [ ] **Step 3: Replace the canvas-tab conditional root**

  Delete `ImmersiveCanvasLayout` and the `isCanvasTabPath(activeTabId)` branch from `page.tsx`. `CanvasWorkspace` must render:

  ```tsx
  <WorkspaceShell>
    <CollapsibleLeftRail><LeftSidebar /></CollapsibleLeftRail>
    <PermanentCanvas canvasId={activeCanvasId} />
    <CollapsibleDocumentPanel><EditorLayout mode="documents-only" /></CollapsibleDocumentPanel>
    <CanvasChatHud />
  </WorkspaceShell>
  ```

  A canvas selection updates only `useCanvasStore.activeCanvasId`; file/record tabs remain in the right panel and may no longer create canvas editor tabs.

- [ ] **Step 4: Preserve the React Flow instance across panel changes**

  Key `CanvasEditor` by canvas ID only. Width, collapse, HUD and tab changes must call container resize/fit bounds as needed without remounting the active canvas. Preserve viewport, selection, open relation editor and in-progress safe pointer state.

- [ ] **Step 5: Run shell tests, canvas tests and typecheck**

  Expected: PASS; the source contract proves `page.tsx` has one permanent canvas path and no right-side `<Chat />` panel.

- [ ] **Step 6: Commit**

  ```powershell
  git add src/app/core/main/canvas/canvas-workspace.tsx src/lib/canvas/workspace-layout-policy.ts src/app/core/main/page.tsx src/app/core/main/editor/editor-layout.tsx src/stores/sidebar.ts src/app/core/main/left-sidebar.tsx scripts/tests/canvas-workspace-layout.test.mjs scripts/tests/canvas-shell-contract.test.mjs
  git commit -m "feat(shell): keep the canvas permanently mounted"
  ```

### Task 8: Add note previews and stable drag-to-canvas references

**Files:**

- Create: `src/lib/canvas/note-reference.ts`
- Create: `src/app/core/main/mark/mark-preview-popover.tsx`
- Modify: `src/app/core/main/mark/mark-item.tsx`
- Modify: `src/app/core/main/canvas/canvas-editor.tsx`
- Modify: `src/app/core/main/canvas/nodes/canvas-nodes.tsx`
- Modify: `src/types/canvas.ts`
- Modify: `src/stores/mark.ts`
- Test: `scripts/tests/canvas-note-reference.test.mjs`
- Test: `scripts/tests/canvas-note-drag-contract.test.mjs`

- [ ] **Step 1: Write failing note-reference tests**

  Cover stable `record:<markId>` IDs, 400ms hover/focus opening, 160ms leave delay, drag suppressing click, multiple references, cached title/excerpt/time refresh, refresh failure retaining cache, source deletion producing `missing`, double-click opening the existing right-panel record tab, and reference deletion not deleting the source.

- [ ] **Step 2: Add canonical reference metadata**

  ```ts
  export interface NoteReferenceData {
    sourceNoteId: string
    sourceTitle: string
    sourceExcerpt: string
    sourceUpdatedAt: number
    sourceStatus: 'available' | 'missing'
    sourceSyncStatus?: 'current' | 'stale'
  }

  export const NOTE_REFERENCE_MIME = 'application/x-zeroxb-note-reference'
  export function noteReferenceId(markId: number): string // `record:${markId}`
  export function createNoteReferenceSnapshot(mark: Mark): NoteReferenceData
  export function refreshNoteReferences(nodes: CanvasNode[], marks: Mark[]): CanvasNode[]
  ```

  Extend `CanvasNodeData` with these optional fields. The reference stores no full note body.

- [ ] **Step 3: Implement accessible preview and drag separation**

  `MarkItem` starts one timer on hover or keyboard focus, keeps the preview open while moving into the popover, and cancels it at drag start. Add the custom MIME alongside existing text/JSON drag data. `Enter` opens the right document panel; drag only creates a reference preview.

- [ ] **Step 4: Create the reference through collision-safe placement**

  `canvas-editor.tsx` recognizes the custom MIME before generic text/JSON, captures a viewport snapshot, creates a note draft, uses the nearest-free placement policy and commits one node/history checkpoint. Failed reads or no-space results create nothing.

- [ ] **Step 5: Batch-refresh references**

  Subscribe once to mark-store changes, group nodes by `sourceNoteId`, refresh all matching caches in one pass and debounce document persistence. Missing sources retain the last cache and render “来源已不存在” with relink/delete actions.

- [ ] **Step 6: Run focused tests, canvas suite and typecheck**

  Expected: PASS.

- [ ] **Step 7: Commit**

  ```powershell
  git add src/lib/canvas/note-reference.ts src/app/core/main/mark/mark-preview-popover.tsx src/app/core/main/mark/mark-item.tsx src/app/core/main/canvas/canvas-editor.tsx src/app/core/main/canvas/nodes/canvas-nodes.tsx src/types/canvas.ts src/stores/mark.ts scripts/tests/canvas-note-reference.test.mjs scripts/tests/canvas-note-drag-contract.test.mjs
  git commit -m "feat(canvas): link notes into the permanent workspace"
  ```

### Task 9: Complete first-version rich-media node ingestion

**Files:**

- Modify: `src/types/canvas.ts`
- Modify: `src/lib/canvas/content-ingest.ts`
- Modify: `src/app/core/main/canvas/nodes/canvas-nodes.tsx`
- Modify: `src/app/core/main/canvas/canvas-editor.tsx`
- Create: `src/app/core/main/canvas/nodes/pdf-canvas-node.tsx`
- Create: `src/app/core/main/canvas/nodes/video-canvas-node.tsx`
- Create: `src/app/core/main/canvas/nodes/web-preview-canvas-node.tsx`
- Test: `scripts/tests/canvas-rich-media-ingest.test.mjs`

- [ ] **Step 1: Add failing classification tests**

  Cover text, image, PDF, local video, video URL, general attachment, web link and explicit web-preview choice. Archive files remain attachments and expose only filename/directory/user notes; no deep extraction. Video exposes title/description/subtitles/user notes and does not promise transcription.

- [ ] **Step 2: Extend node types and discriminated metadata**

  Add `pdf`, `video` and `web-preview` node types plus finite width/height. Keep local paths workspace-relative where possible. Never fetch a web preview automatically merely because a URL is pasted; show the existing lightweight choice UI for link versus preview/media.

- [ ] **Step 3: Implement renderers with failure isolation**

  PDF and video renderers load lazily, show a non-destructive broken-asset state and allow opening the source. Web preview treats fetched content as untrusted display data and never passes it to the operation gateway as instructions.

- [ ] **Step 4: Route all media through sizing, persistence cleanup and placement**

  If file persistence succeeds but node creation fails, delete only the newly created asset for that draft. A failed item does not reorder successful batch items.

- [ ] **Step 5: Run focused tests, canvas suite, typecheck and build**

  Expected: PASS.

- [ ] **Step 6: Commit**

  ```powershell
  git add src/types/canvas.ts src/lib/canvas/content-ingest.ts src/app/core/main/canvas/nodes src/app/core/main/canvas/canvas-editor.tsx scripts/tests/canvas-rich-media-ingest.test.mjs
  git commit -m "feat(canvas): support first-version rich media blocks"
  ```

## Phase C — Global AI HUD and safe conversation state

### Task 10: Persist source-canvas metadata on every chat message

**Files:**

- Create: `src/lib/chat/canvas-context.ts`
- Modify: `src/db/chats.ts`
- Modify: `src/stores/chat.ts`
- Modify: `src/app/core/main/chat/chat-send.tsx`
- Modify: `src/app/core/main/chat/chat-content.tsx`
- Test: `scripts/tests/canvas-chat-context.test.mjs`
- Test: `scripts/tests/canvas-chat-db-contract.test.mjs`

- [ ] **Step 1: Write failing context and migration tests**

  Cover current canvas snapshot at send time, inherited AI-response context, optional evidence node IDs, old rows as `null`, renamed canvas current-title display with historical-title fallback, deleted source display, and no deletion/reordering of old chats.

- [ ] **Step 2: Add one nullable JSON column with tolerant parsing**

  ```ts
  export interface CanvasChatContext {
    sourceCanvasId: string | null
    sourceCanvasTitle: string | null
    sourceNodeIds?: string[]
    sentAt: number
  }

  export interface Chat {
    // existing fields
    canvasContext?: string | null
    completionState?: 'complete' | 'interrupted' | 'failed'
  }
  ```

  Add idempotent migrations for `canvasContext` and `completionState`, update every insert/update/sync query, and parse invalid JSON as “来源未记录” without throwing.

- [ ] **Step 3: Capture context before asynchronous retrieval/send**

  `ChatSend` reads `activeCanvasId`, canvas title and `Date.now()` once before inserting the user message. The placeholder/system reply receives the same context. Later evidence navigation may merge validated `sourceNodeIds` into that context without changing the captured canvas.

- [ ] **Step 4: Render low-noise source chips**

  Hide the chip when its canvas is current. For another existing canvas, clicking switches `activeCanvasId` and focuses `sourceNodeIds`. For missing/unknown sources, show a disabled status without blocking chat.

- [ ] **Step 5: Run focused tests, typecheck and build**

  Expected: PASS.

- [ ] **Step 6: Commit**

  ```powershell
  git add src/lib/chat/canvas-context.ts src/db/chats.ts src/stores/chat.ts src/app/core/main/chat/chat-send.tsx src/app/core/main/chat/chat-content.tsx scripts/tests/canvas-chat-context.test.mjs scripts/tests/canvas-chat-db-contract.test.mjs
  git commit -m "feat(chat): retain source canvas context"
  ```

### Task 11: Add serial generation cancellation transactions

**Files:**

- Create: `src/lib/chat/generation-transaction.ts`
- Modify: `src/stores/chat.ts`
- Modify: `src/app/core/main/chat/chat-send.tsx`
- Modify: `src/app/core/main/chat/history-dropdown.tsx`
- Test: `scripts/tests/canvas-chat-generation-transaction.test.mjs`

- [ ] **Step 1: Write failing transaction-order tests**

  Cover switch, new, temporary and delete-current while streaming; delete-non-active without stream cancellation; abort failure; partial-response persistence; repeated clicks; and no duplicate conversations/orphan messages.

- [ ] **Step 2: Move abort ownership from a component ref into the chat store boundary**

  ```ts
  export interface ActiveGeneration {
    conversationId: number
    assistantChatId: number
    abort: () => Promise<void>
    closed: Promise<void>
  }

  export function createGenerationTransactionCoordinator(deps: {
    getActive: () => ActiveGeneration | null
    persistInterrupted: (generation: ActiveGeneration) => Promise<void>
  }): {
    stopAndSwitch(id: number): Promise<void>
    stopAndCreate(options: { temporary: boolean }): Promise<void>
    stopAndDelete(id: number): Promise<void>
  }
  ```

  Serialize commands through one promise chain. Sequence is abort request → wait for stream close → persist received text with `completionState: 'interrupted'` → target action.

- [ ] **Step 3: Integrate confirmation and recovery**

  The history UI shows “停止生成并切换/删除”. Any failed step keeps the current conversation, received text and active target IDs; it neither creates nor deletes the next conversation.

- [ ] **Step 4: Run focused tests and typecheck**

  Expected: PASS.

- [ ] **Step 5: Commit**

  ```powershell
  git add src/lib/chat/generation-transaction.ts src/stores/chat.ts src/app/core/main/chat/chat-send.tsx src/app/core/main/chat/history-dropdown.tsx scripts/tests/canvas-chat-generation-transaction.test.mjs
  git commit -m "feat(chat): serialize streaming conversation actions"
  ```

### Task 12: Build the screen-space transcript HUD and history popover

**Files:**

- Create: `src/app/core/main/chat/canvas-chat-hud.tsx`
- Create: `src/app/core/main/chat/canvas-chat-summary.tsx`
- Create: `src/app/core/main/chat/canvas-chat-history-popover.tsx`
- Modify: `src/app/core/main/chat/chat-content.tsx`
- Modify: `src/app/core/main/chat/chat-header.tsx`
- Modify: `src/app/core/main/chat/chat-input.tsx`
- Modify: `src/app/core/main/page.tsx`
- Test: `scripts/tests/canvas-chat-hud-policy.test.mjs`
- Test: `scripts/tests/canvas-chat-hud-contract.test.mjs`

- [ ] **Step 1: Write failing HUD policy tests**

  Cover collapsed latest user one-line/AI three-line deterministic clipping, expanded `min(42% visible canvas height, 560px)`, 360×420px history bounds, session-only collapsed default after restart, scroll-position preservation, `Esc`, outside click and wheel routing.

- [ ] **Step 2: Extract reusable chat rendering props**

  Make `ChatContent` accept a layout variant and scroller ID instead of reading fixed right-panel dimensions. Preserve Markdown, thinking, Agent, RAG, MCP, attachments, delete and message controls. Do not fork message rendering into a second implementation.

- [ ] **Step 3: Implement the HUD as a window-layer sibling of the canvas**

  Position it above the bottom composer with `pointer-events` only on interactive content. It must not receive React Flow transforms or exist in `CanvasDocument`. Expanded content scrolls internally; wheel propagation stops only inside the HUD.

- [ ] **Step 4: Implement summary and history behavior**

  Collapsed mode renders exact recent text, not model summaries. Expanded mode restores its per-conversation scroll position. History uses current `HistoryDropdown` capabilities inside a searchable 360×420px popover and calls the generation coordinator for protected actions.

- [ ] **Step 5: Verify render isolation**

  Add a development/test render counter proving chat token updates do not recreate `CanvasEditor`/React Flow. Use memoized selectors so only HUD subtrees subscribe to streaming text.

- [ ] **Step 6: Run HUD tests, canvas suite, typecheck and build**

  Expected: PASS.

- [ ] **Step 7: Commit**

  ```powershell
  git add src/app/core/main/chat/canvas-chat-hud.tsx src/app/core/main/chat/canvas-chat-summary.tsx src/app/core/main/chat/canvas-chat-history-popover.tsx src/app/core/main/chat/chat-content.tsx src/app/core/main/chat/chat-header.tsx src/app/core/main/chat/chat-input.tsx src/app/core/main/page.tsx scripts/tests/canvas-chat-hud-policy.test.mjs scripts/tests/canvas-chat-hud-contract.test.mjs
  git commit -m "feat(chat): render history in a canvas HUD"
  ```

### Task 13: Connect speech, TTS and the low-noise AI breathing state

**Files:**

- Create: `src/lib/chat/voice-session.ts`
- Create: `src/app/core/main/chat/canvas-ai-breath.tsx`
- Modify: `src/app/core/main/chat/canvas-chat-hud.tsx`
- Modify: `src/app/core/main/chat/chat-input.tsx`
- Modify: `src/app/core/main/chat/message-control/read-aloud-control.tsx`
- Modify: `src/lib/audio.ts`
- Modify: `src/stores/speech-recognition.ts`
- Test: `scripts/tests/canvas-voice-session.test.mjs`
- Test: `scripts/tests/canvas-ai-breath-contract.test.mjs`

- [ ] **Step 1: Write failing voice state-machine tests**

  Text prompts never auto-read. A microphone-origin prompt auto-reads the final answer exactly once. Starting speech, changing canvas/session, collapsing/closing HUD and a new playback stop the current TTS. Streaming does not speak partial tokens. TTS failure preserves text.

- [ ] **Step 2: Implement explicit prompt-origin state**

  ```ts
  export type PromptOrigin = 'keyboard' | 'microphone'
  export type AiBreathState = 'idle' | 'listening' | 'thinking' | 'retrieving' |
    'locating' | 'managing' | 'editing' | 'awaiting-confirmation' | 'complete' | 'failed'
  ```

  STT still fills the composer for user review; it does not auto-send. Associate `PromptOrigin` with the outgoing request, not with global microphone state.

- [ ] **Step 3: Replace the simple pulse with the stateful breath component**

  Use transform/opacity/blur only, respect `prefers-reduced-motion`, and keep all state/error controls in the dock. Do not add a voice panel.

- [ ] **Step 4: Reuse the current audio controller**

  `read-aloud-control.tsx` and auto-read share `stopCurrentAudio()` and one current playback owner. Canvas/session/HUD effects call the same stop path.

- [ ] **Step 5: Run focused tests, typecheck and build**

  Expected: PASS.

- [ ] **Step 6: Commit**

  ```powershell
  git add src/lib/chat/voice-session.ts src/app/core/main/chat/canvas-ai-breath.tsx src/app/core/main/chat/canvas-chat-hud.tsx src/app/core/main/chat/chat-input.tsx src/app/core/main/chat/message-control/read-aloud-control.tsx src/lib/audio.ts src/stores/speech-recognition.ts scripts/tests/canvas-voice-session.test.mjs scripts/tests/canvas-ai-breath-contract.test.mjs
  git commit -m "feat(chat): coordinate voice and AI breathing states"
  ```

## Phase D — Reversible AI memory system

### Task 14: Enforce management/edit permissions through an atomic AI gateway

**Files:**

- Create: `src/lib/canvas/ai-permission.ts`
- Create: `src/lib/canvas/ai-transaction.ts`
- Create: `src/db/canvas-ai-transactions.ts`
- Modify: `src/db/index.ts`
- Modify: `src/lib/canvas/operations.ts`
- Modify: `src/lib/agent/tools/canvas-tools.ts`
- Modify: `src/app/core/main/chat/agent-permission-mode.tsx`
- Modify: `src/app/core/main/canvas/canvas-editor.tsx`
- Test: `scripts/tests/canvas-ai-permission.test.mjs`
- Test: `scripts/tests/canvas-ai-transaction.test.mjs`

- [ ] **Step 1: Write a failing permission matrix**

  Management allows read, evidence focus and derived-overlay changes; it rejects source-node text/geometry/delete, manual relations and layout. Editing is explicit, session-scoped and expires on restart/timeout/security failure. Delete, overwrite and large movement always require confirmation.

- [ ] **Step 2: Define validated operations and decisions**

  ```ts
  export type CanvasAiMode = 'management' | 'editing'
  export type AiOperationDecision =
    | { status: 'allowed'; requiresConfirmation: boolean }
    | { status: 'denied'; reason: string }

  export function authorizeCanvasOperation(
    mode: CanvasAiMode,
    operation: ValidatedCanvasOperation,
  ): AiOperationDecision
  ```

  Parse unknown tool JSON into a strict discriminated union before authorization. Untrusted attachment/web text never enters this function as executable operations.

- [ ] **Step 3: Add a separate transaction ledger**

  Store transaction ID, mode, user instruction hash/redacted summary, model ID, timestamps, affected IDs, before/after/inverse patches and state (`previewed`, `approved`, `applied`, `rolled_back`, `failed`). Do not store API keys or raw sensitive values in logs.

- [ ] **Step 4: Route `canvas_apply_operations` through preview and atomic commit**

  Management writes only AI overlay operations. Editing emits the existing ghost preview plus impact summary. Approval revalidates collision, permission and current document revision in one database transaction; failure restores the before snapshot. Rollback is separate from manual undo and reverses the complete AI transaction.

- [ ] **Step 5: Run focused tests, canvas suite and typecheck**

  Expected: PASS; direct `store.updateDocument` is absent from the agent tool mutation path.

- [ ] **Step 6: Commit**

  ```powershell
  git add src/lib/canvas/ai-permission.ts src/lib/canvas/ai-transaction.ts src/db/canvas-ai-transactions.ts src/db/index.ts src/lib/canvas/operations.ts src/lib/agent/tools/canvas-tools.ts src/app/core/main/chat/agent-permission-mode.tsx src/app/core/main/canvas/canvas-editor.tsx scripts/tests/canvas-ai-permission.test.mjs scripts/tests/canvas-ai-transaction.test.mjs
  git commit -m "feat(ai): gate and rollback canvas mutations"
  ```

### Task 15: Store AI tags and relations in a separate derived overlay

**Files:**

- Create: `src/lib/canvas/ai-overlay.ts`
- Create: `src/db/canvas-ai-overlay.ts`
- Modify: `src/db/index.ts`
- Create: `src/stores/canvas-ai.ts`
- Create: `src/app/core/main/canvas/canvas-ai-overlay.tsx`
- Modify: `src/app/core/main/canvas/canvas-editor.tsx`
- Test: `scripts/tests/canvas-ai-overlay.test.mjs`

- [ ] **Step 1: Write failing normalization, confidence and suppression tests**

  Cover stable/free tags, the nine approved relation types, high-confidence auto-apply, medium candidate display, low retrieval-only state, source update → stale, user rejection → suppression and no equivalent regeneration.

- [ ] **Step 2: Implement separate persisted records**

  ```ts
  export interface AiTagRecord {
    id: string
    canvasId: string
    nodeId: string
    normalizedTagId: string
    label: string
    confidence: number
    reason: string
    model: string
    sourceRevision: string
    state: 'active' | 'candidate' | 'retrieval-only' | 'stale' | 'hidden'
  }
  ```

  Add an analogous `AiRelationRecord` with source/target/type/source excerpts and a suppression table keyed by normalized semantic identity. None of these records enter `CanvasDocument.edges`.

- [ ] **Step 3: Implement candidate recall and controlled LLM classification**

  Retrieve candidates through vector/entity/time similarity, filter with deterministic rules, then ask the model only to choose approved type/reason/confidence. Do not perform all-pairs LLM calls.

- [ ] **Step 4: Render as a toggleable overlay**

  Render AI relations/tags above the canvas graph with distinct source styling, confidence/candidate treatment and user feedback controls. Hiding/rebuilding the overlay never changes manual edges or manual history.

- [ ] **Step 5: Run focused tests, typecheck and build**

  Expected: PASS.

- [ ] **Step 6: Commit**

  ```powershell
  git add src/lib/canvas/ai-overlay.ts src/db/canvas-ai-overlay.ts src/db/index.ts src/stores/canvas-ai.ts src/app/core/main/canvas/canvas-ai-overlay.tsx src/app/core/main/canvas/canvas-editor.tsx scripts/tests/canvas-ai-overlay.test.mjs
  git commit -m "feat(ai): separate derived canvas tags and relations"
  ```

### Task 16: Build the current-canvas knowledge index and safe retrieval boundary

**Files:**

- Create: `src/lib/canvas/knowledge-extraction.ts`
- Create: `src/lib/canvas/canvas-retrieval.ts`
- Create: `src/lib/canvas/sensitive-content.ts`
- Create: `src/db/canvas-index.ts`
- Modify: `src/db/index.ts`
- Create: `src/stores/canvas-index.ts`
- Modify: `src/app/core/main/chat/chat-send.tsx`
- Modify: `src/lib/agent/tools/canvas-tools.ts`
- Test: `scripts/tests/canvas-knowledge-extraction.test.mjs`
- Test: `scripts/tests/canvas-retrieval.test.mjs`
- Test: `scripts/tests/canvas-sensitive-content.test.mjs`

- [ ] **Step 1: Write failing extraction and retrieval tests**

  Cover node/range anchors, text, reference excerpts, image OCR output, PDF/Office text, web snapshots, video metadata/subtitles/notes, attachment filename/directory/notes, extraction failure isolation, keyword + semantic + entity + time fusion, optional reranking and “没有找到” when evidence is insufficient.

- [ ] **Step 2: Persist recoverable anchors and jobs**

  ```ts
  export interface CanvasKnowledgeAnchor {
    id: string
    workspaceId: string
    canvasId: string
    nodeId: string
    attachmentId?: string
    startOffset: number
    endOffset: number
    nodePosition: { x: number; y: number }
    contentRevision: string
    plainText: string
    entities: string[]
    timeHints: string[]
    contentType: string
  }
  ```

  Store extraction jobs with pending/running/retry/complete states. A failed extractor never blocks saving the original node. Indexes are rebuildable from source content.

- [ ] **Step 3: Enforce current-canvas-only retrieval by default**

  Replace the generic workspace RAG call in canvas chat with `retrieveCanvasEvidence({ canvasId: capturedContext.sourceCanvasId, query })`. Previous messages from other canvases remain conversational context but their nodes cannot appear as current retrieval evidence. Cross-canvas search requires explicit user intent and a separate tool call.

- [ ] **Step 4: Redact before cloud requests**

  Detect credentials, API keys, passwords, identity numbers and user-marked sensitive nodes locally. Cloud-bound context replaces values with stable placeholders while retaining type and anchor identity. Local model mode may use raw text only when the local endpoint policy says the request does not leave the device.

- [ ] **Step 5: Run focused tests, typecheck and offline cases**

  Expected: PASS; disabling the model still leaves keyword search and evidence listing functional.

- [ ] **Step 6: Commit**

  ```powershell
  git add src/lib/canvas/knowledge-extraction.ts src/lib/canvas/canvas-retrieval.ts src/lib/canvas/sensitive-content.ts src/db/canvas-index.ts src/db/index.ts src/stores/canvas-index.ts src/app/core/main/chat/chat-send.tsx src/lib/agent/tools/canvas-tools.ts scripts/tests/canvas-knowledge-extraction.test.mjs scripts/tests/canvas-retrieval.test.mjs scripts/tests/canvas-sensitive-content.test.mjs
  git commit -m "feat(memory): retrieve evidence from the active canvas"
  ```

### Task 17: Add evidence navigation, linear browsing and saved filter views

**Files:**

- Create: `src/lib/canvas/evidence-navigation.ts`
- Create: `src/lib/canvas/linear-view.ts`
- Create: `src/db/canvas-views.ts`
- Modify: `src/db/index.ts`
- Create: `src/app/core/main/canvas/canvas-evidence-navigator.tsx`
- Create: `src/app/core/main/canvas/canvas-linear-view.tsx`
- Modify: `src/app/core/main/chat/chat-content.tsx`
- Modify: `src/app/core/main/canvas/canvas-editor.tsx`
- Test: `scripts/tests/canvas-evidence-navigation.test.mjs`
- Test: `scripts/tests/canvas-linear-view.test.mjs`

- [ ] **Step 1: Write failing navigation and graph-traversal tests**

  Cover saved pre-query viewport, confidence-gated auto-navigation, exact node/range focus, previous/next results, return to prior viewport, one/two-hop traversal, time/relevance/distance/manual ordering, AI/manual relation selection and no mutation of node positions.

- [ ] **Step 2: Implement evidence navigation state outside the document**

  ```ts
  export interface EvidenceNavigationSession {
    canvasId: string
    originViewport: CanvasViewport
    resultAnchorIds: string[]
    activeIndex: number
  }
  ```

  Clicking evidence collapses the answer HUD, switches the source canvas if necessary, animates to the node and highlights only the matched text range. Low confidence shows the candidate strip first.

- [ ] **Step 3: Implement read-only linear projections**

  `buildLinearProjection` consumes source nodes plus selected manual/AI relations and returns ordered references. It never copies node bodies or writes positions. The UI opens as a temporary view over the permanent canvas and every item can focus the original node.

- [ ] **Step 4: Persist saved filters, not copied content**

  Store name, canvas ID, tag/person/project/time filters, relation depth, relation-source toggles and sort mode. Reopening recomputes the view from current data.

- [ ] **Step 5: Run focused tests, canvas suite, typecheck and build**

  Expected: PASS.

- [ ] **Step 6: Commit**

  ```powershell
  git add src/lib/canvas/evidence-navigation.ts src/lib/canvas/linear-view.ts src/db/canvas-views.ts src/db/index.ts src/app/core/main/canvas/canvas-evidence-navigator.tsx src/app/core/main/canvas/canvas-linear-view.tsx src/app/core/main/chat/chat-content.tsx src/app/core/main/canvas/canvas-editor.tsx scripts/tests/canvas-evidence-navigation.test.mjs scripts/tests/canvas-linear-view.test.mjs
  git commit -m "feat(memory): navigate and read related canvas evidence"
  ```

## Phase E — Windows security, recovery and release

### Task 18: Move model secrets to Windows Credential Manager

**Files:**

- Create: `src-tauri/src/credential_store.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/Cargo.lock`
- Create: `src/lib/security/credentials.ts`
- Modify: `src/stores/setting.ts`
- Modify: `src/lib/ai/chat.ts`
- Modify: `src/lib/audio.ts`
- Test: `src-tauri/src/credential_store_tests.rs`
- Test: `scripts/tests/canvas-credential-boundary.test.mjs`

- [ ] **Step 1: Add failing Rust and source-boundary tests**

  Assert set/get/delete by opaque model-config ID, one-way migration from the existing settings value, missing-credential behavior, redacted diagnostics and absence of secret values in exported/synced settings JSON.

- [ ] **Step 2: Implement Tauri credential commands**

  Use the Windows Credential Manager through a maintained Rust crate or Win32 credential API. Store only an opaque credential reference in app settings. Never return credentials to UI code except for immediate request construction through the narrow bridge.

- [ ] **Step 3: Migrate existing settings safely**

  On first successful credential write, replace the settings value with its reference and persist. On failure, leave the old value untouched and show a local migration error; do not log it.

- [ ] **Step 4: Run Rust tests, typecheck and secret scans**

  ```powershell
  cargo test --locked --manifest-path src-tauri/Cargo.toml credential_store
  pnpm exec tsc --noEmit
  rg -n "apiKey|Authorization|Bearer" src scripts --glob '!**/*.map'
  ```

  Expected: tests PASS; review each scan match as code/config field names, never literal credentials.

- [ ] **Step 5: Commit**

  ```powershell
  git add src-tauri/src/credential_store.rs src-tauri/src/lib.rs src-tauri/Cargo.toml src-tauri/Cargo.lock src/lib/security/credentials.ts src/stores/setting.ts src/lib/ai/chat.ts src/lib/audio.ts src-tauri/src/credential_store_tests.rs scripts/tests/canvas-credential-boundary.test.mjs
  git commit -m "feat(security): protect model secrets on Windows"
  ```

### Task 19: Add crash-safe AI transactions and internal workspace recovery

**Files:**

- Create: `src/db/workspace-recovery.ts`
- Create: `src/lib/recovery/backup-policy.ts`
- Create: `src/lib/recovery/startup-recovery.ts`
- Create: `src/lib/recovery/workspace-path.ts`
- Modify: `src/db/index.ts`
- Modify: `src/app/core/main/canvas/canvas-startup-controller.tsx`
- Modify: `src/app/core/setting/file/page.tsx`
- Test: `scripts/tests/canvas-backup-policy.test.mjs`
- Test: `scripts/tests/canvas-startup-recovery.test.mjs`

- [ ] **Step 1: Write failing recovery tests**

  Cover WAL enablement, pending AI transaction rollback/finalization, migration snapshot before schema change, rotating incremental backups, recoverable trash, corrupt-index rebuild, disk-full attachment rejection, read-only fallback and no user-facing export action.

- [ ] **Step 2: Implement startup journal recovery**

  Initialize SQLite WAL, inspect incomplete transaction journal entries before stores load, and either finish an atomically committed transaction or restore its before checkpoint. Never expose a partially applied canvas.

  New installations resolve the default durable root to `文档\zeroxB\` with `workspace.db`, `assets`, `notes`, `thumbnails` and `backups`; configuration, logs and temporary cache remain under `%LOCALAPPDATA%\zeroxB\`. An existing installation keeps its current workspace until a verified checkpointed migration succeeds, so this task never strands existing local data.

- [ ] **Step 3: Implement internal snapshots and rotation**

  Store backups under the configured local workspace/app-data policy, retain deterministic daily/weekly generations, and delete only generations outside retention after a verified new snapshot. Indexes/thumbnails are rebuildable and need not be backed up.

- [ ] **Step 4: Add settings-only recovery controls**

  Provide “检查工作区”, “恢复历史状态” and “清理旧备份”. Do not add export/share/download database controls.

- [ ] **Step 5: Run focused tests, typecheck and Cargo check**

  Expected: PASS.

- [ ] **Step 6: Commit**

  ```powershell
  git add src/db/workspace-recovery.ts src/lib/recovery src/db/index.ts src/app/core/main/canvas/canvas-startup-controller.tsx src/app/core/setting/file/page.tsx scripts/tests/canvas-backup-policy.test.mjs scripts/tests/canvas-startup-recovery.test.mjs
  git commit -m "feat(recovery): restore interrupted local canvas work"
  ```

### Task 20: Run integrated regression, performance, security and Windows acceptance

**Files:**

- Create: `scripts/verify-zeroxb-mvp.mjs`
- Modify: `package.json`
- Create: `docs/verification/zeroxb-mvp-windows-checklist.md`
- Update: `.adworkflow/worker_state.json`
- Update: `.adworkflow/verification_result.json`
- Update: task-scoped ADworkflo review evidence for the implementation run

- [ ] **Step 1: Add one reproducible verification command**

  Add:

  ```json
  "verify:mvp": "node scripts/verify-zeroxb-mvp.mjs"
  ```

  The script must run the pure canvas/chat/security tests, the foundation contract, TypeScript, production build and locked Cargo check; it must fail on the first failed child command and print command names without secrets.

- [ ] **Step 2: Run the complete automated baseline**

  ```powershell
  pnpm verify:foundation
  pnpm test:canvas
  pnpm exec tsc --noEmit
  pnpm build
  cargo test --locked --manifest-path src-tauri/Cargo.toml
  cargo check --locked --manifest-path src-tauri/Cargo.toml
  pnpm verify:mvp
  git diff --check
  ```

  Expected: every command exits 0.

- [ ] **Step 3: Perform independent review before packaging**

  Review at minimum:

  - permission bypass and prompt-injection paths;
  - AI/source-layer separation and transaction rollback;
  - collision stale-index/legacy-overlap edge cases;
  - chat-generation cancellation races;
  - current-canvas retrieval isolation and sensitive redaction;
  - permanent-canvas remount regressions and HUD event routing;
  - secret/log/sync boundaries.

  Fix all Critical/Important findings, rerun affected tests and record source revision plus findings in task-scoped ADworkflo evidence.

- [ ] **Step 4: Build a Windows NSIS installer**

  ```powershell
  pnpm tauri build --bundles nsis
  ```

  Expected: a signed or explicitly unsigned test installer named for `zeroxB` under `src-tauri/target/release/bundle/nsis/`.

- [ ] **Step 5: Complete the hands-on Windows checklist**

  Verify on Windows 10 or 11:

  1. Fresh install launches into the 65% permanent dot-grid canvas without a black/blank screen.
  2. Left rail collapses/restores and right text tabs survive close/reopen without remounting the canvas.
  3. Two-axis draw creates exact viewport-normalized blocks; click/single-axis drag creates nothing.
  4. Snap, invalid red preview, resize rollback, swept movement, rigid multi-select and old-overlap recovery match the approved geometry spec at 10%, 65%, 100% and 600%.
  5. Right-click selection glows; right-drag partially overlapping selection works; right-hold relation preview follows the pointer and relation routes remain editable.
  6. Text/image/PDF/video/link/file/note references ingest, place and reopen correctly; missing sources fail locally.
  7. Note hover preview, click-to-right-panel and drag-to-reference do not misfire.
  8. HUD collapses/expands, shows full history, protects streaming switches and stays fixed during pan/zoom.
  9. Keyboard prompts remain silent; microphone prompts auto-read once; all required stop events stop TTS.
  10. Management mode cannot alter user content. Editing mode previews, confirms, commits atomically and rolls back as one AI transaction.
  11. Asking about a past travel plan returns only local current-canvas evidence, navigates to the source and returns to the old view. No evidence produces “没有找到”.
  12. AI tags/relations toggle independently, user rejection suppresses equivalent regeneration and linear view does not move nodes.
  13. Offline/no-model mode keeps canvas editing and keyword search. Corrupt index rebuilds. Interrupted AI work recovers without partial mutation.
  14. Settings contain no export command and application/database/log inspection contains no plaintext credential.

- [ ] **Step 6: Record ADworkflo verification and final review**

  Update the implementation task’s `worker_state.json`, `verification_result.json`, `review_findings.json`, accepted L2 `context_preflight` and passed post-edit `impact_report`. Run the project validator and parse every JSON artifact explicitly as UTF-8.

- [ ] **Step 7: Commit the release evidence**

  ```powershell
  git add package.json scripts/verify-zeroxb-mvp.mjs docs/verification/zeroxb-mvp-windows-checklist.md .adworkflow
  git commit -m "test(release): verify zeroxB Windows MVP"
  ```

## Final acceptance gate

Implementation is complete only when all of the following are true:

- The active canvas is permanently mounted and remains the primary workspace.
- Every direct block creation uses the captured-viewport contract, and every solid-block mutation satisfies collision/legacy-recovery rules.
- The left rail, right document panel and chat HUD preserve current functionality without becoming extra canvas nodes or persistent analytics panels.
- Rich-media and linked-note nodes remain locally durable, collision-safe and independently recoverable.
- Chat history is visible in the bottom HUD, every message records source canvas context and current-canvas retrieval is the default knowledge boundary.
- AI management/edit permissions are code-enforced, AI mutations are previewed and atomic, and whole transactions can be rolled back separately from manual undo.
- AI tags/relations and suppression records stay outside user-authored nodes/manual edges.
- Personal-memory answers cite local anchors, navigate to exact nodes/ranges and support return/linear browsing.
- Credentials are protected by Windows credential storage, sensitive cloud context is redacted and recovery never exposes partial AI writes.
- Automated checks, independent review, NSIS packaging and the hands-on Windows checklist pass at one recorded source revision.
