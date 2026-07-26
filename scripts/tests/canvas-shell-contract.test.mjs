import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const readSource = (path) => readFile(new URL(path, import.meta.url), 'utf8')

test('the main shell has one permanent canvas workspace and no right-side chat panel', async () => {
  const page = await readSource('../../src/app/core/main/page.tsx')
  const workspace = await readSource('../../src/app/core/main/canvas/canvas-workspace.tsx')

  assert.doesNotMatch(page, /ImmersiveCanvasLayout/)
  assert.doesNotMatch(page, /isCanvasTabPath/)
  assert.doesNotMatch(page, /<Chat\b/)
  assert.match(page, /<CanvasWorkspace\s*\/>/)
  assert.match(workspace, /<CanvasEditor\s+key=\{activeCanvasId\}/)
  assert.match(workspace, /<EditorLayout\s+mode="documents-only"\s*\/>/)
  assert.match(workspace, /data-canvas-chat-hud/)
})

test('legacy canvas tabs are migration-only and canvas selection does not create editor tabs', async () => {
  const editor = await readSource('../../src/app/core/main/editor/editor-layout.tsx')
  const sidebar = await readSource('../../src/app/core/main/canvas/canvas-sidebar.tsx')
  const startup = await readSource('../../src/app/core/main/canvas/canvas-startup-controller.tsx')
  const articleStore = await readSource('../../src/stores/article.ts')
  const parser = await readSource('../../src/app/core/main/canvas/canvas-tab.ts')
  const searchDialog = await readSource('../../src/components/search-dialog.tsx')
  const tiptapEditor = await readSource('../../src/app/core/main/editor/markdown/tiptap-editor.tsx')

  assert.doesNotMatch(editor, /CanvasEditor/)
  assert.doesNotMatch(editor, /setActiveCanvasId/)
  assert.match(sidebar, /setActiveCanvasId\(project\.id\)/)
  assert.match(startup, /setActiveCanvasId\(project\.id\)/)
  assert.match(articleStore, /kind === 'canvas'/)
  assert.match(articleStore, /isCanvasOpenTabPath\(tab\.path\)/)
  assert.match(articleStore, /if \(isLegacyCanvasOpenTab\(tab\)\)/)
  assert.match(articleStore, /setActiveCanvasId\(canvasId\)/)
  assert.doesNotMatch(parser, /createCanvasTab/)
  assert.doesNotMatch(searchDialog, /createCanvasTab/)
  assert.doesNotMatch(tiptapEditor, /createCanvasTab/)
  assert.match(searchDialog, /setActiveCanvasId\(project\.id\)/)
  assert.match(tiptapEditor, /setActiveCanvasId\(project\.id\)/)
})

test('shell controls retain manual preferences and use current canvas authority after async work', async () => {
  const workspace = await readSource('../../src/app/core/main/canvas/canvas-workspace.tsx')
  const sidebar = await readSource('../../src/app/core/main/canvas/canvas-sidebar.tsx')
  const sidebarStore = await readSource('../../src/stores/sidebar.ts')

  assert.match(workspace, /disabled=\{layout\.autoLeftCollapsed\}/)
  assert.match(workspace, /disabled=\{layout\.autoDocumentPanelCollapsed\}/)
  assert.match(workspace, /setLeftWidth\(layout\.preferences\.leftWidth \+ delta\)/)
  assert.match(workspace, /setDocumentPanelWidth\(layout\.preferences\.documentPanelWidth - delta, windowWidth\)/)
  assert.match(sidebarStore, /const normalizedWidth = normalizeLeftRailWidth\(width\)/)
  assert.match(sidebarStore, /const normalizedWidth = normalizeDocumentPanelWidth\(width, windowWidth\)/)
  assert.match(sidebar, /await deleteProject\(id, syncConfigured\)[\s\S]*useCanvasStore\.getState\(\)\.activeCanvasId === id/)
})
