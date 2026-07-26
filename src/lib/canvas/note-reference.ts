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

export async function commitNoteReferenceDrop<T>(input: {
  payload: string
  place: (reference: NoteReferenceData) => Promise<T | null>
  commit: (placed: T) => void
}): Promise<'placed' | 'invalid' | 'no-space'> {
  const reference = parseNoteReferenceDrop(input.payload)
  if (!reference) return 'invalid'
  const placed = await input.place(reference)
  if (!placed) return 'no-space'
  input.commit(placed)
  return 'placed'
}

export async function openNoteReferenceRecord<T extends { id: string; path: string }>(input: {
  sourceNoteId: string
  marks: Mark[]
  referenceMarksAuthoritative?: boolean
  loadAuthoritativeMarks?: () => Promise<Mark[]>
  createTab: (mark: Mark) => T
  openTabs: Array<{ id: string; path: string }>
  setActiveTabId: (id: string) => Promise<void> | void
  addTab: (tab: T) => Promise<void> | void
  setActiveFilePath: (path: string) => Promise<void> | void
  centerPanelVisible: boolean
  showCenterPanel: () => Promise<void> | void
}): Promise<boolean> {
  let source = input.marks.find(mark => String(mark.id) === input.sourceNoteId)
  if (!source && !input.referenceMarksAuthoritative && input.loadAuthoritativeMarks) {
    source = (await input.loadAuthoritativeMarks()).find(mark => String(mark.id) === input.sourceNoteId)
  }
  if (!source) return false
  const recordTab = input.createTab(source)
  const existingTab = input.openTabs.find(tab => tab.path === recordTab.path)
  if (existingTab) await input.setActiveTabId(existingTab.id)
  else await input.addTab(recordTab)
  await input.setActiveFilePath('')
  if (!input.centerPanelVisible) await input.showCenterPanel()
  return true
}

export function deleteNoteReference(referenceNodeId: string, removeNode: (nodeId: string) => void) {
  removeNode(referenceNodeId)
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
