import assert from 'node:assert/strict'
import test from 'node:test'

import {
  DEFAULT_BACKUP_RETENTION,
  compactRecoveryTimestamp,
  getSnapshotGenerations,
  isSafeSnapshotFileName,
  planBackupRotation,
} from '../../src/lib/recovery/backup-policy.ts'
import {
  assertPathInsideWorkspace,
  selectWorkspaceLayout,
} from '../../src/lib/recovery/workspace-path.ts'

const snapshots = [
  { fileName: 'daily-2026-07-28.workspace.db', kind: 'daily', createdAt: Date.UTC(2026, 6, 28), verified: true },
  { fileName: 'daily-2026-07-27.workspace.db', kind: 'daily', createdAt: Date.UTC(2026, 6, 27), verified: true },
  { fileName: 'daily-2026-07-26.workspace.db', kind: 'daily', createdAt: Date.UTC(2026, 6, 26), verified: true },
  { fileName: 'weekly-2026-07-27.workspace.db', kind: 'weekly', createdAt: Date.UTC(2026, 6, 27), verified: true },
  { fileName: 'weekly-2026-07-20.workspace.db', kind: 'weekly', createdAt: Date.UTC(2026, 6, 20), verified: true },
]

test('new Windows installs use Documents for durable state and LocalAppData for ephemeral state', () => {
  const layout = selectWorkspaceLayout({
    documentsDir: 'C:\\Users\\Example\\Documents',
    localAppDataDir: 'C:\\Users\\Example\\AppData\\Local',
    appConfigDir: 'C:\\Users\\Example\\AppData\\Roaming\\com.codexu.NoteGen',
    legacyDatabaseExists: false,
  })

  assert.equal(layout.source, 'new-install')
  assert.equal(layout.databasePath, 'C:\\Users\\Example\\Documents\\zeroxB\\workspace.db')
  assert.deepEqual(layout.durableDirectories, [
    'C:\\Users\\Example\\Documents\\zeroxB\\assets',
    'C:\\Users\\Example\\Documents\\zeroxB\\notes',
    'C:\\Users\\Example\\Documents\\zeroxB\\thumbnails',
    'C:\\Users\\Example\\Documents\\zeroxB\\backups',
  ])
  assert.deepEqual(layout.localDirectories, [
    'C:\\Users\\Example\\AppData\\Local\\zeroxB\\config',
    'C:\\Users\\Example\\AppData\\Local\\zeroxB\\logs',
    'C:\\Users\\Example\\AppData\\Local\\zeroxB\\cache',
  ])
})

test('existing installs retain their database until a verified checkpointed migration is recorded', () => {
  const input = {
    documentsDir: 'D:\\Documents',
    localAppDataDir: 'C:\\Local',
    appConfigDir: 'C:\\Legacy',
    legacyDatabaseExists: true,
  }
  assert.equal(selectWorkspaceLayout(input).databasePath, 'C:\\Legacy\\note.db')
  assert.equal(selectWorkspaceLayout({
    ...input,
    savedWorkspace: { databasePath: 'E:\\Unverified\\workspace.db' },
  }).databasePath, 'C:\\Legacy\\note.db')
  assert.equal(selectWorkspaceLayout({
    ...input,
    savedWorkspace: {
      databasePath: 'E:\\Existing\\note.db',
      checkpointVerifiedAt: 123,
    },
  }).databasePath, 'E:\\Existing\\note.db')
})

test('daily and weekly generations are deterministic and rotation waits for a verified new snapshot', () => {
  const now = new Date('2026-07-28T13:40:00.000Z')
  assert.deepEqual(getSnapshotGenerations(now).map(item => item.fileName), [
    'daily-2026-07-28.workspace.db',
    'weekly-2026-07-27.workspace.db',
  ])

  const blocked = planBackupRotation({
    snapshots,
    newSnapshotVerified: false,
    retention: { daily: 2, weekly: 1 },
  })
  assert.deepEqual(blocked.moveToTrash, [])

  const verified = planBackupRotation({
    snapshots,
    newSnapshotVerified: true,
    retention: { daily: 2, weekly: 1 },
    now,
  })
  assert.deepEqual(verified.keep.map(item => item.fileName), [
    'daily-2026-07-28.workspace.db',
    'daily-2026-07-27.workspace.db',
    'weekly-2026-07-27.workspace.db',
  ])
  assert.deepEqual(verified.moveToTrash.map(item => item.trashFileName), [
    'daily-2026-07-26.workspace.db.trash-20260728T134000Z',
    'weekly-2026-07-20.workspace.db.trash-20260728T134000Z',
  ])
  assert.deepEqual(DEFAULT_BACKUP_RETENTION, { daily: 7, weekly: 4 })
})

test('recovery timestamps always omit milliseconds', () => {
  assert.equal(
    compactRecoveryTimestamp(new Date('2026-07-28T10:11:12.345Z')),
    '20260728T101112Z',
  )
})

test('verification gates rotation independently by generation and corrupt files consume no retention slot', () => {
  const now = new Date('2026-07-28T13:40:00.000Z')
  const result = planBackupRotation({
    snapshots: [
      ...snapshots,
      { fileName: 'daily-2026-07-29.workspace.db', kind: 'daily', createdAt: Date.UTC(2026, 6, 29), verified: false },
    ],
    newSnapshotVerified: true,
    verifiedNewKinds: ['daily'],
    retention: { daily: 1, weekly: 1 },
    now,
  })
  assert.deepEqual(result.keep.map(item => item.fileName), [
    'daily-2026-07-29.workspace.db',
    'daily-2026-07-28.workspace.db',
    'weekly-2026-07-27.workspace.db',
    'weekly-2026-07-20.workspace.db',
  ])
  assert.deepEqual(result.moveToTrash.map(item => item.fileName), [
    'daily-2026-07-27.workspace.db',
    'daily-2026-07-26.workspace.db',
  ])
})

test('snapshot names and restore paths reject traversal', () => {
  assert.equal(isSafeSnapshotFileName('daily-2026-07-28.workspace.db'), true)
  assert.equal(isSafeSnapshotFileName('..\\daily-2026-07-28.workspace.db'), false)
  assert.equal(isSafeSnapshotFileName('daily-2026-07-28.workspace.db-wal'), false)
  assert.equal(
    assertPathInsideWorkspace('C:\\Workspace\\backups', 'C:\\Workspace\\backups\\daily-2026-07-28.workspace.db'),
    'C:\\Workspace\\backups\\daily-2026-07-28.workspace.db',
  )
  assert.throws(
    () => assertPathInsideWorkspace('C:\\Workspace\\backups', 'C:\\Workspace\\backups-old\\stolen.db'),
    /outside workspace/i,
  )
  assert.throws(
    () => assertPathInsideWorkspace('C:\\Workspace\\backups', 'C:\\Workspace\\backups\\..\\workspace.db'),
    /outside workspace/i,
  )
})
