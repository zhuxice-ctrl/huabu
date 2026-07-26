'use client'

import dynamic from 'next/dynamic'
import { useEffect, useMemo, useState } from 'react'
import { EditorLayout } from '../editor/editor-layout'
import { LeftSidebar } from '../left-sidebar'
import useCanvasStore from '@/stores/canvas'
import { useSidebarStore } from '@/stores/sidebar'
import { normalizeWorkspaceLayout } from '@/lib/canvas/workspace-layout-policy'

const CanvasEditor = dynamic(
  () => import('./canvas-editor').then(module => module.CanvasEditor),
  { ssr: false },
)

function useWindowWidth() {
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const updateWidth = () => setWidth(window.innerWidth)
    updateWidth()
    window.addEventListener('resize', updateWidth)
    return () => window.removeEventListener('resize', updateWidth)
  }, [])

  return width
}

function ResizeDivider({ onResize }: { onResize: (delta: number) => void }) {
  return (
    <div
      aria-hidden="true"
      className="z-20 w-1 shrink-0 cursor-col-resize bg-border/70 transition-colors hover:bg-primary"
      onPointerDown={(event) => {
        const startX = event.clientX
        const target = event.currentTarget
        target.setPointerCapture(event.pointerId)
        const onMove = (moveEvent: PointerEvent) => onResize(moveEvent.clientX - startX)
        const onUp = () => {
          target.removeEventListener('pointermove', onMove)
          target.removeEventListener('pointerup', onUp)
        }
        target.addEventListener('pointermove', onMove)
        target.addEventListener('pointerup', onUp, { once: true })
      }}
    />
  )
}

export function CanvasChatHud() {
  // Task 12 owns the HUD implementation. This permanent slot avoids a shell change later.
  return <div data-canvas-chat-hud className="pointer-events-none absolute inset-x-0 bottom-0 z-30" />
}

export function CanvasWorkspace() {
  const windowWidth = useWindowWidth()
  const activeCanvasId = useCanvasStore(state => state.activeCanvasId)
  const {
    leftSidebarVisible,
    rightSidebarVisible,
    leftSidebarTab,
    leftWidth,
    documentPanelWidth,
    initSidebarState,
    setLeftWidth,
    setDocumentPanelWidth,
    toggleLeftSidebar,
    toggleRightSidebar,
  } = useSidebarStore()

  useEffect(() => {
    void initSidebarState()
  }, [initSidebarState])

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
            onClick={() => void toggleLeftSidebar()}
          >
            ☰
          </button>
        ) : <LeftSidebar />}
      </aside>
      {!layout.leftCollapsed && (
        <ResizeDivider onResize={(delta) => void setLeftWidth(leftWidth + delta)} />
      )}

      <main className="relative min-w-0 flex-1 overflow-hidden">
        {activeCanvasId ? (
          <CanvasEditor key={activeCanvasId} canvasId={activeCanvasId} />
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
            onClick={() => void toggleRightSidebar()}
          >
            Documents
          </button>
        )}
        <CanvasChatHud />
      </main>

      {!layout.documentPanelCollapsed && (
        <ResizeDivider onResize={(delta) => void setDocumentPanelWidth(documentPanelWidth - delta)} />
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
