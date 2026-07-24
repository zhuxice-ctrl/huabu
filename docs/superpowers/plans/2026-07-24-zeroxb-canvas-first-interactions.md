# zeroxB Canvas-First Interactions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the Windows application to zeroxB and make its default experience a canvas-first workspace with direct block drawing, typed paste/drop ingestion, context styling, middle-button panning, and right-button long-press relation creation.

**Architecture:** Keep React Flow and the existing canvas/store/history model. Extract pointer arbitration, content classification, startup selection, and relation styling into small pure modules that can be tested with Node’s built-in runner; keep DOM coordination in focused React controllers/components. Every committed canvas mutation passes through the existing `pushHistory()` snapshot boundary.

**Tech Stack:** Next.js 15, React 19, TypeScript, React Flow 12, Zustand, Tauri 2, Rust, Node 24 built-in test runner.

---

## File map

- Modify `package.json`: zeroxB package identity and canvas test command.
- Rename `scripts/verify-huabu-foundation.mjs` to `scripts/verify-zeroxb-foundation.mjs`: enforce the new product identity.
- Modify `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, `src-tauri/tauri.conf.json`: binary, product, and bundle identifiers.
- Modify `messages/*.json`, `src/**`, `src-tauri/src/**`: all user-visible and runtime brand strings.
- Create `src/lib/canvas/gesture-policy.ts`: pure pointer gesture state transitions.
- Create `src/lib/canvas/content-ingest.ts`: content classification and text-size calculation.
- Create `src/lib/canvas/relation-policy.ts`: relation normalization and edge visual properties.
- Create `src/lib/canvas/startup-policy.ts`: deterministic default-canvas selection.
- Create `scripts/tests/canvas-gesture-policy.test.mjs`, `canvas-content-ingest.test.mjs`, `canvas-relation-policy.test.mjs`, and `canvas-startup-policy.test.mjs`: pure behavior tests.
- Create `src/app/core/main/canvas/canvas-startup-controller.tsx`: open or create the startup canvas.
- Create `src/app/core/main/canvas/canvas-node-style-menu.tsx`: node and canvas style controls.
- Create `src/app/core/main/canvas/canvas-relation-editor.tsx`: line-anchored relation editor.
- Modify `src/types/canvas.ts`: node appearance, canvas background, file node, and relation data.
- Modify `src/app/core/main/canvas/nodes/canvas-nodes.tsx`: resizable multiline text and file rendering.
- Modify `src/app/core/main/canvas/canvas-editor.tsx`: integrate drawing, panning, drop/paste, context menus, relations, persistence, and undo.
- Modify `src/app/core/main/page.tsx`: mount the startup controller and keep canvas immersive.
- Modify `docs/verification/windows-foundation.md` and `.adworkflow/*`: record final build/install evidence.

---

### Task 1: Finish the zeroxB product identity

**Files:**
- Modify: `package.json`
- Rename: `scripts/verify-huabu-foundation.mjs` → `scripts/verify-zeroxb-foundation.mjs`
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/Cargo.lock`
- Modify: `src-tauri/tauri.conf.json`
- Modify: `src-tauri/src/app_setup.rs`
- Modify: `src-tauri/src/tray.rs`
- Modify: `messages/en.json`
- Modify: `messages/ja.json`
- Modify: `messages/pt-BR.json`
- Modify: `messages/zh-TW.json`
- Modify: `messages/zh.json`
- Modify: runtime files returned by `rg -l 'Huabu' src src-tauri/src`

- [ ] **Step 1: Make the foundation contract expect zeroxB**

Use these exact identity assertions in `scripts/verify-zeroxb-foundation.mjs`:

```js
assert.equal(packageJson.name, 'zeroxb')
assert.equal(packageJson.scripts['verify:foundation'], 'node scripts/verify-zeroxb-foundation.mjs')
assert.equal(tauriConfig.productName, 'zeroxB')
assert.equal(tauriConfig.identifier, 'com.zeroxb.desktop')
assert.match(cargoToml, /^name = "zeroxb"$/m)
assert.ok(!runtimeSource.includes('Huabu'))
assert.ok(!tauriSource.includes('Huabu'))
```

- [ ] **Step 2: Run the contract and verify the old identity fails**

Run:

```powershell
npx -y pnpm@9.15.9 verify:foundation
```

Expected before the remaining rename is applied: FAIL on the first stale package, Tauri, Cargo, or runtime identity.

- [ ] **Step 3: Apply the internal identity**

Set the authoritative metadata to:

```json
// package.json
{
  "name": "zeroxb",
  "scripts": {
    "verify:foundation": "node scripts/verify-zeroxb-foundation.mjs"
  }
}
```

```toml
# src-tauri/Cargo.toml
[package]
name = "zeroxb"
authors = ["zeroxB contributors"]
```

```json
// src-tauri/tauri.conf.json
{
  "productName": "zeroxB",
  "identifier": "com.zeroxb.desktop"
}
```

Replace visible `Huabu` strings with the exact case-sensitive product name `zeroxB`. Preserve `NoteGen` only where it is required for upstream GPL attribution or migration cleanup.

- [ ] **Step 4: Run identity and compile checks**

Run:

```powershell
npx -y pnpm@9.15.9 verify:foundation
npx -y pnpm@9.15.9 build
cmd /d /s /c "call F:\toolchains\portable-msvc\msvc\setup_x64.bat && cargo check --manifest-path src-tauri\Cargo.toml --locked"
```

Expected: contract prints `zeroxB foundation contract passed`; frontend and Cargo checks pass without changing the lockfile again.

- [ ] **Step 5: Commit the rename**

```powershell
git add -A
git commit -m "feat: rename application to zeroxB"
```

---

### Task 2: Add pure interaction policies and tests

**Files:**
- Create: `src/lib/canvas/gesture-policy.ts`
- Create: `src/lib/canvas/content-ingest.ts`
- Create: `src/lib/canvas/relation-policy.ts`
- Create: `src/lib/canvas/startup-policy.ts`
- Modify: `src/types/canvas.ts`
- Create: `scripts/tests/canvas-gesture-policy.test.mjs`
- Create: `scripts/tests/canvas-content-ingest.test.mjs`
- Create: `scripts/tests/canvas-relation-policy.test.mjs`
- Create: `scripts/tests/canvas-startup-policy.test.mjs`
- Modify: `package.json`

- [ ] **Step 1: Write failing gesture-policy tests**

```js
// scripts/tests/canvas-gesture-policy.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { classifyPointerRelease, normalizeDrawRect } from '../../src/lib/canvas/gesture-policy.ts'

test('short empty left drag is a click', () => {
  assert.equal(classifyPointerRelease({ button: 0, elapsedMs: 80, distance: 5, startedOnNode: false }), 'pane-click')
})

test('empty left drag draws a block', () => {
  assert.equal(classifyPointerRelease({ button: 0, elapsedMs: 120, distance: 40, startedOnNode: false }), 'draw-block')
})

test('short right press opens context and long right press links', () => {
  assert.equal(classifyPointerRelease({ button: 2, elapsedMs: 200, distance: 2, startedOnNode: true }), 'node-context')
  assert.equal(classifyPointerRelease({ button: 2, elapsedMs: 360, distance: 25, startedOnNode: true }), 'relation-drag')
  assert.equal(classifyPointerRelease({ button: 2, elapsedMs: 360, distance: 0, startedOnNode: true }), 'relation-drag')
})

test('draw rectangle keeps direction and minimum size', () => {
  assert.deepEqual(normalizeDrawRect({ x: 300, y: 220 }, { x: 100, y: 120 }), {
    x: 100, y: 120, width: 200, height: 100,
  })
})
```

- [ ] **Step 2: Write failing content, relation, and startup tests**

```js
// scripts/tests/canvas-content-ingest.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { classifyTextContent, estimateTextBlockSize } from '../../src/lib/canvas/content-ingest.ts'

test('urls become link cards and normal text becomes text blocks', () => {
  assert.equal(classifyTextContent('https://example.com').kind, 'link')
  assert.equal(classifyTextContent('旅行计划').kind, 'text')
})

test('text size stays inside the contract', () => {
  const size = estimateTextBlockSize('行程 '.repeat(300))
  assert.ok(size.width >= 240 && size.width <= 520)
  assert.ok(size.height >= 72)
})
```

```js
// scripts/tests/canvas-relation-policy.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { relationEdgeVisuals } from '../../src/lib/canvas/relation-policy.ts'

test('bidirectional dotted relation has two markers and dotted stroke', () => {
  const visuals = relationEdgeVisuals({ label: '相关', direction: 'both', lineStyle: 'dotted', color: '#0ea5e9', source: 'manual' })
  assert.equal(visuals.markerStart, true)
  assert.equal(visuals.markerEnd, true)
  assert.equal(visuals.strokeDasharray, '2 6')
})
```

```js
// scripts/tests/canvas-startup-policy.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { chooseStartupCanvasId } from '../../src/lib/canvas/startup-policy.ts'

test('last canvas wins, then newest project', () => {
  const projects = [{ id: 'older', updatedAt: 10 }, { id: 'newer', updatedAt: 20 }]
  assert.equal(chooseStartupCanvasId(projects, 'older'), 'older')
  assert.equal(chooseStartupCanvasId(projects, 'missing'), 'newer')
  assert.equal(chooseStartupCanvasId([], null), null)
})
```

- [ ] **Step 3: Run tests and verify they fail because modules do not exist**

Run:

```powershell
node --experimental-strip-types --test scripts/tests/canvas-*.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 4: Implement the pure modules**

```ts
// src/lib/canvas/gesture-policy.ts
export const POINTER_DRAG_THRESHOLD = 6
export const RELATION_LONG_PRESS_MS = 320

export type PointerReleaseIntent = 'pane-click' | 'draw-block' | 'node-context' | 'relation-drag' | 'none'

export function classifyPointerRelease(input: {
  button: number
  elapsedMs: number
  distance: number
  startedOnNode: boolean
}): PointerReleaseIntent {
  if (input.button === 0 && !input.startedOnNode) {
    return input.distance >= POINTER_DRAG_THRESHOLD ? 'draw-block' : 'pane-click'
  }
  if (input.button === 2 && input.startedOnNode) {
    return input.elapsedMs >= RELATION_LONG_PRESS_MS
      ? 'relation-drag'
      : 'node-context'
  }
  return 'none'
}

export function normalizeDrawRect(start: { x: number; y: number }, end: { x: number; y: number }) {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.max(120, Math.abs(end.x - start.x)),
    height: Math.max(72, Math.abs(end.y - start.y)),
  }
}
```

```ts
// src/lib/canvas/content-ingest.ts
export function classifyTextContent(text: string) {
  const value = text.trim()
  return /^https?:\/\/\S+$/i.test(value)
    ? { kind: 'link' as const, value }
    : { kind: 'text' as const, value }
}

export function estimateTextBlockSize(text: string) {
  const longestLine = Math.max(1, ...text.split(/\r?\n/).map(line => Array.from(line).length))
  const width = Math.max(240, Math.min(520, 72 + longestLine * 9))
  const estimatedLines = text.split(/\r?\n/).reduce((total, line) => total + Math.max(1, Math.ceil(Array.from(line).length / Math.max(1, Math.floor((width - 32) / 9)))), 0)
  return { width, height: Math.max(72, 36 + estimatedLines * 22) }
}
```

```ts
// src/lib/canvas/relation-policy.ts
import type { CanvasRelationData } from '../../types/canvas'

export const DEFAULT_RELATION: CanvasRelationData = {
  label: '', direction: 'forward', lineStyle: 'solid', color: '#64748b', source: 'manual',
}

export function relationEdgeVisuals(relation: CanvasRelationData) {
  return {
    markerStart: relation.direction === 'both',
    markerEnd: true,
    stroke: relation.color,
    strokeDasharray: relation.lineStyle === 'dashed' ? '8 6' : relation.lineStyle === 'dotted' ? '2 6' : undefined,
  }
}

export function isValidRelationTarget(sourceId: string, targetId: string | null, nodeIds: Set<string>) {
  return Boolean(targetId && targetId !== sourceId && nodeIds.has(sourceId) && nodeIds.has(targetId))
}
```

Add the shared type once in `src/types/canvas.ts`:

```ts
export interface CanvasRelationData {
  label: string
  direction: 'forward' | 'both'
  lineStyle: 'solid' | 'dashed' | 'dotted'
  color: string
  source: 'manual' | 'ai'
}
```

```ts
// src/lib/canvas/startup-policy.ts
export function chooseStartupCanvasId(
  projects: Array<{ id: string; updatedAt: number }>,
  lastCanvasId: string | null,
) {
  if (lastCanvasId && projects.some(project => project.id === lastCanvasId)) return lastCanvasId
  return [...projects].sort((left, right) => right.updatedAt - left.updatedAt)[0]?.id ?? null
}
```

- [ ] **Step 5: Add and run the canvas test command**

Add to `package.json`:

```json
"test:canvas": "node --experimental-strip-types --test scripts/tests/canvas-*.test.mjs"
```

Run `npx -y pnpm@9.15.9 test:canvas`.

Expected: all tests pass.

- [ ] **Step 6: Commit the policy layer**

```powershell
git add package.json src/types/canvas.ts src/lib/canvas scripts/tests
git commit -m "test: define canvas interaction policies"
```

---

### Task 3: Make the canvas the startup workspace

**Files:**
- Create: `src/app/core/main/canvas/canvas-startup-controller.tsx`
- Modify: `src/app/core/main/page.tsx`
- Test: `scripts/tests/canvas-startup-policy.test.mjs`

- [ ] **Step 1: Extend the startup test for stale Markdown state**

Add this case:

```js
test('startup selection does not depend on a Markdown active tab', () => {
  assert.equal(chooseStartupCanvasId([{ id: 'canvas', updatedAt: 1 }], null), 'canvas')
})
```

Run `npx -y pnpm@9.15.9 test:canvas`; expected: PASS for the pure policy and no UI behavior yet.

- [ ] **Step 2: Implement `CanvasStartupController`**

The component must load tabs and canvases, read `lastCanvasId` from the Tauri store, create a blank canvas when necessary, add its canvas tab, and persist the selected ID:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { Store } from '@tauri-apps/plugin-store'
import useArticleStore from '@/stores/article'
import useCanvasStore from '@/stores/canvas'
import { createCanvasTab } from './canvas-tab'
import { chooseStartupCanvasId } from '@/lib/canvas/startup-policy'

export function CanvasStartupController({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      await Promise.all([
        useArticleStore.getState().initOpenTabs(),
        useCanvasStore.getState().loadProjects(),
      ])
      const store = await Store.load('store.json')
      const lastCanvasId = await store.get<string>('lastCanvasId') || null
      let project = useCanvasStore.getState().projects.find(item => (
        item.id === chooseStartupCanvasId(useCanvasStore.getState().projects, lastCanvasId)
      )) || null
      if (!project) project = await useCanvasStore.getState().createProject('blank', '未命名画布')
      if (project) {
        await useCanvasStore.getState().openProject(project.id)
        await useArticleStore.getState().addTab(createCanvasTab(project))
        await store.set('lastCanvasId', project.id)
        await store.save()
      }
      if (!cancelled) setReady(true)
    })()
    return () => { cancelled = true }
  }, [])

  return ready ? children : <div className="size-full bg-background" aria-label="正在打开画布" />
}
```

- [ ] **Step 3: Mount the controller around the main workspace**

In `src/app/core/main/page.tsx`, wrap the existing `ResizableWrapper`:

```tsx
function Page() {
  // existing currentPage persistence effect remains
  return (
    <CanvasStartupController>
      <ResizableWrapper />
    </CanvasStartupController>
  )
}
```

- [ ] **Step 4: Verify build and manual startup**

Run:

```powershell
npx -y pnpm@9.15.9 test:canvas
npx -y pnpm@9.15.9 build
```

Expected: build passes; a clean profile creates and opens one blank canvas; an existing profile opens the last canvas even when the previous active content was Markdown.

- [ ] **Step 5: Commit startup behavior**

```powershell
git add src/app/core/main/page.tsx src/app/core/main/canvas/canvas-startup-controller.tsx scripts/tests/canvas-startup-policy.test.mjs
git commit -m "feat: open zeroxB directly on the canvas"
```

---

### Task 4: Add direct block drawing and middle-button panning

**Files:**
- Modify: `src/types/canvas.ts`
- Modify: `src/app/core/main/canvas/canvas-editor.tsx`
- Modify: `src/app/core/main/canvas/nodes/canvas-nodes.tsx`
- Test: `scripts/tests/canvas-gesture-policy.test.mjs`

- [ ] **Step 1: Extend the rectangle tests for reverse and small drags**

```js
test('small drag is expanded to the node minimum', () => {
  assert.deepEqual(normalizeDrawRect({ x: 10, y: 10 }, { x: 30, y: 25 }), {
    x: 10, y: 10, width: 120, height: 72,
  })
})
```

Run `npx -y pnpm@9.15.9 test:canvas`; expected: PASS for the policy and no rendered rectangle yet.

- [ ] **Step 2: Add the draw draft state and pointer handlers**

In `canvas-editor.tsx`, keep a screen-space draft and only start it for primary-button events whose target is `.react-flow__pane`:

```ts
interface DrawDraft {
  pointerId: number
  start: { x: number; y: number }
  current: { x: number; y: number }
}

const [drawDraft, setDrawDraft] = useState<DrawDraft | null>(null)

const finishBlockDraw = useCallback((draft: DrawDraft) => {
  const screenRect = normalizeDrawRect(draft.start, draft.current)
  const distance = Math.hypot(draft.current.x - draft.start.x, draft.current.y - draft.start.y)
  if (distance < POINTER_DRAG_THRESHOLD) return
  const position = screenToFlowPosition({ x: screenRect.x, y: screenRect.y })
  const end = screenToFlowPosition({ x: screenRect.x + screenRect.width, y: screenRect.y + screenRect.height })
  const id = crypto.randomUUID()
  pushHistory()
  setNodes(current => [...current.map(node => ({ ...node, selected: false })), {
    id,
    type: 'text',
    position,
    width: Math.max(120, end.x - position.x),
    height: Math.max(72, end.y - position.y),
    selected: true,
    data: { label: '', backgroundColor: 'var(--card)', textColor: 'var(--card-foreground)' },
  }])
  requestAnimationFrame(() => emitter.emit('canvas-focus-node', id))
}, [pushHistory, screenToFlowPosition, setNodes])
```

Render a pointer-events-none rectangle over the pane while `drawDraft` is active.

- [ ] **Step 3: Configure React Flow’s native gestures**

Use:

```tsx
<ReactFlow
  panOnDrag={[1]}
  selectionOnDrag={false}
  nodesDraggable={!previewSnapshot && tool === 'select'}
  elementsSelectable={!previewSnapshot && tool === 'select'}
/>
```

The explicit draw handler owns empty-pane primary drags; existing nodes retain primary drag movement.

- [ ] **Step 4: Make text nodes multiline and resizable**

Add `NodeResizer` and a `<textarea>` that subscribes to `canvas-focus-node` in `TextCanvasNode`. Apply `width: '100%'`, `height: '100%'`, `resize: 'none'`, `background: 'transparent'`, `color: data.textColor`, and `fontSize: data.fontSize`.

- [ ] **Step 5: Run tests and build**

Run:

```powershell
npx -y pnpm@9.15.9 test:canvas
npx -y pnpm@9.15.9 build
```

Expected: tests and build pass; primary drag on an empty pane creates one selected text block; primary drag on a node moves it; middle drag pans.

- [ ] **Step 6: Commit direct manipulation**

```powershell
git add src/types/canvas.ts src/app/core/main/canvas/canvas-editor.tsx src/app/core/main/canvas/nodes/canvas-nodes.tsx scripts/tests/canvas-gesture-policy.test.mjs
git commit -m "feat: draw canvas text blocks directly"
```

---

### Task 5: Add paste and drop ingestion

**Files:**
- Modify: `src/types/canvas.ts`
- Modify: `src/lib/canvas/content-ingest.ts`
- Modify: `src/app/core/main/canvas/canvas-editor.tsx`
- Modify: `src/app/core/main/canvas/nodes/canvas-nodes.tsx`
- Test: `scripts/tests/canvas-content-ingest.test.mjs`

- [ ] **Step 1: Add failing classification tests**

Add these exact cases to `scripts/tests/canvas-content-ingest.test.mjs`:

```js
import { draftsFromTransfer, offsetIngestDrafts } from '../../src/lib/canvas/content-ingest.ts'

test('files take precedence over text and retain their media kind', () => {
  const image = new File(['png'], 'map.png', { type: 'image/png' })
  const document = new File(['hello'], 'plan.txt', { type: 'text/plain' })
  const drafts = draftsFromTransfer({ files: [image, document], html: '<b>ignored</b>', text: 'ignored' })
  assert.deepEqual(drafts.map(draft => draft.kind), ['image', 'file'])
})

test('sanitized html falls back to text and empty input creates nothing', () => {
  assert.equal(draftsFromTransfer({ files: [], html: '<p>旅行<br>清单</p>', text: '' })[0].kind, 'text')
  assert.deepEqual(draftsFromTransfer({ files: [], html: '', text: '   ' }), [])
})

test('multiple drafts cascade by 28 pixels', () => {
  assert.deepEqual(offsetIngestDrafts([{ kind: 'text' }, { kind: 'link' }], { x: 100, y: 80 }), [
    { draft: { kind: 'text' }, position: { x: 100, y: 80 } },
    { draft: { kind: 'link' }, position: { x: 128, y: 108 } },
  ])
})
```

- [ ] **Step 2: Add standard ingest drafts**

Use this union in `content-ingest.ts`:

```ts
export type CanvasIngestDraft =
  | { kind: 'text'; text: string; width: number; height: number }
  | { kind: 'link'; url: string; label: string; width: 320; height: 112 }
  | { kind: 'image'; file: File; label: string; width: 320; height: 220 }
  | { kind: 'file'; file: File; label: string; width: 320; height: 112 }
```

`draftsFromTransfer()` must prefer files, then URL text, then sanitized HTML text, then plain text.

Implement the complete conversion and offset helpers as:

```ts
export interface CanvasTransferInput {
  files: File[]
  html: string
  text: string
}

function htmlToPlainText(html: string) {
  return html
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/p\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .trim()
}

export function draftsFromTransfer(input: CanvasTransferInput): CanvasIngestDraft[] {
  if (input.files.length > 0) {
    return input.files.map(file => file.type.startsWith('image/')
      ? { kind: 'image', file, label: file.name, width: 320, height: 220 }
      : { kind: 'file', file, label: file.name, width: 320, height: 112 })
  }
  const content = input.html ? htmlToPlainText(input.html) : input.text.trim()
  if (!content) return []
  const classified = classifyTextContent(content)
  if (classified.kind === 'link') {
    return [{ kind: 'link', url: classified.value, label: classified.value, width: 320, height: 112 }]
  }
  const size = estimateTextBlockSize(classified.value)
  return [{ kind: 'text', text: classified.value, ...size }]
}

export function offsetIngestDrafts<T>(drafts: T[], origin: { x: number; y: number }) {
  return drafts.map((draft, index) => ({
    draft,
    position: { x: origin.x + index * 28, y: origin.y + index * 28 },
  }))
}
```

- [ ] **Step 3: Add file-node data and rendering**

Extend `CanvasNodeType` with `'file'`, register `FileCanvasNode`, and render a compact card showing filename, extension, and stored path. Double-click opens the stored file with the existing opener integration.

- [ ] **Step 4: Integrate `onPaste`, `onDragOver`, and `onDrop`**

The editor handler must:

1. Ignore editable inputs and the AI dock.
2. Convert the client point with `screenToFlowPosition()`.
3. Persist image/file bytes under `画布资源/<uuid>.<ext>`.
4. Push history once for the complete batch.
5. Add all nodes with 28px cascading offsets.
6. Show a toast and add nothing when conversion fails.

- [ ] **Step 5: Run tests and build**

Run `npx -y pnpm@9.15.9 test:canvas` and `npx -y pnpm@9.15.9 build`.

Expected: all policy tests pass; pasted text and URLs produce nodes; dropped image/file data persists and reloads.

- [ ] **Step 6: Commit ingestion**

```powershell
git add src/types/canvas.ts src/lib/canvas/content-ingest.ts src/app/core/main/canvas/canvas-editor.tsx src/app/core/main/canvas/nodes/canvas-nodes.tsx scripts/tests/canvas-content-ingest.test.mjs
git commit -m "feat: ingest pasted and dropped canvas content"
```

---

### Task 6: Add node and canvas context styling

**Files:**
- Create: `src/app/core/main/canvas/canvas-node-style-menu.tsx`
- Modify: `src/types/canvas.ts`
- Modify: `src/app/core/main/canvas/canvas-editor.tsx`
- Modify: `src/app/core/main/canvas/nodes/canvas-nodes.tsx`
- Modify: `messages/en.json`
- Modify: `messages/zh.json`
- Modify: `messages/zh-TW.json`
- Modify: `messages/ja.json`
- Modify: `messages/pt-BR.json`

- [ ] **Step 1: Add the persistent style fields**

```ts
export interface CanvasNodeData extends Record<string, unknown> {
  backgroundColor?: string
  textColor?: string
  fontSize?: 13 | 15 | 18 | 24
  borderColor?: string
  borderStyle?: 'none' | 'solid' | 'dashed' | 'dotted'
  // existing fields remain
}

export interface CanvasDocumentSettings {
  layoutDirection: 'TB' | 'LR'
  showGrid: boolean
  snapToGrid: boolean
  backgroundColor?: string
}
```

Normalization must preserve old `fillColor`/`color` values as fallback values without rewriting stored documents eagerly.

- [ ] **Step 2: Build `CanvasNodeStyleMenu`**

Expose this controlled API, use six theme-safe presets plus native color inputs, and call `onSessionStart` once when the menu opens so continuous changes share one history checkpoint:

```ts
export interface CanvasNodeStyleMenuProps {
  value: {
    backgroundColor?: string
    textColor?: string
    fontSize?: 13 | 15 | 18 | 24
    borderColor?: string
    borderStyle?: 'none' | 'solid' | 'dashed' | 'dotted'
  }
  onSessionStart: () => void
  onChange: (patch: Partial<CanvasNodeStyleMenuProps['value']>) => void
}

export const NODE_BACKGROUND_PRESETS = ['#ffffff', '#f8fafc', '#dbeafe', '#dcfce7', '#fef3c7', '#fee2e2']
export const NODE_TEXT_PRESETS = ['#0f172a', '#334155', '#1d4ed8', '#15803d', '#b45309', '#b91c1c']
```

- [ ] **Step 3: Split node and pane context menus**

Node right-click selects the target and renders node actions plus the style component. Pane right-click renders tool choices (`select`, `pen`, `highlighter`, `eraser`) and canvas background/grid controls. Do not show node-only actions on a blank pane.

- [ ] **Step 4: Apply styles in renderers**

Update `nodeStyle()` to use:

```ts
const backgroundColor = data.backgroundColor ?? data.fillColor
const borderColor = data.borderColor ?? data.color
return {
  backgroundColor,
  color: data.textColor,
  fontSize: data.fontSize,
  borderColor,
  borderStyle: data.borderStyle === 'none' ? 'none' : data.borderStyle,
}
```

Apply the canvas background color to the pane wrapper and keep the dot grid visible when enabled.

- [ ] **Step 5: Run build and verify one-step undo**

Run `npx -y pnpm@9.15.9 build`. In the application, change three colors during one open menu session, close it, press Ctrl+Z once, and confirm all three changes revert together.

- [ ] **Step 6: Commit styling**

```powershell
git add src/types/canvas.ts src/app/core/main/canvas/canvas-node-style-menu.tsx src/app/core/main/canvas/canvas-editor.tsx src/app/core/main/canvas/nodes/canvas-nodes.tsx messages
git commit -m "feat: add canvas context styling"
```

---

### Task 7: Add right-button long-press relation creation

**Files:**
- Create: `src/app/core/main/canvas/canvas-relation-editor.tsx`
- Modify: `src/types/canvas.ts`
- Modify: `src/lib/canvas/relation-policy.ts`
- Modify: `src/app/core/main/canvas/canvas-editor.tsx`
- Test: `scripts/tests/canvas-gesture-policy.test.mjs`
- Test: `scripts/tests/canvas-relation-policy.test.mjs`

- [ ] **Step 1: Add failing relation tests**

Add these assertions to `scripts/tests/canvas-relation-policy.test.mjs`:

```js
import { isValidRelationTarget } from '../../src/lib/canvas/relation-policy.ts'

test('relations require two different existing nodes', () => {
  const nodeIds = new Set(['a', 'b'])
  assert.equal(isValidRelationTarget('a', 'b', nodeIds), true)
  assert.equal(isValidRelationTarget('a', 'a', nodeIds), false)
  assert.equal(isValidRelationTarget('a', null, nodeIds), false)
  assert.equal(isValidRelationTarget('a', 'missing', nodeIds), false)
})

test('forward relation has no start marker', () => {
  const visuals = relationEdgeVisuals({ ...DEFAULT_RELATION, direction: 'forward' })
  assert.equal(visuals.markerStart, false)
  assert.equal(visuals.markerEnd, true)
})
```

- [ ] **Step 2: Extend serialized relation data**

Add `data?: CanvasRelationData` to `CanvasEdge`. Replace repeated edge serialization blocks in `canvas-editor.tsx` with one `serializeEdges(edges)` helper that preserves `data`, `label`, and `type`.

- [ ] **Step 3: Implement right-pointer arbitration**

Keep one ref:

```ts
interface RelationPointerSession {
  pointerId: number
  sourceId: string
  startedAt: number
  start: { x: number; y: number }
  current: { x: number; y: number }
  active: boolean
  targetId: string | null
}
```

On node right-pointer down, start a 320ms timer. Once active, capture pointer movement, render a preview line, and update the target from `document.elementFromPoint(...).closest('.react-flow__node')?.getAttribute('data-id')`. On pointer up, suppress the following contextmenu only for active relation sessions.

- [ ] **Step 4: Create the relation and anchored editor**

On a valid target:

```ts
const edgeId = crypto.randomUUID()
pushHistory()
setEdges(current => addEdge({
  id: edgeId,
  source: session.sourceId,
  target: session.targetId,
  type: 'smoothstep',
  label: '',
  data: DEFAULT_RELATION,
}, current))
setEditingRelationId(edgeId)
setRelationEditorMode('create')
```

Render `CanvasRelationEditor` at the screen midpoint between source and target. Enter and outside click save; Escape in create mode deletes the just-created edge without adding another history checkpoint.

- [ ] **Step 5: Render direction and line style**

Map `relationEdgeVisuals()` to React Flow `style`, `markerStart`, and `markerEnd` using `MarkerType.ArrowClosed`. Double-clicking an existing edge opens the same anchored editor in edit mode.

- [ ] **Step 6: Run tests, build, and interaction checks**

Run:

```powershell
npx -y pnpm@9.15.9 test:canvas
npx -y pnpm@9.15.9 build
```

Manually verify short right-click opens the context menu; long right-drag creates one relation; releasing on blank/self creates none; Escape cancels creation; one Ctrl+Z removes a completed relation.

- [ ] **Step 7: Commit relations**

```powershell
git add src/types/canvas.ts src/lib/canvas/relation-policy.ts src/app/core/main/canvas/canvas-relation-editor.tsx src/app/core/main/canvas/canvas-editor.tsx scripts/tests
git commit -m "feat: create canvas relations with right drag"
```

---

### Task 8: Package, install, and verify the finished Windows application

**Files:**
- Modify: `docs/verification/windows-foundation.md`
- Modify: `.adworkflow/task_spec.json`
- Modify: `.adworkflow/worker_state.json`
- Modify: `.adworkflow/verification_result.json`
- Modify: `.adworkflow/review_findings.json`

- [ ] **Step 1: Run the complete automated suite**

```powershell
npx -y pnpm@9.15.9 test:canvas
npx -y pnpm@9.15.9 verify:foundation
npx -y pnpm@9.15.9 build
cmd /d /s /c "call F:\toolchains\portable-msvc\msvc\setup_x64.bat && cargo check --manifest-path src-tauri\Cargo.toml --locked"
cmd /d /s /c "call F:\toolchains\portable-msvc\msvc\setup_x64.bat && npx -y pnpm@9.15.9 tauri build --debug --bundles nsis"
```

Expected: all commands pass and `src-tauri/target/debug/bundle/nsis/zeroxB_0.32.1_x64-setup.exe` exists.

- [ ] **Step 2: Install to the F drive**

Stop the old process, silently install to `F:\zeroxBApp`, and copy the installer to `F:\zeroxB-builds\zeroxB_0.32.1_x64-setup.exe`. Preserve user data unless an explicit migration is required by the new Tauri identifier.

- [ ] **Step 3: Run installed UI smoke tests**

Verify through the installed executable `F:\zeroxBApp\zeroxb.exe`:

1. Window title and About page show `zeroxB`.
2. Startup opens a canvas without exposing the former three-panel landing view.
3. Empty left-drag creates a correctly sized editable text block.
4. Existing-node left-drag moves the block.
5. Middle drag pans the canvas.
6. Text/URL/image/file paste or drop creates the correct node type.
7. Node and pane right-click menus are distinct.
8. Right long-drag creates and edits a relation.
9. Undo/redo works for each new mutation.
10. Canvas AI dock and permission modes remain visible and functional.

- [ ] **Step 4: Record package evidence**

Record installer size, SHA-256, Authenticode status, installed executable path, product name, version, test commands, and residual risk in `docs/verification/windows-foundation.md` and `.adworkflow` result files.

- [ ] **Step 5: Final diff and commit**

```powershell
git diff --check
git status --short
git add docs/verification .adworkflow
git commit -m "docs: record zeroxB canvas verification"
```

Expected: clean worktree, installed zeroxB process responsive, and no stale `Huabu` runtime strings.
