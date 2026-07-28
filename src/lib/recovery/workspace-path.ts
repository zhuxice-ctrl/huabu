export interface SavedWorkspaceCheckpoint {
  databasePath: string
  checkpointVerifiedAt?: number
}

export interface WorkspaceLayout {
  source: 'new-install' | 'legacy-install' | 'saved-workspace'
  root: string
  databasePath: string
  assetsPath: string
  notesPath: string
  thumbnailsPath: string
  backupsPath: string
  trashPath: string
  configPath: string
  logsPath: string
  cachePath: string
  durableDirectories: string[]
  localDirectories: string[]
}

function pathSeparator(...paths: string[]): '\\' | '/' {
  return paths.some(path => path.includes('\\')) ? '\\' : '/'
}

function trimTrailingSeparators(path: string): string {
  if (/^[A-Za-z]:[\\/]$/.test(path)) return path
  return path.replace(/[\\/]+$/, '')
}

export function joinWorkspacePath(...parts: string[]): string {
  const separator = pathSeparator(...parts)
  const filtered = parts.filter(Boolean)
  if (filtered.length === 0) return ''
  return filtered
    .map((part, index) => index === 0
      ? trimTrailingSeparators(part)
      : part.replace(/^[\\/]+|[\\/]+$/g, ''))
    .filter(Boolean)
    .join(separator)
}

function parentDirectory(path: string): string {
  const normalized = trimTrailingSeparators(path)
  const index = Math.max(normalized.lastIndexOf('\\'), normalized.lastIndexOf('/'))
  return index > 0 ? normalized.slice(0, index) : normalized
}

function normalizeForContainment(path: string): string {
  const separator = pathSeparator(path)
  const drive = /^[A-Za-z]:/.exec(path)?.[0].toLowerCase() ?? ''
  const rooted = /^[\\/]/.test(path.slice(drive.length))
  const segments: string[] = []
  for (const segment of path.slice(drive.length).split(/[\\/]+/)) {
    if (!segment || segment === '.') continue
    if (segment === '..') segments.pop()
    else segments.push(segment)
  }
  return `${drive}${rooted ? separator : ''}${segments.join(separator)}`.toLowerCase()
}

export function assertPathInsideWorkspace(root: string, candidate: string): string {
  const normalizedRoot = trimTrailingSeparators(normalizeForContainment(root))
  const normalizedCandidate = trimTrailingSeparators(normalizeForContainment(candidate))
  const separator = pathSeparator(normalizedRoot, normalizedCandidate)
  if (normalizedCandidate !== normalizedRoot
    && !normalizedCandidate.startsWith(`${normalizedRoot}${separator}`)) {
    throw new Error('Path is outside workspace recovery root.')
  }
  return candidate
}

export function selectWorkspaceLayout(input: {
  documentsDir: string
  localAppDataDir: string
  appConfigDir: string
  legacyDatabaseExists: boolean
  savedWorkspace?: SavedWorkspaceCheckpoint | null
}): WorkspaceLayout {
  const checkpointVerified = Number.isFinite(input.savedWorkspace?.checkpointVerifiedAt)
    && Number(input.savedWorkspace?.checkpointVerifiedAt) > 0
  const savedPath = checkpointVerified ? input.savedWorkspace?.databasePath?.trim() : ''
  const source = savedPath
    ? 'saved-workspace'
    : input.legacyDatabaseExists
      ? 'legacy-install'
      : 'new-install'
  const databasePath = savedPath
    || (input.legacyDatabaseExists
      ? joinWorkspacePath(input.appConfigDir, 'note.db')
      : joinWorkspacePath(input.documentsDir, 'zeroxB', 'workspace.db'))
  const root = parentDirectory(databasePath)
  const assetsPath = joinWorkspacePath(root, 'assets')
  const notesPath = joinWorkspacePath(root, 'notes')
  const thumbnailsPath = joinWorkspacePath(root, 'thumbnails')
  const backupsPath = joinWorkspacePath(root, 'backups')
  const trashPath = joinWorkspacePath(backupsPath, 'trash')
  const localRoot = joinWorkspacePath(input.localAppDataDir, 'zeroxB')
  const configPath = joinWorkspacePath(localRoot, 'config')
  const logsPath = joinWorkspacePath(localRoot, 'logs')
  const cachePath = joinWorkspacePath(localRoot, 'cache')

  return {
    source,
    root,
    databasePath,
    assetsPath,
    notesPath,
    thumbnailsPath,
    backupsPath,
    trashPath,
    configPath,
    logsPath,
    cachePath,
    durableDirectories: [assetsPath, notesPath, thumbnailsPath, backupsPath],
    localDirectories: [configPath, logsPath, cachePath],
  }
}
