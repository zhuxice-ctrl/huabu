import type { CanvasEvidence } from './canvas-retrieval'
import type { CanvasViewport } from '@/types/canvas'

/** Evidence scores at or above this value can move the viewport immediately. */
export const EVIDENCE_AUTO_NAVIGATION_CONFIDENCE = 0.7

/**
 * Ephemeral navigation state. It deliberately lives outside CanvasDocument so
 * inspecting evidence can neither alter canvas content nor enter undo history.
 */
export interface EvidenceNavigationSession {
  canvasId: string
  originViewport: CanvasViewport
  resultAnchorIds: string[]
  activeIndex: number
}

export interface EvidenceFocus {
  canvasId: string
  nodeId: string
  startOffset: number
  endOffset: number
}

function cloneViewport(viewport: CanvasViewport): CanvasViewport {
  return { x: viewport.x, y: viewport.y, zoom: viewport.zoom }
}

export function createEvidenceNavigationSession(
  canvasId: string,
  originViewport: CanvasViewport,
  evidence: readonly CanvasEvidence[],
): EvidenceNavigationSession {
  return {
    canvasId,
    originViewport: cloneViewport(originViewport),
    resultAnchorIds: evidence
      .filter(item => item.anchor.canvasId === canvasId)
      .map(item => item.anchor.id),
    activeIndex: 0,
  }
}

export function canAutoNavigateEvidence(
  evidence: Pick<CanvasEvidence, 'score'>,
  threshold = EVIDENCE_AUTO_NAVIGATION_CONFIDENCE,
): boolean {
  return Number.isFinite(evidence.score) && evidence.score >= threshold
}

export function advanceEvidenceNavigation(
  session: EvidenceNavigationSession,
  direction: 'previous' | 'next',
): EvidenceNavigationSession {
  const maximumIndex = Math.max(0, session.resultAnchorIds.length - 1)
  const activeIndex = direction === 'next'
    ? Math.min(maximumIndex, session.activeIndex + 1)
    : Math.max(0, session.activeIndex - 1)
  return { ...session, activeIndex }
}

export function evidenceFocusFor(
  session: EvidenceNavigationSession,
  evidence: readonly CanvasEvidence[],
): EvidenceFocus | null {
  const anchorId = session.resultAnchorIds[session.activeIndex]
  if (!anchorId) return null
  const matched = evidence.find(item => (
    item.anchor.id === anchorId && item.anchor.canvasId === session.canvasId
  ))
  if (!matched) return null
  return {
    canvasId: matched.anchor.canvasId,
    nodeId: matched.anchor.nodeId,
    startOffset: matched.anchor.startOffset,
    endOffset: matched.anchor.endOffset,
  }
}

export function returnToEvidenceOrigin(session: EvidenceNavigationSession): CanvasViewport {
  return cloneViewport(session.originViewport)
}
