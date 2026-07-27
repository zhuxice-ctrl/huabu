import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  canvasNodeContentRevision,
  buildLocalCanvasIndexFeatures,
  diffCanvasIndexJobs,
  planCanvasIndexDelete,
  planCanvasIndexRebuild,
  resumeAbandonedCanvasIndexJob,
  retryDelayMs,
  shouldClaimCanvasIndexJob,
} from '../../src/lib/canvas/canvas-index-jobs.ts'

const document = nodes => ({
  schemaVersion: 1,
  nodes,
  edges: [],
  viewport: { x: 0, y: 0, zoom: 1 },
  settings: { layoutDirection: 'TB', showGrid: true, snapToGrid: false },
})

const node = (id, label, extra = {}) => ({
  id,
  type: 'text',
  position: { x: 0, y: 0 },
  data: { label, ...extra },
})

test('create, content update and delete produce revision-deduplicated node jobs', () => {
  const empty = document([])
  const first = document([node('n1', 'Alpha')])
  const moved = document([{ ...first.nodes[0], position: { x: 200, y: 100 } }])
  const edited = document([node('n1', 'Beta')])

  assert.deepEqual(diffCanvasIndexJobs(empty, first), [{
    nodeId: 'n1',
    contentRevision: canvasNodeContentRevision(first.nodes[0]),
    operation: 'upsert',
  }])
  assert.deepEqual(diffCanvasIndexJobs(first, moved), [])
  assert.deepEqual(diffCanvasIndexJobs(first, edited), [{
    nodeId: 'n1',
    contentRevision: canvasNodeContentRevision(edited.nodes[0]),
    operation: 'upsert',
  }])
  assert.deepEqual(diffCanvasIndexJobs(edited, empty), [{
    nodeId: 'n1',
    contentRevision: canvasNodeContentRevision(edited.nodes[0]),
    operation: 'delete',
  }])
})

test('retry backoff is exactly bounded at 1s, 5s, 30s, 5m, then 30m', () => {
  assert.deepEqual(
    [1, 2, 3, 4, 5, 6, 40].map(retryDelayMs),
    [1_000, 5_000, 30_000, 300_000, 1_800_000, 1_800_000, 1_800_000],
  )
})

test('startup resumes abandoned running work without resetting completed jobs', () => {
  const running = {
    id: 'j1', canvasId: 'c1', nodeId: 'n1', contentRevision: 'r1', operation: 'upsert',
    state: 'running', attempts: 2, nextAttemptAt: 10,
  }
  assert.deepEqual(resumeAbandonedCanvasIndexJob(running, 100), {
    ...running, state: 'retry', nextAttemptAt: 100,
  })
  const complete = { ...running, state: 'complete' }
  assert.equal(resumeAbandonedCanvasIndexJob(complete, 100), complete)
})

test('full rebuild removes absent anchors and enumerates every authoritative node', () => {
  const current = document([node('n2', 'Beta'), node('n1', 'Alpha')])
  const plan = planCanvasIndexRebuild(['stale', 'n1', 'stale'], current)
  assert.deepEqual(plan.removeNodeIds, ['stale'])
  assert.deepEqual(plan.upserts, [
    { nodeId: 'n2', contentRevision: canvasNodeContentRevision(current.nodes[0]), operation: 'upsert' },
    { nodeId: 'n1', contentRevision: canvasNodeContentRevision(current.nodes[1]), operation: 'upsert' },
  ])
})

test('delete tombstone preserves and re-enqueues a node restored before drain', () => {
  const restored = document([node('n1', 'Alpha')])
  assert.deepEqual(planCanvasIndexDelete(restored, 'n1'), {
    remove: false,
    ensureUpsert: {
      nodeId: 'n1',
      contentRevision: canvasNodeContentRevision(restored.nodes[0]),
      operation: 'upsert',
    },
  })
  assert.deepEqual(planCanvasIndexDelete(document([]), 'n1'), { remove: true })
})

test('worker stop planner prevents the next claim', () => {
  assert.equal(shouldClaimCanvasIndexJob(false), true)
  assert.equal(shouldClaimCanvasIndexJob(true), false)
})

test('offline index features support vector, entity and time recall without a model', () => {
  const features = buildLocalCanvasIndexFeatures('Project Alpha #Travel @Alice 2026-08-12 明天')
  assert.ok(features.vector.project > 0)
  assert.ok(features.vector.alpha > 0)
  assert.deepEqual(features.entities, ['#travel', '@alice'])
  assert.deepEqual(features.timeTerms, ['2026-08-12', '明天'])
})

test('persistence and worker source preserve atomic save and resumable tombstones', async () => {
  const [canvasDb, indexDb, indexStore, startup] = await Promise.all([
    readFile(new URL('../../src/db/canvases.ts', import.meta.url), 'utf8'),
    readFile(new URL('../../src/db/canvas-index.ts', import.meta.url), 'utf8'),
    readFile(new URL('../../src/stores/canvas-index.ts', import.meta.url), 'utf8'),
    readFile(new URL('../../src/app/core/main/canvas/canvas-startup-controller.tsx', import.meta.url), 'utf8'),
  ])

  assert.match(canvasDb, /BEGIN IMMEDIATE[\s\S]*update canvases[\s\S]*enqueueCanvasIndexJobDrafts[\s\S]*COMMIT/)
  assert.match(canvasDb, /insertCanvasProject[\s\S]*enqueueCanvasIndexJobDrafts/)
  assert.match(canvasDb, /softDeleteCanvasProject[\s\S]*enqueueCanvasDeleteTombstones/)
  assert.match(indexDb, /unique\s*\(canvasId, nodeId, contentRevision, operation\)/)
  assert.match(indexDb, /on conflict\(canvasId, nodeId, contentRevision, operation\) do update set/)
  assert.match(indexDb, /state = 'running'[\s\S]*state = 'retry'/)
  assert.match(indexDb, /delete from canvas_index_anchors[\s\S]*delete from canvas_index_embeddings/)
  assert.match(indexDb, /planCanvasIndexDelete[\s\S]*enqueueCanvasIndexJobDrafts[\s\S]*completeCanvasIndexJob/)
  assert.match(indexDb, /removeAbsentCanvasIndexNodes/)
  assert.match(indexStore, /drainReadyCanvasIndexJobs/)
  assert.match(indexStore, /while \(shouldClaimCanvasIndexJob\(workerStopped\)\)/)
  assert.match(indexStore, /await drainPromise\?\.catch/)
  assert.match(indexStore, /queueCanvasIndexRebuild/)
  assert.match(startup, /startCanvasIndexWorker\(\)/)
  assert.match(startup, /initAllDatabases\(\)[\s\S]*\.then\(\(\) => Promise\.all\(\[[\s\S]*initOpenTabs\(\)[\s\S]*loadProjects\(\)[\s\S]*startCanvasIndexWorker\(\)/)
  assert.match(startup, /void stopCanvasIndexWorker\(\)/)
})

test('saved canvas acknowledgement is independent from later extraction failure', async () => {
  const store = await readFile(new URL('../../src/stores/canvas.ts', import.meta.url), 'utf8')
  const save = store.slice(store.indexOf('saveProject: async'))
  const durableSave = save.indexOf('await updateCanvasDocument(id, document)')
  const publishSavedState = save.indexOf('projects: state.projects')
  assert.ok(durableSave >= 0)
  assert.ok(publishSavedState > durableSave)
  assert.doesNotMatch(save.slice(durableSave, publishSavedState), /drainReadyCanvasIndexJobs|extract|overlay/)
})
