import emitter from '@/lib/emitter'
import useCanvasStore from '@/stores/canvas'
import { setChatHudExpanded } from '@/stores/chat-hud'
import type { EvidenceFocus } from './evidence-navigation'
import type { CanvasViewport } from '@/types/canvas'

const readyCanvases = new Set<string>()
const readinessWaiters = new Map<string, Set<() => void>>()

export function markCanvasEvidenceRuntimeReady(canvasId: string) {
  readyCanvases.add(canvasId)
  for (const resolve of readinessWaiters.get(canvasId) ?? []) resolve()
  readinessWaiters.delete(canvasId)
  return () => {
    readyCanvases.delete(canvasId)
  }
}

export async function waitForCanvasEvidenceRuntime(canvasId: string) {
  if (readyCanvases.has(canvasId)) return
  await new Promise<void>(resolve => {
    const waiters = readinessWaiters.get(canvasId) ?? new Set()
    waiters.add(resolve)
    readinessWaiters.set(canvasId, waiters)
  })
}

export async function executeCanvasEvidenceFocus(focus: EvidenceFocus) {
  setChatHudExpanded(false)
  if (useCanvasStore.getState().activeCanvasId !== focus.canvasId) {
    useCanvasStore.setState({ activeCanvasId: focus.canvasId })
  }
  await waitForCanvasEvidenceRuntime(focus.canvasId)
  emitter.emit('canvas-focus-evidence', focus)
}

export function executeCanvasEvidenceReturn(canvasId: string, viewport: CanvasViewport) {
  emitter.emit('canvas-evidence-return', { canvasId, viewport })
}
