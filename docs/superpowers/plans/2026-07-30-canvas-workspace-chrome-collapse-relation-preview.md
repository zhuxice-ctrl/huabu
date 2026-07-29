# Canvas Workspace Chrome Collapse and Relation Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the canvas-only Documents panel, persist collapsible left and AI surfaces, and make right-drag relations show a visible anchor-style live curve.

**Architecture:** Keep the existing workspace, sidebar, chat HUD, and relation-session boundaries. CanvasWorkspace stops rendering the document surface; the sidebar reuses its persisted visibility preference; ChatHud adds one persisted presentation flag without touching conversation data; the right-drag session keeps its transaction flow and only changes its transient overlay styling.

**Tech Stack:** React 19, Next.js 15, TypeScript, Zustand, Tauri Store, React Flow, Node test runner, Rust/MSVC, NSIS.

---

## File structure

- Modify `src/app/core/main/canvas/canvas-workspace.tsx`: remove the canvas Documents surface and expose left collapse controls.
- Modify `scripts/tests/canvas-workspace-layout.test.mjs`: assert the canvas shell owns no Documents UI and retains the persistent left rail.
- Modify `src/stores/chat-hud.ts`: own and persist `composerCollapsed` without changing drafts or conversations.
- Modify `src/app/core/main/chat/canvas-chat-hud.tsx`: render compact, composer, and history presentation levels.
- Modify `src/app/core/main/chat/canvas-chat-summary.tsx`: provide a one-line compact summary variant.
- Modify `scripts/tests/canvas-chat-hud-contract.test.mjs`: verify persistence, hierarchy, and draft-preserving composition.
- Modify `src/app/core/main/canvas/canvas-editor.tsx`: render a visible solid primary relation curve and endpoint during right drag.
- Modify `scripts/tests/canvas-editor-contract.test.mjs`: verify the relation overlay style and layering.
- Modify `scripts/tests/canvas-relation-interaction.test.mjs`: retain threshold, target, and context-menu behavior coverage.

---

### Task 1: Remove canvas Documents and expose the persistent left rail control

**Files:**
- Modify: `src/app/core/main/canvas/canvas-workspace.tsx`
- Modify: `scripts/tests/canvas-workspace-layout.test.mjs`

- [ ] **Step 1: Add the failing canvas-shell source contract**

Append to `scripts/tests/canvas-workspace-layout.test.mjs`:

```js
import { readFile } from 'node:fs/promises'

test('canvas workspace removes Documents and exposes persistent left collapse controls', async () => {
  const source = await readFile(
    new URL('../../src/app/core/main/canvas/canvas-workspace.tsx', import.meta.url),
    'utf8',
  )
  assert.doesNotMatch(source, /EditorLayout/)
  assert.doesNotMatch(source, /Expand documents|Documents/)
  assert.doesNotMatch(source, /startDocumentPanelResize|toggleRightSidebar/)
  assert.match(source, /aria-label="收起资源栏"/)
  assert.match(source, /aria-label="展开资源栏"/)
  assert.match(source, /toggleLeftSidebar/)
})
```

- [ ] **Step 2: Run the focused test and verify the existing Documents surface fails it**

Run:

```powershell
node --experimental-strip-types --test scripts/tests/canvas-workspace-layout.test.mjs
```

Expected: FAIL because `CanvasWorkspace` still imports `EditorLayout`, renders `Documents`, and lacks the Chinese collapse labels.

- [ ] **Step 3: Remove the right panel and add explicit left controls**

In `src/app/core/main/canvas/canvas-workspace.tsx`:

1. Remove the `EditorLayout` import.
2. Import `PanelLeftClose` and `PanelLeftOpen` from `lucide-react`.
3. Stop selecting `rightSidebarVisible`, `documentPanelWidth`, `toggleRightSidebar`, and `startDocumentPanelResize`.
4. Normalize the layout with the right panel always collapsed so narrow-window left behavior remains deterministic:

```tsx
const layout = useMemo(() => normalizeWorkspaceLayout({
  leftCollapsed: !leftSidebarVisible,
  leftWidth,
  leftTab: leftSidebarTab,
  documentPanelCollapsed: true,
}, windowWidth), [leftSidebarTab, leftSidebarVisible, leftWidth, windowWidth])
```

5. Render the collapsed left rail with an icon button:

```tsx
{layout.leftCollapsed ? (
  <button
    type="button"
    aria-label="展开资源栏"
    className="flex h-full w-full items-start justify-center pt-4 text-muted-foreground hover:bg-muted"
    disabled={layout.autoLeftCollapsed}
    onClick={() => void toggleLeftSidebar()}
  >
    <PanelLeftOpen className="size-4" />
  </button>
) : (
  <>
    <LeftSidebar />
    <button
      type="button"
      aria-label="收起资源栏"
      className="absolute right-1 top-1/2 z-30 flex size-7 -translate-y-1/2 items-center justify-center rounded-md border bg-background/90 text-muted-foreground shadow-sm hover:bg-muted"
      onClick={() => void toggleLeftSidebar()}
    >
      <PanelLeftClose className="size-4" />
    </button>
  </>
)}
```

6. Delete the Documents recovery button, right divider, and right `<aside>` entirely.

- [ ] **Step 4: Run workspace and shell tests**

Run:

```powershell
node --experimental-strip-types --test scripts/tests/canvas-workspace-layout.test.mjs scripts/tests/canvas-shell-contract.test.mjs
& '.\node_modules\.bin\tsc.CMD' --noEmit
```

Expected: all focused tests pass and TypeScript exits 0.

- [ ] **Step 5: Commit the workspace change**

```powershell
git add src/app/core/main/canvas/canvas-workspace.tsx scripts/tests/canvas-workspace-layout.test.mjs
git commit -m "feat(canvas): simplify workspace chrome"
```

---

### Task 2: Persist a compact AI bar without losing drafts

**Files:**
- Modify: `src/stores/chat-hud.ts`
- Modify: `src/app/core/main/chat/canvas-chat-hud.tsx`
- Modify: `src/app/core/main/chat/canvas-chat-summary.tsx`
- Modify: `scripts/tests/canvas-chat-hud-contract.test.mjs`

- [ ] **Step 1: Add failing store and source contracts**

Append to `scripts/tests/canvas-chat-hud-contract.test.mjs`:

```js
test('AI composer collapses to a persisted compact bar without clearing drafts', async () => {
  const [hud, summary, store] = await Promise.all([
    readFile(new URL('src/app/core/main/chat/canvas-chat-hud.tsx', root), 'utf8'),
    readFile(new URL('src/app/core/main/chat/canvas-chat-summary.tsx', root), 'utf8'),
    readFile(new URL('src/stores/chat-hud.ts', root), 'utf8'),
  ])
  assert.match(store, /composerCollapsed:\s*boolean/)
  assert.match(store, /canvasChatHudComposerCollapsed/)
  assert.match(store, /Store\.load\('store\.json'\)/)
  assert.match(store, /setChatHudComposerCollapsed/)
  assert.match(hud, /composerCollapsed/)
  assert.match(hud, /收起 AI 输入框/)
  assert.match(hud, /展开 AI 输入框/)
  assert.match(summary, /variant\?: 'summary' \| 'compact'/)
  assert.doesNotMatch(store, /setChatHudComposerCollapsed[^]*drafts:\s*\{\}/)
})
```

- [ ] **Step 2: Run the HUD contract and verify missing compact state**

Run:

```powershell
node --experimental-strip-types --test scripts/tests/canvas-chat-hud-contract.test.mjs scripts/tests/canvas-chat-hud-policy.test.mjs
```

Expected: FAIL because the store and components do not define `composerCollapsed`.

- [ ] **Step 3: Add immediate and durable HUD preference state**

At the top of `src/stores/chat-hud.ts`, import Tauri Store and define the key:

```ts
import { Store } from '@tauri-apps/plugin-store'

const CHAT_HUD_COMPOSER_COLLAPSED_KEY = 'canvasChatHudComposerCollapsed'

function initialComposerCollapsed() {
  if (typeof window === 'undefined') return false
  return localStorage.getItem(CHAT_HUD_COMPOSER_COLLAPSED_KEY) === 'true'
}

async function persistComposerCollapsed(collapsed: boolean) {
  const store = await Store.load('store.json')
  await store.set(CHAT_HUD_COMPOSER_COLLAPSED_KEY, collapsed)
  await store.save()
}
```

Add `composerCollapsed: boolean` to `ChatHudState`, initialize it with `initialComposerCollapsed()`, and export:

```ts
let chatHudPreferencesInitialized = false

export function initChatHudPreferences() {
  if (chatHudPreferencesInitialized || typeof window === 'undefined') return
  chatHudPreferencesInitialized = true
  void Store.load('store.json').then(async store => {
    const persisted = await store.get<boolean>(CHAT_HUD_COMPOSER_COLLAPSED_KEY)
    if (typeof persisted !== 'boolean') return
    localStorage.setItem(CHAT_HUD_COMPOSER_COLLAPSED_KEY, String(persisted))
    useChatHudStore.setState({ composerCollapsed: persisted })
  })
}

export function setChatHudComposerCollapsed(composerCollapsed: boolean) {
  useChatHudStore.setState({
    composerCollapsed,
    ...(composerCollapsed ? { expanded: false, historyOpen: false } : {}),
  })
  if (typeof window !== 'undefined') {
    localStorage.setItem(CHAT_HUD_COMPOSER_COLLAPSED_KEY, String(composerCollapsed))
    void persistComposerCollapsed(composerCollapsed)
  }
}
```

Do not modify `drafts`, `scrollPositions`, `messageWindows`, or conversation state in either function.

- [ ] **Step 4: Add a compact summary variant**

Change `CanvasChatSummaryProps` in `src/app/core/main/chat/canvas-chat-summary.tsx` to:

```ts
interface CanvasChatSummaryProps {
  onExpand: () => void
  variant?: 'summary' | 'compact'
  statusLabel?: string
}
```

For `variant === 'compact'`, render a single 40px row:

```tsx
if (variant === 'compact') {
  return (
    <button
      type="button"
      onClick={onExpand}
      className="flex h-10 w-full items-center gap-2 rounded-xl border bg-background/95 px-3 text-left shadow-xl backdrop-blur-xl hover:bg-muted/90"
      aria-label="展开 AI 输入框"
    >
      <MessageCircleMore className="size-4 shrink-0 text-primary" />
      <span className="min-w-0 flex-1 truncate text-xs text-foreground">
        {summary.assistant || summary.user || '在当前画布中开始提问'}
      </span>
      <span className="shrink-0 text-[11px] text-muted-foreground">{statusLabel || 'AI 已就绪'}</span>
    </button>
  )
}
```

Keep the existing multi-line summary as the default `summary` variant.

- [ ] **Step 5: Render compact, composer, and history levels**

In `src/app/core/main/chat/canvas-chat-hud.tsx`:

1. Import `initChatHudPreferences`, `setChatHudComposerCollapsed`, and `PanelBottomClose`.
2. Read `composerCollapsed` from the HUD store and `loading` from the chat store.
3. Call `initChatHudPreferences()` in a mount effect.
4. Extend Escape handling:

```ts
if (historyOpen) setChatHudHistoryOpen(false)
else if (expanded) setChatHudExpanded(false)
else if (!composerCollapsed) setChatHudComposerCollapsed(true)
```

5. Before the existing composer/history branch, render the compact level:

```tsx
{composerCollapsed ? (
  <CanvasChatSummary
    variant="compact"
    statusLabel={loading ? 'AI 正在处理' : 'AI 已就绪'}
    onExpand={() => setChatHudComposerCollapsed(false)}
  />
) : (
  <>
    {/* existing history/summary branch */}
    <div className="rounded-b-xl border bg-background/96 shadow-xl backdrop-blur-xl">
      <ChatInput key={conversationKey} />
    </div>
  </>
)}
```

6. In the composer-level action row, add:

```tsx
<Button
  type="button"
  variant="ghost"
  size="icon-sm"
  aria-label="收起 AI 输入框"
  onClick={() => setChatHudComposerCollapsed(true)}
>
  <PanelBottomClose className="size-4" />
</Button>
```

- [ ] **Step 6: Run HUD policy, contract, chat context, and TypeScript**

```powershell
node --experimental-strip-types --test scripts/tests/canvas-chat-hud-policy.test.mjs scripts/tests/canvas-chat-hud-contract.test.mjs scripts/tests/canvas-chat-context.test.mjs
& '.\node_modules\.bin\tsc.CMD' --noEmit
```

Expected: all focused tests pass and TypeScript exits 0.

- [ ] **Step 7: Commit the compact HUD**

```powershell
git add src/stores/chat-hud.ts src/app/core/main/chat/canvas-chat-hud.tsx src/app/core/main/chat/canvas-chat-summary.tsx scripts/tests/canvas-chat-hud-contract.test.mjs
git commit -m "feat(canvas): collapse AI composer to compact bar"
```

---

### Task 3: Match right-drag preview to anchor connection visuals

**Files:**
- Modify: `src/app/core/main/canvas/canvas-editor.tsx`
- Modify: `scripts/tests/canvas-editor-contract.test.mjs`
- Verify: `scripts/tests/canvas-gesture-policy.test.mjs`
- Verify: `scripts/tests/canvas-relation-interaction.test.mjs`

- [ ] **Step 1: Replace the dashed-preview expectation with a visible anchor-style contract**

Change the relationship preview test in `scripts/tests/canvas-editor-contract.test.mjs` to:

```js
test('right-drag relation preview is a visible anchor-style curve above canvas nodes', () => {
  assert.match(editorSource, /relationPreviewPath/)
  assert.match(editorSource, /hsl\(var\(--primary\)\)/)
  assert.match(editorSource, /canvas-relation-preview/)
  assert.match(editorSource, /<circle/)
  assert.match(editorSource, /z-20/)
  assert.doesNotMatch(editorSource, /strokeDasharray="7 6"/)
  assert.match(edgeSource, /interactionWidth=\{24\}/)
})
```

- [ ] **Step 2: Run the editor contract and verify the dashed preview fails**

```powershell
node --experimental-strip-types --test scripts/tests/canvas-editor-contract.test.mjs
```

Expected: FAIL because the preview uses `stroke="var(--primary)"`, a dashed stroke, no endpoint, and no explicit overlay z-index.

- [ ] **Step 3: Render the activated relation snapshot as a solid visible curve**

In the `relationPreview?.active` block of `src/app/core/main/canvas/canvas-editor.tsx`, calculate local endpoints once and render:

```tsx
{relationPreview?.active && (() => {
  const bounds = containerRef.current?.getBoundingClientRect()
  const start = {
    x: relationPreview.start.x - (bounds?.left || 0),
    y: relationPreview.start.y - (bounds?.top || 0),
  }
  const end = {
    x: relationPreview.current.x - (bounds?.left || 0),
    y: relationPreview.current.y - (bounds?.top || 0),
  }
  return (
    <svg className="canvas-relation-preview pointer-events-none absolute inset-0 z-20 size-full overflow-visible">
      <path
        d={relationPreviewPath(start, end)}
        fill="none"
        stroke="hsl(var(--primary))"
        strokeWidth="2.25"
        strokeLinecap="round"
        style={{ filter: 'drop-shadow(0 0 5px hsl(var(--primary) / 0.45))' }}
      />
      <circle cx={end.x} cy={end.y} r="4" fill="hsl(var(--primary))" />
    </svg>
  )
})()}
```

Keep the 4px activation threshold, `selectRelationHandles`, target lookup, target classes, capture cleanup, context-menu suppression, and staged relation editor unchanged.

- [ ] **Step 4: Run editor, gesture, relation, and collision tests**

```powershell
node --experimental-strip-types --test scripts/tests/canvas-editor-contract.test.mjs scripts/tests/canvas-gesture-policy.test.mjs scripts/tests/canvas-relation-interaction.test.mjs scripts/tests/canvas-collision-sessions.test.mjs
& '.\node_modules\.bin\tsc.CMD' --noEmit
```

Expected: all focused tests pass and TypeScript exits 0.

- [ ] **Step 5: Commit the preview change**

```powershell
git add src/app/core/main/canvas/canvas-editor.tsx scripts/tests/canvas-editor-contract.test.mjs
git commit -m "feat(canvas): show live right-drag relation preview"
```

---

### Task 4: Full Windows verification, package, and overwrite install

**Files:**
- Verify: all files changed by Tasks 1–3
- Artifact: `src-tauri/target/release/bundle/nsis/zeroxB_0.32.1_x64-setup.exe`
- Install target: `F:\zeroxBApp`

- [ ] **Step 1: Run all Canvas tests**

```powershell
node --experimental-strip-types --test scripts/tests/canvas-*.test.mjs
```

Expected: zero failures.

- [ ] **Step 2: Run TypeScript and Windows Rust gates**

```powershell
& '.\node_modules\.bin\tsc.CMD' --noEmit
cmd /d /c "call F:\VSBuildTools\Common7\Tools\VsDevCmd.bat -arch=x64 -host_arch=x64 && cargo test --manifest-path src-tauri\Cargo.toml --locked && cargo check --manifest-path src-tauri\Cargo.toml --locked"
```

Expected: TypeScript exits 0, both Rust test binaries pass, and Cargo check exits 0.

- [ ] **Step 3: Build the NSIS package**

```powershell
cmd /d /c "call F:\VSBuildTools\Common7\Tools\VsDevCmd.bat -arch=x64 -host_arch=x64 && node_modules\.bin\tauri.CMD build --bundles nsis"
```

Expected: 53 static pages, successful release compilation, and installer output at the artifact path.

- [ ] **Step 4: Record artifact and database metadata**

```powershell
$installer='F:\huabu-worktrees\foundation\src-tauri\target\release\bundle\nsis\zeroxB_0.32.1_x64-setup.exe'
$database='C:\Users\Lenovo\AppData\Roaming\com.zeroxb.desktop\note.db'
Get-FileHash -LiteralPath $installer -Algorithm SHA256
Get-Item -LiteralPath $database | Select-Object FullName,Length,LastWriteTime
```

Do not delete, rename, truncate, or replace the database.

- [ ] **Step 5: Overwrite the installed Windows app and cold-start three times**

```powershell
Get-Process -Name zeroxb -ErrorAction SilentlyContinue | Stop-Process -Force
$installer='F:\huabu-worktrees\foundation\src-tauri\target\release\bundle\nsis\zeroxB_0.32.1_x64-setup.exe'
$install=Start-Process -FilePath $installer -ArgumentList '/S','/D=F:\zeroxBApp' -WindowStyle Hidden -Wait -PassThru
if($install.ExitCode -ne 0){ throw "Installer failed: $($install.ExitCode)" }
1..3 | ForEach-Object {
  Start-Process -FilePath 'F:\zeroxBApp\zeroxb.exe'
  Start-Sleep -Seconds 8
  if(-not (Get-Process -Name zeroxb -ErrorAction SilentlyContinue)){ throw "Cold start $_ failed" }
  if($_ -lt 3){ Get-Process -Name zeroxb | Stop-Process -Force; Start-Sleep -Seconds 1 }
}
```

- [ ] **Step 6: Complete manual acceptance**

Verify:

1. Canvas has no right Documents panel or recovery button.
2. Left rail folds to 48px, expands from its visible control, and restores after restart.
3. AI composer folds to one compact row, restores without losing a typed draft or attachment, and persists after restart.
4. Esc closes history, then the composer, without clearing the conversation.
5. Stationary right click opens the node menu.
6. A right drag shows a solid visible curve after 4px, follows the pointer, highlights a valid target/anchor, and opens the staged relation editor on release.
7. Cancelling or releasing on an invalid target creates no edge and leaves no overlay.

No verification-only commit is required unless a tracked checklist genuinely changes.

---

## Plan self-review

- Spec coverage: Task 1 covers right removal and persistent left controls; Task 2 covers the persistent compact AI bar and Esc hierarchy; Task 3 covers anchor-style right-drag feedback; Task 4 covers Windows gates, packaging, overwrite installation, and restart behavior.
- Type consistency: `composerCollapsed`, `initChatHudPreferences`, and `setChatHudComposerCollapsed` keep the same names in store, component, and tests.
- Scope: canvas-only Documents removal; ordinary editor behavior, relationship data, chat persistence, Android, and cloud sync remain unchanged.
- Placeholder scan: the plan contains no deferred implementation markers.
