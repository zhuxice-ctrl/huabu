import type { CanvasRect, RelationSide } from './gesture-policy'
import type { CanvasRelationData, CanvasRelationWaypoint } from '../../types/canvas'

export interface RelationEdgeLike {
  id: string
  source: string
  target: string
  sourceHandle?: string | null
  targetHandle?: string | null
  type?: string
  label?: unknown
  data?: unknown
}

export interface PendingRelationEdge extends RelationEdgeLike {
  sourceHandle: string
  targetHandle: string
  type: 'relation'
  label: string
  data: CanvasRelationData
}

export interface RelationEditorTransaction<T extends RelationEdgeLike> {
  edgeId: string
  mode: 'create' | 'edit'
  draft?: T
}

export interface RelationCommitResult<T extends RelationEdgeLike> {
  changed: boolean
  edges: T[]
}

export interface RelationHandleEndpoint {
  handleId: string
  point: { x: number; y: number }
}

export interface RelationHandleSelection {
  source: RelationHandleEndpoint
  target?: RelationHandleEndpoint
}

export interface ContextMenuSuppressionState {
  expiresAt: number
}

const CONTEXT_MENU_SUPPRESSION_MS = 750
const SOURCE_HANDLE_IDS = { top: 'source-top', right: 'right', bottom: 'bottom', left: 'source-left' } as const
const TARGET_HANDLE_IDS = { top: 'top', right: 'target-right', bottom: 'target-bottom', left: 'left' } as const

export function sourceHandleIdForSide(side: RelationSide) {
  return SOURCE_HANDLE_IDS[side]
}

export function targetHandleIdForSide(side: RelationSide) {
  return TARGET_HANDLE_IDS[side]
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value))
}

export function selectSourceRelationHandle(rect: CanvasRect, side: RelationSide): RelationHandleEndpoint {
  if (side === 'top') return { handleId: sourceHandleIdForSide(side), point: { x: rect.x + rect.width / 2, y: rect.y } }
  if (side === 'right') return { handleId: sourceHandleIdForSide(side), point: { x: rect.x + rect.width, y: rect.y + rect.height / 2 } }
  if (side === 'bottom') return { handleId: sourceHandleIdForSide(side), point: { x: rect.x + rect.width / 2, y: rect.y + rect.height } }
  return { handleId: sourceHandleIdForSide(side), point: { x: rect.x, y: rect.y + rect.height / 2 } }
}

export function selectTargetRelationHandle(rect: CanvasRect, pointer: { x: number; y: number }): RelationHandleEndpoint {
  const candidates = [
    { side: 'top' as const, distance: Math.abs(pointer.y - rect.y), point: { x: clamp(pointer.x, rect.x, rect.x + rect.width), y: rect.y } },
    { side: 'right' as const, distance: Math.abs(pointer.x - (rect.x + rect.width)), point: { x: rect.x + rect.width, y: clamp(pointer.y, rect.y, rect.y + rect.height) } },
    { side: 'bottom' as const, distance: Math.abs(pointer.y - (rect.y + rect.height)), point: { x: clamp(pointer.x, rect.x, rect.x + rect.width), y: rect.y + rect.height } },
    { side: 'left' as const, distance: Math.abs(pointer.x - rect.x), point: { x: rect.x, y: clamp(pointer.y, rect.y, rect.y + rect.height) } },
  ]
  const nearest = candidates.reduce((best, candidate) => candidate.distance < best.distance ? candidate : best)
  return { handleId: targetHandleIdForSide(nearest.side), point: nearest.point }
}

function distanceSquared(a: { x: number; y: number }, b: { x: number; y: number }) {
  return (b.x - a.x) ** 2 + (b.y - a.y) ** 2
}

function sourceHandleEndpoints(rect: CanvasRect): RelationHandleEndpoint[] {
  return [
    { handleId: 'bottom', point: { x: rect.x + rect.width / 2, y: rect.y + rect.height } },
    { handleId: 'right', point: { x: rect.x + rect.width, y: rect.y + rect.height / 2 } },
  ]
}

function targetHandleEndpoints(rect: CanvasRect): RelationHandleEndpoint[] {
  return [
    { handleId: 'top', point: { x: rect.x + rect.width / 2, y: rect.y } },
    { handleId: 'left', point: { x: rect.x, y: rect.y + rect.height / 2 } },
  ]
}

export function selectRelationHandles(input: {
  sourceRect: CanvasRect
  targetRect?: CanvasRect
  pointer: { x: number; y: number }
}): RelationHandleSelection {
  const sources = sourceHandleEndpoints(input.sourceRect)
  if (!input.targetRect) {
    const source = sources.reduce((best, candidate) => (
      distanceSquared(candidate.point, input.pointer) < distanceSquared(best.point, input.pointer)
        ? candidate
        : best
    ))
    return { source }
  }

  const targets = targetHandleEndpoints(input.targetRect)
  let best = { source: sources[0], target: targets[0] }
  for (const source of sources) {
    for (const target of targets) {
      if (distanceSquared(source.point, target.point) < distanceSquared(best.source.point, best.target.point)) {
        best = { source, target }
      }
    }
  }
  return best
}

export function canStartRelationGesture(input: {
  button: number
  sourceId: string | null
  hasPreviewSnapshot: boolean
}) {
  return input.button === 2 && Boolean(input.sourceId) && !input.hasPreviewSnapshot
}

export function createPendingRelationEdge(input: {
  id: string
  source: string
  target: string
  sourceHandle: string
  targetHandle: string
  data: CanvasRelationData
}): PendingRelationEdge {
  return {
    ...input,
    type: 'relation',
    label: '',
    data: {
      ...input.data,
      ...(input.data.waypoints ? { waypoints: input.data.waypoints.map(point => ({ ...point })) } : {}),
    },
  }
}

export function commitRelationEditorTransaction<T extends RelationEdgeLike>(
  edges: T[],
  transaction: RelationEditorTransaction<T>,
  value: CanvasRelationData,
): RelationCommitResult<T> {
  const normalized = value
  if (transaction.mode === 'create') {
    if (!transaction.draft || edges.some(edge => edge.id === transaction.edgeId)) {
      return { changed: false, edges }
    }
    return {
      changed: true,
      edges: [
        ...edges,
        {
          ...transaction.draft,
          type: 'relation',
          label: normalized.label,
          data: normalized,
        },
      ],
    }
  }

  let changed = false
  const next = edges.map(edge => {
    if (edge.id !== transaction.edgeId) return edge
    changed = true
    return {
      ...edge,
      type: 'relation',
      label: normalized.label,
      data: normalized,
    }
  })
  return { changed, edges: changed ? next : edges }
}

export function removeWaypointAt(
  waypoints: CanvasRelationWaypoint[],
  selectedIndex: number | null,
) {
  if (selectedIndex === null || selectedIndex < 0 || selectedIndex >= waypoints.length) return waypoints
  return waypoints.filter((_point, index) => index !== selectedIndex)
}

export function armContextMenuSuppression(
  now: number,
  durationMs = CONTEXT_MENU_SUPPRESSION_MS,
): ContextMenuSuppressionState {
  return { expiresAt: now + durationMs }
}

export function consumeContextMenuSuppression(
  state: ContextMenuSuppressionState | null,
  now: number,
): { suppress: boolean; next: null } {
  return { suppress: Boolean(state && now <= state.expiresAt), next: null }
}
