import { create } from 'zustand'
import {
  getCanvasAiOverlayRecords,
  markCanvasOverlayStale,
  rejectCanvasAiOverlayRecord,
  setCanvasAiOverlayRecordState,
  upsertCanvasAiRelation,
  upsertCanvasAiTag,
} from '@/db/canvas-ai-overlay'
import {
  getCanvasIndexSourceCandidate,
  queueCanvasIndexRebuild as persistCanvasIndexRebuild,
} from '@/db/canvas-index'
import type { AiRelationRecord, AiTagRecord } from '@/lib/canvas/ai-overlay'
import {
  queryCanvasIndexCandidates,
  type CanvasIndexCandidate,
  type CanvasIndexJob,
} from '@/lib/canvas/canvas-index-jobs'
import {
  filterCanvasAiOverlayCandidates,
  parseCanvasAiClassificationResponse,
  planCanvasAiOverlayRecords,
  type CanvasAiClassifierInput,
} from '@/lib/canvas/ai-overlay-runtime'
import { getAISettings, withFastAiRequestOptions } from '@/lib/ai/utils'
import { invokeAiJson, resolveAiRequestConfig } from '@/lib/ai/tauri-client'

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

let activeCanvasAiOverlayId: string | null = null

export async function loadCanvasAiOverlay(canvasId: string) {
  activeCanvasAiOverlayId = canvasId
  useCanvasAiStore.setState({ canvasId, loading: true })
  try {
    const records = await getCanvasAiOverlayRecords(canvasId)
    if (activeCanvasAiOverlayId === canvasId) {
      useCanvasAiStore.setState({ ...records, loading: false })
    }
  } catch (error) {
    if (activeCanvasAiOverlayId === canvasId) useCanvasAiStore.setState({ loading: false })
    throw error
  }
}

export const useCanvasAiStore = create<CanvasAiState>((set) => ({
  canvasId: null,
  visible: true,
  loading: false,
  tags: [],
  relations: [],
  load: loadCanvasAiOverlay,
  setVisible: visible => set({ visible }),
  accept: async (kind, id) => {
    await setCanvasAiOverlayRecordState(kind, id, 'active')
    set(state => kind === 'tag'
      ? { tags: state.tags.map(record => record.id === id ? { ...record, state: 'active' } : record) }
      : { relations: state.relations.map(record => record.id === id ? { ...record, state: 'active' } : record) })
  },
  reject: async (kind, id) => {
    await rejectCanvasAiOverlayRecord(kind, id)
    if (activeCanvasAiOverlayId) await loadCanvasAiOverlay(activeCanvasAiOverlayId)
  },
  rebuild: async canvasId => {
    await markCanvasOverlayStale(canvasId)
    await persistCanvasIndexRebuild(canvasId)
    await loadCanvasAiOverlay(canvasId)
  },
}))

type ConfiguredAiModel = NonNullable<Awaited<ReturnType<typeof getAISettings>>>

interface ChatCompletionResponse {
  choices: Array<{ message?: { content?: string | null } }>
}

async function requestCanvasAiClassification(
  config: ConfiguredAiModel,
  input: CanvasAiClassifierInput,
) {
  const response = await invokeAiJson<ChatCompletionResponse>({
    config: await resolveAiRequestConfig(config),
    path: '/chat/completions',
    method: 'POST',
    body: withFastAiRequestOptions({
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
          content: JSON.stringify(input),
        },
      ],
    }, config),
  })
  const content = response.choices[0]?.message?.content
  if (typeof content !== 'string') throw new Error('Canvas overlay classifier returned no JSON')
  return parseCanvasAiClassificationResponse(content)
}

async function loadOverlayCandidates(source: CanvasIndexCandidate, text: string) {
  return filterCanvasAiOverlayCandidates(source.nodeId, await queryCanvasIndexCandidates({
    canvasId: source.canvasId,
    nodeId: source.nodeId,
    text,
    kinds: ['vector', 'entity', 'time'],
    limit: 30,
  }))
}

export async function classifyIndexedCanvasOverlay(job: CanvasIndexJob) {
  if (job.operation !== 'upsert') return
  const source = await getCanvasIndexSourceCandidate(job.canvasId, job.nodeId)
  if (!source || source.contentRevision !== job.contentRevision) return
  let config: Awaited<ReturnType<typeof getAISettings>>
  try {
    config = await getAISettings()
  } catch (error) {
    console.error('Canvas overlay classifier configuration failed:', error)
    await markCanvasOverlayStale(job.canvasId, job.nodeId)
    return
  }
  if (!config?.model) return

  let candidates: CanvasIndexCandidate[]
  try {
    candidates = await loadOverlayCandidates(source, source.text)
  } catch (error) {
    console.error('Canvas index candidate query failed:', error)
    await markCanvasOverlayStale(job.canvasId, job.nodeId)
    await persistCanvasIndexRebuild(job.canvasId)
    return
  }

  let classified
  try {
    classified = await requestCanvasAiClassification(config, {
      source,
      candidates,
      approvedRelationTypes: [
        'same_topic', 'supplement', 'time_continuation', 'plan_execution',
        'problem_solution', 'person_or_place', 'citation_or_source',
        'possible_duplicate', 'credential_ownership',
      ],
    })
  } catch (error) {
    console.error('Canvas overlay classifier failed:', error)
    await markCanvasOverlayStale(job.canvasId, job.nodeId)
    return
  }

  const plan = planCanvasAiOverlayRecords({
    canvasId: job.canvasId,
    source,
    model: config.model,
    candidates,
    classified,
  })
  for (const tag of plan.tags) {
    await upsertCanvasAiTag({ ...tag, id: crypto.randomUUID() })
  }
  for (const relation of plan.relations) {
    await upsertCanvasAiRelation({ ...relation, id: crypto.randomUUID() })
  }
  if (activeCanvasAiOverlayId === job.canvasId) await loadCanvasAiOverlay(job.canvasId)
}

export default useCanvasAiStore
