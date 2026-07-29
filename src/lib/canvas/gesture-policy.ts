export const POINTER_DRAG_THRESHOLD = 6
export const POINTER_AXIS_THRESHOLD = 3
export const RELATION_DRAG_THRESHOLD = 4

export interface CanvasRect {
  x: number
  y: number
  width: number
  height: number
}

export type PointerReleaseIntent =
  | 'pane-click'
  | 'pane-context'
  | 'draw-block'
  | 'marquee-select'
  | 'node-context'
  | 'relation-drag'
  | 'none'

export function classifyPointerRelease(input: {
  button: number
  elapsedMs: number
  deltaX: number
  deltaY: number
  startedOnNode: boolean
}): PointerReleaseIntent {
  if (input.button === 0 && !input.startedOnNode) {
    return hasDrawableArea({ x: 0, y: 0 }, { x: input.deltaX, y: input.deltaY })
      ? 'draw-block'
      : 'pane-click'
  }

  if (input.button === 2 && input.startedOnNode) {
    return Math.hypot(input.deltaX, input.deltaY) >= RELATION_DRAG_THRESHOLD
      ? 'relation-drag'
      : 'node-context'
  }

  if (input.button === 2 && !input.startedOnNode) {
    const distance = Math.hypot(input.deltaX, input.deltaY)
    return distance >= POINTER_DRAG_THRESHOLD ? 'marquee-select' : 'pane-context'
  }

  return 'none'
}

export function hasDrawableArea(start: { x: number; y: number }, end: { x: number; y: number }) {
  return Math.abs(end.x - start.x) >= POINTER_AXIS_THRESHOLD
    && Math.abs(end.y - start.y) >= POINTER_AXIS_THRESHOLD
}

export function normalizeDrawRect(
  start: { x: number; y: number },
  end: { x: number; y: number },
) : CanvasRect {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  }
}

export function rectanglesIntersect(a: CanvasRect, b: CanvasRect) {
  return a.x <= b.x + b.width
    && a.x + a.width >= b.x
    && a.y <= b.y + b.height
    && a.y + a.height >= b.y
}

export function intersectingRectIds(
  selection: CanvasRect,
  candidates: Array<CanvasRect & { id: string }>,
) {
  return candidates
    .filter(candidate => rectanglesIntersect(selection, candidate))
    .map(candidate => candidate.id)
}
