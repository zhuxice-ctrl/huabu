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
  field: 'text' | null
  textFingerprint: string
}

const canvasViewportSnapshots = new Map<string, CanvasViewport>()
const evidenceQueryOrigins = new Map<string, { canvasId: string; viewport: CanvasViewport }>()

function canvasEvidenceTextFingerprint(value: string): string {
  let hash = 0x811c9dc5
  for (const byte of new TextEncoder().encode(value)) {
    hash ^= byte
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
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

export function reconcileEvidenceNavigationSession(
  session: EvidenceNavigationSession,
  canvasId: string,
  originViewport: CanvasViewport,
  evidence: readonly CanvasEvidence[],
): EvidenceNavigationSession {
  const next = createEvidenceNavigationSession(canvasId, originViewport, evidence)
  if (session.canvasId !== canvasId) return next
  const activeAnchorId = session.resultAnchorIds[session.activeIndex]
  const activeIndex = activeAnchorId ? next.resultAnchorIds.indexOf(activeAnchorId) : -1
  const reconciled = { ...next, activeIndex: activeIndex >= 0 ? activeIndex : 0 }
  const unchanged = session.activeIndex === reconciled.activeIndex
    && session.originViewport.x === reconciled.originViewport.x
    && session.originViewport.y === reconciled.originViewport.y
    && session.originViewport.zoom === reconciled.originViewport.zoom
    && session.resultAnchorIds.length === reconciled.resultAnchorIds.length
    && session.resultAnchorIds.every((id, index) => id === reconciled.resultAnchorIds[index])
  return unchanged ? session : reconciled
}

export function recordCanvasViewportSnapshot(canvasId: string, viewport: CanvasViewport): void {
  canvasViewportSnapshots.set(canvasId, cloneViewport(viewport))
}

export function captureEvidenceQueryOrigin(canvasId: string, queryKey: string): CanvasViewport | null {
  const current = canvasViewportSnapshots.get(canvasId)
  if (!current) return null
  const viewport = cloneViewport(current)
  evidenceQueryOrigins.set(queryKey, { canvasId, viewport })
  return cloneViewport(viewport)
}

export function getEvidenceQueryOrigin(canvasId: string, queryKey: string): CanvasViewport | null {
  const origin = evidenceQueryOrigins.get(queryKey)
  return origin?.canvasId === canvasId ? cloneViewport(origin.viewport) : null
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
    field: matched.anchor.contentType === 'text' ? 'text' : null,
    textFingerprint: matched.textFingerprint
      ?? canvasEvidenceTextFingerprint(matched.anchor.plainText),
  }
}

export function isExactEvidenceTextSelection(
  focus: EvidenceFocus | null | undefined,
  value: string,
): boolean {
  if (!focus || focus.field !== 'text') return false
  if (
    !Number.isSafeInteger(focus.startOffset)
    || !Number.isSafeInteger(focus.endOffset)
    || focus.startOffset < 0
    || focus.endOffset <= focus.startOffset
    || focus.endOffset > value.length
  ) return false
  return canvasEvidenceTextFingerprint(value.slice(focus.startOffset, focus.endOffset)) === focus.textFingerprint
}

export function returnToEvidenceOrigin(session: EvidenceNavigationSession): CanvasViewport {
  return cloneViewport(session.originViewport)
}
