import type { CanvasProject } from '@/types/canvas'

export interface CanvasChatContext {
  sourceCanvasId: string | null
  sourceCanvasTitle: string | null
  sourceNodeIds?: string[]
  sentAt: number
}

export const UNKNOWN_CANVAS_SOURCE_LABEL = '来源未记录'

export function createCanvasChatContext(
  activeCanvasId: string | null,
  projects: Pick<CanvasProject, 'id' | 'title'>[],
  sentAt: number,
): string {
  const project = activeCanvasId
    ? projects.find(item => item.id === activeCanvasId)
    : undefined

  return JSON.stringify({
    sourceCanvasId: activeCanvasId,
    sourceCanvasTitle: project?.title ?? null,
    sentAt,
  } satisfies CanvasChatContext)
}

export function parseCanvasChatContext(value: string | null | undefined): CanvasChatContext | null {
  if (!value) return null

  try {
    const parsed: unknown = JSON.parse(value)
    if (!parsed || typeof parsed !== 'object') return null
    const context = parsed as Partial<CanvasChatContext>
    if (
      (context.sourceCanvasId !== null && typeof context.sourceCanvasId !== 'string')
      || (context.sourceCanvasTitle !== null && typeof context.sourceCanvasTitle !== 'string')
      || typeof context.sentAt !== 'number'
      || !Number.isFinite(context.sentAt)
    ) {
      return null
    }

    const sourceNodeIds = Array.isArray(context.sourceNodeIds)
      ? context.sourceNodeIds.filter((id): id is string => typeof id === 'string')
      : undefined

    return {
      sourceCanvasId: context.sourceCanvasId ?? null,
      sourceCanvasTitle: context.sourceCanvasTitle ?? null,
      ...(sourceNodeIds?.length ? { sourceNodeIds } : {}),
      sentAt: context.sentAt,
    }
  } catch {
    // Invalid local JSON is intentionally rendered as 来源未记录 by the chat UI.
    return null
  }
}

export function mergeCanvasContextNodeIds(
  value: string | null | undefined,
  sourceNodeIds: unknown,
): string | null {
  const context = parseCanvasChatContext(value)
  if (!context || !Array.isArray(sourceNodeIds)) return value ?? null

  const validatedNodeIds = Array.from(new Set(
    sourceNodeIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
  ))
  if (validatedNodeIds.length === 0) return JSON.stringify(context)

  return JSON.stringify({
    ...context,
    sourceNodeIds: validatedNodeIds,
  } satisfies CanvasChatContext)
}
