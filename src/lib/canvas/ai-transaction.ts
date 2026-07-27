import type { CanvasDocument } from '@/types/canvas'
import {
  isSolidCanvasNode,
  scoreLegacyConflicts,
  thresholdsForSnapshot,
} from './collision-policy.ts'
import type { CanvasRect } from './gesture-policy.ts'
import type {
  CanvasAiMode,
  ValidatedCanvasOperation,
} from './ai-permission.ts'
import type { ViewportSnapshot } from './viewport-sizing.ts'

export type CanvasAiTransactionState =
  | 'previewed'
  | 'approved'
  | 'applied'
  | 'rolled_back'
  | 'failed'

export interface ReplaceCanvasDocumentPatch {
  op: 'replace_document'
  document: CanvasDocument
}

export type CanvasAiPatch = ReplaceCanvasDocumentPatch

export interface CanvasAiTransactionRecord {
  transactionId: string
  canvasId: string
  mode: CanvasAiMode
  userInstructionHash: string
  userInstructionSummary: string
  modelId: string
  createdAt: number
  previewedAt: number
  approvedAt: number | null
  appliedAt: number | null
  rolledBackAt: number | null
  failedAt: number | null
  affectedIds: string[]
  beforeRevision: string
  afterRevision: string
  beforePatch: CanvasAiPatch[]
  afterPatch: CanvasAiPatch[]
  inversePatch: CanvasAiPatch[]
  state: CanvasAiTransactionState
  errorSummary?: string
}

export interface CanvasAiRuntimeSnapshot {
  canvasId: string
  document: CanvasDocument
  revision: string
  viewport: ViewportSnapshot
}

const canvasAiRuntimeSnapshots = new Map<string, CanvasAiRuntimeSnapshot>()

export function publishCanvasAiRuntimeSnapshot(input: {
  canvasId: string
  document: CanvasDocument
  viewport: ViewportSnapshot
}) {
  canvasAiRuntimeSnapshots.set(input.canvasId, {
    canvasId: input.canvasId,
    document: input.document,
    revision: canvasDocumentRevision(input.document),
    viewport: input.viewport,
  })
}

export function getCanvasAiRuntimeSnapshot(canvasId: string): CanvasAiRuntimeSnapshot | null {
  const snapshot = canvasAiRuntimeSnapshots.get(canvasId)
  if (!snapshot) return null
  return {
    ...snapshot,
    document: structuredClone(snapshot.document),
    viewport: Object.freeze({ ...snapshot.viewport }),
  }
}

export function clearCanvasAiRuntimeSnapshot(canvasId: string) {
  canvasAiRuntimeSnapshots.delete(canvasId)
}

export function redactCanvasAiInstruction(value: string, maxLength = 240): string {
  const length = Array.from(value).length
  if (length === 0 || maxLength <= 0) return ''
  return `[REDACTED_INSTRUCTION length=${length}]`.slice(0, maxLength)
}

export async function hashCanvasAiInstruction(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

export function canvasDocumentRevision(document: CanvasDocument): string {
  const content = JSON.stringify(document)
  let hash = 0x811c9dc5
  for (const byte of new TextEncoder().encode(content)) {
    hash ^= byte
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

export function affectedCanvasIds(operations: ValidatedCanvasOperation[]): string[] {
  const ids = new Set<string>()
  for (const operation of operations) {
    for (const key of ['id', 'nodeId', 'source', 'target'] as const) {
      const value = key in operation ? operation[key as keyof typeof operation] : undefined
      if (typeof value === 'string' && value) ids.add(value)
    }
  }
  return [...ids].sort((left, right) => left.localeCompare(right))
}

export async function createCanvasAiTransactionPreview(input: {
  transactionId?: string
  canvasId: string
  mode: CanvasAiMode
  userInstruction: string
  modelId: string
  before: CanvasDocument
  after: CanvasDocument
  operations: ValidatedCanvasOperation[]
  createdAt?: number
}): Promise<CanvasAiTransactionRecord> {
  const createdAt = input.createdAt ?? Date.now()
  const before = structuredClone(input.before)
  const after = structuredClone(input.after)
  return {
    transactionId: input.transactionId || crypto.randomUUID(),
    canvasId: input.canvasId,
    mode: input.mode,
    userInstructionHash: await hashCanvasAiInstruction(input.userInstruction),
    userInstructionSummary: redactCanvasAiInstruction(input.userInstruction),
    modelId: input.modelId || 'unknown',
    createdAt,
    previewedAt: createdAt,
    approvedAt: null,
    appliedAt: null,
    rolledBackAt: null,
    failedAt: null,
    affectedIds: affectedCanvasIds(input.operations),
    beforeRevision: canvasDocumentRevision(before),
    afterRevision: canvasDocumentRevision(after),
    beforePatch: [{ op: 'replace_document', document: before }],
    afterPatch: [{ op: 'replace_document', document: after }],
    inversePatch: [{ op: 'replace_document', document: before }],
    state: 'previewed',
  }
}

export function applyInverseCanvasPatch(
  document: CanvasDocument,
  patches: CanvasAiPatch[],
): CanvasDocument {
  let next = structuredClone(document)
  for (const patch of patches) {
    if (patch.op === 'replace_document') next = structuredClone(patch.document)
  }
  return next
}

function nodeRect(node: CanvasDocument['nodes'][number]): CanvasRect | null {
  const width = node.width
  const height = node.height
  if (typeof width !== 'number' || !Number.isFinite(width) || width < 0
    || typeof height !== 'number' || !Number.isFinite(height) || height < 0
    || !Number.isFinite(node.position.x) || !Number.isFinite(node.position.y)) {
    return null
  }
  return { x: node.position.x, y: node.position.y, width, height }
}

function collisionEntities(document: CanvasDocument) {
  return document.nodes.filter(isSolidCanvasNode).map(node => {
    const rect = nodeRect(node)
    return rect ? { id: node.id, rect } : null
  })
}

export type CanvasAiGeometryValidation =
  | { valid: true }
  | { valid: false; reason: string }

export function validateCanvasAiGeometry(input: {
  before: CanvasDocument
  after: CanvasDocument
  viewport: ViewportSnapshot
}): CanvasAiGeometryValidation {
  const beforeEntities = collisionEntities(input.before)
  const afterEntities = collisionEntities(input.after)
  if (beforeEntities.some(entity => entity === null) || afterEntities.some(entity => entity === null)) {
    return { valid: false, reason: 'AI 操作包含无效或非有限几何。' }
  }
  const thresholds = thresholdsForSnapshot(input.viewport)
  const beforeScore = scoreLegacyConflicts({
    entities: beforeEntities as NonNullable<typeof beforeEntities[number]>[],
    thresholds,
  })
  const afterScore = scoreLegacyConflicts({
    entities: afterEntities as NonNullable<typeof afterEntities[number]>[],
    thresholds,
  })
  if (!beforeScore.valid || !afterScore.valid) {
    return { valid: false, reason: '无法验证 AI 操作的碰撞状态。' }
  }
  const beforePairs = new Map(beforeScore.pairs.map(pair => [pair.ids.join('\u0000'), pair.mtd]))
  for (const pair of afterScore.pairs) {
    const previousMtd = beforePairs.get(pair.ids.join('\u0000'))
    if (previousMtd === undefined || pair.mtd > previousMtd) {
      return { valid: false, reason: 'AI 操作产生了新的或更严重的实体碰撞。' }
    }
  }
  return { valid: true }
}
