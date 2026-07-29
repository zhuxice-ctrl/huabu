import { create } from 'zustand'
import type { SavedCanvasView } from '@/db/canvas-views'
import type {
  EvidenceNavigationCommand,
  EvidenceNavigationSession,
} from '@/lib/canvas/evidence-navigation'
import {
  DEFAULT_LINEAR_VIEW_CONTROLS,
  type LinearViewControls,
} from '@/lib/canvas/linear-view'
import type { CanvasViewport } from '@/types/canvas'

export interface EvidenceNavigationViewState {
  session: EvidenceNavigationSession
  showCandidates: boolean
}

interface CanvasViewState {
  viewports: Record<string, CanvasViewport>
  evidenceNavigation: Record<string, EvidenceNavigationViewState>
  automaticEvidenceClaims: Record<string, string>
  linearControls: Record<string, LinearViewControls>
  savedViews: Record<string, SavedCanvasView[]>
}

const EMPTY_SAVED_VIEWS: SavedCanvasView[] = []
const viewportAnimations = new Map<string, number>()

const useCanvasViewStore = create<CanvasViewState>(() => ({
  viewports: {},
  evidenceNavigation: {},
  automaticEvidenceClaims: {},
  linearControls: {},
  savedViews: {},
}))

function sameViewport(left: CanvasViewport | undefined, right: CanvasViewport) {
  return left?.x === right.x && left.y === right.y && left.zoom === right.zoom
}

function cancelCanvasViewportAnimation(canvasId: string) {
  const animation = viewportAnimations.get(canvasId)
  if (animation !== undefined) cancelAnimationFrame(animation)
  viewportAnimations.delete(canvasId)
}

export function useCanvasViewportState(canvasId: string, initialViewport: CanvasViewport) {
  return useCanvasViewStore(state => state.viewports[canvasId] ?? initialViewport)
}

export function initializeCanvasViewportState(canvasId: string, viewport: CanvasViewport) {
  useCanvasViewStore.setState(state => state.viewports[canvasId]
    ? state
    : { viewports: { ...state.viewports, [canvasId]: { ...viewport } } })
}

export function publishCanvasViewportState(canvasId: string, viewport: CanvasViewport) {
  useCanvasViewStore.setState(state => sameViewport(state.viewports[canvasId], viewport)
    ? state
    : { viewports: { ...state.viewports, [canvasId]: { ...viewport } } })
}

export function animateCanvasViewportState(
  canvasId: string,
  target: CanvasViewport,
  duration: number,
) {
  cancelCanvasViewportAnimation(canvasId)
  const initial = useCanvasViewStore.getState().viewports[canvasId] ?? target
  if (duration <= 0 || sameViewport(initial, target)) {
    publishCanvasViewportState(canvasId, target)
    return
  }

  const startedAt = performance.now()
  function advanceViewportAnimation(timestamp: number) {
    const progress = Math.min(1, Math.max(0, (timestamp - startedAt) / duration))
    const eased = 1 - (1 - progress) ** 3
    publishCanvasViewportState(canvasId, {
      x: initial.x + (target.x - initial.x) * eased,
      y: initial.y + (target.y - initial.y) * eased,
      zoom: initial.zoom + (target.zoom - initial.zoom) * eased,
    })
    if (progress >= 1) {
      viewportAnimations.delete(canvasId)
      return
    }
    viewportAnimations.set(canvasId, requestAnimationFrame(advanceViewportAnimation))
  }
  viewportAnimations.set(canvasId, requestAnimationFrame(advanceViewportAnimation))
}

export function useEvidenceNavigationViewState(
  navigationId: string,
  initialState: EvidenceNavigationViewState,
) {
  return useCanvasViewStore(state => state.evidenceNavigation[navigationId] ?? initialState)
}

export function applyEvidenceNavigationCommand(
  navigationId: string,
  command: EvidenceNavigationCommand,
) {
  useCanvasViewStore.setState(state => ({
    evidenceNavigation: {
      ...state.evidenceNavigation,
      [navigationId]: {
        session: command.session,
        showCandidates: command.showCandidates,
      },
    },
  }))
}

export function releaseEvidenceNavigationState(navigationId: string) {
  useCanvasViewStore.setState(state => {
    if (!state.evidenceNavigation[navigationId]) return state
    const evidenceNavigation = { ...state.evidenceNavigation }
    delete evidenceNavigation[navigationId]
    return { evidenceNavigation }
  })
}

export function claimAutomaticEvidenceNavigation(navigationId: string, signature: string): boolean {
  const claimed = useCanvasViewStore.getState().automaticEvidenceClaims[navigationId]
  if (claimed === signature) return false
  useCanvasViewStore.setState(state => ({
    automaticEvidenceClaims: {
      ...state.automaticEvidenceClaims,
      [navigationId]: signature,
    },
  }))
  return true
}

export function evidenceNavigationSignature(canvasId: string, anchorIds: readonly string[]) {
  return JSON.stringify([canvasId, ...anchorIds])
}

export function useCanvasLinearViewControls(canvasId: string) {
  return useCanvasViewStore(state => (
    state.linearControls[canvasId] ?? DEFAULT_LINEAR_VIEW_CONTROLS
  ))
}

export function replaceCanvasLinearViewControls(
  canvasId: string,
  controls: LinearViewControls,
) {
  useCanvasViewStore.setState(state => ({
    linearControls: { ...state.linearControls, [canvasId]: controls },
  }))
}

export function useCanvasSavedViews(canvasId: string) {
  return useCanvasViewStore(state => state.savedViews[canvasId] ?? EMPTY_SAVED_VIEWS)
}

export function replaceCanvasSavedViews(canvasId: string, savedViews: SavedCanvasView[]) {
  useCanvasViewStore.setState(state => ({
    savedViews: { ...state.savedViews, [canvasId]: savedViews },
  }))
}

export default useCanvasViewStore
