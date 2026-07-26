import type { Mark } from '../../db/marks'
import type { CanvasNode } from '../../types/canvas'

export interface NoteReferenceData extends Record<string, unknown> {
  sourceNoteId: string
  sourceTitle: string
  sourceExcerpt: string
  sourceUpdatedAt: number
  sourceStatus: 'available' | 'missing'
  sourceSyncStatus?: 'current' | 'stale'
}

export const NOTE_REFERENCE_MIME = 'application/x-zeroxb-note-reference'

const TITLE_LIMIT = 96
const EXCERPT_LIMIT = 240

function compact(value?: string): string {
  return value?.replace(/\s+/g, ' ').trim() || ''
}

function truncate(value: string, limit: number): string {
  return value.length > limit ? `${value.slice(0, limit - 1).trimEnd()}…` : value
}

function titleForMark(mark: Mark): string {
  return truncate(compact(mark.desc) || compact(mark.content).split(/[。！？.!?]/)[0] || compact(mark.url) || `记录 ${mark.id}`, TITLE_LIMIT)
}

function excerptForMark(mark: Mark, title: string): string {
  return truncate(compact(mark.content) || compact(mark.desc) || compact(mark.url) || title, EXCERPT_LIMIT)
}

export function noteReferenceId(markId: number): string {
  return `record:${markId}`
}

export function createNoteReferenceSnapshot(mark: Mark): NoteReferenceData {
  const sourceTitle = titleForMark(mark)
  return {
    sourceNoteId: String(mark.id),
    sourceTitle,
    sourceExcerpt: excerptForMark(mark, sourceTitle),
    sourceUpdatedAt: mark.createdAt,
    sourceStatus: 'available',
    sourceSyncStatus: 'current',
  }
}

export function refreshNoteReferences(nodes: CanvasNode[], marks: Mark[]): CanvasNode[] {
  const marksById = new Map(marks.map(mark => [String(mark.id), mark]))
  return nodes.map(node => {
    const sourceNoteId = node.data.sourceNoteId
    if (typeof sourceNoteId !== 'string') return node
    const source = marksById.get(sourceNoteId)
    if (source) {
      return { ...node, data: { ...node.data, ...createNoteReferenceSnapshot(source) } }
    }
    return {
      ...node,
      data: {
        ...node.data,
        sourceStatus: 'missing',
        sourceSyncStatus: 'stale',
      },
    }
  })
}
