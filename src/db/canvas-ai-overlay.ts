import { getDb } from './client'
import {
  createAiRelationRecord,
  createAiTagRecord,
  normalizeSemanticIdentity,
  semanticIdentityForOverlayRecord,
  type AiOverlayRecord,
  type AiOverlayState,
  type AiRelationRecord,
  type AiTagRecord,
} from '@/lib/canvas/ai-overlay'
import type { AiRelationType } from '@/lib/canvas/ai-permission'

interface AiTagRow extends AiTagRecord { createdAt: number; updatedAt: number }
interface AiRelationRow extends AiRelationRecord { createdAt: number; updatedAt: number }

export async function initCanvasAiOverlayDb() {
  const db = await getDb()
  await db.execute(`
    create table if not exists canvas_ai_tag_records (
      id text primary key,
      canvasId text not null,
      nodeId text not null,
      normalizedTagId text not null,
      label text not null,
      confidence real not null check (confidence >= 0 and confidence <= 1),
      reason text not null,
      model text not null,
      sourceRevision text not null,
      state text not null check (state in ('active', 'candidate', 'retrieval-only', 'stale', 'hidden')),
      createdAt integer not null,
      updatedAt integer not null,
      unique(canvasId, nodeId, normalizedTagId)
    )
  `)
  await db.execute(`
    create table if not exists canvas_ai_relation_records (
      id text primary key,
      canvasId text not null,
      sourceNodeId text not null,
      targetNodeId text not null,
      type text not null check (type in (
        'same_topic', 'supplement', 'time_continuation', 'plan_execution',
        'problem_solution', 'person_or_place', 'citation_or_source',
        'possible_duplicate', 'credential_ownership'
      )),
      sourceExcerpt text not null,
      targetExcerpt text not null,
      confidence real not null check (confidence >= 0 and confidence <= 1),
      reason text not null,
      model text not null,
      sourceRevision text not null,
      targetRevision text not null,
      state text not null check (state in ('active', 'candidate', 'retrieval-only', 'stale', 'hidden')),
      createdAt integer not null,
      updatedAt integer not null
    )
  `)
  await db.execute(`
    create index if not exists canvas_ai_relations_canvas_state
    on canvas_ai_relation_records(canvasId, state, updatedAt desc)
  `)
  await db.execute(`
    create table if not exists canvas_ai_overlay_suppressions (
      semanticIdentity text primary key,
      canvasId text not null,
      kind text not null check (kind in ('tag', 'relation')),
      rejectedAt integer not null
    )
  `)
}

export async function getCanvasAiOverlayRecords(canvasId: string): Promise<{
  tags: AiTagRecord[]
  relations: AiRelationRecord[]
}> {
  const db = await getDb()
  const [tags, relations] = await Promise.all([
    db.select<AiTagRow[]>(
      `select id, canvasId, nodeId, normalizedTagId, label, confidence, reason,
        model, sourceRevision, state, createdAt, updatedAt
       from canvas_ai_tag_records where canvasId = $1 and state != 'hidden'`,
      [canvasId],
    ),
    db.select<AiRelationRow[]>(
      `select id, canvasId, sourceNodeId, targetNodeId, type, sourceExcerpt,
        targetExcerpt, confidence, reason, model, sourceRevision, targetRevision,
        state, createdAt, updatedAt
       from canvas_ai_relation_records where canvasId = $1 and state != 'hidden'`,
      [canvasId],
    ),
  ])
  return { tags, relations }
}

async function isSuppressed(record: AiOverlayRecord): Promise<boolean> {
  const db = await getDb()
  const rows = await db.select<Array<{ semanticIdentity: string }>>(
    'select semanticIdentity from canvas_ai_overlay_suppressions where semanticIdentity = $1 limit 1',
    [semanticIdentityForOverlayRecord(record)],
  )
  return rows.length > 0
}

export async function upsertCanvasAiTag(input: Omit<AiTagRecord, 'state' | 'normalizedTagId'> & {
  normalizedTagId?: string
  state?: AiOverlayState
}): Promise<AiTagRecord | null> {
  const record = createAiTagRecord(input)
  if (await isSuppressed(record)) return null
  const db = await getDb()
  const now = Date.now()
  await db.execute(
    `insert into canvas_ai_tag_records (
      id, canvasId, nodeId, normalizedTagId, label, confidence, reason, model,
      sourceRevision, state, createdAt, updatedAt
    ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11)
    on conflict(canvasId, nodeId, normalizedTagId) do update set
      id = excluded.id, label = excluded.label, confidence = excluded.confidence,
      reason = excluded.reason, model = excluded.model,
      sourceRevision = excluded.sourceRevision, state = excluded.state,
      updatedAt = excluded.updatedAt`,
    [record.id, record.canvasId, record.nodeId, record.normalizedTagId, record.label,
      record.confidence, record.reason, record.model, record.sourceRevision, record.state, now],
  )
  return record
}

export async function upsertCanvasAiRelation(
  input: Omit<AiRelationRecord, 'state' | 'type'> & { type: string; state?: AiOverlayState },
): Promise<AiRelationRecord | null> {
  const record = createAiRelationRecord(input)
  if (await isSuppressed(record)) return null
  const db = await getDb()
  const now = Date.now()
  await db.execute(
    `insert into canvas_ai_relation_records (
      id, canvasId, sourceNodeId, targetNodeId, type, sourceExcerpt, targetExcerpt,
      confidence, reason, model, sourceRevision, targetRevision, state, createdAt, updatedAt
    ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $14)
    on conflict(id) do update set
      sourceNodeId = excluded.sourceNodeId, targetNodeId = excluded.targetNodeId,
      type = excluded.type, sourceExcerpt = excluded.sourceExcerpt,
      targetExcerpt = excluded.targetExcerpt, confidence = excluded.confidence,
      reason = excluded.reason, model = excluded.model,
      sourceRevision = excluded.sourceRevision, targetRevision = excluded.targetRevision,
      state = excluded.state, updatedAt = excluded.updatedAt`,
    [record.id, record.canvasId, record.sourceNodeId, record.targetNodeId, record.type,
      record.sourceExcerpt, record.targetExcerpt, record.confidence, record.reason,
      record.model, record.sourceRevision, record.targetRevision, record.state, now],
  )
  return record
}

export async function setCanvasAiOverlayRecordState(
  kind: 'tag' | 'relation',
  id: string,
  state: AiOverlayState,
) {
  const db = await getDb()
  const table = kind === 'tag' ? 'canvas_ai_tag_records' : 'canvas_ai_relation_records'
  await db.execute(`update ${table} set state = $1, updatedAt = $2 where id = $3`, [state, Date.now(), id])
}

export async function rejectCanvasAiOverlayRecord(kind: 'tag' | 'relation', id: string) {
  const db = await getDb()
  const table = kind === 'tag' ? 'canvas_ai_tag_records' : 'canvas_ai_relation_records'
  const records = kind === 'tag'
    ? await db.select<AiTagRow[]>(`select * from ${table} where id = $1 limit 1`, [id])
    : await db.select<AiRelationRow[]>(`select * from ${table} where id = $1 limit 1`, [id])
  const record = records[0]
  if (!record) return
  const semanticIdentity = semanticIdentityForOverlayRecord(record)
  const now = Date.now()
  await db.execute('BEGIN IMMEDIATE')
  try {
    await db.execute(
      `insert into canvas_ai_overlay_suppressions (semanticIdentity, canvasId, kind, rejectedAt)
       values ($1, $2, $3, $4) on conflict(semanticIdentity) do nothing`,
      [semanticIdentity, record.canvasId, kind, now],
    )
    await db.execute(`update ${table} set state = 'hidden', updatedAt = $1 where id = $2`, [now, id])
    await db.execute('COMMIT')
  } catch (error) {
    try { await db.execute('ROLLBACK') } catch { /* no active transaction */ }
    throw error
  }
}

export async function markCanvasOverlayStale(
  canvasId: string,
  nodeId?: string,
  currentRevision?: string,
) {
  const db = await getDb()
  const now = Date.now()
  if (!nodeId) {
    await db.execute(
      `update canvas_ai_tag_records set state = 'stale', updatedAt = $1
       where canvasId = $2 and state != 'hidden'`,
      [now, canvasId],
    )
    await db.execute(
      `update canvas_ai_relation_records set state = 'stale', updatedAt = $1
       where canvasId = $2 and state != 'hidden'`,
      [now, canvasId],
    )
    return
  }
  await db.execute(
    `update canvas_ai_tag_records set state = 'stale', updatedAt = $1
     where canvasId = $2 and nodeId = $3 and state != 'hidden'
       and ($4 is null or sourceRevision != $4)`,
    [now, canvasId, nodeId, currentRevision ?? null],
  )
  await db.execute(
    `update canvas_ai_relation_records set state = 'stale', updatedAt = $1
     where canvasId = $2 and (sourceNodeId = $3 or targetNodeId = $3) and state != 'hidden'
       and ($4 is null or sourceRevision != $4 or targetRevision != $4)`,
    [now, canvasId, nodeId, currentRevision ?? null],
  )
}

export function relationSuppressionIdentity(input: {
  canvasId: string
  sourceNodeId: string
  targetNodeId: string
  type: AiRelationType
}) {
  return normalizeSemanticIdentity({ kind: 'relation', ...input })
}
