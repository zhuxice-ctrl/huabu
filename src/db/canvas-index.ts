import { getDb } from './client'
import { createStatementRecorder, executeNativeSqliteTransaction } from './native-transaction'
import {
  canvasNodeContentRevision,
  buildLocalCanvasIndexFeatures,
  extractCanvasNodeIndexText,
  planCanvasIndexDelete,
  planCanvasIndexRebuild,
  retryDelayMs,
  type CandidateQuery,
  type CanvasIndexCandidate,
  type CanvasIndexJob,
  type CanvasIndexJobDraft,
} from '@/lib/canvas/canvas-index-jobs'
import {
  extractCanvasKnowledgeAnchors,
  extractKnowledgeEntities,
  extractKnowledgeTimeHints,
  type CanvasKnowledgeAnchor,
} from '@/lib/canvas/knowledge-extraction'
import { getCanvasImageRecognition } from './canvas-image-recognition'
import { recognitionKnowledgeParts } from '@/lib/canvas/canvas-image-recognition'
import { DEFAULT_CANVAS_DOCUMENT, normalizeCanvasDocument, type CanvasDocument } from '@/types/canvas'

interface SqlExecutor {
  execute(query: string, bindValues?: unknown[]): Promise<unknown>
  select<T>(query: string, bindValues?: unknown[]): Promise<T>
}

interface CanvasIndexAnchorRow {
  canvasId: string
  nodeId: string
  contentRevision: string
  content: string
  entities: string
  timeTerms: string
  embedding: string | null
}

interface CanvasKnowledgeAnchorRow {
  id: string
  workspaceId: string
  canvasId: string
  nodeId: string
  attachmentId: string | null
  startOffset: number
  endOffset: number
  nodeX: number
  nodeY: number
  contentRevision: string
  plainText: string
  entities: string
  timeHints: string
  contentType: string
  userMarkedSensitive: number
}

export async function initCanvasIndexDb() {
  const db = await getDb()
  await db.execute(`
    create table if not exists canvas_index_jobs (
      id text primary key,
      canvasId text not null,
      nodeId text not null,
      contentRevision text not null,
      operation text not null check (operation in ('upsert', 'delete', 'rebuild')),
      state text not null check (state in ('pending', 'running', 'retry', 'complete')),
      attempts integer not null default 0,
      nextAttemptAt integer not null,
      lastError text default null,
      createdAt integer not null,
      updatedAt integer not null,
      unique (canvasId, nodeId, contentRevision, operation)
    )
  `)
  await db.execute(`
    create index if not exists canvas_index_jobs_ready
    on canvas_index_jobs(state, nextAttemptAt, createdAt)
  `)
  await db.execute(`
    create table if not exists canvas_index_anchors (
      canvasId text not null,
      nodeId text not null,
      contentRevision text not null,
      content text not null,
      entities text not null default '[]',
      timeTerms text not null default '[]',
      updatedAt integer not null,
      primary key (canvasId, nodeId)
    )
  `)
  await db.execute(`
    create table if not exists canvas_index_embeddings (
      canvasId text not null,
      nodeId text not null,
      contentRevision text not null,
      embedding text not null,
      model text not null,
      updatedAt integer not null,
      primary key (canvasId, nodeId, model)
    )
  `)
  await db.execute(`
    create table if not exists canvas_knowledge_anchors (
      id text primary key,
      workspaceId text not null,
      canvasId text not null,
      nodeId text not null,
      attachmentId text default null,
      startOffset integer not null,
      endOffset integer not null,
      nodeX real not null,
      nodeY real not null,
      contentRevision text not null,
      plainText text not null,
      entities text not null default '[]',
      timeHints text not null default '[]',
      contentType text not null,
      userMarkedSensitive integer not null default 0
    )
  `)
  await db.execute(`
    create index if not exists canvas_knowledge_anchors_canvas_recall
    on canvas_knowledge_anchors(canvasId, nodeId, contentRevision, startOffset)
  `)
}

function jobId(canvasId: string, draft: CanvasIndexJobDraft): string {
  return `${encodeURIComponent(canvasId)}:${encodeURIComponent(draft.nodeId)}:${draft.contentRevision}:${draft.operation}`
}

export async function enqueueCanvasIndexJobDrafts(
  canvasId: string,
  drafts: CanvasIndexJobDraft[],
  executor?: SqlExecutor,
) {
  if (drafts.length === 0) return
  const db = executor ?? await getDb()
  const now = Date.now()
  for (const draft of drafts) {
    await db.execute(
      `insert into canvas_index_jobs (
        id, canvasId, nodeId, contentRevision, operation, state,
        attempts, nextAttemptAt, createdAt, updatedAt
      ) values ($1, $2, $3, $4, $5, 'pending', 0, $6, $6, $6)
      on conflict(canvasId, nodeId, contentRevision, operation) do update set
        state = case when canvas_index_jobs.state = 'running' then 'running' else 'pending' end,
        attempts = case when canvas_index_jobs.state = 'running' then canvas_index_jobs.attempts else 0 end,
        nextAttemptAt = case when canvas_index_jobs.state = 'running'
          then canvas_index_jobs.nextAttemptAt else excluded.nextAttemptAt end,
        lastError = case when canvas_index_jobs.state = 'running' then canvas_index_jobs.lastError else null end,
        updatedAt = excluded.updatedAt`,
      [jobId(canvasId, draft), canvasId, draft.nodeId, draft.contentRevision, draft.operation, now],
    )
  }
}

export async function enqueueCanvasDeleteTombstones(
  canvasId: string,
  document: CanvasDocument,
  executor?: SqlExecutor,
) {
  await enqueueCanvasIndexJobDrafts(canvasId, document.nodes.map(node => ({
    nodeId: node.id,
    contentRevision: canvasNodeContentRevision(node),
    operation: 'delete' as const,
  })), executor)
}

export async function queueCanvasIndexRebuild(canvasId: string) {
  const db = await getDb()
  const rows = await db.select<Array<{ content: string }>>(
    'select content from canvases where id = $1 and deletedAt is null limit 1',
    [canvasId],
  )
  const document = rows[0] ? normalizeCanvasDocument(JSON.parse(rows[0].content)) : DEFAULT_CANVAS_DOCUMENT
  const contentRevision = document.nodes
    .map(node => `${node.id}:${canvasNodeContentRevision(node)}`)
    .sort()
    .join('|') || 'empty'
  await enqueueCanvasIndexJobDrafts(canvasId, [{
    nodeId: '__canvas__', contentRevision, operation: 'rebuild',
  }], db)
}

export async function queueCanvasIndexRetry(canvasId: string, nodeId?: string) {
  const db = await getDb()
  const now = Date.now()
  await db.execute(
    `update canvas_index_jobs set state = 'retry', nextAttemptAt = $1, updatedAt = $1
     where canvasId = $2 and state != 'complete'${nodeId ? ' and nodeId = $3' : ''}`,
    nodeId ? [now, canvasId, nodeId] : [now, canvasId],
  )
}

export async function resetAbandonedCanvasIndexJobs() {
  const db = await getDb()
  const now = Date.now()
  await db.execute(
    `update canvas_index_jobs
     set state = 'retry', nextAttemptAt = $1, updatedAt = $1
     where state = 'running'`,
    [now],
  )
}

export async function claimReadyCanvasIndexJob(now = Date.now()): Promise<CanvasIndexJob | null> {
  const db = await getDb()
  const rows = await db.select<CanvasIndexJob[]>(
    `update canvas_index_jobs
     set state = 'running', attempts = attempts + 1, updatedAt = $1
     where id = (
       select id from canvas_index_jobs
       where state in ('pending', 'retry') and nextAttemptAt <= $1
       order by createdAt, id limit 1
     ) and state in ('pending', 'retry')
     returning id, canvasId, nodeId, contentRevision, operation, state, attempts, nextAttemptAt`,
    [now],
  )
  return rows[0] ?? null
}

export async function completeCanvasIndexJob(id: string, executor?: SqlExecutor) {
  const db = executor ?? await getDb()
  await db.execute(
    `update canvas_index_jobs set state = 'complete', updatedAt = $1, lastError = null where id = $2`,
    [Date.now(), id],
  )
}

export async function retryCanvasIndexJob(job: CanvasIndexJob, error: unknown) {
  const db = await getDb()
  const now = Date.now()
  const message = (error instanceof Error ? error.message : String(error)).slice(0, 240)
  await db.execute(
    `update canvas_index_jobs
     set state = 'retry', nextAttemptAt = $1, updatedAt = $2, lastError = $3 where id = $4`,
    [now + retryDelayMs(job.attempts), now, message, job.id],
  )
}

export async function removeCanvasIndexNode(canvasId: string, nodeId: string, executor?: SqlExecutor) {
  const db = executor ?? await getDb()
  await db.execute('delete from canvas_index_anchors where canvasId = $1 and nodeId = $2', [canvasId, nodeId])
  await db.execute('delete from canvas_index_embeddings where canvasId = $1 and nodeId = $2', [canvasId, nodeId])
  await db.execute('delete from canvas_knowledge_anchors where canvasId = $1 and nodeId = $2', [canvasId, nodeId])
}

export async function removeAbsentCanvasIndexNodes(
  canvasId: string,
  currentNodeIds: string[],
  executor?: SqlExecutor,
) {
  const db = executor ?? await getDb()
  if (currentNodeIds.length === 0) {
    await db.execute('delete from canvas_index_anchors where canvasId = $1', [canvasId])
    await db.execute('delete from canvas_index_embeddings where canvasId = $1', [canvasId])
    await db.execute('delete from canvas_knowledge_anchors where canvasId = $1', [canvasId])
    return
  }
  const placeholders = currentNodeIds.map((_, index) => `$${index + 2}`).join(', ')
  const values = [canvasId, ...currentNodeIds]
  await db.execute(
    `delete from canvas_index_anchors where canvasId = $1 and nodeId not in (${placeholders})`,
    values,
  )
  await db.execute(
    `delete from canvas_index_embeddings where canvasId = $1 and nodeId not in (${placeholders})`,
    values,
  )
  await db.execute(
    `delete from canvas_knowledge_anchors where canvasId = $1 and nodeId not in (${placeholders})`,
    values,
  )
}

async function replaceCanvasKnowledgeAnchors(
  canvasId: string,
  nodeId: string,
  contentRevision: string,
  anchors: CanvasKnowledgeAnchor[],
  executor: SqlExecutor,
) {
  // A node revision is authoritative: old ranges cannot survive a successful replacement.
  await executor.execute(
    'delete from canvas_knowledge_anchors where canvasId = $1 and nodeId = $2',
    [canvasId, nodeId],
  )
  for (const anchor of anchors) {
    await executor.execute(
      `insert into canvas_knowledge_anchors (
        id, workspaceId, canvasId, nodeId, attachmentId, startOffset, endOffset,
        nodeX, nodeY, contentRevision, plainText, entities, timeHints, contentType, userMarkedSensitive
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
      [
        anchor.id, anchor.workspaceId, canvasId, nodeId, anchor.attachmentId ?? null,
        anchor.startOffset, anchor.endOffset, anchor.nodePosition.x, anchor.nodePosition.y,
        contentRevision, anchor.plainText, JSON.stringify(anchor.entities), JSON.stringify(anchor.timeHints),
        anchor.contentType, anchor.userMarkedSensitive ? 1 : 0,
      ],
    )
  }
}

export async function processCanvasIndexJob(job: CanvasIndexJob): Promise<'complete' | 'retry'> {
  const db = await getDb()
  if (job.operation === 'delete') {
    const rows = await db.select<Array<{ content: string }>>(
      'select content from canvases where id = $1 and deletedAt is null limit 1',
      [job.canvasId],
    )
    const document = rows[0]
      ? normalizeCanvasDocument(JSON.parse(rows[0].content))
      : DEFAULT_CANVAS_DOCUMENT
    const plan = planCanvasIndexDelete(document, job.nodeId)
    const recorder = createStatementRecorder()
    if (plan.remove) {
      await removeCanvasIndexNode(job.canvasId, job.nodeId, recorder)
    } else if (plan.ensureUpsert) {
      await enqueueCanvasIndexJobDrafts(job.canvasId, [plan.ensureUpsert], recorder)
    }
    await completeCanvasIndexJob(job.id, recorder)
    await executeNativeSqliteTransaction(recorder.statements)
    return 'complete'
  }

  const rows = await db.select<Array<{ content: string }>>(
    'select content from canvases where id = $1 and deletedAt is null limit 1',
    [job.canvasId],
  )
  const document = rows[0] ? normalizeCanvasDocument(JSON.parse(rows[0].content)) : DEFAULT_CANVAS_DOCUMENT
  if (job.operation === 'rebuild') {
    const indexedRows = await db.select<Array<{ nodeId: string }>>(
      'select nodeId from canvas_index_anchors where canvasId = $1',
      [job.canvasId],
    )
    const plan = planCanvasIndexRebuild(indexedRows.map(row => row.nodeId), document)
    for (const nodeId of plan.removeNodeIds) {
      await removeCanvasIndexNode(job.canvasId, nodeId)
    }
    await enqueueCanvasIndexJobDrafts(job.canvasId, plan.upserts)
    await completeCanvasIndexJob(job.id)
    return 'complete'
  }

  const node = document.nodes.find(candidate => candidate.id === job.nodeId)
  if (!node) {
    await removeCanvasIndexNode(job.canvasId, job.nodeId)
    await completeCanvasIndexJob(job.id)
    return 'complete'
  }
  const currentRevision = canvasNodeContentRevision(node)
  if (currentRevision !== job.contentRevision) {
    await enqueueCanvasIndexJobDrafts(job.canvasId, [{
      nodeId: node.id, contentRevision: currentRevision, operation: 'upsert',
    }])
    await completeCanvasIndexJob(job.id)
    return 'complete'
  }
  const content = extractCanvasNodeIndexText(node)
  const features = buildLocalCanvasIndexFeatures(content)
  const extraction = extractCanvasKnowledgeAnchors({
    workspaceId: 'default',
    canvasId: job.canvasId,
    contentRevision: currentRevision,
    node,
  })
  if (extraction.failures.length > 0) {
    await retryCanvasIndexJob(job, new Error(extraction.failures.map(failure => failure.message).join('; ')))
    return 'retry'
  }
  const recognition = node.type === 'image'
    ? await getCanvasImageRecognition({
        canvasId: job.canvasId,
        nodeId: job.nodeId,
        contentRevision: currentRevision,
      })
    : null
  const recognitionAnchors: CanvasKnowledgeAnchor[] = recognitionKnowledgeParts(
    recognition ?? { ocrText: '', visionDescription: '' },
  ).filter(part => part.contentType === 'image-ocr' || part.contentType === 'image-description')
    .map((part, index) => ({
    id: `${job.canvasId}:${job.nodeId}:${currentRevision}:image:${index}`,
    workspaceId: 'default',
    canvasId: job.canvasId,
    nodeId: job.nodeId,
    startOffset: 0,
    endOffset: part.text.length,
    nodePosition: { ...node.position },
    contentRevision: currentRevision,
    plainText: part.text,
    entities: extractKnowledgeEntities(part.text),
    timeHints: extractKnowledgeTimeHints(part.text),
    contentType: part.contentType,
    ...(node.data.sensitive === true ? { userMarkedSensitive: true } : {}),
    }))
  const completeAnchors = [...extraction.anchors, ...recognitionAnchors]
  const now = Date.now()
  const recorder = createStatementRecorder()
  await recorder.execute(
    `insert into canvas_index_anchors (
      canvasId, nodeId, contentRevision, content, entities, timeTerms, updatedAt
    ) values ($1, $2, $3, $4, $5, $6, $7)
    on conflict(canvasId, nodeId) do update set
      contentRevision = excluded.contentRevision,
      content = excluded.content,
      entities = excluded.entities,
      timeTerms = excluded.timeTerms,
      updatedAt = excluded.updatedAt`,
    [job.canvasId, job.nodeId, currentRevision, content,
      JSON.stringify(features.entities), JSON.stringify(features.timeTerms), now],
    )
  await recorder.execute(
    `insert into canvas_index_embeddings (
      canvasId, nodeId, contentRevision, embedding, model, updatedAt
    ) values ($1, $2, $3, $4, 'local-sparse-v1', $5)
    on conflict(canvasId, nodeId, model) do update set
      contentRevision = excluded.contentRevision,
      embedding = excluded.embedding,
      updatedAt = excluded.updatedAt`,
    [job.canvasId, job.nodeId, currentRevision, JSON.stringify(features.vector), now],
    )
  await replaceCanvasKnowledgeAnchors(
    job.canvasId,
    job.nodeId,
    currentRevision,
    completeAnchors,
    recorder,
  )
  await completeCanvasIndexJob(job.id, recorder)
  await executeNativeSqliteTransaction(recorder.statements)
  return 'complete'
}

export async function queryPersistedCanvasKnowledgeAnchors(canvasId: string): Promise<CanvasKnowledgeAnchor[]> {
  const db = await getDb()
  const rows = await db.select<CanvasKnowledgeAnchorRow[]>(
    `select id, workspaceId, canvasId, nodeId, attachmentId, startOffset, endOffset,
       nodeX, nodeY, contentRevision, plainText, entities, timeHints, contentType, userMarkedSensitive
     from canvas_knowledge_anchors where canvasId = $1 order by nodeId, startOffset, id`,
    [canvasId],
  )
  return rows.map(row => ({
    id: row.id,
    workspaceId: row.workspaceId,
    canvasId: row.canvasId,
    nodeId: row.nodeId,
    ...(row.attachmentId ? { attachmentId: row.attachmentId } : {}),
    startOffset: row.startOffset,
    endOffset: row.endOffset,
    nodePosition: { x: row.nodeX, y: row.nodeY },
    contentRevision: row.contentRevision,
    plainText: row.plainText,
    entities: parseStringArray(row.entities),
    timeHints: parseStringArray(row.timeHints),
    contentType: row.contentType,
    ...(row.userMarkedSensitive ? { userMarkedSensitive: true } : {}),
  }))
}

export async function getCanvasIndexSourceCandidate(canvasId: string, nodeId: string): Promise<(
  CanvasIndexCandidate & { text: string }
) | null> {
  const db = await getDb()
  const rows = await db.select<CanvasIndexAnchorRow[]>(
    `select a.canvasId, a.nodeId, a.contentRevision, a.content, a.entities, a.timeTerms,
       e.embedding
     from canvas_index_anchors a
     left join canvas_index_embeddings e
       on e.canvasId = a.canvasId and e.nodeId = a.nodeId and e.model = 'local-sparse-v1'
     where a.canvasId = $1 and a.nodeId = $2 limit 1`,
    [canvasId, nodeId],
  )
  const row = rows[0]
  if (!row) return null
  return {
    canvasId: row.canvasId,
    nodeId: row.nodeId,
    contentRevision: row.contentRevision,
    excerpt: row.content.slice(0, 500),
    text: row.content,
    score: 1,
    matchedBy: ['vector'],
  }
}

function tokenize(value: string): string[] {
  return [...new Set(value.toLocaleLowerCase().match(/[\p{L}\p{N}]{2,}/gu) || [])]
}

function parseStringArray(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter(item => typeof item === 'string') : []
  } catch {
    return []
  }
}

function parseSparseVector(value: string | null): Record<string, number> {
  if (!value) return {}
  try {
    const parsed: unknown = JSON.parse(value)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, number] => (
      typeof entry[1] === 'number' && Number.isFinite(entry[1])
    )))
  } catch {
    return {}
  }
}

function sparseSimilarity(left: Record<string, number>, right: Record<string, number>): number {
  let score = 0
  for (const [token, value] of Object.entries(left)) score += value * (right[token] || 0)
  return Math.max(0, Math.min(1, score))
}

export async function queryPersistedCanvasIndexCandidates(
  input: CandidateQuery,
): Promise<CanvasIndexCandidate[]> {
  const db = await getDb()
  const rows = await db.select<CanvasIndexAnchorRow[]>(
    `select a.canvasId, a.nodeId, a.contentRevision, a.content, a.entities, a.timeTerms,
       e.embedding
     from canvas_index_anchors a
     left join canvas_index_embeddings e
       on e.canvasId = a.canvasId and e.nodeId = a.nodeId and e.model = 'local-sparse-v1'
     where a.canvasId = $1`,
    [input.canvasId],
  )
  const terms = tokenize(input.text)
  const queryFeatures = buildLocalCanvasIndexFeatures(input.text)
  const kinds = input.kinds?.length ? input.kinds : ['vector', 'entity', 'time'] as const
  return rows
    .filter(row => row.nodeId !== input.nodeId)
    .map(row => {
      const haystack = row.content.toLocaleLowerCase()
      const matches = terms.filter(term => haystack.includes(term)).length
      const vectorScore = sparseSimilarity(queryFeatures.vector, parseSparseVector(row.embedding))
      const matchedBy = kinds.filter(kind => {
        if (kind === 'vector') return vectorScore > 0
        const values = parseStringArray(kind === 'entity' ? row.entities : row.timeTerms)
        const queryValues = kind === 'entity' ? queryFeatures.entities : queryFeatures.timeTerms
        return values.some(value => queryValues.includes(value))
      })
      return {
        canvasId: row.canvasId,
        nodeId: row.nodeId,
        contentRevision: row.contentRevision,
        excerpt: row.content.slice(0, 500),
        score: Math.max(vectorScore, terms.length > 0 ? matches / terms.length : 0),
        matchedBy,
      } satisfies CanvasIndexCandidate
    })
    .filter(candidate => candidate.matchedBy.length > 0)
    .sort((left, right) => right.score - left.score || left.nodeId.localeCompare(right.nodeId))
    .slice(0, Math.max(1, Math.min(input.limit ?? 20, 100)))
}
