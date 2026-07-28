import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  assertAttachmentWriteAllowed,
  enableCrashSafeSqlite,
  recoverPendingCanvasAiTransactions,
  repairCanvasIndexes,
} from '../../src/db/workspace-recovery.ts'

function document(label) {
  return {
    schemaVersion: 1,
    nodes: [{ id: 'n1', type: 'text', position: { x: 0, y: 0 }, data: { label } }],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    settings: { layoutDirection: 'TB', showGrid: true, snapToGrid: false },
  }
}

function revision(value) {
  const content = JSON.stringify(value)
  let hash = 0x811c9dc5
  for (const byte of new TextEncoder().encode(content)) {
    hash ^= byte
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

function fakeDb(rows = [], options = {}) {
  const calls = []
  return {
    calls,
    async execute(query, values = []) {
      calls.push({ kind: 'execute', query, values })
      if (options.reindexFails && /REINDEX/i.test(query)) throw new Error('database disk image is malformed: index')
      return { rowsAffected: 1 }
    },
    async select(query, values = []) {
      calls.push({ kind: 'select', query, values })
      if (/canvas_ai_transactions/i.test(query)) return rows
      if (/sqlite_master/i.test(query)) return [{ count: 1 }]
      return []
    },
  }
}

test('SQLite WAL and durable sync are enabled before recovery writes', async () => {
  const db = fakeDb()
  await enableCrashSafeSqlite(db)
  const statements = db.calls.filter(call => call.kind === 'execute').map(call => call.query)
  assert.match(statements[0], /PRAGMA journal_mode\s*=\s*WAL/i)
  assert.match(statements[1], /PRAGMA synchronous\s*=\s*FULL/i)
  assert.match(statements[2], /PRAGMA foreign_keys\s*=\s*ON/i)
})

test('startup finalizes an atomically committed AI transaction without rewriting its canvas', async () => {
  const after = document('after')
  const db = fakeDb([{
    transactionId: 'tx-finalize',
    canvasId: 'canvas-1',
    state: 'approved',
    beforeRevision: revision(document('before')),
    afterRevision: revision(after),
    beforePatch: JSON.stringify([{ op: 'replace_document', document: document('before') }]),
    currentContent: JSON.stringify(after),
  }])
  const result = await recoverPendingCanvasAiTransactions(db, 500)
  assert.deepEqual(result, { finalized: ['tx-finalize'], rolledBack: [] })
  assert.equal(db.calls.some(call => /update canvases set content/i.test(call.query)), false)
  assert.equal(db.calls.some(call => /set state = 'applied'/i.test(call.query)), true)
})

test('startup restores the complete before checkpoint for a partially visible AI transaction', async () => {
  const before = document('before')
  const partial = document('partial')
  const db = fakeDb([{
    transactionId: 'tx-rollback',
    canvasId: 'canvas-1',
    state: 'approved',
    beforeRevision: revision(before),
    afterRevision: revision(document('after')),
    beforePatch: JSON.stringify([{ op: 'replace_document', document: before }]),
    currentContent: JSON.stringify(partial),
  }])
  const result = await recoverPendingCanvasAiTransactions(db, 600)
  assert.deepEqual(result, { finalized: [], rolledBack: ['tx-rollback'] })
  const restore = db.calls.find(call => /update canvases set content/i.test(call.query))
  assert.equal(restore.values[0], JSON.stringify(before))
  const begin = db.calls.findIndex(call => /BEGIN IMMEDIATE/i.test(call.query))
  const canvasRestore = db.calls.indexOf(restore)
  const ledgerRollback = db.calls.findIndex(call => /set state = 'rolled_back'/i.test(call.query))
  const commit = db.calls.findIndex(call => /COMMIT/i.test(call.query))
  assert.ok(begin < canvasRestore && canvasRestore < ledgerRollback && ledgerRollback < commit)
})

test('startup closes a stale preview without overwriting later manual canvas edits', async () => {
  const before = document('before')
  const manual = document('manual edit')
  const db = fakeDb([{
    transactionId: 'tx-preview',
    canvasId: 'canvas-1',
    state: 'previewed',
    beforeRevision: revision(before),
    afterRevision: revision(document('preview result')),
    beforePatch: JSON.stringify([{ op: 'replace_document', document: before }]),
    currentContent: JSON.stringify(manual),
  }])
  const result = await recoverPendingCanvasAiTransactions(db, 650)
  assert.deepEqual(result, { finalized: [], rolledBack: ['tx-preview'] })
  assert.equal(db.calls.some(call => /update canvases set content/i.test(call.query)), false)
  assert.equal(db.calls.some(call => /Closed stale preview/i.test(call.query)), true)
})

test('an approved partial transaction with no valid before checkpoint fails closed', async () => {
  const db = fakeDb([{
    transactionId: 'tx-corrupt',
    canvasId: 'canvas-1',
    state: 'approved',
    beforeRevision: revision(document('before')),
    afterRevision: revision(document('after')),
    beforePatch: 'not-json',
    currentContent: JSON.stringify(document('partial')),
  }])
  await assert.rejects(() => recoverPendingCanvasAiTransactions(db, 675), /no recoverable before checkpoint/i)
  assert.equal(db.calls.some(call => /ROLLBACK/i.test(call.query)), true)
})

test('corrupt derived indexes are cleared and rebuilt from authoritative canvases', async () => {
  const db = fakeDb([], { reindexFails: true })
  const result = await repairCanvasIndexes(db, 700)
  assert.equal(result, 'rebuilt')
  const source = db.calls.map(call => call.query).join('\n')
  assert.match(source, /delete from canvas_index_anchors/i)
  assert.match(source, /delete from canvas_index_embeddings/i)
  assert.match(source, /select id from canvases/i)
  assert.match(source, /operation[^\n]*'rebuild'/i)
})

test('disk-full and read-only workspaces reject attachment adoption before any write', () => {
  assert.throws(
    () => assertAttachmentWriteAllowed({ mode: 'read-only', requiredBytes: 1, availableBytes: 10 }),
    /read-only/i,
  )
  assert.throws(
    () => assertAttachmentWriteAllowed({ mode: 'read-write', requiredBytes: 11, availableBytes: 10 }),
    /disk full/i,
  )
  assert.doesNotThrow(
    () => assertAttachmentWriteAllowed({ mode: 'read-write', requiredBytes: 10, availableBytes: 10 }),
  )
})

test('startup recovery and migration snapshot precede schema initialization and every store load', async () => {
  const [database, startup] = await Promise.all([
    readFile(new URL('../../src/db/index.ts', import.meta.url), 'utf8'),
    readFile(new URL('../../src/app/core/main/canvas/canvas-startup-controller.tsx', import.meta.url), 'utf8'),
  ])
  const initialization = database.slice(
    database.indexOf('async function runDatabaseInitialization()'),
    database.indexOf('async function runSchemaInitialization()'),
  )
  const prepare = initialization.indexOf('await prepareStartupRecovery()')
  const snapshot = initialization.indexOf('await createMigrationSnapshotIfNeeded')
  const schema = initialization.indexOf('await runSchemaInitialization()')
  const recover = initialization.indexOf('await completeStartupRecovery')
  assert.ok(prepare >= 0 && prepare < snapshot && snapshot < schema && schema < recover)

  const init = startup.indexOf('void initAllDatabases()')
  assert.ok(init >= 0)
  for (const storeLoad of ['initOpenTabs()', 'loadProjects()']) {
    assert.ok(startup.indexOf(storeLoad) > init, `${storeLoad} must happen after startup recovery`)
  }
  assert.match(startup, /async function initializeCanvasStartup[\s\S]*Store\.load\('store\.json'\)/)
  assert.ok(startup.indexOf('initializeCanvasStartup(projects)', init) > init)
})

test('settings expose recovery-only database actions and no export, share, or download action', async () => {
  const source = await readFile(new URL('../../src/app/core/setting/file/page.tsx', import.meta.url), 'utf8')
  for (const label of ['检查工作区', '恢复历史状态', '清理旧备份']) assert.match(source, new RegExp(label))
  assert.doesNotMatch(source, /导出数据库|分享数据库|下载数据库|export_app_data|downloadDatabase|shareDatabase/i)
})
