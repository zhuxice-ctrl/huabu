import emitter from '@/lib/emitter'
import useCanvasStore from '@/stores/canvas'
import { setChatHudExpanded } from '@/stores/chat-hud'
import type { EvidenceFocus } from './evidence-navigation'
import type { CanvasViewport } from '@/types/canvas'

export function executeCanvasEvidenceFocus(focus: EvidenceFocus) {
  setChatHudExpanded(false)
  if (useCanvasStore.getState().activeCanvasId !== focus.canvasId) {
    useCanvasStore.setState({ activeCanvasId: focus.canvasId })
  }
  requestAnimationFrame(() => emitter.emit('canvas-focus-evidence', focus))
}

export function executeCanvasEvidenceReturn(canvasId: string, viewport: CanvasViewport) {
  emitter.emit('canvas-evidence-return', { canvasId, viewport })
}
