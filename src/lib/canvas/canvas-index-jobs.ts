import type { CanvasDocument, CanvasNode } from '@/types/canvas'

export type CanvasIndexOperation = 'upsert' | 'delete' | 'rebuild'
export type CanvasIndexJobState = 'pending' | 'running' | 'retry' | 'complete'

export interface CanvasIndexJob {
  id: string
  canvasId: string
  nodeId: string
  contentRevision: string
  operation: CanvasIndexOperation
  state: CanvasIndexJobState
  attempts: number
  nextAttemptAt: number
}

export interface CanvasIndexJobDraft {
  nodeId: string
  contentRevision: string
  operation: CanvasIndexOperation
}

export interface CanvasIndexRebuildPlan {
  removeNodeIds: string[]
  upserts: CanvasIndexJobDraft[]
}

export interface CanvasIndexDeletePlan {
  remove: boolean
  ensureUpsert?: CanvasIndexJobDraft
}

export type CanvasIndexRecallKind = 'vector' | 'entity' | 'time'

export interface CandidateQuery {
  canvasId: string
  nodeId?: string
  text: string
  kinds?: CanvasIndexRecallKind[]
  limit?: number
}

export interface CanvasIndexCandidate {
  canvasId: string
  nodeId: string
  contentRevision: string
  excerpt: string
  score: number
  matchedBy: CanvasIndexRecallKind[]
}

export interface LocalCanvasIndexFeatures {
  vector: Record<string, number>
  entities: string[]
  timeTerms: string[]
}

export class CanvasIndexUnavailableError extends Error {
  constructor(message = 'Canvas index is unavailable') {
    super(message)
    this.name = 'CanvasIndexUnavailableError'
  }
}

const RETRY_DELAYS_MS = [1_000, 5_000, 30_000, 300_000, 1_800_000] as const

export function retryDelayMs(attempts: number): number {
  if (!Number.isFinite(attempts) || attempts <= 0) return RETRY_DELAYS_MS[0]
  return RETRY_DELAYS_MS[Math.min(Math.trunc(attempts) - 1, RETRY_DELAYS_MS.length - 1)]
}

export function resumeAbandonedCanvasIndexJob(job: CanvasIndexJob, now: number): CanvasIndexJob {
  return job.state === 'running'
    ? { ...job, state: 'retry', nextAttemptAt: now }
    : job
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${stableSerialize(record[key])}`).join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

function fnv1a(value: string): string {
  let hash = 0x811c9dc5
  for (const byte of new TextEncoder().encode(value)) {
    hash ^= byte
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

const NON_CONTENT_DATA_KEYS = new Set([
  'backgroundColor', 'borderColor', 'borderStyle', 'borderWidth', 'color', 'contentScale',
  'fillColor', 'fillStyle', 'fontSize', 'height', 'opacity', 'pathStrokeWidth',
  'previewState', 'strokeWidth', 'textColor', 'width',
])

function indexableNodeValue(node: CanvasNode): unknown {
  const data = Object.fromEntries(
    Object.entries(node.data).filter(([key]) => !NON_CONTENT_DATA_KEYS.has(key)),
  )
  return { type: node.type, data }
}

export function canvasNodeContentRevision(node: CanvasNode): string {
  return fnv1a(stableSerialize(indexableNodeValue(node)))
}

export function extractCanvasNodeIndexText(node: CanvasNode): string {
  const values: string[] = []
  const visit = (value: unknown) => {
    if (typeof value === 'string') {
      const text = value.trim()
      if (text) values.push(text)
      return
    }
    if (Array.isArray(value)) {
      value.forEach(visit)
      return
    }
    if (!value || typeof value !== 'object') return
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !NON_CONTENT_DATA_KEYS.has(key))
      .forEach(([, nested]) => visit(nested))
  }
  visit(node.data)
  return values.join('\n').slice(0, 100_000)
}

function recallTokens(value: string): string[] {
  return value.toLocaleLowerCase().match(/[\p{L}\p{N}]{2,}/gu) || []
}

export function buildLocalCanvasIndexFeatures(content: string): LocalCanvasIndexFeatures {
  const counts = new Map<string, number>()
  for (const token of recallTokens(content)) counts.set(token, (counts.get(token) || 0) + 1)
  const magnitude = Math.sqrt(
    [...counts.values()].reduce((sum, count) => sum + count * count, 0),
  ) || 1
  const vector = Object.fromEntries(
    [...counts.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([token, count]) => [token, count / magnitude]),
  )
  const entities = [...new Set(
    (content.match(/[#@][\p{L}\p{N}_-]{2,}/gu) || []).map(value => value.toLocaleLowerCase()),
  )].sort()
  const timeTerms = [...new Set([
    ...(content.match(/\b\d{4}[-/]\d{1,2}(?:[-/]\d{1,2})?\b/g) || []),
    ...(content.match(/\d{4}年\d{1,2}月(?:\d{1,2}日)?/g) || []),
    ...(content.match(/今天|明天|昨天|本周|下周|本月|下月/g) || []),
  ])].sort()
  return { vector, entities, timeTerms }
}

export function diffCanvasIndexJobs(
  before: CanvasDocument,
  after: CanvasDocument,
): CanvasIndexJobDraft[] {
  const previous = new Map(before.nodes.map(node => [node.id, node]))
  const current = new Map(after.nodes.map(node => [node.id, node]))
  const drafts: CanvasIndexJobDraft[] = []

  for (const node of after.nodes) {
    const prior = previous.get(node.id)
    const contentRevision = canvasNodeContentRevision(node)
    if (!prior || canvasNodeContentRevision(prior) !== contentRevision) {
      drafts.push({ nodeId: node.id, contentRevision, operation: 'upsert' })
    }
  }
  for (const node of before.nodes) {
    if (!current.has(node.id)) {
      drafts.push({
        nodeId: node.id,
        contentRevision: canvasNodeContentRevision(node),
        operation: 'delete',
      })
    }
  }
  return drafts
}

export function planCanvasIndexRebuild(
  indexedNodeIds: readonly string[],
  document: CanvasDocument,
): CanvasIndexRebuildPlan {
  const currentNodeIds = new Set(document.nodes.map(node => node.id))
  return {
    removeNodeIds: [...new Set(indexedNodeIds)]
      .filter(nodeId => !currentNodeIds.has(nodeId))
      .sort(),
    upserts: document.nodes.map(node => ({
      nodeId: node.id,
      contentRevision: canvasNodeContentRevision(node),
      operation: 'upsert' as const,
    })),
  }
}

export function planCanvasIndexDelete(
  document: CanvasDocument,
  nodeId: string,
): CanvasIndexDeletePlan {
  const node = document.nodes.find(candidate => candidate.id === nodeId)
  if (!node) return { remove: true }
  return {
    remove: false,
    ensureUpsert: {
      nodeId,
      contentRevision: canvasNodeContentRevision(node),
      operation: 'upsert',
    },
  }
}

export function shouldClaimCanvasIndexJob(stopped: boolean): boolean {
  return !stopped
}

type CandidateQueryProvider = (input: CandidateQuery) => Promise<CanvasIndexCandidate[]>
let candidateQueryProvider: CandidateQueryProvider | null = null

export function registerCanvasIndexCandidateQueryProvider(provider: CandidateQueryProvider | null) {
  candidateQueryProvider = provider
}

export function queryCanvasIndexCandidates(input: CandidateQuery): Promise<CanvasIndexCandidate[]> {
  if (!candidateQueryProvider) throw new CanvasIndexUnavailableError()
  return candidateQueryProvider(input)
}
