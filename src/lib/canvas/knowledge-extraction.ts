import type { CanvasNode } from '@/types/canvas'

export interface CanvasKnowledgeAnchor {
  id: string
  workspaceId: string
  canvasId: string
  nodeId: string
  attachmentId?: string
  startOffset: number
  endOffset: number
  nodePosition: { x: number; y: number }
  contentRevision: string
  plainText: string
  entities: string[]
  timeHints: string[]
  contentType: string
  userMarkedSensitive?: boolean
}

export interface KnowledgeExtractionPart {
  text: string
  contentType: string
  attachmentId?: string
}

export interface KnowledgeExtractionInput {
  workspaceId: string
  canvasId: string
  contentRevision: string
  node: CanvasNode
  extractors?: KnowledgeExtractor[]
}

export interface KnowledgeExtractionFailure {
  extractor: string
  message: string
}

export interface KnowledgeExtractionResult {
  anchors: CanvasKnowledgeAnchor[]
  failures: KnowledgeExtractionFailure[]
}

export type KnowledgeExtractor = (input: KnowledgeExtractionInput) => KnowledgeExtractionPart | KnowledgeExtractionPart[] | null | undefined

const KEY_CONTENT_TYPES: Record<string, string> = {
  referenceexcerpt: 'reference-excerpt',
  ocrtext: 'image-ocr',
  pdftext: 'pdf-text',
  officetext: 'office-text',
  websnapshot: 'web-snapshot',
  subtitles: 'video-subtitle',
  videonotes: 'video-note',
  notes: 'note',
  filename: 'attachment-filename',
  directory: 'attachment-directory',
  attachmentnotes: 'attachment-note',
}

function normalizeKey(key: string) {
  return key.replace(/[^a-z]/gi, '').toLowerCase()
}

function stableId(value: string): string {
  let hash = 0x811c9dc5
  for (const byte of new TextEncoder().encode(value)) {
    hash ^= byte
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function dedupe(values: string[]) {
  return [...new Set(values.map(value => value.trim()).filter(Boolean))].sort()
}

export function extractKnowledgeEntities(text: string): string[] {
  return dedupe([
    ...(text.match(/(?:#|@)[\p{L}\p{N}_-]+/gu) || []).map(value => value.toLocaleLowerCase()),
    ...(text.match(/\b[A-Z][a-z]{2,}\b/g) || []).map(value => `@${value.toLocaleLowerCase()}`),
  ])
}

export function extractKnowledgeTimeHints(text: string): string[] {
  return dedupe([
    ...(text.match(/\b\d{4}-\d{2}-\d{2}\b/g) || []),
    ...(text.match(/(?:今天|明天|后天|昨天|下周|本周|\b(?:today|tomorrow|yesterday|next week)\b)/giu) || []),
  ])
}

function attachmentIdFor(value: Record<string, unknown>, inherited?: string) {
  return typeof value.id === 'string' && value.id.trim() ? value.id : inherited
}

function collectParts(value: unknown, key = '', attachmentId?: string, parts: KnowledgeExtractionPart[] = []): KnowledgeExtractionPart[] {
  if (typeof value === 'string') {
    const text = value.trim()
    if (!text) return parts
    const normalized = normalizeKey(key)
    const contentType = KEY_CONTENT_TYPES[normalized]
      || (normalized === 'videometadata' ? 'video-metadata' : 'text')
    parts.push({ text, contentType, attachmentId })
    return parts
  }
  if (Array.isArray(value)) {
    value.forEach(item => collectParts(item, key, attachmentId, parts))
    return parts
  }
  if (!value || typeof value !== 'object') return parts

  const record = value as Record<string, unknown>
  const nextAttachmentId = key === 'attachment' ? attachmentIdFor(record, attachmentId) : attachmentId
  for (const [childKey, childValue] of Object.entries(record)) {
    if (childKey === 'id' && key === 'attachment') continue
    const qualifiedKey = key === 'attachment' && childKey === 'notes' ? 'attachmentNotes' : childKey
    collectParts(childValue, qualifiedKey, nextAttachmentId, parts)
  }
  return parts
}

function defaultExtractor(input: KnowledgeExtractionInput): KnowledgeExtractionPart[] {
  return collectParts(input.node.data)
}

function safeFailure(extractor: KnowledgeExtractor, error: unknown): KnowledgeExtractionFailure {
  // Extraction errors are persisted later for retry, so never retain error payloads that may contain source text.
  return {
    extractor: extractor.name || 'anonymous-extractor',
    message: error instanceof Error && error.name ? `${error.name}: extraction failed` : 'Extraction failed',
  }
}

export function extractCanvasKnowledgeAnchors(input: KnowledgeExtractionInput): KnowledgeExtractionResult {
  const extractors = [defaultExtractor, ...(input.extractors || [])]
  const parts: KnowledgeExtractionPart[] = []
  const failures: KnowledgeExtractionFailure[] = []

  for (const extractor of extractors) {
    try {
      const extracted = extractor(input)
      if (Array.isArray(extracted)) parts.push(...extracted)
      else if (extracted) parts.push(extracted)
    } catch (error) {
      failures.push(safeFailure(extractor, error))
    }
  }

  let offset = 0
  const anchors = parts.flatMap((part, index) => {
    const plainText = part.text.trim().slice(0, 100_000)
    if (!plainText) return []
    const startOffset = offset
    offset += plainText.length + 1
    const endOffset = startOffset + plainText.length
    return [{
      id: `${input.canvasId}:${input.node.id}:${input.contentRevision}:${index}:${stableId(plainText)}`,
      workspaceId: input.workspaceId,
      canvasId: input.canvasId,
      nodeId: input.node.id,
      ...(part.attachmentId ? { attachmentId: part.attachmentId } : {}),
      startOffset,
      endOffset,
      nodePosition: { x: input.node.position.x, y: input.node.position.y },
      contentRevision: input.contentRevision,
      plainText,
      entities: extractKnowledgeEntities(plainText),
      timeHints: extractKnowledgeTimeHints(plainText),
      contentType: part.contentType,
      ...(input.node.data.sensitive === true || input.node.data.isSensitive === true
        ? { userMarkedSensitive: true }
        : {}),
    } satisfies CanvasKnowledgeAnchor]
  })

  return { anchors, failures }
}
