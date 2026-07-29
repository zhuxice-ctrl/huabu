import { readFile } from '@tauri-apps/plugin-fs'
import { create } from 'zustand'
import {
  deleteStaleCanvasImageRecognition,
  getCanvasImageRecognition,
  upsertCanvasImageRecognition,
} from '@/db/canvas-image-recognition'
import { enqueueCanvasIndexJobDrafts } from '@/db/canvas-index'
import {
  imageRecognitionCacheKey,
  planCanvasImageRecognition,
  type CanvasImageRecognitionStatus,
} from '@/lib/canvas/canvas-image-recognition'
import { recognizeImageWithFallback } from '@/lib/image-recognition'
import { getFilePathOptions } from '@/lib/workspace'
import useSettingStore from '@/stores/setting'
import type { CanvasNode } from '@/types/canvas'

export interface CanvasImageRecognitionInput {
  canvasId: string
  node: CanvasNode
  contentRevision: string
}

export const useCanvasImageRecognitionStore = create<{
  statuses: Record<string, CanvasImageRecognitionStatus>
}>(() => ({ statuses: {} }))

function statusKey(canvasId: string, nodeId: string) {
  return `${canvasId}:${nodeId}`
}

function publishCanvasImageRecognitionStatus(
  canvasId: string,
  nodeId: string,
  status: CanvasImageRecognitionStatus,
) {
  useCanvasImageRecognitionStore.setState(state => ({
    statuses: { ...state.statuses, [statusKey(canvasId, nodeId)]: status },
  }))
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return `data:${blob.type || 'image/png'};base64,${btoa(binary)}`
}

let workerChain = Promise.resolve()
const queued = new Set<string>()

function redactRecognitionError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  if (/timeout|超时/i.test(message)) return 'timeout'
  if (/model|模型/i.test(message)) return 'model-unavailable'
  if (/file|path|文件|路径/i.test(message)) return 'image-unavailable'
  return 'recognition-failed'
}

async function publishCanvasImageRecognitionFailure(
  input: CanvasImageRecognitionInput,
  errorCode: string,
) {
  await upsertCanvasImageRecognition({
    cacheKey: imageRecognitionCacheKey({
      canvasId: input.canvasId,
      nodeId: input.node.id,
      contentRevision: input.contentRevision,
      imageHash: '',
      modelKey: 'unavailable',
    }),
    canvasId: input.canvasId,
    nodeId: input.node.id,
    contentRevision: input.contentRevision,
    imageHash: '',
    modelKey: 'unavailable',
    ocrText: '',
    visionDescription: '',
    status: 'failed',
    errorCode,
  })
  publishCanvasImageRecognitionStatus(input.canvasId, input.node.id, 'failed')
}

async function recognizeCanvasImage(
  input: CanvasImageRecognitionInput,
  options: { force: boolean },
) {
  const imagePath = input.node.data.imagePath
  if (typeof imagePath !== 'string' || !imagePath) throw new Error('image path unavailable')
  const resolved = await getFilePathOptions(imagePath)
  const bytes = await readFile(
    resolved.path,
    resolved.baseDir === undefined ? undefined : { baseDir: resolved.baseDir },
  )
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  const imageHash = Array.from(
    new Uint8Array(digest),
    byte => byte.toString(16).padStart(2, '0'),
  ).join('')
  const { enableImageRecognition, imageMethodModel } = useSettingStore.getState()
  const policy = planCanvasImageRecognition({
    enabled: enableImageRecognition,
    sensitive: input.node.data.sensitive === true,
    modelConfigured: Boolean(imageMethodModel),
    explicitRequest: false,
    confirmed: false,
  })
  if (!policy.runOcr && !policy.runVision) return
  const modelKey = policy.runVision ? imageMethodModel : 'local-ocr'
  const cacheKey = imageRecognitionCacheKey({
    canvasId: input.canvasId,
    nodeId: input.node.id,
    contentRevision: input.contentRevision,
    imageHash,
    modelKey,
  })
  await deleteStaleCanvasImageRecognition(input.canvasId, input.node.id, input.contentRevision)
  const cached = options.force ? null : await getCanvasImageRecognition(cacheKey)
  if (cached) {
    publishCanvasImageRecognitionStatus(input.canvasId, input.node.id, cached.status)
    return
  }
  publishCanvasImageRecognitionStatus(input.canvasId, input.node.id, 'running')
  const blob = new Blob([bytes])
  const imageData = policy.runVision ? await blobToDataUrl(blob) : null
  const result = await recognizeImageWithFallback({ imagePath: resolved.path, base64: imageData })
  const status: CanvasImageRecognitionStatus = result.visionDescription
    ? 'recognized'
    : result.ocrText
      ? 'ocr-only'
      : 'failed'
  await upsertCanvasImageRecognition({
    cacheKey,
    canvasId: input.canvasId,
    nodeId: input.node.id,
    contentRevision: input.contentRevision,
    imageHash,
    modelKey,
    ocrText: result.ocrText,
    visionDescription: result.visionDescription,
    status,
    errorCode: status === 'failed' ? 'recognition-empty' : null,
  })
  publishCanvasImageRecognitionStatus(input.canvasId, input.node.id, status)
  await enqueueCanvasIndexJobDrafts(input.canvasId, [{
    nodeId: input.node.id,
    contentRevision: input.contentRevision,
    operation: 'upsert',
  }])
}

export function enqueueCanvasImageRecognition(
  input: CanvasImageRecognitionInput,
  options = { force: false },
) {
  const queueKey = `${input.canvasId}:${input.node.id}:${input.contentRevision}`
  if (queued.has(queueKey) && !options.force) return workerChain
  queued.add(queueKey)
  workerChain = workerChain
    .then(() => recognizeCanvasImage(input, options))
    .catch(error => publishCanvasImageRecognitionFailure(input, redactRecognitionError(error)))
    .finally(() => queued.delete(queueKey))
  return workerChain
}
