# zeroxB Canvas Gestures and Editable Relations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver React Flow-style right-drag selection, exact-area text block drawing, live right-hold relationship creation, and persistently editable relationship routing in the zeroxB Windows canvas.

**Architecture:** Keep React Flow as the viewport and node engine, move gesture/routing decisions into pure TypeScript modules, and register one custom relationship edge for rendering and waypoint editing. `canvas-editor.tsx` remains the event orchestrator and persistence boundary; existing canvas documents load through optional relation fields and safe normalization.

**Tech Stack:** TypeScript 5, React 19, Next.js 15, `@xyflow/react` 12, Node test runner, Tauri 2, Rust/Cargo, NSIS.

---

## Global Constraints

- Empty-canvas right-drag uses partial-intersection selection.
- Empty-canvas right-click, node right-click, and middle-button panning retain their current behavior.
- Node right-hold is the only custom relationship gesture; it never creates a text block.
- A left click or a single-axis left drag creates nothing. A two-axis drag creates one text node at the exact drawn size.
- Existing node positions and user-authored content are never rewritten by relation routing.
- Existing relationships without routing fields load as `auto`, width `2`, with no waypoints.
- The four quick-create buttons for process, decision, terminator, and text nodes are removed.
- Every mutation participates in existing undo/redo history.
- Do not print, modify, or commit the configured localhost AI credential.
- Do not push the branch or publish a release.

## File Map

- Modify `src/lib/canvas/gesture-policy.ts`: pointer intent, exact rectangles, area checks, and partial-intersection helpers.
- Modify `scripts/tests/canvas-gesture-policy.test.mjs`: pure gesture and marquee coverage.
- Modify `src/types/canvas.ts`: backward-compatible relation route fields.
- Modify `src/lib/canvas/relation-policy.ts`: relation normalization and visual defaults.
- Create `src/lib/canvas/relation-routing.ts`: deterministic SVG path construction and simple obstacle avoidance.
- Modify `scripts/tests/canvas-relation-policy.test.mjs`: relation normalization and visuals.
- Create `scripts/tests/canvas-relation-routing.test.mjs`: path mode and avoidance tests.
- Create `src/app/core/main/canvas/canvas-edge.tsx`: custom relationship renderer, hit area, label, and draggable waypoints.
- Modify `src/app/core/main/canvas/canvas-relation-editor.tsx`: route type, width, waypoint add/clear, and existing properties.
- Modify `src/app/core/main/canvas/nodes/canvas-nodes.tsx`: remove the fixed text-node minimum size.
- Modify `src/app/core/main/canvas/canvas-editor.tsx`: event routing, overlays, custom edge registration, context editing, history, and toolbar cleanup.
- Create `scripts/tests/canvas-editor-contract.test.mjs`: source-level integration contracts that complement TypeScript/build verification.
- Update `.adworkflow/impact_report.json`, `.adworkflow/worker_state.json`, `.adworkflow/verification_result.json`, `.adworkflow/review_findings.json`, and `docs/verification/windows-foundation.md`: final evidence.

### Task 1: Exact-area creation and partial marquee policies

**Files:**
- Modify: `src/lib/canvas/gesture-policy.ts`
- Modify: `scripts/tests/canvas-gesture-policy.test.mjs`

- [ ] **Step 1: Replace the old minimum-size tests with failing area and marquee tests**

Use this test contract:

```js
import {
  classifyPointerRelease,
  hasDrawableArea,
  intersectingRectIds,
  normalizeDrawRect,
} from '../../src/lib/canvas/gesture-policy.ts'

test('clicks and single-axis drags do not draw blocks', () => {
  assert.equal(hasDrawableArea({ x: 10, y: 10 }, { x: 10, y: 10 }), false)
  assert.equal(hasDrawableArea({ x: 10, y: 10 }, { x: 80, y: 10 }), false)
  assert.equal(hasDrawableArea({ x: 10, y: 10 }, { x: 10, y: 80 }), false)
  assert.equal(hasDrawableArea({ x: 10, y: 10 }, { x: 13, y: 13 }), true)
})

test('draw rectangles preserve the exact two-axis drag size', () => {
  assert.deepEqual(normalizeDrawRect({ x: 105, y: 125 }, { x: 100, y: 120 }), {
    x: 100, y: 120, width: 5, height: 5,
  })
})

test('right-drag empty canvas is a marquee and right-click is context', () => {
  assert.equal(classifyPointerRelease({ button: 2, elapsedMs: 90, deltaX: 30, deltaY: 20, startedOnNode: false }), 'marquee-select')
  assert.equal(classifyPointerRelease({ button: 2, elapsedMs: 90, deltaX: 0, deltaY: 0, startedOnNode: false }), 'pane-context')
})

test('marquee includes every partially intersecting rectangle', () => {
  assert.deepEqual(intersectingRectIds(
    { x: 20, y: 20, width: 40, height: 40 },
    [
      { id: 'inside', x: 30, y: 30, width: 10, height: 10 },
      { id: 'partial', x: 55, y: 55, width: 30, height: 30 },
      { id: 'outside', x: 100, y: 100, width: 10, height: 10 },
    ],
  ), ['inside', 'partial'])
})
```

- [ ] **Step 2: Run the focused test and confirm the new contract fails**

Run: `node --experimental-strip-types --test scripts/tests/canvas-gesture-policy.test.mjs`

Expected: FAIL because `hasDrawableArea` and `intersectingRectIds` are not exported and the old normalizer expands to `120 × 72`.

- [ ] **Step 3: Implement the pure gesture policy**

Use these public types and functions:

```ts
export const POINTER_DRAG_THRESHOLD = 6
export const POINTER_AXIS_THRESHOLD = 3
export const RELATION_LONG_PRESS_MS = 320

export interface CanvasRect {
  x: number
  y: number
  width: number
  height: number
}

export type PointerReleaseIntent =
  | 'pane-click'
  | 'pane-context'
  | 'draw-block'
  | 'marquee-select'
  | 'node-context'
  | 'relation-drag'
  | 'none'

export function hasDrawableArea(start: { x: number; y: number }, end: { x: number; y: number }) {
  return Math.abs(end.x - start.x) >= POINTER_AXIS_THRESHOLD
    && Math.abs(end.y - start.y) >= POINTER_AXIS_THRESHOLD
}

export function normalizeDrawRect(start: { x: number; y: number }, end: { x: number; y: number }): CanvasRect {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  }
}

export function rectanglesIntersect(a: CanvasRect, b: CanvasRect) {
  return a.x <= b.x + b.width
    && a.x + a.width >= b.x
    && a.y <= b.y + b.height
    && a.y + a.height >= b.y
}

export function intersectingRectIds(selection: CanvasRect, candidates: Array<CanvasRect & { id: string }>) {
  return candidates.filter(candidate => rectanglesIntersect(selection, candidate)).map(candidate => candidate.id)
}
```

Update `classifyPointerRelease` to accept `deltaX` and `deltaY` instead of `distance`. Left blank gestures return `draw-block` only when both axes pass `POINTER_AXIS_THRESHOLD`. Right blank gestures return `marquee-select` when the Euclidean distance passes `POINTER_DRAG_THRESHOLD`, otherwise `pane-context`. Preserve the existing node long-press threshold.

- [ ] **Step 4: Run the focused test and the canvas suite**

Run: `node --experimental-strip-types --test scripts/tests/canvas-gesture-policy.test.mjs`

Expected: all gesture-policy tests PASS.

Run: `corepack pnpm test:canvas`

Expected: all canvas tests PASS.

- [ ] **Step 5: Commit Task 1**

```powershell
git add src/lib/canvas/gesture-policy.ts scripts/tests/canvas-gesture-policy.test.mjs
git commit -m "feat: refine canvas gesture policies"
```

### Task 2: Backward-compatible relation model and deterministic routing

**Files:**
- Modify: `src/types/canvas.ts`
- Modify: `src/lib/canvas/relation-policy.ts`
- Create: `src/lib/canvas/relation-routing.ts`
- Modify: `scripts/tests/canvas-relation-policy.test.mjs`
- Create: `scripts/tests/canvas-relation-routing.test.mjs`

- [ ] **Step 1: Write failing relation normalization and routing tests**

Add tests with these assertions:

```js
test('legacy relations normalize to auto routing and width two', () => {
  const relation = normalizeRelationData({ label: '旧关系', direction: 'forward', lineStyle: 'solid', color: '#64748b', source: 'manual' })
  assert.equal(relation.routeType, 'auto')
  assert.equal(relation.strokeWidth, 2)
  assert.deepEqual(relation.waypoints, [])
})

test('invalid route values and waypoint coordinates are discarded', () => {
  const relation = normalizeRelationData({
    ...DEFAULT_RELATION,
    routeType: 'unknown',
    strokeWidth: 99,
    waypoints: [{ x: 20, y: 30 }, { x: Number.NaN, y: 8 }],
  })
  assert.equal(relation.routeType, 'auto')
  assert.equal(relation.strokeWidth, 8)
  assert.deepEqual(relation.waypoints, [{ x: 20, y: 30 }])
})

test('manual routing includes every persisted waypoint', () => {
  const result = buildRelationPath({
    source: { x: 0, y: 0 }, target: { x: 200, y: 100 }, routeType: 'manual',
    waypoints: [{ x: 50, y: 80 }, { x: 150, y: 20 }], obstacles: [],
  })
  assert.match(result.path, /50 80/)
  assert.match(result.path, /150 20/)
})

test('auto routing inserts an outside route when a block intersects the direct corridor', () => {
  const result = buildRelationPath({
    source: { x: 0, y: 50 }, target: { x: 200, y: 50 }, routeType: 'auto', waypoints: [],
    obstacles: [{ x: 80, y: 20, width: 40, height: 60 }],
  })
  assert.equal(result.avoidedObstacle, true)
  assert.notEqual(result.path, 'M 0 50 L 200 50')
})
```

- [ ] **Step 2: Run focused relation tests and confirm failure**

Run: `node --experimental-strip-types --test scripts/tests/canvas-relation-policy.test.mjs scripts/tests/canvas-relation-routing.test.mjs`

Expected: FAIL because normalization, route fields, and `buildRelationPath` do not exist.

- [ ] **Step 3: Extend the persisted relation types without a schema migration**

Add these definitions to `src/types/canvas.ts`:

```ts
export type CanvasRelationRouteType = 'auto' | 'bezier' | 'straight' | 'orthogonal' | 'manual'

export interface CanvasRelationWaypoint {
  x: number
  y: number
}

export interface CanvasRelationData extends Record<string, unknown> {
  label: string
  direction: 'forward' | 'both'
  lineStyle: 'solid' | 'dashed' | 'dotted'
  color: string
  source: 'manual' | 'ai'
  routeType?: CanvasRelationRouteType
  strokeWidth?: number
  waypoints?: CanvasRelationWaypoint[]
}
```

- [ ] **Step 4: Normalize relation defaults and visual settings**

Set `DEFAULT_RELATION` to `routeType: 'auto'`, `strokeWidth: 2`, and `waypoints: []`. Export `normalizeRelationData(value)` that validates enum members, clamps width to `1..8`, filters non-finite waypoint coordinates, and returns a complete relation. Make `relationEdgeVisuals` call the normalizer and return `strokeWidth` in addition to markers, stroke, and dash array.

- [ ] **Step 5: Implement path construction and simple obstacle avoidance**

Create these public contracts in `src/lib/canvas/relation-routing.ts`:

```ts
export interface RoutePoint { x: number; y: number }
export interface RouteObstacle extends RoutePoint { width: number; height: number }
export interface RelationPathInput {
  source: RoutePoint
  target: RoutePoint
  routeType: CanvasRelationRouteType
  waypoints: CanvasRelationWaypoint[]
  obstacles: RouteObstacle[]
}
export interface RelationPathResult {
  path: string
  label: RoutePoint
  editablePoints: RoutePoint[]
  avoidedObstacle: boolean
}
```

Implement these deterministic rules:

1. `straight` returns `M source.x source.y L target.x target.y`.
2. `bezier` returns a cubic path whose horizontal control distance is `max(48, abs(target.x - source.x) * 0.45)` and whose label is the cubic midpoint.
3. `orthogonal` routes through `{ x: (source.x + target.x) / 2, y: source.y }` and `{ x: midpointX, y: target.y }` unless saved waypoints exist.
4. `manual` routes through all saved waypoints.
5. `auto` expands each unrelated obstacle by `24` pixels, finds the first rectangle intersecting the source-target segment, compares top/bottom routes for mostly horizontal connections or left/right routes for mostly vertical connections, and uses the shorter pair of outside points. If no obstacle intersects, it returns the bezier path.
6. Multi-point paths use `M`, `L`, and `Q` commands with a corner radius no greater than `14` pixels or half of either adjacent segment.
7. All numeric output passes through a formatter that rounds to two decimal places and converts `-0` to `0`.

- [ ] **Step 6: Run focused and full canvas tests**

Run: `node --experimental-strip-types --test scripts/tests/canvas-relation-policy.test.mjs scripts/tests/canvas-relation-routing.test.mjs`

Expected: all relation tests PASS.

Run: `corepack pnpm test:canvas`

Expected: all canvas tests PASS.

- [ ] **Step 7: Commit Task 2**

```powershell
git add src/types/canvas.ts src/lib/canvas/relation-policy.ts src/lib/canvas/relation-routing.ts scripts/tests/canvas-relation-policy.test.mjs scripts/tests/canvas-relation-routing.test.mjs
git commit -m "feat: add editable relation routing model"
```

### Task 3: Custom relationship edge and compact relation editor

**Files:**
- Create: `src/app/core/main/canvas/canvas-edge.tsx`
- Modify: `src/app/core/main/canvas/canvas-relation-editor.tsx`

- [ ] **Step 1: Create the custom relationship edge renderer**

Implement `CanvasRelationEdge` with `BaseEdge`, `EdgeLabelRenderer`, `useReactFlow`, and the pure routing module. The component must:

```tsx
export type FlowRelationEdge = Edge<CanvasRelationData, 'relation'>

export const CanvasRelationEdge = memo(function CanvasRelationEdge(props: EdgeProps<FlowRelationEdge>) {
  const { getNodes, setEdges, screenToFlowPosition } = useReactFlow()
  const relation = normalizeRelationData(props.data)
  const obstacles = getNodes()
    .filter(node => node.id !== props.source && node.id !== props.target && node.measured?.width && node.measured?.height)
    .map(node => ({
      x: node.position.x,
      y: node.position.y,
      width: node.measured!.width!,
      height: node.measured!.height!,
    }))
  const route = buildRelationPath({
    source: { x: props.sourceX, y: props.sourceY },
    target: { x: props.targetX, y: props.targetY },
    routeType: relation.routeType!,
    waypoints: relation.waypoints!,
    obstacles,
  })
```

Render `BaseEdge` with `interactionWidth={24}`, the computed path, existing marker props, and normalized stroke/dash/width. Render the label through `EdgeLabelRenderer`. When the edge is selected and `routeType === 'manual'`, render one `nodrag nopan` circular button per waypoint.

On waypoint pointer-down, emit `canvas-history-checkpoint`, capture the pointer, convert screen coordinates with `screenToFlowPosition`, and update only the matching waypoint through `setEdges`. Remove window listeners on pointer-up and pointer-cancel. Use a visible `10px` control point with a `24px` transparent hit target.

- [ ] **Step 2: Extend the relation editor with complete route controls**

Add optional `suggestedWaypoint?: CanvasRelationWaypoint` to the component props. Normalize `initial` before putting it into local state. Add:

```tsx
<select value={value.routeType} onChange={event => patch({ routeType: event.target.value as CanvasRelationRouteType })}>
  <option value="auto">自动绕行</option>
  <option value="bezier">弧形线</option>
  <option value="straight">直线</option>
  <option value="orthogonal">折线</option>
  <option value="manual">手动节点</option>
</select>

<input
  type="range"
  min={1}
  max={8}
  step={1}
  value={value.strokeWidth}
  onChange={event => patch({ strokeWidth: Number(event.target.value) })}
/>
```

Add “增加节点” and “清除节点” buttons. “增加节点” appends `suggestedWaypoint` only when it exists and switches to `manual`; “清除节点” sets `waypoints: []`. Keep the panel at `w-72` or smaller, with no unrelated information panels.

- [ ] **Step 3: Run the TypeScript compiler**

Run: `corepack pnpm exec tsc --noEmit`

Expected: PASS with no diagnostics.

- [ ] **Step 4: Commit Task 3**

```powershell
git add src/app/core/main/canvas/canvas-edge.tsx src/app/core/main/canvas/canvas-relation-editor.tsx
git commit -m "feat: render editable canvas relations"
```

### Task 4: Integrate gesture sessions, exact nodes, edge editing, and toolbar cleanup

**Files:**
- Modify: `src/app/core/main/canvas/canvas-editor.tsx`
- Modify: `src/app/core/main/canvas/nodes/canvas-nodes.tsx`
- Create: `scripts/tests/canvas-editor-contract.test.mjs`

- [ ] **Step 1: Write failing source integration contracts**

Create a test that reads both TSX files and asserts:

```js
test('canvas editor registers the custom relation edge and right-drag marquee overlay', () => {
  assert.match(editorSource, /const edgeTypes = \{ relation: CanvasRelationEdge \}/)
  assert.match(editorSource, /type: 'relation'/)
  assert.match(editorSource, /intersectingRectIds/)
  assert.match(editorSource, /relation-target-active/)
})

test('obsolete shape quick-create buttons are absent', () => {
  assert.doesNotMatch(editorSource, /onClick=\{\(\) => addNode\('process'\)\}/)
  assert.doesNotMatch(editorSource, /onClick=\{\(\) => addNode\('decision'\)\}/)
  assert.doesNotMatch(editorSource, /onClick=\{\(\) => addNode\('terminator'\)\}/)
  assert.doesNotMatch(editorSource, /onClick=\{\(\) => addNode\('text'\)\}/)
})

test('text nodes do not impose the former fixed minimum', () => {
  assert.doesNotMatch(nodesSource, /min-h-\[72px\]/)
  assert.doesNotMatch(nodesSource, /min-w-\[120px\]/)
  assert.match(nodesSource, /minWidth=\{1\}/)
  assert.match(nodesSource, /minHeight=\{1\}/)
})
```

- [ ] **Step 2: Run the contract test and confirm failure**

Run: `node --experimental-strip-types --test scripts/tests/canvas-editor-contract.test.mjs`

Expected: FAIL because the custom edge, marquee contract, and minimum-size changes are not present.

- [ ] **Step 3: Remove the text-node minimum size**

In `TextCanvasNode`, replace the fixed minimum classes with `relative size-full overflow-hidden rounded-xl ...`. Set `NodeResizer` to `minWidth={1}` and `minHeight={1}`. Do not change default sizes for note, file, image, or legacy flowchart nodes.

- [ ] **Step 4: Register and normalize custom relationship edges**

At module scope register:

```ts
const edgeTypes = { relation: CanvasRelationEdge }
```

Pass `edgeTypes={edgeTypes}` to `ReactFlow`. For every manual relationship created by right-hold, use `type: 'relation'` and `data: normalizeRelationData(DEFAULT_RELATION)`. While displaying stored edges, treat any edge with relation data as `type: 'relation'`, normalize its data, and apply `relationEdgeVisuals` so old relationships upgrade in memory without moving nodes.

- [ ] **Step 5: Add the empty-canvas right-drag marquee session**

Add a `MarqueePointerSession` containing `pointerId`, `start`, `current`, and `active`; store it in a ref and mirror only active state to React state for rendering.

On right pointer-down on `.react-flow__pane`, start the session without preventing the short-click context menu. On pointer-move, once distance reaches `POINTER_DRAG_THRESHOLD`, capture the pointer, set `suppressContextMenuRef`, and render a translucent selection rectangle. On pointer-up, collect `.react-flow__node[data-id]` client rectangles, call `intersectingRectIds`, and set matching nodes selected while clearing selected edges. Selection itself does not create a history entry; the subsequent bulk deletion creates the checkpoint that makes the deletion undoable. Always clear the overlay and release capture on pointer-up/cancel.

- [ ] **Step 6: Enforce exact two-axis block creation**

In `finishBlockDraw`, replace the Euclidean-distance decision with:

```ts
if (!hasDrawableArea(draft.start, draft.current)) {
  setNodes(current => current.map(node => ({ ...node, selected: false })))
  setEdges(current => current.map(edge => ({ ...edge, selected: false })))
  return
}
```

Use `normalizeDrawRect` and store `width: end.x - position.x` and `height: end.y - position.y` without `Math.max`. The preview rectangle uses the same exact normalizer.

- [ ] **Step 7: Upgrade the live relationship preview**

Replace the preview `<line>` with an SVG `<path>` built from a cubic curve between the source node’s nearest connection edge and `relation.current`. Use `strokeDasharray="7 6"`, a rounded line cap, and a subtle `drop-shadow`. During pointer-move add `relation-target-active` to a valid target node and remove it from the previous target. Clear the class on pointer-up/cancel. Add a scoped React Flow class that renders the target ring/glow without moving the node.

- [ ] **Step 8: Open relationship editing from right-click and support suggested waypoints**

In `onEdgeContextMenu`, prevent the native menu, select the edge, and when relation data exists open `CanvasRelationEditor` at the click position with `mode: 'edit'`. Compute `suggestedWaypoint` as the midpoint of the source and target React Flow node centers and pass it to the editor. Keep double-click editing as a compatibility path.

Saving normalizes the value, calls `pushHistory` once, updates `label`, `type: 'relation'`, and `data`. Cancelling a new relation removes it; cancelling an existing relation makes no changes.

- [ ] **Step 9: Remove the four obsolete quick-create buttons**

Delete only the `CanvasToolbarTooltip`/`Button` blocks that call `addNode('process')`, `addNode('decision')`, `addNode('terminator')`, and `addNode('text')`. Remove now-unused icon imports. Keep note/image import and conditional arrange/relation tools.

- [ ] **Step 10: Run contracts, canvas tests, TypeScript, and production build**

Run: `node --experimental-strip-types --test scripts/tests/canvas-editor-contract.test.mjs`

Expected: all editor contract tests PASS.

Run: `corepack pnpm test:canvas`

Expected: all canvas tests PASS.

Run: `corepack pnpm exec tsc --noEmit`

Expected: PASS with no diagnostics.

Run: `npx -y pnpm@9.15.9 build`

Expected: Next.js static production build completes successfully.

- [ ] **Step 11: Commit Task 4**

```powershell
git add src/app/core/main/canvas/canvas-editor.tsx src/app/core/main/canvas/nodes/canvas-nodes.tsx scripts/tests/canvas-editor-contract.test.mjs
git commit -m "feat: refine canvas selection and relation gestures"
```

### Task 5: ADworkflo impact gate, Windows bundle, reinstall, and final verification

**Files:**
- Modify: `.adworkflow/impact_report.json`
- Modify: `.adworkflow/worker_state.json`
- Modify: `.adworkflow/verification_result.json`
- Modify: `.adworkflow/review_findings.json`
- Modify: `docs/verification/windows-foundation.md`

- [ ] **Step 1: Run the L2 post-edit impact gate**

Run:

```powershell
py -3 F:\CodexHome\skills\adworkflo\scripts\codegraph_post_edit.py --project F:\huabu-worktrees\foundation
```

Expected: `.adworkflow/impact_report.json` reports `passed` and contains no unreviewed high-risk impact.

- [ ] **Step 2: Run complete source verification**

Run:

```powershell
corepack pnpm test:canvas
corepack pnpm verify:foundation
corepack pnpm exec tsc --noEmit
npx -y pnpm@9.15.9 build
cmd /d /s /c "call F:\toolchains\portable-msvc\msvc\setup_x64.bat && cargo check --locked"
```

Expected: every command exits `0`; canvas test count is at least the previous `19` plus the new gesture/routing/editor cases.

- [ ] **Step 3: Bundle the NSIS installer using the working GitHub route**

Run:

```powershell
cmd /d /s /c "call F:\toolchains\portable-msvc\msvc\setup_x64.bat && set CI=true && npx -y pnpm@9.15.9 tauri bundle --debug --bundles nsis"
```

If direct GitHub asset download is unavailable, set `TAURI_BUNDLER_TOOLS_GITHUB_MIRROR` only for this process to a verified mirror that returns the exact upstream SHA-1 values. Do not disable Tauri’s package hash verification.

Expected installer: `src-tauri\target\debug\bundle\nsis\zeroxB_0.32.1_x64-setup.exe`.

- [ ] **Step 4: Preserve a copy and silently reinstall on F:**

Verify both paths resolve under `F:\`, stop only `zeroxb.exe`, copy the installer, reinstall, and restart with:

```powershell
$source = (Resolve-Path 'src-tauri\target\debug\bundle\nsis\zeroxB_0.32.1_x64-setup.exe').Path
$builds = (Resolve-Path 'F:\zeroxB-builds').Path
if (-not $source.StartsWith('F:\') -or -not $builds.StartsWith('F:\')) { throw 'Installer paths must remain on F:' }
Get-Process zeroxb -ErrorAction SilentlyContinue | Stop-Process -Force
$installer = 'F:\zeroxB-builds\zeroxB_0.32.1_x64-setup.exe'
Copy-Item -LiteralPath $source -Destination $installer -Force
Start-Process -FilePath $installer -ArgumentList @('/S', '/D=F:\zeroxBApp') -Wait
Start-Process -FilePath 'F:\zeroxBApp\zeroxb.exe'
```

Expected: the installed executable exists, has a new SHA-256 matching the packaged binary, and its process reaches `Responding = True`.

- [ ] **Step 5: Verify persistent application state without exposing secrets**

Check:

- the active tab URL remains `canvas://project/...`;
- SQLite still contains the `canvases` table and at least one canvas;
- provider count remains `1` and model count remains `10` without printing provider credentials;
- the localhost chat endpoint returns `OK` for a minimal request without canvas content;
- the old Huabu application/data paths remain absent;
- the default Tauri cache path remains a junction to `F:\toolchains\tauri-bundler-cache\cache-root`.

- [ ] **Step 6: Record evidence and validate ADworkflo artifacts**

Set `worker_state.json` to completed, `verification_result.json` to passed, and `review_findings.json` to the independent reviewer’s final verdict. Update `docs/verification/windows-foundation.md` with commands, counts, installer path, installed executable hash, and sanitized persistence checks.

Run:

```powershell
py -3 F:\CodexHome\skills\adworkflo\scripts\validate_adworkflow.py --project F:\huabu-worktrees\foundation
git diff --check
```

Expected: artifact validation passes and `git diff --check` emits no errors.

- [ ] **Step 7: Commit final verification evidence**

```powershell
git add .adworkflow/impact_report.json .adworkflow/worker_state.json .adworkflow/verification_result.json .adworkflow/review_findings.json docs/verification/windows-foundation.md
git commit -m "docs: verify editable canvas interactions"
```

The branch must finish clean. Do not push it.
