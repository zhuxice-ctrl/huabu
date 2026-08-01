const MIN_TEXT_NODE_DIMENSION = 1
export const MAX_AUTO_TEXT_NODE_HEIGHT = 20_000

function finitePositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= MIN_TEXT_NODE_DIMENSION
}

export function normalizeTextManualMinHeight(value: unknown, persistedHeight: number): number {
  if (finitePositive(value)) return value
  return finitePositive(persistedHeight) ? persistedHeight : MIN_TEXT_NODE_DIMENSION
}

export function resolveTextNodeHeight(input: {
  measuredContentHeight: number
  chromeHeight: number
  currentHeight?: number
  manualMinHeight: number
}): number {
  const minimum = normalizeTextManualMinHeight(input.manualMinHeight, MIN_TEXT_NODE_DIMENSION)
  const current = finitePositive(input.currentHeight) ? input.currentHeight : minimum
  if (!Number.isFinite(input.measuredContentHeight) || !Number.isFinite(input.chromeHeight)) return Math.max(minimum, current)
  const measuredHeight = input.measuredContentHeight + input.chromeHeight
  if (!Number.isFinite(measuredHeight) || measuredHeight <= current) return Math.max(minimum, current)
  return Math.max(current, minimum, Math.min(MAX_AUTO_TEXT_NODE_HEIGHT, Math.ceil(measuredHeight)))
}

export function resolveTextResize(input: {
  width: number
  height: number
  previousManualMinHeight: number
  changedWidth: boolean
  changedHeight: boolean
}) {
  const previousMinimum = normalizeTextManualMinHeight(input.previousManualMinHeight, input.height)
  return {
    width: finitePositive(input.width) ? input.width : MIN_TEXT_NODE_DIMENSION,
    manualMinHeight: input.changedHeight && finitePositive(input.height)
      ? input.height
      : previousMinimum,
    shouldMeasure: input.changedWidth || input.changedHeight,
  }
}
