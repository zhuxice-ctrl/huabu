import { create } from 'zustand'
import {
  getCanvasAiOverlayRecords,
  markCanvasOverlayStale,
  rejectCanvasAiOverlayRecord,
  setCanvasAiOverlayRecordState,
  upsertCanvasAiRelation,
  upsertCanvasAiTag,
} from '@/db/canvas-ai-overlay'
import { queueCanvasIndexRebuild, queueCanvasIndexRetry } from '@/stores/canvas-index'
import {
  APPROVED_AI_RELATION_TYPES,
  type AiRelationRecord,
  type AiTagRecord,
} from '@/lib/canvas/ai-overlay'
import {
  CanvasIndexUnavailableError,
  queryCanvasIndexCandidates,
  type CanvasIndexCandidate,
} from '@/lib/canvas/canvas-index-jobs'

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

type CanvasAiClassifier = (input: CanvasAiClassifierInput) => Promise<CanvasAiClassification[]>

interface CanvasAiState {
  canvasId: string | null
  visible: boolean
  loading: boolean
  tags: AiTagRecord[]
  relations: AiRelationRecord[]
  load: (canvasId: string) => Promise<void>
  setVisible: (visible: boolean) => void
  accept: (kind: 'tag' | 'relation', id: string) => Promise<void>
  reject: (kind: 'tag' | 'relation', id: string) => Promise<void>
  rebuild: (canvasId: string) => Promise<void>
}

export const useCanvasAiStore = create<CanvasAiState>((set, get) => ({
  canvasId: null,
  visible: true,
  loading: false,
  tags: [],
  relations: [],
  load: async canvasId => {
    set({ canvasId, loading: true })
    try {
      const records = await getCanvasAiOverlayRecords(canvasId)
      if (get().canvasId === canvasId) set({ ...records, loading: false })
    } catch (error) {
      if (get().canvasId === canvasId) set({ loading: false })
      throw error
    }
  },
  setVisible: visible => set({ visible }),
  accept: async (kind, id) => {
    await setCanvasAiOverlayRecordState(kind, id, 'active')
    set(state => kind === 'tag'
      ? { tags: state.tags.map(record => record.id === id ? { ...record, state: 'active' } : record) }
      : { relations: state.relations.map(record => record.id === id ? { ...record, state: 'active' } : record) })
  },
  reject: async (kind, id) => {
    await rejectCanvasAiOverlayRecord(kind, id)
    set(state => kind === 'tag'
      ? { tags: state.tags.filter(record => record.id !== id) }
      : { relations: state.relations.filter(record => record.id !== id) })
  },
  rebuild: async canvasId => {
    await markCanvasOverlayStale(canvasId)
    await queueCanvasIndexRebuild(canvasId)
    await get().load(canvasId)
  },
}))

function deterministicCandidateFilter(sourceNodeId: string, candidates: CanvasIndexCandidate[]) {
  const seen = new Set<string>()
  return candidates.filter(candidate => {
    if (candidate.nodeId === sourceNodeId || candidate.score <= 0 || seen.has(candidate.nodeId)) return false
    seen.add(candidate.nodeId)
    return true
  }).slice(0, 20)
}

export async function recallAndClassifyCanvasOverlay(input: {
  canvasId: string
  source: CanvasIndexCandidate
  text: string
  model: string
  classifier: CanvasAiClassifier
}) {
  let candidates: CanvasIndexCandidate[]
  try {
    candidates = deterministicCandidateFilter(input.source.nodeId, await queryCanvasIndexCandidates({
      canvasId: input.canvasId,
      nodeId: input.source.nodeId,
      text: input.text,
      kinds: ['vector', 'entity', 'time'],
      limit: 30,
    }))
  } catch (error) {
    if (!(error instanceof CanvasIndexUnavailableError)) {
      console.error('Canvas index candidate query failed:', error)
    }
    await markCanvasOverlayStale(input.canvasId, input.source.nodeId)
    await queueCanvasIndexRetry(input.canvasId, input.source.nodeId)
    return { status: 'index-unavailable' as const, records: [] }
  }

  const classified = await input.classifier({
    source: input.source,
    candidates,
    approvedRelationTypes: APPROVED_AI_RELATION_TYPES,
  })
  const records: Array<AiTagRecord | AiRelationRecord> = []
  for (const result of classified) {
    if (result.kind === 'tag' && result.label) {
      const record = await upsertCanvasAiTag({
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
    const record = await upsertCanvasAiRelation({
      id: crypto.randomUUID(), canvasId: input.canvasId,
      sourceNodeId: input.source.nodeId, targetNodeId: target.nodeId, type: result.type,
      sourceExcerpt: input.source.excerpt, targetExcerpt: target.excerpt,
      confidence: result.confidence, reason: result.reason, model: input.model,
      sourceRevision: input.source.contentRevision, targetRevision: target.contentRevision,
    })
    if (record) records.push(record)
  }
  await useCanvasAiStore.getState().load(input.canvasId)
  return { status: 'complete' as const, records }
}
