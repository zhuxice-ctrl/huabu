import type { CanvasKnowledgeAnchor } from './knowledge-extraction'

export type CanvasEvidenceMatch = 'keyword' | 'semantic' | 'entity' | 'time'

export interface CanvasEvidence {
  anchor: CanvasKnowledgeAnchor
  score: number
  matchedBy: CanvasEvidenceMatch[]
  textFingerprint?: string
}

export interface RetrieveCanvasEvidenceInput {
  canvasId: string | null | undefined
  query: string
  anchors?: CanvasKnowledgeAnchor[]
  limit?: number
  rerankedAnchorIds?: string[]
}

export interface CanvasEvidenceResult {
  canvasId: string | null
  evidence: CanvasEvidence[]
  context: string
}

function terms(value: string): string[] {
  return [...new Set(value.toLocaleLowerCase().match(/[\p{L}\p{N}_-]{2,}/gu) || [])]
}

function scoreOverlap(left: string[], right: string[]) {
  if (!left.length || !right.length) return 0
  const matches = left.filter(value => right.includes(value)).length
  return matches / Math.sqrt(left.length * right.length)
}

function normalizedEntity(value: string) {
  return value.replace(/^[@#]/, '').toLocaleLowerCase()
}

function queryEntities(query: string) {
  return [...new Set([
    ...(query.match(/(?:#|@)[\p{L}\p{N}_-]+/gu) || []),
    ...(query.match(/\b[A-Z][a-z]{2,}\b/g) || []).map(value => `@${value}`),
  ].map(normalizedEntity))]
}

function queryTimeHints(query: string) {
  return [...new Set([
    ...(query.match(/\b\d{4}-\d{2}-\d{2}\b/g) || []),
    ...(query.match(/(?:今天|明天|后天|昨天|下周|本周|\b(?:today|tomorrow|yesterday|next week)\b)/giu) || []),
  ].map(value => value.toLocaleLowerCase()))]
}

export function canvasEvidenceTextFingerprint(value: string): string {
  let hash = 0x811c9dc5
  for (const byte of new TextEncoder().encode(value)) {
    hash ^= byte
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export function serializeCanvasEvidenceMarker(evidence: CanvasEvidence): string {
  const score = Number.isFinite(evidence.score) ? evidence.score : 0
  return `[画布证据 ${encodeURIComponent(evidence.anchor.nodeId)}:${evidence.anchor.startOffset}-${evidence.anchor.endOffset}`
    + ` score=${score} field=${encodeURIComponent(evidence.anchor.contentType)}`
    + ` text=${evidence.textFingerprint ?? canvasEvidenceTextFingerprint(evidence.anchor.plainText)}]`
}

export function serializeCanvasEvidenceContext(evidence: readonly CanvasEvidence[]): string {
  if (!evidence.length) return '没有找到与当前画布相关的证据。'
  return evidence.map(item => (
    `${serializeCanvasEvidenceMarker(item)}\n${item.anchor.plainText}`
  )).join('\n\n')
}

export function parseCanvasEvidenceMarkers(content: string, canvasId: string): CanvasEvidence[] {
  const markerPattern = /\[画布证据 ([^:\]\s]+):(\d+)-(\d+)(?: score=([0-9]+(?:\.[0-9]+)?))?(?: field=([^\]\s]+))?(?: text=([0-9a-f]{8}))?\]/g
  return [...content.matchAll(markerPattern)].flatMap((marker, index) => {
    const startOffset = Number(marker[2])
    const endOffset = Number(marker[3])
    if (!Number.isSafeInteger(startOffset) || !Number.isSafeInteger(endOffset) || endOffset <= startOffset) return []
    const parsedScore = marker[4] === undefined ? 0 : Number(marker[4])
    const score = Number.isFinite(parsedScore) ? Math.min(1, Math.max(0, parsedScore)) : 0
    let nodeId: string
    let contentType: string
    try {
      nodeId = decodeURIComponent(marker[1])
      contentType = marker[5] ? decodeURIComponent(marker[5]) : 'unknown'
    } catch {
      return []
    }
    return [{
      anchor: {
        id: `${canvasId}:${nodeId}:${startOffset}:${endOffset}:${index}`,
        workspaceId: 'current-workspace',
        canvasId,
        nodeId,
        startOffset,
        endOffset,
        nodePosition: { x: 0, y: 0 },
        contentRevision: 'retrieval-marker',
        plainText: '',
        entities: [],
        timeHints: [],
        contentType,
      },
      score,
      matchedBy: ['keyword'],
      ...(marker[6] ? { textFingerprint: marker[6] } : {}),
    } satisfies CanvasEvidence]
  })
}

export function applyCanvasEvidenceRerank(
  evidence: CanvasEvidence[],
  orderedAnchorIds: string[] | undefined,
): CanvasEvidence[] {
  if (!orderedAnchorIds?.length) return evidence
  const allowedById = new Map(evidence.map(item => [item.anchor.id, item]))
  const seen = new Set<string>()
  return orderedAnchorIds.flatMap(id => {
    const item = allowedById.get(id)
    if (!item || seen.has(id)) return []
    seen.add(id)
    return [item]
  })
}

export async function retrieveCanvasEvidence(input: RetrieveCanvasEvidenceInput): Promise<CanvasEvidenceResult> {
  const canvasId = input.canvasId?.trim() || null
  if (!canvasId) return { canvasId: null, evidence: [], context: '没有找到与当前画布相关的证据。' }
  const anchors = (input.anchors ?? [])
    // This is the retrieval boundary: no caller can smuggle another canvas into default evidence.
    .filter(anchor => anchor.canvasId === canvasId)
  const queryTerms = terms(input.query)
  const entities = queryEntities(input.query)
  const timeHints = queryTimeHints(input.query)

  let evidence = anchors.map(anchor => {
    const anchorTerms = terms(anchor.plainText)
    const keywordScore = queryTerms.length
      ? queryTerms.filter(term => anchor.plainText.toLocaleLowerCase().includes(term)).length / queryTerms.length
      : 0
    const semanticScore = scoreOverlap(queryTerms, anchorTerms)
    const entityHit = entities.some(entity => anchor.entities.some(value => normalizedEntity(value) === entity))
    const timeHit = timeHints.some(time => anchor.timeHints.some(value => value.toLocaleLowerCase() === time))
    const matchedBy: CanvasEvidenceMatch[] = [
      ...(keywordScore > 0 ? ['keyword' as const] : []),
      ...(semanticScore > 0 ? ['semantic' as const] : []),
      ...(entityHit ? ['entity' as const] : []),
      ...(timeHit ? ['time' as const] : []),
    ]
    return {
      anchor,
      score: keywordScore * 0.45 + semanticScore * 0.25 + (entityHit ? 0.2 : 0) + (timeHit ? 0.2 : 0),
      matchedBy,
    }
  }).filter(item => item.matchedBy.length > 0 && item.score >= 0.12)

  evidence.sort((left, right) => right.score - left.score || left.anchor.id.localeCompare(right.anchor.id))
  evidence = applyCanvasEvidenceRerank(evidence, input.rerankedAnchorIds)
  evidence = evidence.slice(0, Math.max(1, Math.min(input.limit ?? 8, 30)))
  return { canvasId, evidence, context: serializeCanvasEvidenceContext(evidence) }
}
