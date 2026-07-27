import {
  APPROVED_AI_RELATION_TYPES,
  type AiRelationRecord,
  type AiTagRecord,
} from './ai-overlay.ts'
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

export type CanvasAiClassifier = (
  input: CanvasAiClassifierInput,
) => Promise<CanvasAiClassification[]>

function deterministicCandidateFilter(sourceNodeId: string, candidates: CanvasIndexCandidate[]) {
  const seen = new Set<string>()
  return candidates.filter(candidate => {
    if (candidate.nodeId === sourceNodeId || candidate.score <= 0 || seen.has(candidate.nodeId)) return false
    seen.add(candidate.nodeId)
    return true
  }).slice(0, 20)
}

export async function runCanvasAiOverlayClassification(input: {
  canvasId: string
  source: CanvasIndexCandidate
  text: string
  model: string
  classifier: CanvasAiClassifier
}, dependencies: {
  recall: (input: {
    canvasId: string
    nodeId: string
    text: string
    limit: number
  }) => Promise<CanvasIndexCandidate[]>
  persistTag: (input: Omit<AiTagRecord, 'state' | 'normalizedTagId'>) => Promise<AiTagRecord | null>
  persistRelation: (
    input: Omit<AiRelationRecord, 'state' | 'type'> & { type: string },
  ) => Promise<AiRelationRecord | null>
  markStale: (canvasId: string, nodeId: string) => Promise<void>
  refresh: (canvasId: string) => Promise<void>
}): Promise<{
  status: 'complete' | 'index-unavailable' | 'classifier-failed'
  records: Array<AiTagRecord | AiRelationRecord>
}> {
  let candidates: CanvasIndexCandidate[]
  try {
    candidates = deterministicCandidateFilter(input.source.nodeId, await dependencies.recall({
      canvasId: input.canvasId,
      nodeId: input.source.nodeId,
      text: input.text,
      limit: 30,
    }))
  } catch {
    await dependencies.markStale(input.canvasId, input.source.nodeId)
    return { status: 'index-unavailable', records: [] }
  }

  let classified: CanvasAiClassification[]
  try {
    classified = await input.classifier({
      source: input.source,
      candidates,
      approvedRelationTypes: APPROVED_AI_RELATION_TYPES,
    })
  } catch {
    await dependencies.markStale(input.canvasId, input.source.nodeId)
    return { status: 'classifier-failed', records: [] }
  }

  const records: Array<AiTagRecord | AiRelationRecord> = []
  for (const result of classified) {
    if (result.kind === 'tag' && result.label) {
      const record = await dependencies.persistTag({
        id: crypto.randomUUID(), canvasId: input.canvasId, nodeId: input.source.nodeId,
        label: result.label, confidence: result.confidence, reason: result.reason,
        model: input.model, sourceRevision: input.source.contentRevision,
      })
      if (record) records.push(record)
      continue
    }
    if (result.kind !== 'relation' || !result.targetNodeId || !result.type) continue
    const target = candidates.find(candidate => candidate.nodeId === result.targetNodeId)
    if (!target || !APPROVED_AI_RELATION_TYPES.includes(result.type as never)) continue
    const record = await dependencies.persistRelation({
      id: crypto.randomUUID(), canvasId: input.canvasId,
      sourceNodeId: input.source.nodeId, targetNodeId: target.nodeId, type: result.type,
      sourceExcerpt: input.source.excerpt, targetExcerpt: target.excerpt,
      confidence: result.confidence, reason: result.reason, model: input.model,
      sourceRevision: input.source.contentRevision, targetRevision: target.contentRevision,
    })
    if (record) records.push(record)
  }
  await dependencies.refresh(input.canvasId)
  return { status: 'complete', records }
}
