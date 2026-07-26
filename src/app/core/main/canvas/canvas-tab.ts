import type { CanvasProject } from '@/types/canvas'

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

/**
 * Compatibility for callers that have not yet moved to activeCanvasId.
 * Task 7 itself never adds the returned legacy tab to the document panel.
 */
export function createCanvasTab(project: Pick<CanvasProject, 'id' | 'title'>) {
  return {
    id: `${CANVAS_TAB_PREFIX}${project.id}`,
    path: `${CANVAS_TAB_PREFIX}${project.id}`,
    name: project.title,
    isFolder: false as const,
    kind: 'canvas' as const,
    canvasId: project.id,
  }
}
