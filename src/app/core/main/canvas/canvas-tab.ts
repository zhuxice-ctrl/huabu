export const CANVAS_TAB_PREFIX = 'canvas://project/'

export function getCanvasIdFromTabPath(path: string) {
  if (!path.startsWith(CANVAS_TAB_PREFIX)) {
    return null
  }
  const id = path.slice(CANVAS_TAB_PREFIX.length)
  return id || null
}

export function isCanvasTabPath(path: string) {
  return getCanvasIdFromTabPath(path) !== null
}
