import { create } from 'zustand'
import {
  getCanvasAiOverlayRecords,
  markCanvasOverlayStale,
  rejectCanvasAiOverlayRecord,
  setCanvasAiOverlayRecordState,
  upsertCanvasAiRelation,
  upsertCanvasAiTag,
} from '@/db/canvas-ai-overlay'
import { getCanvasIndexSourceCandidate } from '@/db/canvas-index'
import { queueCanvasIndexRebuild, queueCanvasIndexRetry } from '@/stores/canvas-index'
import { type AiRelationRecord, type AiTagRecord } from '@/lib/canvas/ai-overlay'
import {
  queryCanvasIndexCandidates,
  registerCanvasIndexJobProcessedHandler,
  type CanvasIndexCandidate,
} from '@/lib/canvas/canvas-index-jobs'
import {
  runCanvasAiOverlayClassification,
  type CanvasAiClassification,
  type CanvasAiClassifier,
} from '@/lib/canvas/ai-overlay-runtime'
import {
  createOpenAIClient,
  getAISettings,
  withFastAiRequestOptions,
} from '@/lib/ai/utils'

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
    const canvasId = get().canvasId
    if (canvasId) await get().load(canvasId)
  },
  rebuild: async canvasId => {
    await markCanvasOverlayStale(canvasId)
    await queueCanvasIndexRebuild(canvasId)
    await get().load(canvasId)
  },
}))

function parseClassifierResponse(value: string): CanvasAiClassification[] {
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

async function getConfiguredCanvasAiClassifier(): Promise<{
  model: string
  classifier: CanvasAiClassifier
} | null> {
  const config = await getAISettings()
  if (!config?.model) return null
  const client = await createOpenAIClient(config)
  return {
    model: config.model,
    classifier: async input => {
      const response = await client.chat.completions.create(withFastAiRequestOptions({
        model: config.model!,
        stream: false,
        temperature: 0,
        messages: [
          {
            role: 'system',
            content: 'Return JSON only as {"results": [...]} using tag or relation entries. Relations must use one approved type and one supplied targetNodeId. Never invent nodes.',
          },
          {
            role: 'user',
            content: JSON.stringify({
              source: input.source,
              candidates: input.candidates,
              approvedRelationTypes: input.approvedRelationTypes,
            }),
          },
        ],
      }, config))
      const content = response.choices[0]?.message?.content
      if (typeof content !== 'string') throw new Error('Canvas overlay classifier returned no JSON')
      return parseClassifierResponse(content)
    },
  }
}

export async function recallAndClassifyCanvasOverlay(input: {
  canvasId: string
  source: CanvasIndexCandidate
  text: string
  model: string
  classifier: CanvasAiClassifier
}) {
  const result = await runCanvasAiOverlayClassification(input, {
    recall: request => queryCanvasIndexCandidates({
      ...request,
      kinds: ['vector', 'entity', 'time'],
    }),
    persistTag: upsertCanvasAiTag,
    persistRelation: upsertCanvasAiRelation,
    markStale: (canvasId, nodeId) => markCanvasOverlayStale(canvasId, nodeId),
    refresh: async canvasId => {
      if (useCanvasAiStore.getState().canvasId === canvasId) {
        await useCanvasAiStore.getState().load(canvasId)
      }
    },
  })
  if (result.status === 'index-unavailable') {
    await queueCanvasIndexRetry(input.canvasId, input.source.nodeId)
  }
  return result
}

export function initializeCanvasAiOverlayClassification() {
  registerCanvasIndexJobProcessedHandler(async job => {
    if (job.operation !== 'upsert') return
    const source = await getCanvasIndexSourceCandidate(job.canvasId, job.nodeId)
    if (!source || source.contentRevision !== job.contentRevision) return
    let configured: Awaited<ReturnType<typeof getConfiguredCanvasAiClassifier>>
    try {
      configured = await getConfiguredCanvasAiClassifier()
    } catch (error) {
      console.error('Canvas overlay classifier configuration failed:', error)
      await markCanvasOverlayStale(job.canvasId, job.nodeId)
      return
    }
    if (!configured) return
    await recallAndClassifyCanvasOverlay({
      canvasId: job.canvasId,
      source,
      text: source.text,
      model: configured.model,
      classifier: configured.classifier,
    })
  })
  return () => registerCanvasIndexJobProcessedHandler(null)
}
