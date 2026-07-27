import { APPROVED_AI_RELATION_TYPES, type AiRelationRecord, type AiTagRecord } from './ai-overlay.ts'
import type { CanvasIndexCandidate } from './canvas-index-jobs.ts'

export interface CanvasAiClassification {
  kind: 'tag' | 'relation'
  label?: string
  targetNodeId?: string
  type?: string
  reason: string
  confidence: number
}

export interface CanvasAiClassifierInput {
  source: CanvasIndexCandidate
  candidates: CanvasIndexCandidate[]
  approvedRelationTypes: readonly string[]
}

export interface CanvasAiOverlayPlan {
  tags: Array<Omit<AiTagRecord, 'id' | 'state' | 'normalizedTagId'>>
  relations: Array<Omit<AiRelationRecord, 'id' | 'state' | 'type'> & { type: string }>
}

export function filterCanvasAiOverlayCandidates(
  sourceNodeId: string,
  candidates: CanvasIndexCandidate[],
) {
  const seen = new Set<string>()
  return candidates.filter(candidate => {
    if (candidate.nodeId === sourceNodeId || candidate.score <= 0 || seen.has(candidate.nodeId)) return false
    seen.add(candidate.nodeId)
    return true
  }).slice(0, 20)
}

export function parseCanvasAiClassificationResponse(value: string): CanvasAiClassification[] {
  const parsed: unknown = JSON.parse(value)
  const values = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object' && Array.isArray((parsed as { results?: unknown }).results)
      ? (parsed as { results: unknown[] }).results
      : []
  return values.filter((item): item is CanvasAiClassification => {
    if (!item || typeof item !== 'object') return false
    const record = item as Partial<CanvasAiClassification>
    return (record.kind === 'tag' || record.kind === 'relation')
      && typeof record.reason === 'string'
      && typeof record.confidence === 'number'
      && Number.isFinite(record.confidence)
      && record.confidence >= 0
      && record.confidence <= 1
  })
}

export function planCanvasAiOverlayRecords(input: {
  canvasId: string
  source: CanvasIndexCandidate
  model: string
  candidates: CanvasIndexCandidate[]
  classified: CanvasAiClassification[]
}): CanvasAiOverlayPlan {
  const candidates = filterCanvasAiOverlayCandidates(input.source.nodeId, input.candidates)
  const tags: CanvasAiOverlayPlan['tags'] = []
  const relations: CanvasAiOverlayPlan['relations'] = []
  for (const result of input.classified) {
    if (result.kind === 'tag' && result.label) {
      tags.push({
        canvasId: input.canvasId,
        nodeId: input.source.nodeId,
        label: result.label,
        confidence: result.confidence,
        reason: result.reason,
        model: input.model,
        sourceRevision: input.source.contentRevision,
      })
      continue
    }
    if (result.kind !== 'relation' || !result.targetNodeId || !result.type) continue
    const target = candidates.find(candidate => candidate.nodeId === result.targetNodeId)
    if (!target || !APPROVED_AI_RELATION_TYPES.includes(result.type as never)) continue
    relations.push({
      canvasId: input.canvasId,
      sourceNodeId: input.source.nodeId,
      targetNodeId: target.nodeId,
      type: result.type,
      sourceExcerpt: input.source.excerpt,
      targetExcerpt: target.excerpt,
      confidence: result.confidence,
      reason: result.reason,
      model: input.model,
      sourceRevision: input.source.contentRevision,
      targetRevision: target.contentRevision,
    })
  }
  return { tags, relations }
}
