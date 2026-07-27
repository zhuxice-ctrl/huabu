import type { CanvasDocument } from '@/types/canvas'
import {
  canvasDocumentRevision,
  redactCanvasAiInstruction,
  validateCanvasAiGeometry,
  type CanvasAiPatch,
  type CanvasAiTransactionRecord,
  type CanvasAiTransactionState,
} from '@/lib/canvas/ai-transaction'
import {
  authorizeCanvasProposal,
  isDerivedOverlayCanvasOperation,
  type CanvasAiMode,
  type ValidatedCanvasOperation,
} from '@/lib/canvas/ai-permission'
import { applyValidatedCanvasOperations } from '@/lib/canvas/operations'
import type { ViewportSnapshot } from '@/lib/canvas/viewport-sizing'
import { getDb } from './client'

interface CanvasAiTransactionRow {
  transactionId: string
  canvasId: string
  mode: CanvasAiTransactionRecord['mode']
  userInstructionHash: string
  userInstructionSummary: string
  modelId: string
  createdAt: number
  previewedAt: number
  approvedAt: number | null
  appliedAt: number | null
  rolledBackAt: number | null
  failedAt: number | null
  affectedIds: string
  beforeRevision: string
  afterRevision: string
  beforePatch: string
  afterPatch: string
  inversePatch: string
  state: CanvasAiTransactionState
  errorSummary: string | null
}

export async function initCanvasAiTransactionsDb() {
  const db = await getDb()
  await db.execute(`
    create table if not exists canvas_ai_transactions (
      transactionId text primary key,
      canvasId text not null,
      mode text not null check (mode in ('management', 'editing')),
      userInstructionHash text not null,
      userInstructionSummary text not null,
      modelId text not null,
      createdAt integer not null,
      previewedAt integer not null,
      approvedAt integer default null,
      appliedAt integer default null,
      rolledBackAt integer default null,
      failedAt integer default null,
      affectedIds text not null,
      beforeRevision text not null,
      afterRevision text not null,
      beforePatch text not null,
      afterPatch text not null,
      inversePatch text not null,
      state text not null check (state in ('previewed', 'approved', 'applied', 'rolled_back', 'failed')),
      errorSummary text default null
    )
  `)
  await db.execute(`
    create index if not exists canvas_ai_transactions_canvas_created
    on canvas_ai_transactions(canvasId, createdAt desc)
  `)
  await db.execute(`
    create table if not exists canvas_ai_overlay_operations (
      transactionId text not null,
      operationIndex integer not null,
      canvasId text not null,
      operationType text not null,
      operationJson text not null,
      state text not null check (state in ('active', 'rolled_back')),
      createdAt integer not null,
      primary key (transactionId, operationIndex),
      foreign key (transactionId) references canvas_ai_transactions(transactionId)
    )
  `)
  await db.execute(`
    create index if not exists canvas_ai_overlay_operations_canvas_state
    on canvas_ai_overlay_operations(canvasId, state, createdAt desc)
  `)
}

export async function insertCanvasAiTransactionPreview(record: CanvasAiTransactionRecord) {
  const db = await getDb()
  await db.execute(
    `insert into canvas_ai_transactions (
      transactionId, canvasId, mode, userInstructionHash, userInstructionSummary,
      modelId, createdAt, previewedAt, approvedAt, appliedAt, rolledBackAt, failedAt,
      affectedIds, beforeRevision, afterRevision, beforePatch, afterPatch, inversePatch,
      state, errorSummary
    ) values (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
      $11, $12, $13, $14, $15, $16, $17, $18, $19, $20
    )`,
    [
      record.transactionId,
      record.canvasId,
      record.mode,
      record.userInstructionHash,
      record.userInstructionSummary,
      record.modelId,
      record.createdAt,
      record.previewedAt,
      record.approvedAt,
      record.appliedAt,
      record.rolledBackAt,
      record.failedAt,
      JSON.stringify(record.affectedIds),
      record.beforeRevision,
      record.afterRevision,
      JSON.stringify(record.beforePatch),
      JSON.stringify(record.afterPatch),
      JSON.stringify(record.inversePatch),
      record.state,
      record.errorSummary || null,
    ],
  )
}

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function rowToRecord(row: CanvasAiTransactionRow): CanvasAiTransactionRecord {
  return {
    ...row,
    affectedIds: parseJson<string[]>(row.affectedIds, []),
    beforePatch: parseJson<CanvasAiPatch[]>(row.beforePatch, []),
    afterPatch: parseJson<CanvasAiPatch[]>(row.afterPatch, []),
    inversePatch: parseJson<CanvasAiPatch[]>(row.inversePatch, []),
    errorSummary: row.errorSummary || undefined,
  }
}

export async function getCanvasAiTransaction(transactionId: string) {
  const db = await getDb()
  const rows = await db.select<CanvasAiTransactionRow[]>(
    'select * from canvas_ai_transactions where transactionId = $1 limit 1',
    [transactionId],
  )
  return rows[0] ? rowToRecord(rows[0]) : null
}

export async function failCanvasAiTransaction(transactionId: string, error: unknown) {
  const db = await getDb()
  const failedAt = Date.now()
  const errorSummary = redactCanvasAiInstruction(
    error instanceof Error ? error.message : String(error),
    240,
  )
  await db.execute(
    `update canvas_ai_transactions
     set state = 'failed', failedAt = $1, errorSummary = $2
     where transactionId = $3 and state in ('previewed', 'approved')`,
    [failedAt, errorSummary, transactionId],
  )
}

export async function commitCanvasAiTransaction(input: {
  transactionId: string
  canvasId: string
  expectedRevision: string
  operations: ValidatedCanvasOperation[]
  mode: CanvasAiMode
  viewport: ViewportSnapshot
  approved: boolean
  approvedAt?: number
}): Promise<{ appliedAt: number; document: CanvasDocument; documentChanged: boolean }> {
  const db = await getDb()
  const approvedAt = input.approvedAt ?? Date.now()
  try {
    await db.execute('BEGIN IMMEDIATE')
    const canvasRows = await db.select<Array<{ content: string }>>(
      'select content from canvases where id = $1 and deletedAt is null limit 1',
      [input.canvasId],
    )
    if (!canvasRows[0]) throw new Error('画布不存在或已删除。')
    const current = parseJson<CanvasDocument | null>(canvasRows[0].content, null)
    if (!current || canvasDocumentRevision(current) !== input.expectedRevision) {
      throw new Error('画布版本已变化，AI 操作未应用。')
    }
    const transactions = await db.select<Array<{
      state: CanvasAiTransactionState
      mode: CanvasAiMode
      beforeRevision: string
      afterRevision: string
    }>>(
      `select state, mode, beforeRevision, afterRevision from canvas_ai_transactions
       where transactionId = $1 and canvasId = $2 limit 1`,
      [input.transactionId, input.canvasId],
    )
    const transaction = transactions[0]
    if (!transaction || transaction.state !== 'previewed'
      || transaction.beforeRevision !== input.expectedRevision
      || transaction.mode !== input.mode) {
      throw new Error('AI 事务预览无效或已处理。')
    }
    const permission = authorizeCanvasProposal(input.mode, input.operations, {
      document: current,
      viewport: input.viewport,
    })
    if (permission.status === 'denied') throw new Error(permission.reason)
    if (permission.requiresConfirmation && !input.approved) {
      throw new Error('AI 操作需要用户确认，但本次执行没有有效确认。')
    }
    const result = applyValidatedCanvasOperations(current, input.operations)
    const overlayOperations = input.operations.filter(isDerivedOverlayCanvasOperation)
    if (result.applied === 0 && overlayOperations.length === 0) {
      throw new Error('没有可应用的画布或派生层操作。')
    }
    if (result.applied > 0) {
      const geometry = validateCanvasAiGeometry({
        before: current,
        after: result.document,
        viewport: input.viewport,
      })
      if (!geometry.valid) throw new Error(geometry.reason)
    }
    if (canvasDocumentRevision(result.document) !== transaction.afterRevision) {
      throw new Error('AI 操作结果与已展示的预览不一致。')
    }
    await db.execute(
      `update canvas_ai_transactions
       set state = 'approved', approvedAt = $1
       where transactionId = $2`,
      [approvedAt, input.transactionId],
    )
    const appliedAt = Date.now()
    if (result.applied > 0) {
      await db.execute(
        'update canvases set content = $1, schemaVersion = $2, updatedAt = $3 where id = $4',
        [JSON.stringify(result.document), result.document.schemaVersion, appliedAt, input.canvasId],
      )
    }
    for (const [operationIndex, operation] of overlayOperations.entries()) {
      await db.execute(
        `insert into canvas_ai_overlay_operations (
          transactionId, operationIndex, canvasId, operationType, operationJson, state, createdAt
        ) values ($1, $2, $3, $4, $5, 'active', $6)`,
        [
          input.transactionId,
          operationIndex,
          input.canvasId,
          operation.type,
          JSON.stringify(operation),
          appliedAt,
        ],
      )
    }
    await db.execute(
      `update canvas_ai_transactions
       set state = 'applied', appliedAt = $1
       where transactionId = $2`,
      [appliedAt, input.transactionId],
    )
    await db.execute('COMMIT')
    return { appliedAt, document: result.document, documentChanged: result.applied > 0 }
  } catch (error) {
    try { await db.execute('ROLLBACK') } catch { /* no active transaction */ }
    await failCanvasAiTransaction(input.transactionId, error)
    throw error
  }
}

export async function rollbackCanvasAiTransaction(transactionId: string): Promise<{
  canvasId: string
  document: CanvasDocument
  rolledBackAt: number
  documentChanged: boolean
}> {
  const db = await getDb()
  try {
    await db.execute('BEGIN IMMEDIATE')
    const rows = await db.select<CanvasAiTransactionRow[]>(
      'select * from canvas_ai_transactions where transactionId = $1 limit 1',
      [transactionId],
    )
    const row = rows[0]
    if (!row || row.state !== 'applied') throw new Error('AI 事务不存在或当前不能回滚。')
    const canvasRows = await db.select<Array<{ content: string }>>(
      'select content from canvases where id = $1 and deletedAt is null limit 1',
      [row.canvasId],
    )
    const current = canvasRows[0]
      ? parseJson<CanvasDocument | null>(canvasRows[0].content, null)
      : null
    if (!current) throw new Error('画布不存在或已删除。')
    const documentChanged = row.beforeRevision !== row.afterRevision
    if (documentChanged && canvasDocumentRevision(current) !== row.afterRevision) {
      throw new Error('画布在 AI 操作后已变化；为避免覆盖用户修改，本次回滚已取消。')
    }
    const patches = parseJson<CanvasAiPatch[]>(row.inversePatch, [])
    const replacement = patches.findLast(patch => patch.op === 'replace_document')?.document
    if (!replacement) throw new Error('AI 事务缺少完整逆向补丁。')
    const document = documentChanged ? structuredClone(replacement) : current
    const rolledBackAt = Date.now()
    if (documentChanged) {
      await db.execute(
        'update canvases set content = $1, schemaVersion = $2, updatedAt = $3 where id = $4',
        [JSON.stringify(document), document.schemaVersion, rolledBackAt, row.canvasId],
      )
    }
    await db.execute(
      `update canvas_ai_overlay_operations
       set state = 'rolled_back'
       where transactionId = $1 and state = 'active'`,
      [transactionId],
    )
    await db.execute(
      `update canvas_ai_transactions
       set state = 'rolled_back', rolledBackAt = $1
       where transactionId = $2`,
      [rolledBackAt, transactionId],
    )
    await db.execute('COMMIT')
    return { canvasId: row.canvasId, document, rolledBackAt, documentChanged }
  } catch (error) {
    try { await db.execute('ROLLBACK') } catch { /* no active transaction */ }
    throw error
  }
}
