'use client'

import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, RotateCcw, SearchCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  advanceEvidenceNavigation,
  canAutoNavigateEvidence,
  createEvidenceNavigationSession,
  evidenceFocusFor,
  reconcileEvidenceNavigationSession,
  returnToEvidenceOrigin,
  type EvidenceFocus,
} from '@/lib/canvas/evidence-navigation'
import type { CanvasEvidence } from '@/lib/canvas/canvas-retrieval'
import type { CanvasViewport } from '@/types/canvas'

export function CanvasEvidenceNavigator({
  canvasId,
  evidence,
  originViewport,
  onFocus,
  onReturn,
}: {
  canvasId: string
  evidence: readonly CanvasEvidence[]
  originViewport: CanvasViewport
  onFocus: (focus: EvidenceFocus) => void
  onReturn?: (viewport: CanvasViewport) => void
}) {
  const [session, setSession] = useState(() => (
    createEvidenceNavigationSession(canvasId, originViewport, evidence)
  ))
  const [showCandidates, setShowCandidates] = useState(false)
  const synchronizedSession = useMemo(() => reconcileEvidenceNavigationSession(
    session,
    canvasId,
    originViewport,
    evidence,
  ), [canvasId, evidence, originViewport.x, originViewport.y, originViewport.zoom, session])
  useEffect(() => {
    setSession(synchronizedSession)
  }, [synchronizedSession])
  useEffect(() => {
    setShowCandidates(false)
  }, [canvasId, evidence, originViewport.x, originViewport.y, originViewport.zoom])
  const activeEvidence = useMemo(() => {
    const anchorId = synchronizedSession.resultAnchorIds[synchronizedSession.activeIndex]
    return evidence.find(item => (
      item.anchor.id === anchorId && item.anchor.canvasId === synchronizedSession.canvasId
    )) ?? null
  }, [evidence, synchronizedSession])

  const focusActive = () => {
    const focus = evidenceFocusFor(synchronizedSession, evidence)
    if (focus) onFocus(focus)
  }
  const chooseEvidence = (index: number) => {
    const next = { ...synchronizedSession, activeIndex: index }
    setSession(next)
    const selected = evidence.find(item => item.anchor.id === next.resultAnchorIds[index])
    if (selected && canAutoNavigateEvidence(selected)) {
      setShowCandidates(false)
      const focus = evidenceFocusFor(next, evidence)
      if (focus) onFocus(focus)
    } else {
      setShowCandidates(true)
    }
  }
  const move = (direction: 'previous' | 'next') => {
    const next = advanceEvidenceNavigation(synchronizedSession, direction)
    setSession(next)
    const selected = evidence.find(item => item.anchor.id === next.resultAnchorIds[next.activeIndex])
    if (selected && canAutoNavigateEvidence(selected)) {
      const focus = evidenceFocusFor(next, evidence)
      if (focus) onFocus(focus)
    } else {
      setShowCandidates(true)
    }
  }

  if (!activeEvidence) return null
  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-md border bg-muted/40 p-1.5 text-xs">
      <SearchCheck className="size-3.5 text-primary" aria-hidden="true" />
      <Button type="button" size="xs" variant="ghost" onClick={() => chooseEvidence(synchronizedSession.activeIndex)}>
        证据 {synchronizedSession.activeIndex + 1}/{synchronizedSession.resultAnchorIds.length}
      </Button>
      <Button type="button" size="icon-xs" variant="ghost" aria-label="上一条证据" onClick={() => move('previous')}>
        <ChevronLeft />
      </Button>
      <Button type="button" size="icon-xs" variant="ghost" aria-label="下一条证据" onClick={() => move('next')}>
        <ChevronRight />
      </Button>
      {onReturn && (
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          aria-label="返回浏览前的位置"
          onClick={() => onReturn(returnToEvidenceOrigin(synchronizedSession))}
        >
          <RotateCcw />
        </Button>
      )}
      {showCandidates && (
        <span className="flex items-center gap-1 text-muted-foreground">
          候选证据，确认后定位
          <Button type="button" size="xs" variant="secondary" onClick={() => { setShowCandidates(false); focusActive() }}>
            定位
          </Button>
        </span>
      )}
    </div>
  )
}
