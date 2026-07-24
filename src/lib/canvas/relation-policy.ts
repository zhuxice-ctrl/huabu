import type {
  CanvasRelationData,
  CanvasRelationRouteType,
  CanvasRelationWaypoint,
} from '../../types/canvas'

const ROUTE_TYPES = new Set<CanvasRelationRouteType>(['auto', 'bezier', 'straight', 'orthogonal', 'manual'])

export const DEFAULT_RELATION: CanvasRelationData = {
  label: '',
  direction: 'forward',
  lineStyle: 'solid',
  color: '#64748b',
  source: 'manual',
  routeType: 'auto',
  strokeWidth: 2,
  waypoints: [],
}

export function normalizeRelationData(value: unknown): CanvasRelationData & {
  routeType: CanvasRelationRouteType
  strokeWidth: number
  waypoints: CanvasRelationWaypoint[]
} {
  const candidate = value && typeof value === 'object'
    ? value as Partial<CanvasRelationData>
    : {}
  const routeType = typeof candidate.routeType === 'string'
    && ROUTE_TYPES.has(candidate.routeType as CanvasRelationRouteType)
    ? candidate.routeType as CanvasRelationRouteType
    : 'auto'
  const strokeWidth = Number.isFinite(candidate.strokeWidth)
    ? Math.min(8, Math.max(1, Number(candidate.strokeWidth)))
    : 2
  const waypoints = Array.isArray(candidate.waypoints)
    ? candidate.waypoints.filter((point): point is CanvasRelationWaypoint => Boolean(
        point
        && Number.isFinite(point.x)
        && Number.isFinite(point.y)
      )).map(point => ({ x: point.x, y: point.y }))
    : []

  return {
    ...DEFAULT_RELATION,
    ...candidate,
    label: typeof candidate.label === 'string' ? candidate.label : '',
    direction: candidate.direction === 'both' ? 'both' : 'forward',
    lineStyle: candidate.lineStyle === 'dashed' || candidate.lineStyle === 'dotted'
      ? candidate.lineStyle
      : 'solid',
    color: typeof candidate.color === 'string' ? candidate.color : DEFAULT_RELATION.color,
    source: candidate.source === 'ai' ? 'ai' : 'manual',
    routeType,
    strokeWidth,
    waypoints,
  }
}

export function relationEdgeVisuals(relation: CanvasRelationData) {
  const normalized = normalizeRelationData(relation)
  return {
    markerStart: normalized.direction === 'both',
    markerEnd: true,
    stroke: normalized.color,
    strokeWidth: normalized.strokeWidth,
    strokeDasharray: normalized.lineStyle === 'dashed'
      ? '8 6'
      : normalized.lineStyle === 'dotted'
        ? '2 6'
        : undefined,
  }
}

export function isValidRelationTarget(
  sourceId: string,
  targetId: string | null,
  nodeIds: Set<string>,
) {
  return Boolean(
    targetId
    && targetId !== sourceId
    && nodeIds.has(sourceId)
    && nodeIds.has(targetId),
  )
}
