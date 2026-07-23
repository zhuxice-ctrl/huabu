import { BaseDirectory, exists, mkdir, readFile, writeFile } from '@tauri-apps/plugin-fs'
import { Store } from '@tauri-apps/plugin-store'
import emitter from '@/lib/emitter'
import {
  deleteRemoteFile,
  downloadRemoteBytes,
  getRemoteContentType,
  remoteFileExists,
  uploadRemoteBytes,
} from './remote-library'

type RecordAssetMark = {
  type: 'scan' | 'text' | 'image' | 'link' | 'file' | 'recording' | 'todo'
  url: string
}

const HTTP_URL_PATTERN = /^https?:\/\//i
const RECORD_ASSET_REMOTE_DIR = '.data/assets/records'
const PENDING_RECORD_ASSET_DELETIONS_KEY = 'pendingRecordAssetRemoteDeletions'

function normalizeStoredPath(path: string): string {
  return path.replace(/^[/\\]+/, '').replace(/\\/g, '/')
}

function getStoredFileName(path: string): string {
  const normalizedPath = normalizeStoredPath(path)
  const segments = normalizedPath.split('/')
  return segments[segments.length - 1] || ''
}

export function getMarkLocalAssetPath(mark: RecordAssetMark): string | null {
  if (!mark.url || HTTP_URL_PATTERN.test(mark.url)) return null

  if (mark.type === 'scan') {
    const fileName = getStoredFileName(mark.url)
    return fileName ? `screenshot/${fileName}` : null
  }

  if (mark.type === 'image') {
    const fileName = getStoredFileName(mark.url)
    return fileName ? `image/${fileName}` : null
  }

  if (mark.type === 'recording') {
    return normalizeStoredPath(mark.url) || null
  }

  return null
}

function getRemoteAssetPath(localPath: string): string {
  return `${RECORD_ASSET_REMOTE_DIR}/${normalizeStoredPath(localPath)}`
}

async function ensureLocalAssetDirectory(localPath: string) {
  const directory = localPath.split('/').slice(0, -1).join('/')
  if (directory && !await exists(directory, { baseDir: BaseDirectory.AppData })) {
    await mkdir(directory, { baseDir: BaseDirectory.AppData, recursive: true })
  }
}

export async function queueRecordAssetRemoteDeletions(marks: RecordAssetMark[]) {
  const paths = marks
    .map(getMarkLocalAssetPath)
    .filter((path): path is string => Boolean(path))
    .map(getRemoteAssetPath)
  if (paths.length === 0) return

  const store = await Store.load('store.json')
  const pending = await store.get<string[]>(PENDING_RECORD_ASSET_DELETIONS_KEY) || []
  await store.set(PENDING_RECORD_ASSET_DELETIONS_KEY, Array.from(new Set([...pending, ...paths])))
  await store.save()
}

async function flushPendingRecordAssetRemoteDeletions() {
  const store = await Store.load('store.json')
  const pending = await store.get<string[]>(PENDING_RECORD_ASSET_DELETIONS_KEY) || []
  if (pending.length === 0) return

  const remaining = [...pending]
  for (const path of pending) {
    await deleteRemoteFile(path)
    remaining.shift()
    await store.set(PENDING_RECORD_ASSET_DELETIONS_KEY, remaining)
    await store.save()
  }
}

export async function uploadRecordAssets(marks: RecordAssetMark[]) {
  await flushPendingRecordAssetRemoteDeletions()

  const localPaths = Array.from(new Set(
    marks.map(getMarkLocalAssetPath).filter((path): path is string => Boolean(path))
  ))

  for (const localPath of localPaths) {
    if (!await exists(localPath, { baseDir: BaseDirectory.AppData })) continue
    const remotePath = getRemoteAssetPath(localPath)
    if (await remoteFileExists(remotePath)) continue

    const content = await readFile(localPath, { baseDir: BaseDirectory.AppData })
    await uploadRemoteBytes(
      remotePath,
      content,
      `Upload record asset: ${localPath}`,
      getRemoteContentType(localPath)
    )
  }
}

export async function downloadRecordAssets(marks: RecordAssetMark[]) {
  const localPaths = Array.from(new Set(
    marks.map(getMarkLocalAssetPath).filter((path): path is string => Boolean(path))
  ))

  const downloadedPaths: string[] = []

  for (const localPath of localPaths) {
    if (await exists(localPath, { baseDir: BaseDirectory.AppData })) continue
    const remotePath = getRemoteAssetPath(localPath)
    if (!await remoteFileExists(remotePath)) continue

    const content = await downloadRemoteBytes(remotePath)
    await ensureLocalAssetDirectory(localPath)
    await writeFile(localPath, content, { baseDir: BaseDirectory.AppData })
    downloadedPaths.push(localPath)
  }

  if (downloadedPaths.length > 0) {
    emitter.emit('record-assets-downloaded', { paths: downloadedPaths })
  }
}
