import type { CanvasRelationData } from '../../types/canvas'

export const DEFAULT_RELATION: CanvasRelationData = {
  label: '',
  direction: 'forward',
  lineStyle: 'solid',
  color: '#64748b',
  source: 'manual',
}

export function relationEdgeVisuals(relation: CanvasRelationData) {
  return {
    markerStart: relation.direction === 'both',
    markerEnd: true,
    stroke: relation.color,
    strokeDasharray: relation.lineStyle === 'dashed'
      ? '8 6'
      : relation.lineStyle === 'dotted'
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
