'use client'

import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, RotateCcw, SearchCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  advanceEvidenceNavigation,
  canAutoNavigateEvidence,
  createEvidenceNavigationSession,
  evidenceFocusFor,
  type EvidenceFocus,
} from '@/lib/canvas/evidence-navigation'
import type { CanvasEvidence } from '@/lib/canvas/canvas-retrieval'
import type { CanvasViewport } from '@/types/canvas'

export function CanvasEvidenceNavigator({
  canvasId,
  evidence,
  originViewport = { x: 0, y: 0, zoom: 1 },
  onFocus,
  onReturn,
}: {
  canvasId: string
  evidence: readonly CanvasEvidence[]
  originViewport?: CanvasViewport
  onFocus: (focus: EvidenceFocus) => void
  onReturn?: () => void
}) {
  const [session, setSession] = useState(() => (
    createEvidenceNavigationSession(canvasId, originViewport, evidence)
  ))
  const [showCandidates, setShowCandidates] = useState(false)
  const activeEvidence = useMemo(() => {
    const anchorId = session.resultAnchorIds[session.activeIndex]
    return evidence.find(item => item.anchor.id === anchorId) ?? null
  }, [evidence, session])

  const focusActive = () => {
    const focus = evidenceFocusFor(session, evidence)
    if (focus) onFocus(focus)
  }
  const chooseEvidence = (index: number) => {
    const next = { ...session, activeIndex: index }
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
    const next = advanceEvidenceNavigation(session, direction)
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
      <Button type="button" size="xs" variant="ghost" onClick={() => chooseEvidence(session.activeIndex)}>
        证据 {session.activeIndex + 1}/{session.resultAnchorIds.length}
      </Button>
      <Button type="button" size="icon-xs" variant="ghost" aria-label="上一条证据" onClick={() => move('previous')}>
        <ChevronLeft />
      </Button>
      <Button type="button" size="icon-xs" variant="ghost" aria-label="下一条证据" onClick={() => move('next')}>
        <ChevronRight />
      </Button>
      <Button type="button" size="icon-xs" variant="ghost" aria-label="返回浏览前的位置" onClick={onReturn}>
        <RotateCcw />
      </Button>
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
