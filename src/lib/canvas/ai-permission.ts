import type { AgentPermissionMode } from '@/lib/agent/types'
import type { CanvasDocument, CanvasNodeType } from '@/types/canvas'
import { isSolidCanvasNode } from './collision-policy.ts'
import type { ViewportSnapshot } from './viewport-sizing.ts'

export type CanvasAiMode = 'management' | 'editing'

export type AiOperationDecision =
  | { status: 'allowed'; requiresConfirmation: boolean }
  | { status: 'denied'; reason: string }

const CANVAS_NODE_TYPES = new Set<CanvasNodeType>([
  'process', 'decision', 'terminator', 'text', 'note', 'image', 'pdf', 'video',
  'web-preview', 'file', 'link', 'todo', 'group', 'freehand',
])

export const AI_RELATION_TYPES = [
  'same_topic',
  'supplement',
  'time_continuation',
  'plan_execution',
  'problem_solution',
  'person_or_place',
  'citation_or_source',
  'possible_duplicate',
  'credential_ownership',
] as const

export type AiRelationType = typeof AI_RELATION_TYPES[number]

interface CanvasOperationBase {
  type: string
}

export interface ReadCanvasOperation extends CanvasOperationBase {
  type: 'read_canvas'
}

export interface FocusEvidenceOperation extends CanvasOperationBase {
  type: 'focus_evidence'
  nodeId: string
}

export interface UpsertAiTagOperation extends CanvasOperationBase {
  type: 'upsert_ai_tag'
  id: string
  nodeId: string
  label: string
  confidence: number
}

export interface DeleteAiTagOperation extends CanvasOperationBase {
  type: 'delete_ai_tag'
  id: string
}

export interface UpsertAiRelationOperation extends CanvasOperationBase {
  type: 'upsert_ai_relation'
  id: string
  source: string
  target: string
  relationType: AiRelationType
  confidence: number
}

export interface DeleteAiRelationOperation extends CanvasOperationBase {
  type: 'delete_ai_relation'
  id: string
}

export interface AddNodeOperation extends CanvasOperationBase {
  type: 'add_node'
  id?: string
  nodeType: CanvasNodeType
  targetNodeId?: string
  label?: string
  description?: string
  x?: number
  y?: number
  width?: number
  height?: number
}

export interface UpdateNodeOperation extends CanvasOperationBase {
  type: 'update_node'
  id: string
  label?: string
  description?: string
  x?: number
  y?: number
  width?: number
  height?: number
}

export interface DeleteNodeOperation extends CanvasOperationBase {
  type: 'delete_node'
  id: string
}

export interface AddEdgeOperation extends CanvasOperationBase {
  type: 'add_edge'
  id?: string
  source: string
  target: string
  label?: string
}

export interface DeleteEdgeOperation extends CanvasOperationBase {
  type: 'delete_edge'
  id: string
}

export interface LayoutOperation extends CanvasOperationBase {
  type: 'layout'
  direction: 'TB' | 'LR'
}

export interface ClearCanvasOperation extends CanvasOperationBase {
  type: 'clear'
}

export type DerivedOverlayCanvasOperation =
  | UpsertAiTagOperation
  | DeleteAiTagOperation
  | UpsertAiRelationOperation
  | DeleteAiRelationOperation

export type SourceCanvasOperation =
  | AddNodeOperation
  | UpdateNodeOperation
  | DeleteNodeOperation
  | AddEdgeOperation
  | DeleteEdgeOperation
  | LayoutOperation
  | ClearCanvasOperation

export type ValidatedCanvasOperation =
  | ReadCanvasOperation
  | FocusEvidenceOperation
  | DerivedOverlayCanvasOperation
  | SourceCanvasOperation

export type CanvasOperationParseResult =
  | { ok: true; operations: ValidatedCanvasOperation[] }
  | { ok: false; issues: string[] }

const MANAGEMENT_OPERATION_TYPES = new Set<ValidatedCanvasOperation['type']>([
  'read_canvas',
  'focus_evidence',
  'upsert_ai_tag',
  'delete_ai_tag',
  'upsert_ai_relation',
  'delete_ai_relation',
])

const DESTRUCTIVE_OPERATION_TYPES = new Set<ValidatedCanvasOperation['type']>([
  'delete_node',
  'delete_edge',
  'clear',
])

const OPERATION_KEYS: Record<ValidatedCanvasOperation['type'], ReadonlySet<string>> = {
  read_canvas: new Set(['type']),
  focus_evidence: new Set(['type', 'nodeId']),
  upsert_ai_tag: new Set(['type', 'id', 'nodeId', 'label', 'confidence']),
  delete_ai_tag: new Set(['type', 'id']),
  upsert_ai_relation: new Set(['type', 'id', 'source', 'target', 'relationType', 'confidence']),
  delete_ai_relation: new Set(['type', 'id']),
  add_node: new Set(['type', 'id', 'nodeType', 'targetNodeId', 'label', 'description', 'x', 'y', 'width', 'height']),
  update_node: new Set(['type', 'id', 'label', 'description', 'x', 'y', 'width', 'height']),
  delete_node: new Set(['type', 'id']),
  add_edge: new Set(['type', 'id', 'source', 'target', 'label']),
  delete_edge: new Set(['type', 'id']),
  layout: new Set(['type', 'direction']),
  clear: new Set(['type']),
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string'
}

function isOptionalFiniteNumber(value: unknown): value is number | undefined {
  return value === undefined || (typeof value === 'number' && Number.isFinite(value))
}

function isOptionalPositiveNumber(value: unknown): value is number | undefined {
  return value === undefined || (typeof value === 'number' && Number.isFinite(value) && value > 0)
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>): boolean {
  return Object.keys(value).every(key => allowed.has(key))
}

function isConfidence(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
}

function validateOperation(value: Record<string, unknown>): string | null {
  if (!isNonEmptyString(value.type) || !(value.type in OPERATION_KEYS)) {
    return '操作 type 不受支持。'
  }
  const type = value.type as ValidatedCanvasOperation['type']
  if (!hasOnlyKeys(value, OPERATION_KEYS[type])) return `${type} 包含未声明字段。`

  if (type === 'read_canvas' || type === 'clear') return null
  if (type === 'focus_evidence') return isNonEmptyString(value.nodeId) ? null : 'focus_evidence.nodeId 必填。'
  if (type === 'delete_ai_tag' || type === 'delete_ai_relation'
    || type === 'delete_node' || type === 'delete_edge') {
    return isNonEmptyString(value.id) ? null : `${type}.id 必填。`
  }
  if (type === 'upsert_ai_tag') {
    return isNonEmptyString(value.id)
      && isNonEmptyString(value.nodeId)
      && isNonEmptyString(value.label)
      && isConfidence(value.confidence)
      ? null
      : 'upsert_ai_tag 字段无效。'
  }
  if (type === 'upsert_ai_relation') {
    return isNonEmptyString(value.id)
      && isNonEmptyString(value.source)
      && isNonEmptyString(value.target)
      && AI_RELATION_TYPES.includes(value.relationType as AiRelationType)
      && isConfidence(value.confidence)
      ? null
      : 'upsert_ai_relation 字段无效。'
  }
  if (type === 'add_node') {
    return CANVAS_NODE_TYPES.has(value.nodeType as CanvasNodeType)
      && isOptionalString(value.id)
      && isOptionalString(value.targetNodeId)
      && isOptionalString(value.label)
      && isOptionalString(value.description)
      && isOptionalFiniteNumber(value.x)
      && isOptionalFiniteNumber(value.y)
      && isOptionalPositiveNumber(value.width)
      && isOptionalPositiveNumber(value.height)
      ? null
      : 'add_node 字段无效。'
  }
  if (type === 'update_node') {
    const hasMutation = ['label', 'description', 'x', 'y', 'width', 'height']
      .some(key => value[key] !== undefined)
    return isNonEmptyString(value.id)
      && hasMutation
      && isOptionalString(value.label)
      && isOptionalString(value.description)
      && isOptionalFiniteNumber(value.x)
      && isOptionalFiniteNumber(value.y)
      && isOptionalPositiveNumber(value.width)
      && isOptionalPositiveNumber(value.height)
      ? null
      : 'update_node 字段无效或没有修改内容。'
  }
  if (type === 'add_edge') {
    return isOptionalString(value.id)
      && isNonEmptyString(value.source)
      && isNonEmptyString(value.target)
      && isOptionalString(value.label)
      ? null
      : 'add_edge 字段无效。'
  }
  return value.direction === 'TB' || value.direction === 'LR'
    ? null
    : 'layout.direction 必须是 TB 或 LR。'
}

function normalizeOperation(value: Record<string, unknown>): ValidatedCanvasOperation {
  const normalized = { ...value }
  for (const key of ['id', 'nodeId', 'nodeType', 'targetNodeId', 'source', 'target', 'label', 'description']) {
    if (typeof normalized[key] === 'string') normalized[key] = normalized[key].trim()
  }
  return normalized as unknown as ValidatedCanvasOperation
}

export function parseCanvasOperations(value: unknown): CanvasOperationParseResult {
  if (!Array.isArray(value) || value.length === 0) {
    return { ok: false, issues: ['operations 必须是非空数组。'] }
  }
  const issues: string[] = []
  const operations: ValidatedCanvasOperation[] = []
  value.forEach((candidate, index) => {
    if (!isRecord(candidate)) {
      issues.push(`第 ${index + 1} 项不是对象。`)
      return
    }
    const issue = validateOperation(candidate)
    if (issue) {
      issues.push(`第 ${index + 1} 项：${issue}`)
      return
    }
    operations.push(normalizeOperation(candidate))
  })
  return issues.length > 0 ? { ok: false, issues } : { ok: true, operations }
}

export function authorizeCanvasOperation(
  mode: CanvasAiMode,
  operation: ValidatedCanvasOperation,
): AiOperationDecision {
  if (mode === 'management' && !MANAGEMENT_OPERATION_TYPES.has(operation.type)) {
    return {
      status: 'denied',
      reason: '管理模式不能修改来源节点、几何、手工关系或布局。请显式开启本次会话的编辑模式。',
    }
  }
  const overwritesSourceText = operation.type === 'update_node'
    && (operation.label !== undefined || operation.description !== undefined)
  return {
    status: 'allowed',
    requiresConfirmation: DESTRUCTIVE_OPERATION_TYPES.has(operation.type) || overwritesSourceText,
  }
}

export interface CanvasProposalImpact {
  movedSolidNodeCount: number
  geometryChangedSolidNodeCount: number
  currentSolidNodeCount: number
  maxScreenMovement: number
  geometryChangeRatio: number
  movesMoreThanEightSolidNodes: boolean
  movesAnyNodeMoreThan400ScreenPixels: boolean
  changesMoreThanQuarterOfSolidNodes: boolean
}

export type CanvasProposalDecision =
  | { status: 'denied'; reason: string; impact: CanvasProposalImpact }
  | { status: 'allowed'; requiresConfirmation: boolean; impact: CanvasProposalImpact }

function analyzeCanvasProposal(
  operations: ValidatedCanvasOperation[],
  document: CanvasDocument,
  viewport: ViewportSnapshot,
): CanvasProposalImpact {
  const solidNodes = document.nodes.filter(isSolidCanvasNode)
  const solidById = new Map(solidNodes.map(node => [node.id, node]))
  const movedIds = new Set<string>()
  const geometryIds = new Set<string>()
  let maxScreenMovement = 0

  for (const operation of operations) {
    if (operation.type === 'clear') {
      for (const node of solidNodes) geometryIds.add(node.id)
      continue
    }
    if (operation.type === 'delete_node') {
      if (solidById.has(operation.id)) geometryIds.add(operation.id)
      continue
    }
    if (operation.type === 'add_node') continue
    if (operation.type !== 'update_node') continue
    const current = solidById.get(operation.id)
    if (!current) continue
    const nextX = operation.x ?? current.position.x
    const nextY = operation.y ?? current.position.y
    const moved = nextX !== current.position.x || nextY !== current.position.y
    const resized = (operation.width !== undefined && operation.width !== current.width)
      || (operation.height !== undefined && operation.height !== current.height)
    if (moved) {
      movedIds.add(operation.id)
      maxScreenMovement = Math.max(
        maxScreenMovement,
        Math.hypot(nextX - current.position.x, nextY - current.position.y) * viewport.zoom,
      )
    }
    if (moved || resized) geometryIds.add(operation.id)
  }

  const geometryChangeRatio = solidNodes.length > 0 ? geometryIds.size / solidNodes.length : 0
  return {
    movedSolidNodeCount: movedIds.size,
    geometryChangedSolidNodeCount: geometryIds.size,
    currentSolidNodeCount: solidNodes.length,
    maxScreenMovement,
    geometryChangeRatio,
    movesMoreThanEightSolidNodes: movedIds.size > 8,
    movesAnyNodeMoreThan400ScreenPixels: maxScreenMovement > 400,
    changesMoreThanQuarterOfSolidNodes: geometryChangeRatio > 0.25,
  }
}

export function authorizeCanvasProposal(
  mode: CanvasAiMode,
  operations: ValidatedCanvasOperation[],
  context: { document: CanvasDocument; viewport: ViewportSnapshot },
): CanvasProposalDecision {
  const impact = analyzeCanvasProposal(operations, context.document, context.viewport)
  let requiresConfirmation = impact.movesMoreThanEightSolidNodes
    || impact.movesAnyNodeMoreThan400ScreenPixels
    || impact.changesMoreThanQuarterOfSolidNodes
  for (const operation of operations) {
    const decision = authorizeCanvasOperation(mode, operation)
    if (decision.status === 'denied') return { ...decision, impact }
    requiresConfirmation ||= decision.requiresConfirmation
  }
  return { status: 'allowed', requiresConfirmation, impact }
}

export interface CanvasEditingSession {
  grant(input?: { now?: number; ttlMs?: number }): void
  revoke(): void
  reportSecurityFailure(): void
  isActive(now?: number): boolean
  expiresAt(): number | null
  subscribe(listener: () => void): () => void
}

export const DEFAULT_CANVAS_EDITING_SESSION_TTL_MS = 15 * 60 * 1000

export function createCanvasEditingSession(): CanvasEditingSession {
  let expiry: number | null = null
  const listeners = new Set<() => void>()
  let timer: ReturnType<typeof setTimeout> | null = null
  const notify = () => listeners.forEach(listener => listener())
  const clearTimer = () => {
    if (timer) clearTimeout(timer)
    timer = null
  }
  const revoke = () => {
    const changed = expiry !== null
    expiry = null
    clearTimer()
    if (changed) notify()
  }
  return {
    grant(input = {}) {
      const now = input.now ?? Date.now()
      const ttlMs = input.ttlMs ?? DEFAULT_CANVAS_EDITING_SESSION_TTL_MS
      if (!Number.isFinite(now) || !Number.isFinite(ttlMs) || ttlMs <= 0) {
        revoke()
        return
      }
      expiry = now + ttlMs
      clearTimer()
      if (typeof window !== 'undefined' && input.now === undefined) {
        timer = setTimeout(revoke, ttlMs)
      }
      notify()
    },
    revoke,
    reportSecurityFailure: revoke,
    isActive(now = Date.now()) {
      if (expiry === null || !Number.isFinite(now) || now >= expiry) {
        if (expiry !== null) revoke()
        return false
      }
      return true
    },
    expiresAt: () => expiry,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

export const canvasEditingSession = createCanvasEditingSession()

export function resolveCanvasAiMode(
  requestedMode: AgentPermissionMode | undefined,
  session: CanvasEditingSession = canvasEditingSession,
  now = Date.now(),
): CanvasAiMode {
  return requestedMode === 'auto-edit' && session.isActive(now) ? 'editing' : 'management'
}
