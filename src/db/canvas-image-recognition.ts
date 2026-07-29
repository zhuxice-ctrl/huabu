import { getDb } from './client'
import type {
  CanvasImageRecognitionIdentity,
  CanvasImageRecognitionStatus,
} from '@/lib/canvas/canvas-image-recognition'

export interface CanvasImageRecognitionRecord extends CanvasImageRecognitionIdentity {
  cacheKey: string
  ocrText: string
  visionDescription: string
  status: CanvasImageRecognitionStatus
  errorCode: string | null
  createdAt: number
  updatedAt: number
}

export type CanvasImageRecognitionWrite = Omit<
  CanvasImageRecognitionRecord,
  'createdAt' | 'updatedAt'
>

export async function initCanvasImageRecognitionDb() {
  const db = await getDb()
  await db.execute(`
    create table if not exists canvas_image_recognition (
      cacheKey text primary key,
      canvasId text not null,
      nodeId text not null,
      contentRevision text not null,
      imageHash text not null,
      modelKey text not null,
      ocrText text not null default '',
      visionDescription text not null default '',
      status text not null check (status in ('pending', 'running', 'recognized', 'ocr-only', 'failed')),
      errorCode text default null,
      createdAt integer not null,
      updatedAt integer not null
    )
  `)
  await db.execute(`
    create index if not exists canvas_image_recognition_node_revision
    on canvas_image_recognition(canvasId, nodeId, contentRevision, updatedAt)
  `)
}

export async function getCanvasImageRecognition(input: string | {
  canvasId: string
  nodeId: string
  contentRevision: string
}) {
  const db = await getDb()
  const rows = typeof input === 'string'
    ? await db.select<CanvasImageRecognitionRecord[]>(
        'select * from canvas_image_recognition where cacheKey = $1 limit 1',
        [input],
      )
    : await db.select<CanvasImageRecognitionRecord[]>(
        `select * from canvas_image_recognition
         where canvasId = $1 and nodeId = $2 and contentRevision = $3
           and status in ('recognized', 'ocr-only')
         order by updatedAt desc limit 1`,
        [input.canvasId, input.nodeId, input.contentRevision],
      )
  return rows[0] ?? null
}

export async function upsertCanvasImageRecognition(input: CanvasImageRecognitionWrite) {
  const db = await getDb()
  const now = Date.now()
  await db.execute(
    `insert into canvas_image_recognition (
      cacheKey, canvasId, nodeId, contentRevision, imageHash, modelKey,
      ocrText, visionDescription, status, errorCode, createdAt, updatedAt
    ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11)
    on conflict(cacheKey) do update set
      canvasId = excluded.canvasId,
      nodeId = excluded.nodeId,
      contentRevision = excluded.contentRevision,
      imageHash = excluded.imageHash,
      modelKey = excluded.modelKey,
      ocrText = excluded.ocrText,
      visionDescription = excluded.visionDescription,
      status = excluded.status,
      errorCode = excluded.errorCode,
      updatedAt = excluded.updatedAt`,
    [
      input.cacheKey, input.canvasId, input.nodeId, input.contentRevision,
      input.imageHash, input.modelKey, input.ocrText, input.visionDescription,
      input.status, input.errorCode, now,
    ],
  )
}

export async function deleteStaleCanvasImageRecognition(
  canvasId: string,
  nodeId: string,
  contentRevision: string,
) {
  const db = await getDb()
  await db.execute(
    `delete from canvas_image_recognition
     where canvasId = $1 and nodeId = $2 and contentRevision <> $3`,
    [canvasId, nodeId, contentRevision],
  )
}
