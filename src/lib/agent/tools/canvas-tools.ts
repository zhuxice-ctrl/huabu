import emitter from '@/lib/emitter'
import {
  commitCanvasAiTransaction,
  failCanvasAiTransaction,
  insertCanvasAiTransactionPreview,
  rollbackCanvasAiTransaction,
} from '@/db/canvas-ai-transactions'
import {
  authorizeCanvasProposal,
  canvasEditingSession,
  isDerivedOverlayCanvasOperation,
  parseCanvasOperations,
  resolveCanvasAiMode,
  type CanvasAiMode,
  type ValidatedCanvasOperation,
} from '@/lib/canvas/ai-permission'
import {
  canvasDocumentRevision,
  createCanvasAiTransactionPreview,
  getCanvasAiRuntimeSnapshot,
  validateCanvasAiGeometry,
  type CanvasAiTransactionRecord,
} from '@/lib/canvas/ai-transaction'
import { applyValidatedCanvasOperations } from '@/lib/canvas/operations'
import type { ViewportSnapshot } from '@/lib/canvas/viewport-sizing'
import { stageCanvasDocumentForAiPreview } from '@/stores/canvas'
import { retrievePersistedCanvasEvidence } from '@/stores/canvas-index'
import { prepareCanvasEvidenceForRequest } from '@/lib/canvas/sensitive-content'
import type { CanvasDocument } from '@/types/canvas'
import type {
  AgentTool,
  AgentToolExecutionContext,
  AgentToolPermissionDecision,
  AgentToolResult,
} from '../types'

interface PendingCanvasAiTransaction {
  record: CanvasAiTransactionRecord
  operations: ValidatedCanvasOperation[]
  viewport: ViewportSnapshot
  mode: CanvasAiMode
}

const pendingCanvasAiTransactions = new Map<string, PendingCanvasAiTransaction>()

async function cancelPendingCanvasAiTransaction(runId: string, reason: string) {
  const pending = pendingCanvasAiTransactions.get(runId)
  pendingCanvasAiTransactions.delete(runId)
  emitter.emit('canvas-agent-preview-clear')
  if (pending) await failCanvasAiTransaction(pending.record.transactionId, reason)
}

function viewportSnapshotForDocument(document: CanvasDocument): ViewportSnapshot {
  return Object.freeze({
    x: document.viewport.x,
    y: document.viewport.y,
    zoom: document.viewport.zoom,
    containerLeft: 0,
    containerTop: 0,
    capturedAt: Date.now(),
  })
}

function denyCanvasOperation(reason: string) {
  return { allowed: false, requiresApproval: false, reason }
}

async function getActiveCanvas(contextCanvasId?: string) {
  const { default: useCanvasStore } = await import('@/stores/canvas')
  const store = useCanvasStore.getState()
  const canvasId = contextCanvasId || store.activeCanvasId || ''
  const document = canvasId ? store.documents[canvasId] : undefined
  const project = store.projects.find(item => item.id === canvasId)
  return { store, canvasId, document, project }
}

function summarizeDocument(document: CanvasDocument) {
  return {
    settings: document.settings,
    viewport: document.viewport,
    nodes: document.nodes.map(node => ({
      id: node.id,
      type: node.type,
      x: Math.round(node.position.x),
      y: Math.round(node.position.y),
      label: node.data.label || '',
      description: node.data.description || '',
    })),
    edges: document.edges.map(edge => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      label: edge.label || '',
    })),
  }
}

const getCanvasStateTool: AgentTool = {
  name: 'canvas_get_state',
  title: '读取当前画布',
  description: '读取 zeroxB 当前打开的原生可视化画布，包括节点、连线、位置和设置。用户提到当前画布、流程图、节点或连线时必须优先使用，不能用 note_read_file 或 Mermaid 文件代替。',
  category: 'canvas',
  risk: 'read',
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
    additionalProperties: false,
  },
  execute: async (_input, context): Promise<AgentToolResult> => {
    const { canvasId, document, project } = await getActiveCanvas(context.context.activeCanvasId)
    if (!canvasId || !document) {
      return { ok: false, message: '当前没有打开的画布。', error: 'NO_ACTIVE_CANVAS' }
    }
    return {
      ok: true,
      message: `已读取画布“${project?.title || canvasId}”，共 ${document.nodes.length} 个节点、${document.edges.length} 条连线。`,
      data: { canvasId, title: project?.title || '', ...summarizeDocument(document) },
    }
  },
}

const applyCanvasOperationsTool: AgentTool = {
  name: 'canvas_apply_operations',
  title: '编辑当前画布',
  description: '直接编辑 zeroxB 当前打开的原生可视化画布。批量添加、更新或删除节点与连线；不要改写 Markdown/Mermaid 文件来代替画布操作。使用稳定 ID，以便在同一次调用中创建节点后连接或更新它们。',
  category: 'canvas',
  risk: 'editor-write',
  inputSchema: {
    type: 'object',
    properties: {
      operations: {
        type: 'array',
        description: 'Ordered canvas edits. Supports source edits plus management-only AI tag/relation overlay operations.',
        items: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['add_node', 'update_node', 'delete_node', 'add_edge', 'delete_edge', 'layout', 'clear', 'upsert_ai_tag', 'delete_ai_tag', 'upsert_ai_relation', 'delete_ai_relation'] },
            id: { type: 'string', description: 'Node or edge ID.' },
            nodeType: { type: 'string', enum: ['process', 'decision', 'terminator', 'text', 'note', 'image', 'file', 'link', 'todo'] },
            nodeId: { type: 'string' },
            targetNodeId: { type: 'string', description: 'Same-type reference node ID for inherited sizing.' },
            label: { type: 'string' },
            description: { type: 'string' },
            x: { type: 'number' },
            y: { type: 'number' },
            width: { type: 'number', description: 'Optional positive finite canvas width.' },
            height: { type: 'number', description: 'Optional positive finite canvas height.' },
            source: { type: 'string' },
            target: { type: 'string' },
            direction: { type: 'string', enum: ['TB', 'LR'] },
            confidence: { type: 'number' },
            relationType: { type: 'string', enum: ['same_topic', 'supplement', 'time_continuation', 'plan_execution', 'problem_solution', 'person_or_place', 'citation_or_source', 'possible_duplicate', 'credential_ownership'] },
          },
          required: ['type'],
          additionalProperties: false,
        },
      },
    },
    required: ['operations'],
    additionalProperties: false,
  },
  execute: async (input, context): Promise<AgentToolResult> => {
    const { store, canvasId, document, project } = await getActiveCanvas(context.context.activeCanvasId)
    if (!canvasId || !document) {
      return { ok: false, message: '当前没有打开的画布。', error: 'NO_ACTIVE_CANVAS' }
    }
    const pending = pendingCanvasAiTransactions.get(context.runId)
    pendingCanvasAiTransactions.delete(context.runId)
    if (!pending || pending.record.canvasId !== canvasId) {
      canvasEditingSession.reportSecurityFailure()
      emitter.emit('canvas-agent-preview-clear')
      return { ok: false, message: 'AI 事务预览已失效，请重新生成。', error: 'STALE_AI_PREVIEW' }
    }
    const parsed = parseCanvasOperations(input.operations)
    if (!parsed.ok || JSON.stringify(parsed.operations) !== JSON.stringify(pending.operations)) {
      canvasEditingSession.reportSecurityFailure()
      await failCanvasAiTransaction(pending.record.transactionId, '执行参数与已确认预览不一致。')
      emitter.emit('canvas-agent-preview-clear')
      return { ok: false, message: '执行参数与已确认预览不一致。', error: 'AI_PREVIEW_MISMATCH' }
    }
    const mode = resolveCanvasAiMode(context.permissionMode)
    const liveDocument = getCanvasAiRuntimeSnapshot(canvasId)?.document ?? document
    if (mode !== pending.mode || canvasDocumentRevision(liveDocument) !== pending.record.beforeRevision) {
      canvasEditingSession.reportSecurityFailure()
      await failCanvasAiTransaction(pending.record.transactionId, '画布或编辑授权已变化。')
      emitter.emit('canvas-agent-preview-clear')
      return { ok: false, message: '画布或编辑授权已变化，请重新预览。', error: 'STALE_AI_PREVIEW' }
    }
    const permission = authorizeCanvasProposal(mode, parsed.operations, {
      document: liveDocument,
      viewport: pending.viewport,
    })
    if (permission.status === 'denied' || (permission.requiresConfirmation && !context.approved)) {
      canvasEditingSession.reportSecurityFailure()
      await failCanvasAiTransaction(
        pending.record.transactionId,
        permission.status === 'denied' ? permission.reason : '缺少有效用户确认。',
      )
      emitter.emit('canvas-agent-preview-clear')
      return {
        ok: false,
        message: permission.status === 'denied' ? permission.reason : '此操作需要有效的用户确认。',
        error: 'BLOCKED_BY_CANVAS_PERMISSION',
      }
    }
    try {
      const before = JSON.stringify(summarizeDocument(liveDocument))
      const committed = await commitCanvasAiTransaction({
        transactionId: pending.record.transactionId,
        canvasId,
        expectedRevision: pending.record.beforeRevision,
        operations: parsed.operations,
        mode,
        viewport: pending.viewport,
        approved: context.approved === true || !permission.requiresConfirmation,
      })
      const latestRevision = getCanvasAiRuntimeSnapshot(canvasId)?.revision
      if (latestRevision && latestRevision !== pending.record.beforeRevision) {
        await rollbackCanvasAiTransaction(pending.record.transactionId)
        canvasEditingSession.reportSecurityFailure()
        emitter.emit('canvas-agent-preview-clear')
        return {
          ok: false,
          message: '提交期间画布发生了新的用户修改，AI 事务已整体回滚。',
          error: 'CANVAS_CHANGED_DURING_COMMIT',
        }
      }
      if (committed.documentChanged) {
        store.replaceDocumentFromAiTransaction(canvasId, committed.document, committed.appliedAt)
      }
      emitter.emit('canvas-agent-preview-clear')
      return {
        ok: true,
        message: `已在画布“${project?.title || canvasId}”原子应用 ${parsed.operations.length} 项修改。`,
        data: {
          transactionId: pending.record.transactionId,
          impact: permission.impact,
          document: summarizeDocument(committed.document),
        },
        changes: [{
          id: pending.record.transactionId,
          type: 'canvas',
          target: canvasId,
          before,
          after: JSON.stringify(summarizeDocument(committed.document)),
          reversible: true,
          summary: `AI 事务修改画布“${project?.title || canvasId}”`,
        }],
      }
    } catch (error) {
      canvasEditingSession.reportSecurityFailure()
      emitter.emit('canvas-agent-preview-clear')
      return {
        ok: false,
        message: error instanceof Error ? error.message : 'AI 事务提交失败，画布未改变。',
        error: 'AI_TRANSACTION_FAILED',
      }
    }
  },
}

const searchOtherCanvasEvidenceTool: AgentTool = {
  name: 'canvas_search_other_canvases',
  title: '搜索指定的其他画布',
  description: '仅在用户明确要求跨画布查找时使用。必须提供目标画布 ID；默认当前画布检索不会搜索其他画布。',
  category: 'canvas',
  risk: 'read',
  inputSchema: {
    type: 'object',
    properties: {
      canvasId: { type: 'string', description: 'User-requested target canvas ID.' },
      query: { type: 'string', description: 'Evidence query for that target canvas.' },
    },
    required: ['canvasId', 'query'],
    additionalProperties: false,
  },
  execute: async (input, context): Promise<AgentToolResult> => {
    const canvasId = typeof input.canvasId === 'string' ? input.canvasId.trim() : ''
    const query = typeof input.query === 'string' ? input.query.trim() : ''
    if (!canvasId || !query) {
      return { ok: false, message: '跨画布搜索需要明确的目标画布 ID 和查询。', error: 'INVALID_CROSS_CANVAS_QUERY' }
    }
    if (canvasId === context.context.activeCanvasId) {
      return { ok: false, message: '当前画布由默认检索边界处理；此工具仅用于其他画布。', error: 'NOT_CROSS_CANVAS' }
    }
    const result = await retrievePersistedCanvasEvidence({ canvasId, query })
    // Tool output may enter a cloud model turn, so unknown endpoint state remains fail-closed.
    const protectedEvidence = prepareCanvasEvidenceForRequest(
      result.evidence.map(item => item.anchor),
      { baseUrl: undefined },
    )
    return {
      ok: true,
      message: protectedEvidence.anchors.length
        ? `已从指定画布找到 ${protectedEvidence.anchors.length} 条证据。`
        : '没有找到与指定画布相关的证据。',
      data: {
        canvasId,
        evidence: protectedEvidence.anchors.map(anchor => ({
          anchorId: anchor.id,
          nodeId: anchor.nodeId,
          startOffset: anchor.startOffset,
          endOffset: anchor.endOffset,
          text: anchor.plainText,
        })),
      },
    }
  },
}

async function authorizeApplyCanvasOperations(
  input: Record<string, unknown>,
  context: AgentToolExecutionContext,
): Promise<AgentToolPermissionDecision> {
  const parsed = parseCanvasOperations(input.operations)
  if (!parsed.ok) {
    canvasEditingSession.reportSecurityFailure()
    return denyCanvasOperation(parsed.issues.join(' '))
  }
  const { canvasId, document } = await getActiveCanvas(context.context.activeCanvasId)
  if (!canvasId || !document) return denyCanvasOperation('当前没有打开的画布。')
  const runtimeSnapshot = getCanvasAiRuntimeSnapshot(canvasId)
  const beforeDocument = runtimeSnapshot?.document ?? document
  const mode = resolveCanvasAiMode(context.permissionMode)
  const viewport = runtimeSnapshot?.viewport ?? viewportSnapshotForDocument(beforeDocument)
  const permission = authorizeCanvasProposal(mode, parsed.operations, {
    document: beforeDocument,
    viewport,
  })
  if (permission.status === 'denied') return denyCanvasOperation(permission.reason)
  const applied = applyValidatedCanvasOperations(beforeDocument, parsed.operations)
  const overlayOperationCount = parsed.operations.filter(isDerivedOverlayCanvasOperation).length
  if (applied.applied === 0 && overlayOperationCount === 0) {
    return denyCanvasOperation('没有可预览的画布或派生层操作。')
  }
  if (applied.applied > 0) {
    const geometry = validateCanvasAiGeometry({ before: beforeDocument, after: applied.document, viewport })
    if (!geometry.valid) {
      canvasEditingSession.reportSecurityFailure()
      return denyCanvasOperation(geometry.reason)
    }
  }
  const record = await createCanvasAiTransactionPreview({
    canvasId,
    mode,
    userInstruction: context.context.userInput,
    modelId: context.modelId || 'unknown',
    before: beforeDocument,
    after: applied.document,
    operations: parsed.operations,
  })
  await stageCanvasDocumentForAiPreview(canvasId, beforeDocument)
  await insertCanvasAiTransactionPreview(record)
  pendingCanvasAiTransactions.set(context.runId, {
    record,
    operations: parsed.operations,
    viewport,
    mode,
  })
  emitter.emit('canvas-agent-preview', { operations: parsed.operations })
  return {
    allowed: true,
    requiresApproval: permission.requiresConfirmation,
    approvalPreview: {
      previewParams: {
        ...input,
        transactionId: record.transactionId,
        mode,
        impact: permission.impact,
      },
    },
  }
}

function authorizeRollbackCanvasTransaction(
  context: AgentToolExecutionContext,
): AgentToolPermissionDecision {
  return context.permissionMode === 'read-only'
    ? denyCanvasOperation('当前为只读模式，不能回滚 AI 画布事务。')
    : { allowed: true, requiresApproval: true }
}

export async function authorizeCanvasToolCall(
  toolName: string,
  input: Record<string, unknown>,
  context: AgentToolExecutionContext,
): Promise<AgentToolPermissionDecision | null> {
  if (toolName === 'canvas_apply_operations') {
    return authorizeApplyCanvasOperations(input, context)
  }
  if (toolName === 'canvas_rollback_ai_transaction') {
    return authorizeRollbackCanvasTransaction(context)
  }
  return null
}

export async function cancelCanvasToolAuthorization(
  toolName: string,
  context: AgentToolExecutionContext,
  reason: 'denied' | 'steered' | 'stopped',
) {
  if (toolName !== 'canvas_apply_operations') return
  await cancelPendingCanvasAiTransaction(context.runId, `用户审批已${reason}。`)
}

const rollbackCanvasAiTransactionTool: AgentTool = {
  name: 'canvas_rollback_ai_transaction',
  title: '回滚 AI 画布事务',
  description: '按事务 ID 整体回滚最近一次仍可安全回滚的 AI 画布修改；不会写入或消费手工撤销历史。',
  category: 'canvas',
  risk: 'editor-write',
  inputSchema: {
    type: 'object',
    properties: { transactionId: { type: 'string' } },
    required: ['transactionId'],
    additionalProperties: false,
  },
  execute: async (input): Promise<AgentToolResult> => {
    const transactionId = typeof input.transactionId === 'string' ? input.transactionId.trim() : ''
    if (!transactionId) return { ok: false, message: '缺少 AI 事务 ID。', error: 'INVALID_TRANSACTION_ID' }
    try {
      const result = await rollbackCanvasAiTransaction(transactionId)
      const { default: useCanvasStore } = await import('@/stores/canvas')
      if (result.documentChanged) {
        useCanvasStore.getState().replaceDocumentFromAiTransaction(
          result.canvasId,
          result.document,
          result.rolledBackAt,
        )
      }
      return {
        ok: true,
        message: '已整体回滚 AI 画布事务。',
        data: { transactionId, canvasId: result.canvasId },
      }
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : 'AI 事务回滚失败。',
        error: 'AI_TRANSACTION_ROLLBACK_FAILED',
      }
    }
  },
}

export const canvasTools: AgentTool[] = [
  getCanvasStateTool,
  searchOtherCanvasEvidenceTool,
  applyCanvasOperationsTool,
  rollbackCanvasAiTransactionTool,
]
