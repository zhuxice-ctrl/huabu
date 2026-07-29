'use client'

import { useEffect, useMemo } from 'react'
import { ChevronLeft, ChevronRight, RotateCcw, SearchCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  createEvidenceNavigationSession,
  planEvidenceCandidateConfirmation,
  planEvidenceMove,
  planEvidenceNavigationReconciliation,
  planEvidenceSelection,
  planInitialEvidenceNavigation,
  reconcileEvidenceNavigationSession,
  returnToEvidenceOrigin,
  type EvidenceNavigationCommand,
} from '@/lib/canvas/evidence-navigation'
import {
  executeCanvasEvidenceFocus,
  executeCanvasEvidenceReturn,
} from '@/lib/canvas/evidence-navigation-runtime'
import type { CanvasEvidence } from '@/lib/canvas/canvas-retrieval'
import {
  applyEvidenceNavigationCommand,
  claimAutomaticEvidenceNavigation,
  evidenceNavigationSignature,
  releaseEvidenceNavigationState,
  useEvidenceNavigationViewState,
} from '@/stores/canvas-view'
import type { CanvasViewport } from '@/types/canvas'

function executeEvidenceNavigationCommand(
  navigationId: string,
  command: EvidenceNavigationCommand,
) {
  applyEvidenceNavigationCommand(navigationId, command)
  if (command.focus) void executeCanvasEvidenceFocus(command.focus)
}

export function CanvasEvidenceNavigator({
  navigationId,
  canvasId,
  evidence,
  originViewport,
  completed,
}: {
  navigationId: string
  canvasId: string
  evidence: readonly CanvasEvidence[]
  originViewport: CanvasViewport
  completed: boolean
}) {
  const initialState = useMemo(() => ({
    session: createEvidenceNavigationSession(canvasId, originViewport, evidence),
    showCandidates: false,
  }), [canvasId, evidence, originViewport])
  const navigation = useEvidenceNavigationViewState(navigationId, initialState)
  const synchronizedSession = useMemo(() => reconcileEvidenceNavigationSession(
    navigation.session,
    canvasId,
    originViewport,
    evidence,
  ), [canvasId, evidence, navigation.session, originViewport.x, originViewport.y, originViewport.zoom])
  useEffect(() => {
    applyEvidenceNavigationCommand(navigationId, planEvidenceNavigationReconciliation(
      navigation.session,
      canvasId,
      originViewport,
      evidence,
    ))
  }, [canvasId, evidence, navigation.session, navigationId, originViewport])
  useEffect(() => {
    if (!completed) return
    const signature = evidenceNavigationSignature(canvasId, synchronizedSession.resultAnchorIds)
    const alreadyClaimed = !claimAutomaticEvidenceNavigation(navigationId, signature)
    const command = planInitialEvidenceNavigation(
      synchronizedSession,
      evidence,
      { completed, alreadyClaimed },
    )
    applyEvidenceNavigationCommand(navigationId, command)
    if (command.focus) void executeCanvasEvidenceFocus(command.focus)
  }, [canvasId, completed, evidence, navigationId, synchronizedSession])
  useEffect(() => () => releaseEvidenceNavigationState(navigationId), [navigationId])
  const activeEvidence = useMemo(() => {
    const anchorId = synchronizedSession.resultAnchorIds[synchronizedSession.activeIndex]
    return evidence.find(item => (
      item.anchor.id === anchorId && item.anchor.canvasId === synchronizedSession.canvasId
    )) ?? null
  }, [evidence, synchronizedSession])

  const chooseEvidence = (index: number) => {
    executeEvidenceNavigationCommand(
      navigationId,
      planEvidenceSelection(synchronizedSession, evidence, index),
    )
  }
  const move = (direction: 'previous' | 'next') => {
    executeEvidenceNavigationCommand(
      navigationId,
      planEvidenceMove(synchronizedSession, evidence, direction),
    )
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
      <Button
        type="button"
        size="icon-xs"
        variant="ghost"
        aria-label="返回浏览前的位置"
        onClick={() => executeCanvasEvidenceReturn(
          canvasId,
          returnToEvidenceOrigin(synchronizedSession),
        )}
      >
        <RotateCcw />
      </Button>
      {navigation.showCandidates && (
        <span className="flex items-center gap-1 text-muted-foreground">
          候选证据，确认后定位
          <Button
            type="button"
            size="xs"
            variant="secondary"
            onClick={() => executeEvidenceNavigationCommand(
              navigationId,
              planEvidenceCandidateConfirmation(synchronizedSession, evidence),
            )}
          >
            定位
          </Button>
        </span>
      )}
    </div>
  )
}
