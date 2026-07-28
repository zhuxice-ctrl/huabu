import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  DEFAULT_LINEAR_VIEW_CONTROLS,
  buildLinearProjection,
  planLinearViewControls,
} from '../../src/lib/canvas/linear-view.ts'

const nodes = [
  { id: 'a', type: 'text', position: { x: 600, y: 0 }, data: { label: 'Alpha', timestamp: 30, relevance: 0.2, tags: ['work'] } },
  { id: 'b', type: 'text', position: { x: 120, y: 0 }, data: { label: 'Beta', timestamp: 10, relevance: 0.9, people: ['alice'] } },
  { id: 'c', type: 'text', position: { x: 300, y: 0 }, data: { label: 'Gamma', timestamp: 20, relevance: 0.5, project: 'atlas' } },
]

const manualRelations = [
  { id: 'manual-a-b', source: 'a', target: 'b', data: { source: 'manual' } },
]

const aiRelations = [
  {
    id: 'ai-b-c', canvasId: 'canvas-a', sourceNodeId: 'b', targetNodeId: 'c', type: 'same_topic',
    sourceExcerpt: '', targetExcerpt: '', confidence: 0.9, reason: '', model: 'local',
    sourceRevision: '1', targetRevision: '1', state: 'active',
  },
]

test('linear projections traverse selected manual and AI relations for one or two hops without copying nodes', () => {
  const oneHop = buildLinearProjection({
    nodes, manualRelations, aiRelations, filters: { tags: ['work'] }, relationDepth: 1,
    includeManualRelations: true, includeAiRelations: true, sortMode: 'manual',
  })
  const twoHop = buildLinearProjection({
    nodes, manualRelations, aiRelations, filters: { tags: ['work'] }, relationDepth: 2,
    includeManualRelations: true, includeAiRelations: true, sortMode: 'manual',
  })

  assert.deepEqual(oneHop.map(item => [item.nodeId, item.depth]), [['a', 0], ['b', 1]])
  assert.deepEqual(twoHop.map(item => [item.nodeId, item.depth]), [['a', 0], ['b', 1], ['c', 2]])
  assert.deepEqual(twoHop[2].relationIds, ['ai-b-c'])
  assert.ok(twoHop.every(item => !('data' in item) && !('position' in item)))
})

test('projection ordering is deterministic for time, relevance, distance and manual order', () => {
  const base = {
    nodes, manualRelations, aiRelations, filters: {}, relationDepth: 2,
    includeManualRelations: true, includeAiRelations: true,
  }
  assert.deepEqual(buildLinearProjection({ ...base, sortMode: 'time' }).map(item => item.nodeId), ['b', 'c', 'a'])
  assert.deepEqual(buildLinearProjection({ ...base, sortMode: 'relevance' }).map(item => item.nodeId), ['b', 'c', 'a'])
  assert.deepEqual(buildLinearProjection({ ...base, sortMode: 'distance' }).map(item => item.nodeId), ['a', 'b', 'c'])
  assert.deepEqual(buildLinearProjection({ ...base, sortMode: 'manual' }).map(item => item.nodeId), ['a', 'b', 'c'])
})

test('read-only projections never mutate source node positions or source arrays', () => {
  const before = structuredClone(nodes)
  const relationsBefore = structuredClone(manualRelations)
  buildLinearProjection({
    nodes, manualRelations, aiRelations, filters: {}, relationDepth: 2,
    includeManualRelations: true, includeAiRelations: true, sortMode: 'manual',
  })
  assert.deepEqual(nodes, before)
  assert.deepEqual(manualRelations, relationsBefore)
})

test('filters and relation-source toggles recompute references from current source data', () => {
  const byPerson = buildLinearProjection({
    nodes, manualRelations, aiRelations, filters: { people: ['alice'] }, relationDepth: 1,
    includeManualRelations: false, includeAiRelations: true, sortMode: 'manual',
  })
  const byProjectAndTime = buildLinearProjection({
    nodes, manualRelations, aiRelations,
    filters: { projects: ['atlas'], time: { from: 15, to: 25 } }, relationDepth: 0,
    includeManualRelations: true, includeAiRelations: true, sortMode: 'manual',
  })
  assert.deepEqual(byPerson.map(item => item.nodeId), ['b', 'c'])
  assert.deepEqual(byProjectAndTime.map(item => item.nodeId), ['c'])
})

test('pure linear-view commands replace controls without copying projected node content', () => {
  const tagged = planLinearViewControls(DEFAULT_LINEAR_VIEW_CONTROLS, {
    type: 'set-filter-values', field: 'tags', value: 'work, urgent',
  })
  const timed = planLinearViewControls(tagged, {
    type: 'set-time-boundary', boundary: 'from', value: '15',
  })
  const saved = planLinearViewControls(timed, {
    type: 'apply-saved-view',
    value: {
      filters: { people: ['alice'] }, relationDepth: 2,
      includeManualRelations: false, includeAiRelations: true, sortMode: 'distance',
    },
  })

  assert.deepEqual(tagged.filters.tags, ['work', 'urgent'])
  assert.deepEqual(timed.filters.time, { from: 15 })
  assert.deepEqual(saved, {
    filters: { people: ['alice'] }, relationDepth: 2,
    includeManualRelations: false, includeAiRelations: true, sortMode: 'distance',
  })
  assert.equal('nodes' in saved, false)
  assert.equal('position' in saved, false)
})

test('saved views persist filter definitions and relation choices, never copied projection content', async () => {
  const storage = await readFile(new URL('../../src/db/canvas-views.ts', import.meta.url), 'utf8')
  assert.match(storage, /canvas_saved_views/)
  assert.match(storage, /filters text not null/)
  assert.match(storage, /relationDepth/)
  assert.match(storage, /includeManualRelations/)
  assert.match(storage, /includeAiRelations/)
  assert.match(storage, /sortMode/)
  assert.doesNotMatch(storage, /insert into canvas_saved_views[\s\S]*nodeBody/i)
  assert.doesNotMatch(storage, /insert into canvas_saved_views[\s\S]*position/i)
})

test('linear-view UI executes planner results through a static external store boundary', async () => {
  const [component, viewStore] = await Promise.all([
    readFile(new URL('../../src/app/core/main/canvas/canvas-linear-view.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../src/stores/canvas-view.ts', import.meta.url), 'utf8'),
  ])

  assert.match(component, /planLinearViewControls\(controls, command\)/)
  assert.match(component, /replaceCanvasLinearViewControls/)
  assert.match(component, /replaceCanvasSavedViews/)
  assert.doesNotMatch(
    component,
    /\bsetFilters\b|\bsetRelationDepth\b|\bsetIncludeManualRelations\b|\bsetIncludeAiRelations\b|\bsetSortMode\b|\bsetSavedViews\b/,
  )
  assert.match(viewStore, /linearControls: Record<string, LinearViewControls>/)
  assert.match(viewStore, /savedViews: Record<string, SavedCanvasView\[\]>/)
  assert.doesNotMatch(viewStore, /CanvasDocument|nodeBody|position:/)
})
