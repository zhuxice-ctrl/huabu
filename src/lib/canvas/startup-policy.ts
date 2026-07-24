export function chooseStartupCanvasId(
  projects: Array<{ id: string; updatedAt: number }>,
  lastCanvasId: string | null,
) {
  if (lastCanvasId && projects.some(project => project.id === lastCanvasId)) {
    return lastCanvasId
  }

  return [...projects].sort((left, right) => right.updatedAt - left.updatedAt)[0]?.id ?? null
}
