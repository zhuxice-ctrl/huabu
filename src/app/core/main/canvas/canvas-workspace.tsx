'use client'

import dynamic from 'next/dynamic'
import { useEffect, useMemo, type PointerEventHandler } from 'react'
import { useWindowSize } from 'usehooks-ts'
import { EditorLayout } from '../editor/editor-layout'
import { LeftSidebar } from '../left-sidebar'
import useCanvasStore from '@/stores/canvas'
import { useSidebarStore } from '@/stores/sidebar'
import { normalizeWorkspaceLayout } from '@/lib/canvas/workspace-layout-policy'
import { CanvasChatHud } from '../chat/canvas-chat-hud'

const CanvasEditor = dynamic(
  () => import('./canvas-editor').then(module => module.CanvasEditor),
  { ssr: false },
)

function ResizeDivider({ onPointerDown }: { onPointerDown: PointerEventHandler<HTMLDivElement> }) {
  return (
    <div
      aria-hidden="true"
      className="z-20 w-1 shrink-0 cursor-col-resize bg-border/70 transition-colors hover:bg-primary"
      onPointerDown={onPointerDown}
    />
  )
}

let canvasEditorRenderCount = 0

export function getCanvasEditorRenderCountForTest() {
  return canvasEditorRenderCount
}

function CanvasEditorRenderProbe() {
  if (process.env.NODE_ENV !== 'production') canvasEditorRenderCount += 1
  return null
}

export function CanvasWorkspace() {
  const { width: windowWidth } = useWindowSize()
  const activeCanvasId = useCanvasStore(state => state.activeCanvasId)
  const {
    leftSidebarVisible,
    rightSidebarVisible,
    leftSidebarTab,
    leftWidth,
    documentPanelWidth,
    initSidebarState,
    toggleLeftSidebar,
    toggleRightSidebar,
    startLeftResize,
    startDocumentPanelResize,
  } = useSidebarStore()

  useEffect(initSidebarState, [initSidebarState])

  const layout = useMemo(() => normalizeWorkspaceLayout({
    leftCollapsed: !leftSidebarVisible,
    leftWidth,
    leftTab: leftSidebarTab,
    documentPanelCollapsed: !rightSidebarVisible,
    documentPanelWidth,
  }, windowWidth), [documentPanelWidth, leftSidebarTab, leftSidebarVisible, leftWidth, rightSidebarVisible, windowWidth])

  useEffect(() => {
    // React Flow observes its container; notify it after a panel change without replacing the editor.
    window.dispatchEvent(new Event('resize'))
  }, [layout.canvasWidth, layout.documentPanelCollapsed, layout.leftCollapsed])

  return (
    <div className="flex h-full min-h-0 w-full overflow-hidden bg-background">
      <aside
        className="relative flex h-full shrink-0 overflow-hidden border-r bg-background"
        style={{ width: layout.leftWidth }}
      >
        {layout.leftCollapsed ? (
          <button
            type="button"
            aria-label="Expand navigation"
            className="h-full w-full text-xs text-muted-foreground hover:bg-muted"
            disabled={layout.autoLeftCollapsed}
            onClick={toggleLeftSidebar}
          >
            ☰
          </button>
        ) : <LeftSidebar />}
      </aside>
      {!layout.leftCollapsed && (
        <ResizeDivider onPointerDown={startLeftResize} />
      )}

      <main data-canvas-chat-hud-host className="relative min-w-0 flex-1 overflow-hidden">
        {activeCanvasId ? (
          <>
            <CanvasEditor key={activeCanvasId} canvasId={activeCanvasId} />
            <CanvasEditorRenderProbe />
          </>
        ) : (
          <div className="flex size-full items-center justify-center text-sm text-muted-foreground">
            Select or create a canvas to begin
          </div>
        )}
        {layout.documentPanelCollapsed && (
          <button
            type="button"
            aria-label="Expand documents"
            className="absolute right-3 top-3 z-20 rounded border bg-background/90 px-2 py-1 text-xs text-muted-foreground shadow-sm hover:bg-muted"
            disabled={layout.autoDocumentPanelCollapsed}
            onClick={toggleRightSidebar}
          >
            Documents
          </button>
        )}
        <CanvasChatHud />
      </main>

      {!layout.documentPanelCollapsed && (
        <ResizeDivider onPointerDown={startDocumentPanelResize} />
      )}
      <aside
        className="h-full shrink-0 overflow-hidden border-l bg-background"
        style={{ width: layout.documentPanelWidth }}
      >
        {!layout.documentPanelCollapsed && <EditorLayout mode="documents-only" />}
      </aside>
    </div>
  )
}
