import Database from '@tauri-apps/plugin-sql'
import { invoke } from '@tauri-apps/api/core'
import { Store } from '@tauri-apps/plugin-store'
import {
  copyFile,
  exists,
  lstat,
  mkdir,
  readDir,
  remove,
  rename,
  stat,
} from '@tauri-apps/plugin-fs'
import {
  appConfigDir,
  documentDir,
  join,
  localDataDir,
} from '@tauri-apps/api/path'

import {
  enableCrashSafeSqlite,
  inspectWorkspaceIntegrity,
  assertAttachmentWriteAllowed,
  assertReadOnlyRecoverySafe,
  isDiskFullError,
  isReadOnlyError,
  probeWorkspaceWritable,
  rebuildCanvasIndexes,
  recoverPendingCanvasAiTransactions,
  repairCanvasIndexes,
  type SqlExecutor,
  type WorkspaceAccessMode,
} from '../../db/workspace-recovery'
import {
  DEFAULT_BACKUP_RETENTION,
  compactRecoveryTimestamp,
  getSnapshotGenerations,
  isSafeSnapshotFileName,
  parseSnapshotFileName,
  planBackupRotation,
  type WorkspaceSnapshot,
} from './backup-policy'
import {
  assertPathInsideWorkspace,
  selectWorkspaceLayout,
  type SavedWorkspaceCheckpoint,
  type WorkspaceLayout,
} from './workspace-path'
import {
  configureDatabasePath,
  getDb,
  openDatabaseReadOnly,
} from '../../db/client'

const RECOVERY_STORE = 'workspace-recovery.json'
const ACTIVE_WORKSPACE_KEY = 'active-workspace-v1'
const PENDING_RESTORE_KEY = 'pending-restore-v1'
const RECOVERY_SCHEMA_VERSION = 20
const MIGRATION_SNAPSHOT_PATTERN = /^migration-\d{8}T\d{6}Z\.workspace\.db$/
const TRASH_FILE_PATTERN = /^(?:(?:daily|weekly)-\d{4}-\d{2}-\d{2}\.workspace\.db|pre-restore-\d{8}T\d{6}Z\.workspace\.db)\.trash-\d{8}T\d{6}Z(?:-(?:wal|shm))?$/

interface MigrationSnapshot {
  fileName: string
  createdAt: number
  sourceRevision: string
}

export interface StartupRecoveryContext {
  db: SqlExecutor
  layout: WorkspaceLayout
  accessMode: WorkspaceAccessMode
  indexNeedsRebuild: boolean
  schemaVersionBefore: number
  hasUserTables: boolean
  migrationSnapshot: MigrationSnapshot | null
}

let activeContext: StartupRecoveryContext | null = null
let activeAccessMode: WorkspaceAccessMode = 'read-write'

function sqliteString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`
}

function firstNumber(rows: Array<Record<string, unknown>>, fallback = 0): number {
  const value = rows[0] ? Object.values(rows[0])[0] : fallback
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

async function assertSafeRecoveryPath(path: string, allowMissingLeaf = false): Promise<void> {
  await invoke('assert_no_reparse_points', { path, allowMissingLeaf })
}

async function ensureWorkspaceDirectories(layout: WorkspaceLayout): Promise<void> {
  for (const directory of [
    layout.root,
    ...layout.durableDirectories,
    layout.trashPath,
    ...layout.localDirectories,
  ]) {
    await assertSafeRecoveryPath(directory, !await exists(directory))
    if (!await exists(directory)) await mkdir(directory, { recursive: true })
    const metadata = await lstat(directory)
    if (!metadata.isDirectory || metadata.isSymlink) {
      throw new Error('Workspace recovery directory must not be a symlink or junction.')
    }
  }
}

async function loadRecoveryStore(localAppDataDir?: string): Promise<Store> {
  const localRoot = localAppDataDir ?? await localDataDir()
  const configDirectory = await join(localRoot, 'zeroxB', 'config')
  if (!await exists(configDirectory)) await mkdir(configDirectory, { recursive: true })
  return Store.load(await join(configDirectory, RECOVERY_STORE))
}

async function resolveWorkspaceLayout(): Promise<{
  layout: WorkspaceLayout
  store: Store
}> {
  const [documentsDir, localAppDataDir, legacyConfigDir] = await Promise.all([
    documentDir(),
    localDataDir(),
    appConfigDir(),
  ])
  const store = await loadRecoveryStore(localAppDataDir)
  const savedWorkspace = await store.get<SavedWorkspaceCheckpoint>(ACTIVE_WORKSPACE_KEY) ?? null
  const legacyDatabasePath = await join(legacyConfigDir, 'note.db')
  const layout = selectWorkspaceLayout({
    documentsDir,
    localAppDataDir,
    appConfigDir: legacyConfigDir,
    legacyDatabaseExists: await exists(legacyDatabasePath),
    savedWorkspace,
  })
  await ensureWorkspaceDirectories(layout)
  return { layout, store }
}

async function verifySqliteFile(databasePath: string): Promise<boolean> {
  await assertSafeRecoveryPath(databasePath)
  const databaseUrl = `sqlite:${databasePath}`
  const snapshot = await Database.load(databaseUrl)
  try {
    const rows = await snapshot.select<Array<Record<string, unknown>>>('PRAGMA quick_check')
    return rows.length > 0
      && rows.every(row => Object.values(row).every(value => String(value).toLowerCase() === 'ok'))
  } finally {
    await snapshot.close(databaseUrl)
  }
}

async function removeIfPresent(path: string): Promise<void> {
  if (await exists(path)) {
    await assertSafeRecoveryPath(path)
    await remove(path)
  }
}

async function assertRegularRecoveryFile(path: string): Promise<void> {
  const metadata = await lstat(path)
  if (!metadata.isFile || metadata.isSymlink) {
    throw new Error('Workspace recovery path is not a regular file.')
  }
}

async function applyPendingRestore(layout: WorkspaceLayout, store: Store): Promise<void> {
  const pendingFileName = await store.get<string>(PENDING_RESTORE_KEY)
  if (!pendingFileName) return
  if (!isSafeSnapshotFileName(pendingFileName)) {
    await store.delete(PENDING_RESTORE_KEY)
    await store.save()
    throw new Error('Unsafe workspace restore request was rejected.')
  }

  const candidate = assertPathInsideWorkspace(
    layout.backupsPath,
    await join(layout.backupsPath, pendingFileName),
  )
  const temporary = `${layout.databasePath}.restore-tmp`
  const timestamp = compactRecoveryTimestamp(new Date())
  const previous = await join(
    layout.trashPath,
    `pre-restore-${timestamp}.workspace.db.trash-${timestamp}`,
  )
  let previousMoved = false
  const movedSidecars: Array<{ previous: string; active: string }> = []
  try {
    if (!await exists(candidate)) throw new Error('Workspace snapshot does not exist.')
    await assertSafeRecoveryPath(candidate)
    await assertRegularRecoveryFile(candidate)
    if (!await verifySqliteFile(candidate)) {
      throw new Error('Workspace snapshot verification failed.')
    }
    await removeIfPresent(temporary)
    await copyFile(candidate, temporary)
    if (!await verifySqliteFile(temporary)) throw new Error('Restored workspace verification failed.')

    if (await exists(layout.databasePath)) {
      await assertSafeRecoveryPath(layout.databasePath)
      await assertSafeRecoveryPath(previous, true)
      await rename(layout.databasePath, previous)
      previousMoved = true
    }
    for (const suffix of ['-wal', '-shm']) {
      const sidecar = `${layout.databasePath}${suffix}`
      if (await exists(sidecar)) {
        const previousSidecar = `${previous}${suffix}`
        await assertSafeRecoveryPath(sidecar)
        await assertSafeRecoveryPath(previousSidecar, true)
        await rename(sidecar, previousSidecar)
        movedSidecars.push({ previous: previousSidecar, active: sidecar })
      }
    }
    await assertSafeRecoveryPath(temporary)
    await assertSafeRecoveryPath(layout.databasePath, true)
    await rename(temporary, layout.databasePath)
    if (!await verifySqliteFile(layout.databasePath)) {
      throw new Error('Activated workspace verification failed.')
    }
    await store.delete(PENDING_RESTORE_KEY)
    await store.save()
  } catch (error) {
    await removeIfPresent(temporary)
    if (previousMoved && await exists(previous)) {
      await removeIfPresent(layout.databasePath)
      await assertSafeRecoveryPath(previous)
      await assertSafeRecoveryPath(layout.databasePath, true)
      await rename(previous, layout.databasePath)
    }
    for (const sidecar of movedSidecars) {
      if (await exists(sidecar.previous)) {
        await assertSafeRecoveryPath(sidecar.previous)
        await assertSafeRecoveryPath(sidecar.active, true)
        await rename(sidecar.previous, sidecar.active)
      }
    }
    await store.delete(PENDING_RESTORE_KEY)
    await store.save()
    throw error
  }
}

async function createVerifiedSqliteSnapshot(
  db: SqlExecutor,
  backupsPath: string,
  fileName: string,
): Promise<string> {
  if (!isSafeSnapshotFileName(fileName) && !MIGRATION_SNAPSHOT_PATTERN.test(fileName)) {
    throw new Error('Unsafe workspace snapshot name was rejected.')
  }
  const finalPath = assertPathInsideWorkspace(backupsPath, await join(backupsPath, fileName))
  const temporaryPath = `${finalPath}.tmp`
  await assertSafeRecoveryPath(finalPath, !await exists(finalPath))
  await assertSafeRecoveryPath(temporaryPath, !await exists(temporaryPath))
  await removeIfPresent(temporaryPath)
  await db.execute('PRAGMA wal_checkpoint(FULL)')
  await db.execute(`VACUUM INTO ${sqliteString(temporaryPath)}`)
  if (!await verifySqliteFile(temporaryPath)) {
    await removeIfPresent(temporaryPath)
    throw new Error('Workspace snapshot verification failed.')
  }
  await removeIfPresent(finalPath)
  await rename(temporaryPath, finalPath)
  if (!await verifySqliteFile(finalPath)) {
    throw new Error('Final workspace snapshot verification failed.')
  }
  return finalPath
}

async function databaseShape(db: SqlExecutor): Promise<{
  schemaVersion: number
  hasUserTables: boolean
}> {
  const [versionRows, tableRows] = await Promise.all([
    db.select<Array<Record<string, unknown>>>('PRAGMA user_version'),
    db.select<Array<Record<string, unknown>>>(
      "select count(*) as count from sqlite_master where type = 'table' and name not like 'sqlite_%'",
    ),
  ])
  return {
    schemaVersion: firstNumber(versionRows),
    hasUserTables: firstNumber(tableRows) > 0,
  }
}

export async function prepareStartupRecovery(): Promise<StartupRecoveryContext> {
  const { layout, store } = await resolveWorkspaceLayout()
  await applyPendingRestore(layout, store)
  configureDatabasePath(layout.databasePath)
  let db: SqlExecutor
  try {
    db = await getDb()
    await enableCrashSafeSqlite(db)
  } catch (error) {
    if (!isReadOnlyError(error) && !isDiskFullError(error)) throw error
    db = await openDatabaseReadOnly()
    activeAccessMode = 'read-only'
  }
  const integrity = await inspectWorkspaceIntegrity(db)
  if (!integrity.ok && !integrity.indexCorruption) {
    db = await openDatabaseReadOnly()
    activeAccessMode = 'read-only'
  }
  const shape = await databaseShape(db)
  const context: StartupRecoveryContext = {
    db,
    layout,
    accessMode: activeAccessMode,
    indexNeedsRebuild: integrity.indexCorruption,
    schemaVersionBefore: shape.schemaVersion,
    hasUserTables: shape.hasUserTables,
    migrationSnapshot: null,
  }
  activeContext = context
  try {
    await store.set(ACTIVE_WORKSPACE_KEY, {
      databasePath: layout.databasePath,
      checkpointVerifiedAt: Date.now(),
    } satisfies SavedWorkspaceCheckpoint)
    await store.save()
  } catch (error) {
    if (!isDiskFullError(error) && !isReadOnlyError(error)) throw error
    context.db = await openDatabaseReadOnly()
    context.accessMode = 'read-only'
    activeAccessMode = 'read-only'
  }
  if (context.accessMode === 'read-only') await assertReadOnlyRecoverySafe(context.db)
  return context
}

export async function createMigrationSnapshotIfNeeded(
  context: StartupRecoveryContext,
  now = new Date(),
): Promise<void> {
  if (context.accessMode === 'read-only'
    || !context.hasUserTables
    || context.schemaVersionBefore >= RECOVERY_SCHEMA_VERSION) return
  const fileName = `migration-${compactRecoveryTimestamp(now)}.workspace.db`
  await createVerifiedSqliteSnapshot(context.db, context.layout.backupsPath, fileName)
  context.migrationSnapshot = {
    fileName,
    createdAt: now.getTime(),
    sourceRevision: String(context.schemaVersionBefore),
  }
}

async function listWorkspaceSnapshots(layout: WorkspaceLayout): Promise<WorkspaceSnapshot[]> {
  const entries = await readDir(layout.backupsPath)
  const snapshots: WorkspaceSnapshot[] = []
  for (const entry of entries) {
    if (!entry.isFile) continue
    const parsed = parseSnapshotFileName(entry.name)
    if (!parsed) continue
    const path = assertPathInsideWorkspace(layout.backupsPath, await join(layout.backupsPath, entry.name))
    await assertSafeRecoveryPath(path)
    snapshots.push({
      fileName: entry.name,
      kind: parsed.kind,
      createdAt: parsed.createdAt,
      verified: await verifySqliteFile(path),
    })
  }
  return snapshots
}

async function createRotatingSnapshots(
  context: StartupRecoveryContext,
  now = new Date(),
): Promise<{ created: string[]; trashed: string[] }> {
  if (context.accessMode === 'read-only') return { created: [], trashed: [] }
  const created: string[] = []
  for (const generation of getSnapshotGenerations(now)) {
    const path = assertPathInsideWorkspace(
      context.layout.backupsPath,
      await join(context.layout.backupsPath, generation.fileName),
    )
    if (await exists(path)) continue
    await createVerifiedSqliteSnapshot(context.db, context.layout.backupsPath, generation.fileName)
    created.push(generation.fileName)
  }

  const snapshots = await listWorkspaceSnapshots(context.layout)
  const generations = getSnapshotGenerations(now)
  const verifiedNewKinds = generations
    .filter(generation => snapshots.some(snapshot => (
      snapshot.fileName === generation.fileName && snapshot.verified
    )))
    .map(generation => generation.kind)
  const rotation = planBackupRotation({
    snapshots,
    newSnapshotVerified: verifiedNewKinds.length > 0,
    verifiedNewKinds,
    retention: DEFAULT_BACKUP_RETENTION,
    now,
  })
  const trashed: string[] = []
  for (const snapshot of rotation.moveToTrash) {
    const source = assertPathInsideWorkspace(
      context.layout.backupsPath,
      await join(context.layout.backupsPath, snapshot.fileName),
    )
    const destination = assertPathInsideWorkspace(
      context.layout.trashPath,
      await join(context.layout.trashPath, snapshot.trashFileName),
    )
    await assertSafeRecoveryPath(source)
    await assertSafeRecoveryPath(destination, true)
    await rename(source, destination)
    trashed.push(snapshot.fileName)
  }
  return { created, trashed }
}

export async function completeStartupRecovery(context: StartupRecoveryContext): Promise<void> {
  if (context.accessMode === 'read-only') return
  const recovered = await recoverPendingCanvasAiTransactions(context.db)
  if (context.indexNeedsRebuild) {
    await repairCanvasIndexes(context.db)
    const repaired = await inspectWorkspaceIntegrity(context.db)
    if (!repaired.ok) throw new Error(`Workspace integrity repair failed: ${repaired.messages.join('; ')}`)
  }
  if (recovered.rolledBack.length > 0) {
    await rebuildCanvasIndexes(context.db)
  }
  await context.db.execute(`PRAGMA user_version = ${RECOVERY_SCHEMA_VERSION}`)
  if (context.migrationSnapshot) {
    const snapshot = context.migrationSnapshot
    await context.db.execute(
      `insert into workspace_snapshots (fileName, kind, createdAt, verifiedAt, sourceRevision)
       values ($1, 'migration', $2, $3, $4)
       on conflict(fileName) do nothing`,
      [snapshot.fileName, snapshot.createdAt, Date.now(), snapshot.sourceRevision],
    )
  }
  await createRotatingSnapshots(context)
  await probeWorkspaceWritable(context.db)
}

export async function activateReadOnlyFallback(
  context: StartupRecoveryContext,
  error: unknown,
): Promise<boolean> {
  if (!isDiskFullError(error) && !isReadOnlyError(error)) return false
  context.db = await openDatabaseReadOnly()
  context.accessMode = 'read-only'
  activeAccessMode = context.accessMode
  await assertReadOnlyRecoverySafe(context.db)
  return true
}

export function getWorkspaceAccessMode(): WorkspaceAccessMode {
  return activeAccessMode
}

export async function assertWorkspaceAttachmentWriteAllowed(
  requiredBytes: number,
  destinationDirectory: string,
): Promise<void> {
  const context = requireActiveContext()
  const availableBytes = await invoke<number>('workspace_available_bytes', {
    path: destinationDirectory,
  })
  assertAttachmentWriteAllowed({
    mode: context.accessMode,
    requiredBytes,
    availableBytes,
  })
}

function requireActiveContext(): StartupRecoveryContext {
  if (!activeContext) throw new Error('Workspace recovery has not initialized yet.')
  return activeContext
}

export async function checkWorkspaceHealth(): Promise<string> {
  const context = requireActiveContext()
  const integrity = await inspectWorkspaceIntegrity(context.db)
  if (integrity.ok) return context.accessMode === 'read-only' ? '工作区完整（只读）' : '工作区完整'
  if (integrity.indexCorruption && context.accessMode === 'read-write') {
    await repairCanvasIndexes(context.db)
    const repaired = await inspectWorkspaceIntegrity(context.db)
    if (!repaired.ok) throw new Error(`Workspace integrity repair failed: ${repaired.messages.join('; ')}`)
    return '工作区索引已重建'
  }
  throw new Error(`Workspace integrity check failed: ${integrity.messages.join('; ')}`)
}

export async function requestRestoreLatestWorkspaceSnapshot(): Promise<string> {
  const context = requireActiveContext()
  const snapshots = (await listWorkspaceSnapshots(context.layout))
    .filter(snapshot => snapshot.verified)
    .sort((left, right) => right.createdAt - left.createdAt || right.fileName.localeCompare(left.fileName))
  const latest = snapshots[0]
  if (!latest) throw new Error('没有可恢复的历史状态。')
  if (!isSafeSnapshotFileName(latest.fileName)) throw new Error('Unsafe snapshot was rejected.')
  const store = await loadRecoveryStore()
  await store.set(PENDING_RESTORE_KEY, latest.fileName)
  await store.save()
  return latest.fileName
}

export async function cleanupOldWorkspaceBackups(now = new Date()): Promise<number> {
  const context = requireActiveContext()
  if (context.accessMode === 'read-only') {
    throw new Error('Workspace is read-only; backup cleanup is disabled.')
  }
  await createRotatingSnapshots(context, now)
  const entries = await readDir(context.layout.trashPath)
  const cutoff = now.getTime() - 30 * 24 * 60 * 60 * 1_000
  let removed = 0
  for (const entry of entries) {
    if (!entry.isFile || !TRASH_FILE_PATTERN.test(entry.name)) continue
    const path = assertPathInsideWorkspace(
      context.layout.trashPath,
      await join(context.layout.trashPath, entry.name),
    )
    await assertSafeRecoveryPath(path)
    const metadata = await stat(path)
    if ((metadata.mtime?.getTime() ?? now.getTime()) >= cutoff) continue
    await remove(path)
    removed += 1
  }
  return removed
}
