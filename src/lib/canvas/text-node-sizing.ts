const MIN_TEXT_NODE_DIMENSION = 1

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
  manualMinHeight: number
}): number {
  const minimum = normalizeTextManualMinHeight(input.manualMinHeight, MIN_TEXT_NODE_DIMENSION)
  if (!Number.isFinite(input.measuredContentHeight) || !Number.isFinite(input.chromeHeight)) return minimum
  return Math.max(minimum, Math.ceil(input.measuredContentHeight + input.chromeHeight))
}

export function resolveTextResize(input: {
  width: number
  height: number
  previousManualMinHeight: number
  changedWidth: boolean
  changedHeight: boolean
}) {
  return {
    width: Math.max(MIN_TEXT_NODE_DIMENSION, input.width),
    manualMinHeight: input.changedHeight
      ? Math.max(MIN_TEXT_NODE_DIMENSION, input.height)
      : normalizeTextManualMinHeight(input.previousManualMinHeight, input.height),
    shouldMeasure: input.changedWidth || input.changedHeight,
  }
}
