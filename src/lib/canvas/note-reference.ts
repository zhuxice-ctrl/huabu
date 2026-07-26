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

export function createNoteReferenceLinkData(mark: Mark) {
  return {
    referenceId: noteReferenceId(mark.id),
    ...createNoteReferenceSnapshot(mark),
  }
}

export function normalizeLiveNoteReferenceMarks(marks: Mark[]): Mark[] {
  return marks
    .filter(mark => mark.deleted === 0)
    .map(mark => ({ ...mark, content: mark.content || '' }))
}

export interface NoteReferenceAuthorityState {
  marks: Mark[]
  status: 'unconfirmed' | 'authoritative'
}

export type NoteReferenceAuthorityUpdate =
  | { source: 'store' }
  | { source: 'database'; marks: Mark[] }

export function updateNoteReferenceAuthority(
  current: NoteReferenceAuthorityState,
  update: NoteReferenceAuthorityUpdate,
): NoteReferenceAuthorityState {
  if (update.source === 'store') {
    return current.status === 'unconfirmed'
      ? current
      : { ...current, status: 'unconfirmed' }
  }
  return {
    marks: normalizeLiveNoteReferenceMarks(update.marks),
    status: 'authoritative',
  }
}

export function mergeNoteReferenceMarks(authoritative: Mark[], partial: Mark[]): Mark[] {
  const records = new Map<number, Mark>()
  for (const mark of authoritative) if (mark.deleted === 0) records.set(mark.id, mark)
  for (const mark of partial) if (mark.deleted === 0) records.set(mark.id, mark)
  return [...records.values()]
}

export function parseNoteReferenceDrop(payload: string): NoteReferenceData | null {
  try {
    const candidate = JSON.parse(payload) as Partial<NoteReferenceData> & { referenceId?: unknown }
    const sourceUpdatedAt = candidate.sourceUpdatedAt
    if (typeof candidate.sourceNoteId !== 'string'
      || !/^\d+$/.test(candidate.sourceNoteId)
      || typeof candidate.sourceTitle !== 'string'
      || typeof candidate.sourceExcerpt !== 'string'
      || typeof sourceUpdatedAt !== 'number'
      || !Number.isFinite(sourceUpdatedAt)
      || candidate.referenceId !== noteReferenceId(Number(candidate.sourceNoteId))) return null
    return {
      sourceNoteId: candidate.sourceNoteId,
      sourceTitle: candidate.sourceTitle,
      sourceExcerpt: candidate.sourceExcerpt,
      sourceUpdatedAt,
      sourceStatus: 'available',
      sourceSyncStatus: 'current',
    }
  } catch {
    return null
  }
}

export type NoteReferenceDropPlan =
  | { status: 'invalid' }
  | { status: 'ready'; reference: NoteReferenceData }

export function planNoteReferenceDrop(payload: string): NoteReferenceDropPlan {
  const reference = parseNoteReferenceDrop(payload)
  return reference ? { status: 'ready', reference } : { status: 'invalid' }
}

export type NoteReferencePlacementPlan<T> =
  | { status: 'no-space'; checkpoint: false }
  | { status: 'placed'; checkpoint: true; placed: T }

export function planNoteReferencePlacement<T>(placed: T | null): NoteReferencePlacementPlan<T> {
  return placed === null
    ? { status: 'no-space', checkpoint: false }
    : { status: 'placed', checkpoint: true, placed }
}

export type NoteReferenceRecordOpenPlan =
  | { status: 'load-authority' }
  | { status: 'missing' }
  | { status: 'activate'; source: Mark; tabId: string }
  | { status: 'add'; source: Mark }

export function planNoteReferenceRecordOpen(input: {
  sourceNoteId: string
  marks: Mark[]
  referenceMarksAuthoritative: boolean
  recordPath: string
  openTabs: Array<{ id: string; path: string }>
}): NoteReferenceRecordOpenPlan {
  const source = input.marks.find(mark => String(mark.id) === input.sourceNoteId)
  if (!source) return input.referenceMarksAuthoritative ? { status: 'missing' } : { status: 'load-authority' }
  const existingTab = input.openTabs.find(tab => tab.path === input.recordPath)
  return existingTab
    ? { status: 'activate', source, tabId: existingTab.id }
    : { status: 'add', source }
}

export function planNoteReferenceDeletion(referenceNodeId: string) {
  return { nodeIds: [referenceNodeId], sourceMutation: false as const }
}

export function refreshNoteReferences(
  nodes: CanvasNode[],
  marks: Mark[],
  options: { allowMissing?: boolean } = {},
): CanvasNode[] {
  const marksById = new Map(marks.map(mark => [String(mark.id), mark]))
  return nodes.map(node => {
    const sourceNoteId = node.data.sourceNoteId
    if (typeof sourceNoteId !== 'string') return node
    const source = marksById.get(sourceNoteId)
    if (source) {
      return { ...node, data: { ...node.data, ...createNoteReferenceSnapshot(source) } }
    }
    if (!options.allowMissing) return node
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
