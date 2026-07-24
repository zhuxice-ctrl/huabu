export const POINTER_DRAG_THRESHOLD = 6
export const RELATION_LONG_PRESS_MS = 320

export type PointerReleaseIntent =
  | 'pane-click'
  | 'draw-block'
  | 'node-context'
  | 'relation-drag'
  | 'none'

export function classifyPointerRelease(input: {
  button: number
  elapsedMs: number
  distance: number
  startedOnNode: boolean
}): PointerReleaseIntent {
  if (input.button === 0 && !input.startedOnNode) {
    return input.distance >= POINTER_DRAG_THRESHOLD ? 'draw-block' : 'pane-click'
  }

  if (input.button === 2 && input.startedOnNode) {
    return input.elapsedMs >= RELATION_LONG_PRESS_MS
      ? 'relation-drag'
      : 'node-context'
  }

  return 'none'
}

export function normalizeDrawRect(
  start: { x: number; y: number },
  end: { x: number; y: number },
) {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.max(120, Math.abs(end.x - start.x)),
    height: Math.max(72, Math.abs(end.y - start.y)),
  }
}
