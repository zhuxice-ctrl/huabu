export type BackupGeneration = 'daily' | 'weekly'

export interface WorkspaceSnapshot {
  fileName: string
  kind: BackupGeneration
  createdAt: number
  verified: boolean
}

export interface BackupRetention {
  daily: number
  weekly: number
}

export const DEFAULT_BACKUP_RETENTION: Readonly<BackupRetention> = Object.freeze({
  daily: 7,
  weekly: 4,
})

const SNAPSHOT_FILE_PATTERN = /^(daily|weekly)-(\d{4}-\d{2}-\d{2})\.workspace\.db$/

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function weeklyDate(date: Date): Date {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const daysSinceMonday = (start.getUTCDay() + 6) % 7
  start.setUTCDate(start.getUTCDate() - daysSinceMonday)
  return start
}

export function getSnapshotGenerations(now = new Date()): Array<{
  kind: BackupGeneration
  key: string
  fileName: string
}> {
  const dailyKey = dayKey(now)
  const weeklyKey = dayKey(weeklyDate(now))
  return [
    { kind: 'daily', key: dailyKey, fileName: `daily-${dailyKey}.workspace.db` },
    { kind: 'weekly', key: weeklyKey, fileName: `weekly-${weeklyKey}.workspace.db` },
  ]
}

export function isSafeSnapshotFileName(fileName: string): boolean {
  return SNAPSHOT_FILE_PATTERN.test(fileName)
}

export function parseSnapshotFileName(fileName: string): {
  kind: BackupGeneration
  createdAt: number
} | null {
  const match = SNAPSHOT_FILE_PATTERN.exec(fileName)
  if (!match) return null
  const createdAt = Date.parse(`${match[2]}T00:00:00.000Z`)
  if (!Number.isFinite(createdAt)) return null
  return { kind: match[1] as BackupGeneration, createdAt }
}

function descendingSnapshotOrder(left: WorkspaceSnapshot, right: WorkspaceSnapshot): number {
  if (left.createdAt !== right.createdAt) return right.createdAt - left.createdAt
  return left.fileName < right.fileName ? -1 : left.fileName > right.fileName ? 1 : 0
}

function trashTimestamp(now: Date): string {
  return now.toISOString().replace(/[-:]/g, '').replace('.000', '')
}

export function planBackupRotation(input: {
  snapshots: WorkspaceSnapshot[]
  newSnapshotVerified: boolean
  verifiedNewKinds?: BackupGeneration[]
  retention?: BackupRetention
  now?: Date
}): {
  keep: WorkspaceSnapshot[]
  moveToTrash: Array<WorkspaceSnapshot & { trashFileName: string }>
} {
  const retention = input.retention ?? DEFAULT_BACKUP_RETENTION
  const verifiedNewKinds = new Set(
    input.verifiedNewKinds
      ?? (input.newSnapshotVerified ? ['daily', 'weekly'] as const : []),
  )
  if (verifiedNewKinds.size === 0) {
    return { keep: [...input.snapshots].sort(descendingSnapshotOrder), moveToTrash: [] }
  }

  const keep = new Set<WorkspaceSnapshot>()
  const moveToTrash: WorkspaceSnapshot[] = []
  for (const kind of ['daily', 'weekly'] as const) {
    const snapshots = input.snapshots
      .filter(snapshot => snapshot.kind === kind)
      .sort(descendingSnapshotOrder)
    if (!verifiedNewKinds.has(kind)) {
      snapshots.forEach(snapshot => keep.add(snapshot))
      continue
    }
    const limit = Math.max(0, Math.trunc(retention[kind]))
    snapshots.filter(snapshot => !snapshot.verified).forEach(snapshot => keep.add(snapshot))
    snapshots.filter(snapshot => snapshot.verified).forEach((snapshot, index) => {
      if (index < limit) keep.add(snapshot)
      else moveToTrash.push(snapshot)
    })
  }

  const suffix = trashTimestamp(input.now ?? new Date())
  return {
    keep: [...keep].sort((left, right) => {
      if (left.kind !== right.kind) return left.kind === 'daily' ? -1 : 1
      return descendingSnapshotOrder(left, right)
    }),
    moveToTrash: moveToTrash
      .sort((left, right) => {
        if (left.kind !== right.kind) return left.kind === 'daily' ? -1 : 1
        return descendingSnapshotOrder(left, right)
      })
      .map(snapshot => ({
        ...snapshot,
        trashFileName: `${snapshot.fileName}.trash-${suffix}`,
      })),
  }
}
