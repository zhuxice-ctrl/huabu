'use client'

import dynamic from 'next/dynamic'
import { useEffect, useMemo, type PointerEventHandler } from 'react'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { useWindowSize } from 'usehooks-ts'
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
    leftSidebarTab,
    leftWidth,
    initSidebarState,
    toggleLeftSidebar,
    startLeftResize,
  } = useSidebarStore()

  useEffect(initSidebarState, [initSidebarState])

  const layout = useMemo(() => normalizeWorkspaceLayout({
    leftCollapsed: !leftSidebarVisible,
    leftWidth,
    leftTab: leftSidebarTab,
    documentPanelCollapsed: true,
  }, windowWidth), [leftSidebarTab, leftSidebarVisible, leftWidth, windowWidth])

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
        <CanvasChatHud />
      </main>
    </div>
  )
}
