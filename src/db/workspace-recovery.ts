import { createStatementRecorder, executeNativeSqliteTransaction } from './native-transaction.ts'

export interface SqlExecutor {
  execute(query: string, bindValues?: unknown[]): Promise<unknown>
  select<T>(query: string, bindValues?: unknown[]): Promise<T>
}

export type WorkspaceAccessMode = 'read-write' | 'read-only'

interface PendingCanvasAiTransactionRow {
  transactionId: string
  canvasId: string
  state: 'previewed' | 'approved'
  beforeRevision: string
  afterRevision: string
  beforePatch: string
  currentContent: string | null
}

interface ReplaceDocumentPatch {
  op: 'replace_document'
  document: {
    schemaVersion?: number
    [key: string]: unknown
  }
}

function parseJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function documentRevision(document: unknown): string {
  const content = JSON.stringify(document)
  let hash = 0x811c9dc5
  for (const byte of new TextEncoder().encode(content)) {
    hash ^= byte
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

export function isDiskFullError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /SQLITE_FULL|database or disk is full|disk full|no space left/i.test(message)
}

export function isReadOnlyError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /SQLITE_READONLY|readonly database|read-only file system|access is denied/i.test(message)
}

export async function enableCrashSafeSqlite(db: SqlExecutor): Promise<void> {
  await db.execute('PRAGMA journal_mode = WAL')
  await db.execute('PRAGMA synchronous = FULL')
  await db.execute('PRAGMA foreign_keys = ON')
  await db.execute('PRAGMA busy_timeout = 5000')
}

export async function initWorkspaceRecoveryDb(db: SqlExecutor): Promise<void> {
  await db.execute(`
    create table if not exists workspace_recovery_metadata (
      key text primary key,
      value text not null,
      updatedAt integer not null
    )
  `)
  await db.execute(`
    create table if not exists workspace_snapshots (
      fileName text primary key,
      kind text not null check (kind in ('daily', 'weekly', 'migration')),
      createdAt integer not null,
      verifiedAt integer not null,
      sourceRevision text not null
    )
  `)
}

export async function probeWorkspaceWritable(db: SqlExecutor, now = Date.now()): Promise<void> {
  try {
    await db.execute('BEGIN IMMEDIATE')
    await db.execute(
      `insert into workspace_recovery_metadata (key, value, updatedAt)
       values ('write-probe', $1, $1)
       on conflict(key) do update set value = excluded.value, updatedAt = excluded.updatedAt`,
      [now],
    )
    await db.execute("delete from workspace_recovery_metadata where key = 'write-probe'")
    await db.execute('COMMIT')
  } catch (error) {
    try { await db.execute('ROLLBACK') } catch { /* no active transaction */ }
    throw error
  }
}

export async function enterReadOnlyFallback(db: SqlExecutor): Promise<WorkspaceAccessMode> {
  await db.execute('PRAGMA query_only = ON')
  return 'read-only'
}

export function assertAttachmentWriteAllowed(input: {
  mode: WorkspaceAccessMode
  requiredBytes: number
  availableBytes: number
}): void {
  if (input.mode === 'read-only') {
    throw new Error('Workspace is read-only; attachment write rejected.')
  }
  if (!Number.isFinite(input.requiredBytes) || input.requiredBytes < 0) {
    throw new Error('Invalid attachment size.')
  }
  if (input.requiredBytes > Math.max(0, input.availableBytes)) {
    throw new Error('Disk full; attachment write rejected before copy.')
  }
}

export async function recoverPendingCanvasAiTransactions(
  db: SqlExecutor,
  recoveredAt = Date.now(),
  runTransaction?: (statements: Array<{ query: string; bindValues?: unknown[] }>) => Promise<unknown>,
): Promise<{ finalized: string[]; rolledBack: string[] }> {
  const rows = await db.select<PendingCanvasAiTransactionRow[]>(`
    select tx.transactionId, tx.canvasId, tx.state, tx.beforeRevision, tx.afterRevision,
      tx.beforePatch, canvas.content as currentContent
    from canvas_ai_transactions tx
    left join canvases canvas on canvas.id = tx.canvasId and canvas.deletedAt is null
    where tx.state in ('previewed', 'approved')
    order by tx.createdAt, tx.transactionId
  `)
  const finalized: string[] = []
  const rolledBack: string[] = []
  if (rows.length === 0) return { finalized, rolledBack }

  try {
    const recorder = createStatementRecorder()
    for (const row of rows) {
      const currentDocument = parseJson<unknown | null>(row.currentContent, null)
      const currentRevision = currentDocument ? documentRevision(currentDocument) : null
      if (row.state === 'previewed') {
        recorder.statements.push({
          query: `update canvas_ai_transactions
           set state = 'rolled_back', rolledBackAt = $1,
             errorSummary = 'Closed stale preview before store load.'
           where transactionId = $2 and state = 'previewed'`,
          bindValues: [recoveredAt, row.transactionId],
          minRowsAffected: 1,
        })
        rolledBack.push(row.transactionId)
        continue
      }
      if (currentRevision === row.afterRevision) {
        recorder.statements.push({
          query: `update canvas_ai_transactions
           set state = 'applied', appliedAt = coalesce(appliedAt, $1), errorSummary = null
           where transactionId = $2 and state in ('previewed', 'approved')`,
          bindValues: [recoveredAt, row.transactionId],
          minRowsAffected: 1,
        })
        finalized.push(row.transactionId)
        continue
      }

      const beforePatches = parseJson<ReplaceDocumentPatch[]>(row.beforePatch, [])
      const beforeDocument = beforePatches.findLast(patch => patch.op === 'replace_document')?.document
      if (currentRevision !== row.beforeRevision) {
        if (!beforeDocument || row.currentContent === null) {
          throw new Error(`Approved AI transaction ${row.transactionId} has no recoverable before checkpoint.`)
        }
        recorder.statements.push({
          query: `update canvases set content = $1, schemaVersion = $2, updatedAt = $3
            where id = $4 and content = $5 and deletedAt is null`,
          bindValues: [
            JSON.stringify(beforeDocument),
            Number(beforeDocument.schemaVersion) || 1,
            recoveredAt,
            row.canvasId,
            row.currentContent,
          ],
          minRowsAffected: 1,
        })
      }
      await recorder.execute(
        `update canvas_ai_overlay_operations set state = 'rolled_back'
         where transactionId = $1 and state = 'active'`,
        [row.transactionId],
      )
      recorder.statements.push({
        query: `update canvas_ai_transactions
         set state = 'rolled_back', rolledBackAt = $1,
           errorSummary = 'Recovered interrupted transaction before store load.'
         where transactionId = $2 and state in ('previewed', 'approved')`,
        bindValues: [recoveredAt, row.transactionId],
        minRowsAffected: 1,
      })
      rolledBack.push(row.transactionId)
    }
    await (runTransaction ?? executeNativeSqliteTransaction)(recorder.statements)
    return { finalized, rolledBack }
  } catch (error) {
    throw error
  }
}

export async function rebuildCanvasIndexes(db: SqlExecutor, now = Date.now()): Promise<'rebuilt'> {
  try {
    await db.execute('BEGIN IMMEDIATE')
    await db.execute('delete from canvas_index_anchors')
    await db.execute('delete from canvas_index_embeddings')
    await db.execute('delete from canvas_knowledge_anchors')
    await db.execute("delete from canvas_index_jobs where state != 'complete' or operation = 'rebuild'")
    const canvases = await db.select<Array<{ id: string }>>(
      'select id from canvases where deletedAt is null order by id',
    )
    for (const canvas of canvases) {
      await db.execute(
        `insert into canvas_index_jobs (id, canvasId, nodeId, contentRevision, operation, state, attempts, nextAttemptAt, createdAt, updatedAt) values ($1, $2, '__canvas__', 'startup-rebuild', 'rebuild', 'pending', 0, $3, $3, $3) on conflict(id) do update set state = 'pending', attempts = 0, nextAttemptAt = excluded.nextAttemptAt, updatedAt = excluded.updatedAt`,
        [`recovery:${encodeURIComponent(canvas.id)}:${now}`, canvas.id, now],
      )
    }
    await db.execute('COMMIT')
    return 'rebuilt'
  } catch (error) {
    try { await db.execute('ROLLBACK') } catch { /* no active transaction */ }
    throw error
  }
}

export async function assertReadOnlyRecoverySafe(db: SqlExecutor): Promise<void> {
  const tables = await db.select<Array<{ count: number }>>(
    "select count(*) as count from sqlite_master where type = 'table' and name = 'canvas_ai_transactions'",
  )
  if (Number(tables[0]?.count || 0) === 0) return
  const rows = await db.select<Array<{ count: number }>>(
    "select count(*) as count from canvas_ai_transactions where state in ('previewed', 'approved')",
  )
  if (Number(rows[0]?.count || 0) > 0) {
    throw new Error('Pending AI work requires writable recovery; read-only startup was stopped.')
  }
}

export async function repairCanvasIndexes(db: SqlExecutor, now = Date.now()): Promise<'reindexed' | 'rebuilt'> {
  try {
    await db.execute('REINDEX')
    return 'reindexed'
  } catch (error) {
    if (isDiskFullError(error)) throw error
  }
  return rebuildCanvasIndexes(db, now)
}

export async function inspectWorkspaceIntegrity(db: SqlExecutor): Promise<{
  ok: boolean
  indexCorruption: boolean
  messages: string[]
}> {
  const rows = await db.select<Array<Record<string, unknown>>>('PRAGMA quick_check')
  const messages = rows.flatMap(row => Object.values(row).map(String))
  const ok = messages.length > 0 && messages.every(message => message.toLowerCase() === 'ok')
  return {
    ok,
    indexCorruption: !ok && messages.every(message => /index/i.test(message)),
    messages,
  }
}
