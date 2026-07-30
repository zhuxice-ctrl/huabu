# Canvas Interaction Physics and Image Tags Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复外部文本粘贴排版，重排画布左右键职责，实现四边关系锚点、轻量节点惯性、缩放感知的文本块创建尺寸，以及图片悬停元数据与当前画布标签查询。

**Architecture:** 保留 React Flow、现有碰撞引擎、历史记录与文档持久化；把文本、手势、锚点、惯性、缩放尺寸和图片标签拆成纯策略模块，`canvas-editor.tsx` 只负责编排会话。图片标签目录通过 Tauri Store 持久化，节点自身的名称、评论和标签仍保存在画布文档中。

**Tech Stack:** TypeScript、React 19、Next.js 15、React Flow 12、Zustand、Tauri Store、Node test runner、Rust/Tauri 2、Windows NSIS。

---

## 执行前约束

- 基线规格：`docs/superpowers/specs/2026-07-30-canvas-interaction-physics-image-tags-design.md`，规格 commit `c70d3504`。
- 目标分支：`codex/canvas-interaction-physics-image-tags`。
- 只做 Windows 10/11 x64，不添加 Android、iOS、macOS 或 Linux 交付物。
- 不使用 ADworkflo，不修改 `.adworkflow/**`、`.codegraph/**`、`src-tauri/src/printing.rs`、`pnpm-workspace.yaml`。
- 中文和其他非 ASCII 文件使用 UTF-8；禁止全仓格式化、换行归一化或无关重构。
- 每个任务严格执行失败测试、最小实现、局部验证、显式暂存、独立提交。
- 不使用 `git add -A`；每次只 `git add` 当前任务列出的路径。
- `canvas-editor.tsx` 已较大，只做策略接线，不把纯算法继续写进组件。

开始命令：

```powershell
git fetch origin
git switch codex/canvas-interaction-physics-image-tags
git pull --ff-only origin codex/canvas-interaction-physics-image-tags
git merge-base --is-ancestor c70d3504 HEAD
git status -sb
```

预期：祖先检查退出码为 `0`；除执行者自己明确拥有的改动外，工作区为空。

## 文件职责

- `src/lib/canvas/external-text.ts`：外部文本选择、HTML DOM 回退、Unicode 规范化、选区插入。
- `src/lib/canvas/gesture-policy.ts`：空白画布左右键释放意图、关系激活阈值、来源方向判定。
- `src/lib/canvas/relation-interaction.ts`：四边 typed handle 映射与目标最近边计算。
- `src/lib/canvas/node-inertia.ts`：最近采样窗口、加权速度、投影距离、阻尼进度。
- `src/lib/canvas/viewport-sizing.ts`：高倍缩放下文本创建软下限。
- `src/lib/canvas/image-tags.ts`：标签清洗、目录合并、OR 过滤、稳定导航顺序。
- `src/stores/canvas-image-tags.ts`：工作区图片标签目录持久化与当前会话筛选状态。
- `src/app/core/main/canvas/canvas-image-info.tsx`：图片名称、评论、标签编辑面板。
- `src/app/core/main/canvas/canvas-image-tag-filter.tsx`：工具栏标签筛选、上一个/下一个定位。
- `src/app/core/main/canvas/nodes/canvas-nodes.tsx`：文本编辑模式、typed handles、图片悬停浮层。
- `src/app/core/main/canvas/canvas-editor.tsx`：指针、几何、惯性、历史和筛选接线。
- `src/types/canvas.ts`：`imageTags` 与仅用于渲染的筛选状态类型。

---

### Task 1: 统一外部文本清洗与选区插入

**Files:**
- Create: `src/lib/canvas/external-text.ts`
- Create: `scripts/tests/canvas-external-text.test.mjs`
- Modify: `src/lib/canvas/content-ingest.ts`
- Modify: `src/app/core/main/canvas/nodes/canvas-nodes.tsx`

- [ ] **Step 1: 写失败测试，锁定纯文本优先、Unicode 换行和选区行为**

创建 `scripts/tests/canvas-external-text.test.mjs`：

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  chooseExternalText,
  insertExternalText,
  normalizeExternalText,
} from '../../src/lib/canvas/external-text.ts'

test('system plain text wins over external html and normalizes separators', () => {
  const value = chooseExternalText({
    plainText: '\ufeff第一段\r\n第二段\u2028第三段\u00a0结尾\u200b',
    htmlText: '<p>错误 HTML</p>',
    htmlToText: () => '不应使用',
  })
  assert.equal(value, '第一段\n第二段\n第三段 结尾')
})

test('html is used only when plain text is empty', () => {
  assert.equal(chooseExternalText({
    plainText: '',
    htmlText: '<p>A</p><p>B</p>',
    htmlToText: () => 'A\nB\n',
  }), 'A\nB')
})

test('tabs repeated ascii spaces and internal blank lines are preserved', () => {
  assert.equal(normalizeExternalText('  A\t  B\n\nC  '), 'A\t  B\n\nC')
})

test('selection insertion replaces exactly one range and returns the caret', () => {
  assert.deepEqual(insertExternalText('abcd', 1, 3, '甲\n乙'), {
    value: 'a甲\n乙d',
    caret: 4,
  })
})
```

- [ ] **Step 2: 运行测试并确认因模块缺失而失败**

Run:

```powershell
node --experimental-strip-types --test scripts/tests/canvas-external-text.test.mjs
```

Expected: FAIL，错误包含 `ERR_MODULE_NOT_FOUND` 或缺少导出函数。

- [ ] **Step 3: 实现纯策略模块，并替换 `content-ingest` 的 HTML 正则路径**

在 `src/lib/canvas/external-text.ts` 写入下列接口和实现：

```ts
const LINE_SEPARATOR_RE = /\r\n?|[\u2028\u2029]/g
const ZERO_WIDTH_RE = /[\u200B-\u200D\u2060\uFEFF]/g
const EXOTIC_SPACE_RE = /[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g
const BLOCK_TAGS = new Set([
  'ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'DIV', 'DL', 'FIELDSET',
  'FIGCAPTION', 'FIGURE', 'FOOTER', 'FORM', 'H1', 'H2', 'H3', 'H4',
  'H5', 'H6', 'HEADER', 'HR', 'LI', 'MAIN', 'NAV', 'OL', 'P', 'PRE',
  'SECTION', 'TABLE', 'TR', 'UL',
])

export function normalizeExternalText(value: string): string {
  return value
    .replace(LINE_SEPARATOR_RE, '\n')
    .replace(ZERO_WIDTH_RE, '')
    .replace(EXOTIC_SPACE_RE, ' ')
    .replace(/[ \t]+$/gm, '')
    .trim()
}

export function htmlToExternalText(html: string): string {
  if (!html || typeof DOMParser === 'undefined') return ''
  const document = new DOMParser().parseFromString(html, 'text/html')
  const chunks: string[] = []
  const visit = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      chunks.push(node.textContent ?? '')
      return
    }
    if (!(node instanceof Element)) return
    if (node.tagName === 'BR') {
      chunks.push('\n')
      return
    }
    const block = BLOCK_TAGS.has(node.tagName)
    if (block && chunks.at(-1) !== '\n') chunks.push('\n')
    node.childNodes.forEach(visit)
    if (block && chunks.at(-1) !== '\n') chunks.push('\n')
  }
  document.body.childNodes.forEach(visit)
  return normalizeExternalText(chunks.join(''))
}

export function chooseExternalText(input: {
  plainText: string
  htmlText: string
  htmlToText?: (html: string) => string
}): string {
  const plain = normalizeExternalText(input.plainText)
  if (plain) return plain
  return normalizeExternalText((input.htmlToText ?? htmlToExternalText)(input.htmlText))
}

export function insertExternalText(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  inserted: string,
) {
  const start = Math.max(0, Math.min(value.length, selectionStart))
  const end = Math.max(start, Math.min(value.length, selectionEnd))
  const normalized = normalizeExternalText(inserted)
  return {
    value: `${value.slice(0, start)}${normalized}${value.slice(end)}`,
    caret: start + normalized.length,
  }
}
```

在 `src/lib/canvas/content-ingest.ts`：

```ts
import { chooseExternalText } from './external-text.ts'

// transferUrlChoice 和 draftsFromTransfer 都使用同一个结果：
const content = chooseExternalText({
  plainText: input.text,
  htmlText: input.html,
})
```

删除旧的正则 `htmlToPlainText`。在 `TextCanvasNode` 的 `<textarea>` 增加 `onPaste`，读取 `text/plain`/`text/html`，调用 `chooseExternalText` 与 `insertExternalText`，`preventDefault()` 后只调用一次 `updateNodeData`，并在 `requestAnimationFrame` 中恢复光标。

- [ ] **Step 4: 运行局部测试和类型检查**

Run:

```powershell
node --experimental-strip-types --test scripts/tests/canvas-external-text.test.mjs scripts/tests/canvas-content-ingest.test.mjs scripts/tests/canvas-text-node-sizing.test.mjs
.\node_modules\.bin\tsc.CMD --noEmit
```

Expected: 全部 PASS；TypeScript 无输出且退出码为 `0`。

- [ ] **Step 5: 提交外部文本策略**

```powershell
git add scripts/tests/canvas-external-text.test.mjs src/lib/canvas/external-text.ts src/lib/canvas/content-ingest.ts src/app/core/main/canvas/nodes/canvas-nodes.tsx
git commit -m "fix(canvas): normalize external text paste"
```

---

### Task 2: 重排空白画布左右键并增加双击编辑模式

**Files:**
- Modify: `src/lib/canvas/gesture-policy.ts`
- Modify: `scripts/tests/canvas-gesture-policy.test.mjs`
- Modify: `src/app/core/main/canvas/canvas-editor.tsx`
- Modify: `src/app/core/main/canvas/nodes/canvas-nodes.tsx`
- Modify: `scripts/tests/canvas-editor-contract.test.mjs`
- Modify: `scripts/tests/canvas-node-visual-contract.test.mjs`

- [ ] **Step 1: 写失败测试，锁定左键框选、右键绘制与双击编辑合同**

在 `canvas-gesture-policy.test.mjs` 增加：

```js
test('empty-canvas buttons assign marquee to left and text drawing to right', () => {
  assert.equal(classifyPointerRelease({ button: 0, elapsedMs: 20, deltaX: 30, deltaY: 20, startedOnNode: false }), 'marquee-select')
  assert.equal(classifyPointerRelease({ button: 2, elapsedMs: 20, deltaX: 30, deltaY: 20, startedOnNode: false }), 'draw-block')
  assert.equal(classifyPointerRelease({ button: 2, elapsedMs: 20, deltaX: 1, deltaY: 1, startedOnNode: false }), 'pane-click')
})
```

在 `canvas-editor-contract.test.mjs` 和 `canvas-node-visual-contract.test.mjs` 增加源码合同断言：

```js
assert.match(editor, /event\.button === 2[\s\S]*react-flow__pane/)
assert.match(editor, /selectionOnDrag=\{true\}/)
assert.match(renderer, /onDoubleClick/)
assert.match(renderer, /readOnly=\{!editing\}/)
assert.match(renderer, /event\.key === 'Escape'/)
```

- [ ] **Step 2: 运行测试并确认旧按钮职责导致失败**

```powershell
node --experimental-strip-types --test scripts/tests/canvas-gesture-policy.test.mjs scripts/tests/canvas-editor-contract.test.mjs scripts/tests/canvas-node-visual-contract.test.mjs
```

Expected: 至少一个断言 FAIL，显示左键仍为 `draw-block` 或缺少编辑模式。

- [ ] **Step 3: 修改手势分类、指针会话和文本编辑状态**

将 `classifyPointerRelease` 的空白画布分支改为：

```ts
if (!input.startedOnNode && input.button === 0) {
  return hasDrawableArea({ x: 0, y: 0 }, { x: input.deltaX, y: input.deltaY })
    ? 'marquee-select'
    : 'pane-click'
}
if (!input.startedOnNode && input.button === 2) {
  return hasDrawableArea({ x: 0, y: 0 }, { x: input.deltaX, y: input.deltaY })
    ? 'draw-block'
    : 'pane-click'
}
```

在 `handleBlockDrawPointerDown` 中仅对 `button === 2` 且 `.react-flow__pane` 创建 `DrawGeometrySession`；左键空白拖动交给 React Flow，设置：

```tsx
selectionOnDrag={true}
panOnDrag={[1]}
```

右键小面积释放时清理 draw session，不创建节点也不打开 pane 菜单。`TextCanvasNode` 使用：

同时把 React Flow 的 pane context handler 改为显式阻止默认菜单，并删除仅用于 `contextTarget === 'pane'` 的画布模式/背景菜单组：

```tsx
onPaneContextMenu={event => {
  event.preventDefault()
  event.stopPropagation()
}}
```

节点和关系仍通过现有 `onNodeContextMenu` / `onEdgeContextMenu` 打开对应设置。

`TextCanvasNode` 使用：

```tsx
const [editing, setEditing] = useState(false)

<div
  onDoubleClick={event => {
    event.stopPropagation()
    setEditing(true)
    requestAnimationFrame(() => textareaRef.current?.focus())
  }}
>
  <textarea
    readOnly={!editing}
    className={cn(
      'size-full resize-none bg-transparent text-left leading-6 outline-none',
      editing ? 'nodrag nowheel' : 'pointer-events-none',
    )}
    onBlur={() => setEditing(false)}
    onKeyDown={event => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      setEditing(false)
      event.currentTarget.blur()
    }}
  />
</div>
```

`canvas-focus-node` 事件同时调用 `setEditing(true)`，保证新创建空文本块仍能直接输入。

- [ ] **Step 4: 验证手势和既有创建尺寸测试**

```powershell
node --experimental-strip-types --test scripts/tests/canvas-gesture-policy.test.mjs scripts/tests/canvas-editor-contract.test.mjs scripts/tests/canvas-node-visual-contract.test.mjs scripts/tests/canvas-creation-sizing.test.mjs
.\node_modules\.bin\tsc.CMD --noEmit
```

Expected: 全部 PASS。

- [ ] **Step 5: 提交按钮职责与编辑模式**

```powershell
git add src/lib/canvas/gesture-policy.ts scripts/tests/canvas-gesture-policy.test.mjs src/app/core/main/canvas/canvas-editor.tsx src/app/core/main/canvas/nodes/canvas-nodes.tsx scripts/tests/canvas-editor-contract.test.mjs scripts/tests/canvas-node-visual-contract.test.mjs
git commit -m "feat(canvas): clarify pointer roles and text editing"
```

---

### Task 3: 支持四边关系锚点与方向锁定

**Files:**
- Modify: `src/lib/canvas/gesture-policy.ts`
- Modify: `src/lib/canvas/relation-interaction.ts`
- Modify: `scripts/tests/canvas-relation-interaction.test.mjs`
- Modify: `src/app/core/main/canvas/nodes/canvas-nodes.tsx`
- Modify: `src/app/core/main/canvas/canvas-editor.tsx`
- Modify: `scripts/tests/canvas-editor-contract.test.mjs`

- [ ] **Step 1: 写失败测试覆盖四个来源方向、四个目标区域和 legacy ID**

```js
test('source direction locks every side and maps to typed handle ids', () => {
  assert.equal(relationSourceSideFromVector({ x: 8, y: 2 }), 'right')
  assert.equal(relationSourceSideFromVector({ x: -8, y: 2 }), 'left')
  assert.equal(relationSourceSideFromVector({ x: 2, y: -8 }), 'top')
  assert.equal(relationSourceSideFromVector({ x: 2, y: 8 }), 'bottom')
  assert.equal(sourceHandleIdForSide('bottom'), 'bottom')
  assert.equal(sourceHandleIdForSide('right'), 'right')
  assert.equal(sourceHandleIdForSide('top'), 'source-top')
  assert.equal(sourceHandleIdForSide('left'), 'source-left')
})

test('target side follows the pointer nearest edge', () => {
  const rect = { x: 100, y: 100, width: 200, height: 120 }
  assert.equal(selectTargetRelationHandle(rect, { x: 110, y: 160 }).handleId, 'left')
  assert.equal(selectTargetRelationHandle(rect, { x: 290, y: 160 }).handleId, 'target-right')
  assert.equal(selectTargetRelationHandle(rect, { x: 200, y: 105 }).handleId, 'top')
  assert.equal(selectTargetRelationHandle(rect, { x: 200, y: 215 }).handleId, 'target-bottom')
})
```

- [ ] **Step 2: 运行关系测试并确认缺少新导出**

```powershell
node --experimental-strip-types --test scripts/tests/canvas-relation-interaction.test.mjs scripts/tests/canvas-editor-contract.test.mjs
```

Expected: FAIL，错误指向 `relationSourceSideFromVector`、`sourceHandleIdForSide` 或 `selectTargetRelationHandle`。

- [ ] **Step 3: 实现方向与 typed handle 映射，并接入 pointer session**

在 `gesture-policy.ts` 增加：

```ts
export type RelationSide = 'top' | 'right' | 'bottom' | 'left'

export function relationSourceSideFromVector(delta: { x: number; y: number }): RelationSide {
  if (Math.abs(delta.x) >= Math.abs(delta.y)) return delta.x < 0 ? 'left' : 'right'
  return delta.y < 0 ? 'top' : 'bottom'
}
```

在 `relation-interaction.ts` 增加稳定映射：

```ts
const SOURCE_HANDLE_IDS = { top: 'source-top', right: 'right', bottom: 'bottom', left: 'source-left' } as const
const TARGET_HANDLE_IDS = { top: 'top', right: 'target-right', bottom: 'target-bottom', left: 'left' } as const

export function sourceHandleIdForSide(side: RelationSide) {
  return SOURCE_HANDLE_IDS[side]
}

export function targetHandleIdForSide(side: RelationSide) {
  return TARGET_HANDLE_IDS[side]
}

export function selectTargetRelationHandle(rect: CanvasRect, pointer: { x: number; y: number }) {
  const distances = [
    { side: 'top' as const, value: Math.abs(pointer.y - rect.y), point: { x: pointer.x, y: rect.y } },
    { side: 'right' as const, value: Math.abs(pointer.x - (rect.x + rect.width)), point: { x: rect.x + rect.width, y: pointer.y } },
    { side: 'bottom' as const, value: Math.abs(pointer.y - (rect.y + rect.height)), point: { x: pointer.x, y: rect.y + rect.height } },
    { side: 'left' as const, value: Math.abs(pointer.x - rect.x), point: { x: rect.x, y: pointer.y } },
  ]
  const nearest = distances.reduce((best, candidate) => candidate.value < best.value ? candidate : best)
  return { handleId: targetHandleIdForSide(nearest.side), point: nearest.point }
}
```

`RelationPointerSession` 新增 `sourceSide: RelationSide | null`。越过 `RELATION_DRAG_THRESHOLD` 的那一帧调用 `relationSourceSideFromVector` 并锁定；后续 `updateRelationPointerGeometry` 不再重新选择来源。目标存在时调用 `selectTargetRelationHandle`。

`ConnectionHandles` 保留四个 legacy handles，并新增四个互补 role handles：

```tsx
<Handle type="source" position={Position.Top} id="source-top" className="canvas-handle-role-pair" />
<Handle type="target" position={Position.Right} id="target-right" className="canvas-handle-role-pair" />
<Handle type="target" position={Position.Bottom} id="target-bottom" className="canvas-handle-role-pair" />
<Handle type="source" position={Position.Left} id="source-left" className="canvas-handle-role-pair" />
```

互补 handle 与 legacy handle 同位，视觉尺寸/颜色一致，不额外显示第二个圆点。

- [ ] **Step 4: 运行关系、路由和编辑器测试**

```powershell
node --experimental-strip-types --test scripts/tests/canvas-relation-interaction.test.mjs scripts/tests/canvas-relation-policy.test.mjs scripts/tests/canvas-relation-routing.test.mjs scripts/tests/canvas-editor-contract.test.mjs
.\node_modules\.bin\tsc.CMD --noEmit
```

Expected: 全部 PASS；legacy relation tests 保持通过。

- [ ] **Step 5: 提交四边关系手势**

```powershell
git add src/lib/canvas/gesture-policy.ts src/lib/canvas/relation-interaction.ts scripts/tests/canvas-relation-interaction.test.mjs src/app/core/main/canvas/nodes/canvas-nodes.tsx src/app/core/main/canvas/canvas-editor.tsx scripts/tests/canvas-editor-contract.test.mjs
git commit -m "feat(canvas): route relation gestures through four sides"
```

---

### Task 4: 增加缩放感知的文本创建软下限

**Files:**
- Modify: `src/lib/canvas/viewport-sizing.ts`
- Modify: `scripts/tests/canvas-viewport-sizing.test.mjs`
- Modify: `src/app/core/main/canvas/canvas-editor.tsx`
- Modify: `scripts/tests/canvas-creation-sizing.test.mjs`

- [ ] **Step 1: 写失败测试覆盖 100%、200%、600% 和无跳变合同**

```js
test('drawn text soft minimum grows sublinearly above 100 percent', () => {
  assert.deepEqual(resolveZoomAwareTextDrawSize({ width: 40, height: 20 }, 1), { width: 160, height: 88 })
  assert.deepEqual(resolveZoomAwareTextDrawSize({ width: 40, height: 20 }, 2), { width: 113.14, height: 62.23 })
  assert.deepEqual(resolveZoomAwareTextDrawSize({ width: 40, height: 20 }, 6), { width: 65.32, height: 35.93 })
  assert.deepEqual(resolveZoomAwareTextDrawSize({ width: 300, height: 120 }, 6), { width: 300, height: 120 })
})

test('reverse drag expands the soft minimum toward the pointer direction', () => {
  assert.deepEqual(resolveZoomAwareTextDrawRect({ x: 200, y: 160 }, { x: 190, y: 150 }, 2), {
    x: 86.86, y: 97.77, width: 113.14, height: 62.23,
  })
})
```

在创建合同中断言预览 `candidate` 直接用于最终节点 `width/height`，没有 release-time 固定尺寸替换。

- [ ] **Step 2: 运行尺寸测试并确认缺少解析函数**

```powershell
node --experimental-strip-types --test scripts/tests/canvas-viewport-sizing.test.mjs scripts/tests/canvas-creation-sizing.test.mjs
```

Expected: FAIL，错误包含缺少 `resolveZoomAwareTextDrawSize`。

- [ ] **Step 3: 实现软下限并在 draw preview 阶段接入**

在 `viewport-sizing.ts` 增加：

```ts
const TEXT_DRAW_BASE_MINIMUM = { width: 160, height: 88 }

export function resolveZoomAwareTextDrawSize(size: CanvasSize, zoom: number): CanvasSize {
  const normalized = normalizeZoom(zoom)
  const effectiveZoom = Math.sqrt(Math.max(1, normalized))
  return {
    width: round2(Math.max(size.width, TEXT_DRAW_BASE_MINIMUM.width / effectiveZoom)),
    height: round2(Math.max(size.height, TEXT_DRAW_BASE_MINIMUM.height / effectiveZoom)),
  }
}

export function resolveZoomAwareTextDrawRect(
  start: { x: number; y: number },
  current: { x: number; y: number },
  zoom: number,
) {
  const size = resolveZoomAwareTextDrawSize({
    width: Math.abs(current.x - start.x),
    height: Math.abs(current.y - start.y),
  }, zoom)
  return {
    x: current.x >= start.x ? start.x : start.x - size.width,
    y: current.y >= start.y ? start.y : start.y - size.height,
    ...size,
  }
}
```

在 `evaluateDrawGeometrySession` 中先把屏幕起止点分别转换为 canvas point，再调用：

```ts
const startCanvas = screenPointToCanvas({ clientX: draft.start.x, clientY: draft.start.y }, draft.viewport)
const currentCanvas = screenPointToCanvas({ clientX: current.x, clientY: current.y }, draft.viewport)
const candidate = resolveZoomAwareTextDrawRect(startCanvas, currentCanvas, draft.viewport.zoom)
```

从第一次有效预览开始使用 `candidate`，`finalizeDrawGeometrySession` 继续直接读取 `session.candidate`。

- [ ] **Step 4: 运行尺寸、碰撞和类型测试**

```powershell
node --experimental-strip-types --test scripts/tests/canvas-viewport-sizing.test.mjs scripts/tests/canvas-creation-sizing.test.mjs scripts/tests/canvas-collision-policy.test.mjs scripts/tests/canvas-collision-sessions.test.mjs
.\node_modules\.bin\tsc.CMD --noEmit
```

Expected: 全部 PASS。

- [ ] **Step 5: 提交缩放软下限**

```powershell
git add src/lib/canvas/viewport-sizing.ts scripts/tests/canvas-viewport-sizing.test.mjs src/app/core/main/canvas/canvas-editor.tsx scripts/tests/canvas-creation-sizing.test.mjs
git commit -m "feat(canvas): soften text creation size across zoom"
```

---

### Task 5: 实现轻量节点惯性并保持一次历史记录

**Files:**
- Create: `src/lib/canvas/node-inertia.ts`
- Create: `scripts/tests/canvas-node-inertia.test.mjs`
- Modify: `src/app/core/main/canvas/canvas-editor.tsx`
- Modify: `scripts/tests/canvas-editor-collision-contract.test.mjs`

- [ ] **Step 1: 写失败测试锁定采样窗口、速度阈值、距离上限和单调阻尼**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  appendPointerSample,
  inertiaProgress,
  planNodeInertia,
  releaseVelocity,
} from '../../src/lib/canvas/node-inertia.ts'

test('samples retain only the latest 80ms and calculate weighted release velocity', () => {
  let samples = []
  samples = appendPointerSample(samples, { x: 0, y: 0, time: 0 })
  samples = appendPointerSample(samples, { x: 10, y: 0, time: 50 })
  samples = appendPointerSample(samples, { x: 30, y: 0, time: 100 })
  assert.deepEqual(samples.map(item => item.time), [50, 100])
  assert.ok(releaseVelocity(samples).x > 0.35)
})

test('slow release has no inertia and fast release stays capped', () => {
  assert.equal(planNodeInertia({ x: 0.2, y: 0 }), null)
  const plan = planNodeInertia({ x: 4, y: 0 })
  assert.ok(plan)
  assert.equal(plan.durationMs, 160)
  assert.ok(plan.screenDistance >= 40 && plan.screenDistance <= 56)
  assert.equal(Math.hypot(plan.delta.x, plan.delta.y), plan.screenDistance)
})

test('inertia progress is monotonic and ends exactly at one', () => {
  const values = [0, 40, 80, 120, 160].map(time => inertiaProgress(time, 160))
  assert.deepEqual([...values].sort((a, b) => a - b), values)
  assert.equal(values[0], 0)
  assert.equal(values.at(-1), 1)
})
```

- [ ] **Step 2: 运行测试并确认模块缺失**

```powershell
node --experimental-strip-types --test scripts/tests/canvas-node-inertia.test.mjs
```

Expected: FAIL，错误包含 `ERR_MODULE_NOT_FOUND`。

- [ ] **Step 3: 实现纯惯性策略并接入 move geometry session**

`node-inertia.ts` 导出固定常量和纯函数：

```ts
export interface PointerSample { x: number; y: number; time: number }
export interface PointerVelocity { x: number; y: number }
export interface NodeInertiaPlan {
  delta: { x: number; y: number }
  screenDistance: number
  durationMs: 160
}

const SAMPLE_WINDOW_MS = 80
const MIN_SPEED = 0.35
const MIN_DISTANCE = 40
const MAX_DISTANCE = 56

export function appendPointerSample(samples: PointerSample[], sample: PointerSample) {
  if (![sample.x, sample.y, sample.time].every(Number.isFinite)) return samples
  return [...samples, sample].filter(item => sample.time - item.time <= SAMPLE_WINDOW_MS)
}

export function releaseVelocity(samples: PointerSample[]): PointerVelocity {
  if (samples.length < 2) return { x: 0, y: 0 }
  let weight = 0
  let x = 0
  let y = 0
  for (let index = 1; index < samples.length; index += 1) {
    const prior = samples[index - 1]
    const next = samples[index]
    const elapsed = next.time - prior.time
    if (!Number.isFinite(elapsed) || elapsed <= 0) continue
    const currentWeight = index
    x += ((next.x - prior.x) / elapsed) * currentWeight
    y += ((next.y - prior.y) / elapsed) * currentWeight
    weight += currentWeight
  }
  return weight ? { x: x / weight, y: y / weight } : { x: 0, y: 0 }
}

export function planNodeInertia(velocity: PointerVelocity): NodeInertiaPlan | null {
  const speed = Math.hypot(velocity.x, velocity.y)
  if (!Number.isFinite(speed) || speed < MIN_SPEED) return null
  const screenDistance = Math.min(MAX_DISTANCE, Math.max(MIN_DISTANCE, speed * 20))
  return {
    delta: { x: velocity.x / speed * screenDistance, y: velocity.y / speed * screenDistance },
    screenDistance,
    durationMs: 160,
  }
}

export function inertiaProgress(elapsedMs: number, durationMs: number) {
  if (!Number.isFinite(elapsedMs) || !Number.isFinite(durationMs) || durationMs <= 0) return 1
  const t = Math.min(1, Math.max(0, elapsedMs / durationMs))
  const normalized = 1 - Math.exp(-5 * t)
  return t === 1 ? 1 : normalized / (1 - Math.exp(-5))
}
```

扩展 `MoveGeometrySession`：

```ts
samples: PointerSample[]
inertiaFrame: number | null
inertiaStartedAt: number | null
inertiaStartGeometry: Map<string, CanvasRect> | null
inertiaTargetGeometry: Map<string, CanvasRect> | null
```

`onNodeDragStart` 保存首样本；`onNodeDrag` 接收事件并追加 `{ clientX, clientY, timeStamp }`。`onNodeDragStop`：

1. 用 `releaseVelocity`/`planNodeInertia` 得到屏幕投影。
2. 用 session viewport 将 delta 转成 canvas delta。
3. 对 rigid members 调用现有 `sweepRigidSet`，得到碰撞截断后的终点。
4. 用 `requestAnimationFrame` 和 `inertiaProgress` 在 start/target geometry 间插值。
5. 完成或取消时只调用一次 `executeGeometrySessionOutcome` 与 `commitGeometrySessionCheckpoint`。

所有新 pointer down、viewport zoom、tool change、blur 和 stale document 路径先取消 frame，再把最后已接受 geometry 作为本次 move 的单一提交结果。组件 unmount 时必须 `cancelAnimationFrame`。

- [ ] **Step 4: 运行惯性、碰撞和完整几何会话测试**

```powershell
node --experimental-strip-types --test scripts/tests/canvas-node-inertia.test.mjs scripts/tests/canvas-editor-collision-contract.test.mjs scripts/tests/canvas-collision-sessions.test.mjs scripts/tests/canvas-collision-policy.test.mjs
.\node_modules\.bin\tsc.CMD --noEmit
```

Expected: 全部 PASS；源码合同显示 `onNodeDrag` 传递 event，且 commit 只在惯性完成/取消出口调用一次。

- [ ] **Step 5: 提交节点惯性**

```powershell
git add src/lib/canvas/node-inertia.ts scripts/tests/canvas-node-inertia.test.mjs src/app/core/main/canvas/canvas-editor.tsx scripts/tests/canvas-editor-collision-contract.test.mjs
git commit -m "feat(canvas): add restrained collision-safe node inertia"
```

---

### Task 6: 建立图片标签策略、类型和工作区目录 store

**Files:**
- Create: `src/lib/canvas/image-tags.ts`
- Create: `src/stores/canvas-image-tags.ts`
- Create: `scripts/tests/canvas-image-tags.test.mjs`
- Modify: `src/types/canvas.ts`
- Modify: `scripts/tests/canvas-node-visual-contract.test.mjs`

- [ ] **Step 1: 写失败测试覆盖清洗、目录重建、OR 筛选和稳定顺序**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  mergeImageTagCatalog,
  normalizeImageTags,
  orderedMatchingImageIds,
} from '../../src/lib/canvas/image-tags.ts'

const image = (id, x, y, tags) => ({ id, type: 'image', position: { x, y }, data: { imageTags: tags } })

test('image tags trim deduplicate case-insensitively and keep display order', () => {
  assert.deepEqual(normalizeImageTags([' 资料 ', '参考', '资料', '参考 ']), ['资料', '参考'])
})

test('catalog merges persisted and recovered document tags', () => {
  assert.deepEqual(mergeImageTagCatalog(['常用'], [['资料', '常用'], ['截图']]), ['常用', '资料', '截图'])
})

test('multiple selected tags use OR semantics and deterministic y-x-id order', () => {
  const nodes = [image('c', 200, 20, ['资料']), image('a', 20, 20, ['参考']), image('b', 10, 5, ['其他'])]
  assert.deepEqual(orderedMatchingImageIds(nodes, ['资料', '参考']), ['a', 'c'])
})
```

- [ ] **Step 2: 运行测试并确认模块缺失**

```powershell
node --experimental-strip-types --test scripts/tests/canvas-image-tags.test.mjs
```

Expected: FAIL，错误包含 `ERR_MODULE_NOT_FOUND`。

- [ ] **Step 3: 实现纯策略、节点类型和带因果保护的 Tauri Store**

在 `CanvasNodeData` 增加：

```ts
imageTags?: string[]
imageTagFilterState?: 'match' | 'dim'
```

`image-tags.ts` 提供：

```ts
const MAX_TAG_LENGTH = 40

export function normalizeImageTags(values: unknown): string[] {
  if (!Array.isArray(values)) return []
  const result: string[] = []
  const seen = new Set<string>()
  for (const value of values) {
    if (typeof value !== 'string') continue
    const tag = value.trim().replace(/\s+/g, ' ').slice(0, MAX_TAG_LENGTH)
    const key = tag.toLocaleLowerCase()
    if (!tag || seen.has(key)) continue
    seen.add(key)
    result.push(tag)
  }
  return result
}

export function mergeImageTagCatalog(catalog: string[], nodeTagLists: unknown[]) {
  return normalizeImageTags([...catalog, ...nodeTagLists.flatMap(value => normalizeImageTags(value))])
}

export function imageMatchesTags(node: { type?: string; data?: { imageTags?: unknown } }, selected: string[]) {
  if (node.type !== 'image') return false
  const wanted = new Set(normalizeImageTags(selected).map(tag => tag.toLocaleLowerCase()))
  return wanted.size > 0 && normalizeImageTags(node.data?.imageTags).some(tag => wanted.has(tag.toLocaleLowerCase()))
}

export function orderedMatchingImageIds(nodes: Array<{ id: string; type?: string; position: { x: number; y: number }; data?: { imageTags?: unknown } }>, selected: string[]) {
  return nodes.filter(node => imageMatchesTags(node, selected))
    .sort((left, right) => left.position.y - right.position.y || left.position.x - right.position.x || left.id.localeCompare(right.id))
    .map(node => node.id)
}
```

`canvas-image-tags.ts` 使用 Zustand，状态接口固定为：

```ts
interface CanvasImageTagState {
  catalog: string[]
  recent: string[]
  selectedByCanvas: Record<string, string[]>
  activeIndexByCanvas: Record<string, number>
}
```

Tauri Store 文件使用现有 `store.json`，key 为 `canvasImageTagCatalog` 和 `canvasImageTagRecent`。初始化采用与 `chat-hud.ts` 相同的 mutation counter：旧异步读取不得覆盖用户刚创建的标签。导出 `initCanvasImageTags`、`mergeCanvasImageTagsFromNodes`、`registerCanvasImageTags`、`setCanvasImageTagFilter`、`stepCanvasImageTagMatch`、`clearCanvasImageTagFilter`。

- [ ] **Step 4: 运行标签、类型和 TypeScript 测试**

```powershell
node --experimental-strip-types --test scripts/tests/canvas-image-tags.test.mjs scripts/tests/canvas-node-visual-contract.test.mjs
.\node_modules\.bin\tsc.CMD --noEmit
```

Expected: 全部 PASS。

- [ ] **Step 5: 提交图片标签领域模型**

```powershell
git add src/lib/canvas/image-tags.ts src/stores/canvas-image-tags.ts scripts/tests/canvas-image-tags.test.mjs src/types/canvas.ts scripts/tests/canvas-node-visual-contract.test.mjs
git commit -m "feat(canvas): add workspace image tag model"
```

---

### Task 7: 隐藏永久图片名称并增加右键图片信息编辑

**Files:**
- Create: `src/app/core/main/canvas/canvas-image-info.tsx`
- Modify: `src/app/core/main/canvas/nodes/canvas-nodes.tsx`
- Modify: `src/app/core/main/canvas/canvas-editor.tsx`
- Create: `scripts/tests/canvas-image-info-contract.test.mjs`
- Modify: `scripts/tests/canvas-node-visual-contract.test.mjs`

- [ ] **Step 1: 写失败合同测试锁定 hover 浮层、无永久名称和一次保存**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('image node hides the permanent label and exposes hover metadata', async () => {
  const source = await readFile(new URL('../../src/app/core/main/canvas/nodes/canvas-nodes.tsx', import.meta.url), 'utf8')
  const imageSection = source.slice(source.indexOf('export const ImageCanvasNode'), source.indexOf('export const GroupCanvasNode'))
  assert.doesNotMatch(imageSection, /<BaseNodeContent/)
  assert.match(imageSection, /group-hover:opacity-100/)
  assert.match(imageSection, /pointer-events-none/)
  assert.match(imageSection, /imageTags/)
})

test('image context menu opens one metadata editor and saves through one checkpoint', async () => {
  const editor = await readFile(new URL('../../src/app/core/main/canvas/canvas-editor.tsx', import.meta.url), 'utf8')
  assert.match(editor, /图片信息/)
  assert.match(editor, /setImageInfoNodeId/)
  assert.match(editor, /pushHistory\(\)[\s\S]*imageTags/)
})
```

- [ ] **Step 2: 运行合同测试并确认组件尚不存在**

```powershell
node --experimental-strip-types --test scripts/tests/canvas-image-info-contract.test.mjs scripts/tests/canvas-node-visual-contract.test.mjs
```

Expected: FAIL，显示永久 `BaseNodeContent` 仍存在或缺少“图片信息”。

- [ ] **Step 3: 实现图片信息面板、hover 浮层和保存事务**

`CanvasImageInfo` props 固定为：

```ts
interface CanvasImageInfoProps {
  open: boolean
  initial: { name: string; comment: string; tags: string[] }
  catalog: string[]
  recent: string[]
  onOpenChange: (open: boolean) => void
  onSave: (value: { name: string; comment: string; tags: string[] }) => void
}
```

组件使用现有 `Dialog`、`Input`、`Textarea`、`Badge`、`Button`：名称单行、评论多行、标签搜索与多选、Enter 创建自定义标签、recent chips 快选。只有点击保存才调用 `onSave`；关闭/取消不修改目录。

`ImageCanvasNode`：

```tsx
<BaseNode className={cn('group relative size-full overflow-hidden', transientNodeClassName(selected))}>
  <SolidNodeResizer selected={selected} type="image" />
  <ConnectionHandles />
  {/* existing recognition badge */}
  {imageUrl ? (
    <Image
      src={imageUrl}
      alt=""
      width={256}
      height={144}
      unoptimized
      className="size-full object-cover"
    />
  ) : (
    <div className="flex size-full items-center justify-center bg-muted text-muted-foreground">
      <ImageIcon style={scaledSquareStyle(data, 24)} />
    </div>
  )}
  <div className="pointer-events-none absolute inset-x-0 bottom-0 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
    <div className="bg-black/65 px-2 py-1.5 text-white backdrop-blur-sm">
      <div className="truncate text-xs font-medium">{data.label || '图片'}</div>
      <div className="mt-1 flex max-h-10 flex-wrap gap-1 overflow-hidden">
        {visibleTags.map(tag => <span key={tag} className="rounded-full bg-white/15 px-1.5 py-0.5 text-[10px]">{tag}</span>)}
        {hiddenCount > 0 && <span className="text-[10px]">+{hiddenCount}</span>}
      </div>
    </div>
  </div>
</BaseNode>
```

删除图片节点永久 `BaseNodeContent/EditableLabel`。编辑器右键图片区域在“识别图片”旁新增“图片信息”，保存出口：

```ts
pushHistory()
updateFlowNodes(current => current.map(node => node.id === imageInfoNodeId ? {
  ...node,
  data: { ...node.data, label: value.name, description: value.comment, imageTags: normalizeImageTags(value.tags) },
} : node))
registerCanvasImageTags(value.tags)
setImageInfoNodeId(null)
```

- [ ] **Step 4: 运行图片、识别和 TypeScript 测试**

```powershell
node --experimental-strip-types --test scripts/tests/canvas-image-info-contract.test.mjs scripts/tests/canvas-node-visual-contract.test.mjs scripts/tests/canvas-image-recognition.test.mjs
.\node_modules\.bin\tsc.CMD --noEmit
```

Expected: 全部 PASS。

- [ ] **Step 5: 提交图片元数据 UI**

```powershell
git add src/app/core/main/canvas/canvas-image-info.tsx src/app/core/main/canvas/nodes/canvas-nodes.tsx src/app/core/main/canvas/canvas-editor.tsx scripts/tests/canvas-image-info-contract.test.mjs scripts/tests/canvas-node-visual-contract.test.mjs
git commit -m "feat(canvas): reveal image metadata on demand"
```

---

### Task 8: 增加当前画布图片标签筛选与顺序定位

**Files:**
- Create: `src/app/core/main/canvas/canvas-image-tag-filter.tsx`
- Modify: `src/app/core/main/canvas/canvas-editor.tsx`
- Create: `scripts/tests/canvas-image-tag-filter-contract.test.mjs`
- Modify: `scripts/tests/canvas-editor-contract.test.mjs`

- [ ] **Step 1: 写失败合同测试锁定 OR 筛选、dim 状态和前后定位**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('canvas image tag filter is transient and navigates matching ids', async () => {
  const [filter, editor] = await Promise.all([
    readFile(new URL('../../src/app/core/main/canvas/canvas-image-tag-filter.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../src/app/core/main/canvas/canvas-editor.tsx', import.meta.url), 'utf8'),
  ])
  assert.match(filter, /selectedTags/)
  assert.match(filter, /onPrevious/)
  assert.match(filter, /onNext/)
  assert.match(filter, /清除筛选/)
  assert.match(editor, /orderedMatchingImageIds/)
  assert.match(editor, /imageTagFilterState:\s*'match'/)
  assert.match(editor, /imageTagFilterState:\s*'dim'/)
  assert.match(editor, /animateCanvasViewportState/)
  assert.doesNotMatch(editor, /updateDocument\([\s\S]{0,300}selectedTags/)
  assert.match(editor, /canvas-image-tag-match/)
  assert.match(editor, /opacity:\s*0\.25/)
})
```

- [ ] **Step 2: 运行测试并确认筛选组件缺失**

```powershell
node --experimental-strip-types --test scripts/tests/canvas-image-tag-filter-contract.test.mjs scripts/tests/canvas-editor-contract.test.mjs
```

Expected: FAIL，错误包含缺少筛选组件或源码合同不匹配。

- [ ] **Step 3: 实现筛选控件、显示节点投影和视角定位**

`CanvasImageTagFilter` props：

```ts
interface CanvasImageTagFilterProps {
  catalog: string[]
  selectedTags: string[]
  matchIndex: number
  matchCount: number
  onToggleTag: (tag: string) => void
  onPrevious: () => void
  onNext: () => void
  onClear: () => void
}
```

使用 `Popover` 展示可搜索 catalog、已选 chips、`上一个`、`下一个`、`清除筛选`。控件放在现有画布工具栏图片按钮附近。

编辑器从 store 读取当前 `canvasId` 的 selected tags，调用 `orderedMatchingImageIds`。仅构造 `displayNodes/displayEdges` 时添加瞬态状态：

```ts
const selectedTags = imageTagFilters[canvasId] ?? []
const matchingIds = new Set(orderedMatchingImageIds(nodes, selectedTags))
const filtering = selectedTags.length > 0

const tagFilteredNodes = displayNodes.map(node => {
  const match = filtering && matchingIds.has(node.id)
  return {
    ...node,
    className: cn(node.className, match && 'canvas-image-tag-match'),
    style: {
      ...node.style,
      ...(filtering && !match ? { opacity: 0.25 } : {}),
    },
    data: {
      ...node.data,
      imageTagFilterState: match ? 'match' : filtering ? 'dim' : undefined,
    },
  }
})
const tagFilteredEdges = displayEdges.map(edge => ({ ...edge, style: filtering ? { ...edge.style, opacity: 0.25 } : edge.style }))
```

在 React Flow 根 `className` 的现有选择器中增加匹配节点的高优先 ring；dim 由投影节点的 `style.opacity` 统一应用，因此 PDF、视频、网页预览和所有普通节点使用同一行为：

```tsx
className={cn(
  tool === 'select' && '[&_.react-flow__node.canvas-image-tag-match]:!ring-2 [&_.react-flow__node.canvas-image-tag-match]:!ring-primary [&_.react-flow__node.canvas-image-tag-match]:!ring-offset-2',
  tool === 'hand' && '[&_.react-flow__node]:!cursor-grab',
)}
```

定位函数取得节点中心和容器尺寸，保留至少当前 zoom 或 `0.8`：

```ts
const zoom = Math.max(viewport.zoom, 0.8)
animateCanvasViewportState(canvasId, {
  x: bounds.width / 2 - center.x * zoom,
  y: bounds.height / 2 - center.y * zoom,
  zoom,
}, 260)
```

筛选状态只写 Zustand store，不调用 `updateDocument`。

- [ ] **Step 4: 运行标签筛选、画布合同和类型检查**

```powershell
node --experimental-strip-types --test scripts/tests/canvas-image-tags.test.mjs scripts/tests/canvas-image-tag-filter-contract.test.mjs scripts/tests/canvas-editor-contract.test.mjs scripts/tests/canvas-evidence-navigation.test.mjs
.\node_modules\.bin\tsc.CMD --noEmit
```

Expected: 全部 PASS；证据定位行为不回归。

- [ ] **Step 5: 提交标签筛选与定位**

```powershell
git add src/app/core/main/canvas/canvas-image-tag-filter.tsx src/app/core/main/canvas/canvas-editor.tsx scripts/tests/canvas-image-tag-filter-contract.test.mjs scripts/tests/canvas-editor-contract.test.mjs
git commit -m "feat(canvas): filter and focus images by tag"
```

---

### Task 9: 完整门禁、Windows 打包与实机验收

**Files:**
- Modify only if a gate exposes a task-scoped defect: files already listed in Tasks 1–8 and their tests.
- Do not modify: `.adworkflow/**`, `.codegraph/**`, `src-tauri/src/printing.rs`, `pnpm-workspace.yaml`.

- [ ] **Step 1: 运行完整 Canvas 测试和 TypeScript**

```powershell
node --experimental-strip-types --test scripts/tests/canvas-*.test.mjs
.\node_modules\.bin\tsc.CMD --noEmit
```

Expected: 所有测试 PASS，0 failed；TypeScript 退出码 `0`。

- [ ] **Step 2: 在 MSVC 环境运行 locked Rust 门禁**

```powershell
cmd /d /c "call F:\VSBuildTools\Common7\Tools\VsDevCmd.bat -arch=x64 -host_arch=x64 && cargo test --manifest-path src-tauri\Cargo.toml --locked && cargo check --manifest-path src-tauri\Cargo.toml --locked"
```

Expected: Rust tests 全部 PASS，`cargo check` 退出码 `0`。

- [ ] **Step 3: 构建 NSIS 并记录 SHA-256**

```powershell
cmd /d /c "call F:\VSBuildTools\Common7\Tools\VsDevCmd.bat -arch=x64 -host_arch=x64 && node_modules\.bin\tauri.CMD build --bundles nsis"
Get-FileHash -Algorithm SHA256 -LiteralPath 'src-tauri\target\release\bundle\nsis\zeroxB_0.32.1_x64-setup.exe'
```

Expected: 生成 `src-tauri\target\release\bundle\nsis\zeroxB_0.32.1_x64-setup.exe` 并输出 64 位 SHA-256。

- [ ] **Step 4: 保留数据库、覆盖安装并完成三次冷启动**

安装前记录并备份：

```powershell
$db='C:\Users\Lenovo\AppData\Roaming\com.zeroxb.desktop\note.db'
Get-Item -LiteralPath $db | Select-Object FullName,Length,LastWriteTimeUtc
Copy-Item -LiteralPath $db -Destination "$db.pre-canvas-interaction.bak"
```

关闭正在运行的 zeroxB，使用新 NSIS 覆盖安装到 `F:\zeroxBApp`。完成三次冷启动，前两次正常关闭，第三次保持运行。确认 `note.db` 仍存在且旧画布可打开。

- [ ] **Step 5: 按规格逐项实机验收并只修复本任务缺陷**

验收顺序：

1. 把问题样例粘贴到新文本块和已有文本块，确认段落清晰、无叠行。
2. 空白处右键单击不创建；右拖有效面积创建；左拖空白框选。
3. 左拖节点移动并有轻微阻尼；多选组保持刚体；碰撞时提前停止；一次 Undo 回到拖前。
4. 双击文字编辑，Escape 退出；拖边缘只调整尺寸。
5. 节点右键打开设置；向四个方向右拖，来源锚点锁定对应边；目标最近边实时高亮。
6. 在 200% 和 600% 创建窄块，预览与落地一致，回到 100% 不出现不可用细条。
7. 粘贴图片后无永久文件名；悬停显示名称和标签；右键可保存名称、评论、自定义/快速标签。
8. 当前画布标签筛选使用 OR 语义，上一个/下一个定位正确，清除后恢复。
9. 重启后图片元数据和工作区标签目录仍存在，筛选条件不跨重启持久化。

若验收失败，回到拥有该行为的 Task 1–8，重复该任务的失败测试、实现、验证和显式暂存步骤；不得使用汇总式 `git add -A` 或把多个无关缺陷塞进一个补丁。修复提交沿用所属任务的文件边界，commit message 必须直接写出实际缺陷，例如 `fix(canvas): resolve high-zoom draw preview`。

---

## 最终推送与汇报

确认工作区没有未提交的任务改动：

```powershell
git status -sb
git log --oneline origin/main..HEAD
git push -u origin codex/canvas-interaction-physics-image-tags
```

最终汇报必须包含：

- 实际 commit 列表与每个 commit 的职责。
- 改动文件清单。
- 新增与完整 Canvas 测试数量、TypeScript、Rust test/check 结果。
- NSIS 安装包绝对路径、文件大小和 SHA-256。
- `note.db` 备份路径与覆盖安装结果。
- 三次冷启动结果。
- 九项实机验收的逐项结论。
- 未完成、降级或受阻事项；若没有，明确写“无”。
