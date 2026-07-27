import { AI_RELATION_TYPES, type AiRelationType } from './ai-permission.ts'

export const APPROVED_AI_RELATION_TYPES = AI_RELATION_TYPES
export type AiOverlayState = 'active' | 'candidate' | 'retrieval-only' | 'stale' | 'hidden'

export interface AiTagRecord {
  id: string
  canvasId: string
  nodeId: string
  normalizedTagId: string
  label: string
  confidence: number
  reason: string
  model: string
  sourceRevision: string
  state: AiOverlayState
}

export interface AiRelationRecord {
  id: string
  canvasId: string
  sourceNodeId: string
  targetNodeId: string
  type: AiRelationType
  sourceExcerpt: string
  targetExcerpt: string
  confidence: number
  reason: string
  model: string
  sourceRevision: string
  targetRevision: string
  state: AiOverlayState
}

export type AiOverlayRecord = AiTagRecord | AiRelationRecord

export type AiSemanticIdentityInput =
  | { kind: 'tag'; canvasId: string; nodeId: string; normalizedTagId: string }
  | { kind: 'relation'; canvasId: string; sourceNodeId: string; targetNodeId: string; type: AiRelationType }

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase()
}

function requireText(value: string, field: string): string {
  const normalized = value.trim().replace(/\s+/g, ' ')
  if (!normalized) throw new Error(`${field} is required`)
  return normalized
}

export function aiOverlayStateForConfidence(confidence: number): Exclude<AiOverlayState, 'stale' | 'hidden'> {
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new Error('confidence must be a finite number in [0,1]')
  }
  if (confidence >= 0.85) return 'active'
  if (confidence >= 0.60) return 'candidate'
  return 'retrieval-only'
}

export function createAiTagRecord(
  input: Omit<AiTagRecord, 'normalizedTagId' | 'state' | 'label'>
    & { normalizedTagId?: string; state?: AiOverlayState; label: string },
): AiTagRecord {
  const label = requireText(input.label, 'label')
  return {
    ...input,
    label,
    normalizedTagId: normalizeText(input.normalizedTagId || label),
    state: input.state === 'stale' || input.state === 'hidden'
      ? input.state
      : aiOverlayStateForConfidence(input.confidence),
  }
}

export function createAiRelationRecord(
  input: Omit<AiRelationRecord, 'state' | 'type'> & { type: string; state?: AiOverlayState },
): AiRelationRecord {
  if (!APPROVED_AI_RELATION_TYPES.includes(input.type as AiRelationType)) {
    throw new Error('relation type is not approved')
  }
  return {
    ...input,
    type: input.type as AiRelationType,
    state: input.state === 'stale' || input.state === 'hidden'
      ? input.state
      : aiOverlayStateForConfidence(input.confidence),
  }
}

export function normalizeSemanticIdentity(input: AiSemanticIdentityInput): string {
  if (input.kind === 'tag') {
    return JSON.stringify(['tag', input.canvasId, input.nodeId, normalizeText(input.normalizedTagId)])
  }
  const [sourceNodeId, targetNodeId] = input.type === 'same_topic' || input.type === 'possible_duplicate'
    ? [input.sourceNodeId, input.targetNodeId].sort()
    : [input.sourceNodeId, input.targetNodeId]
  return JSON.stringify(['relation', input.canvasId, sourceNodeId, targetNodeId, input.type])
}

export function semanticIdentityForOverlayRecord(record: AiOverlayRecord): string {
  return 'normalizedTagId' in record
    ? normalizeSemanticIdentity({
        kind: 'tag', canvasId: record.canvasId, nodeId: record.nodeId,
        normalizedTagId: record.normalizedTagId,
      })
    : normalizeSemanticIdentity({
        kind: 'relation', canvasId: record.canvasId, sourceNodeId: record.sourceNodeId,
        targetNodeId: record.targetNodeId, type: record.type,
      })
}

export function markOverlayRecordsStale<T extends AiOverlayRecord>(
  records: T[],
  currentRevisions: ReadonlyMap<string, string>,
): T[] {
  return records.map(record => {
    const changed = 'normalizedTagId' in record
      ? currentRevisions.get(record.nodeId) !== record.sourceRevision
      : currentRevisions.get(record.sourceNodeId) !== record.sourceRevision
        || currentRevisions.get(record.targetNodeId) !== record.targetRevision
    return changed && record.state !== 'hidden' ? { ...record, state: 'stale' } : record
  }) as T[]
}
