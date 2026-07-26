import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createNoteReferenceLinkData,
  NOTE_REFERENCE_MIME,
  createNoteReferenceSnapshot,
  mergeNoteReferenceMarks,
  noteReferenceId,
  planNoteReferenceDeletion,
  planNoteReferenceDrop,
  planNoteReferencePlacement,
  planNoteReferenceRecordOpen,
  refreshNoteReferences,
} from '../../src/lib/canvas/note-reference.ts'

const mark = (overrides = {}) => ({
  id: 42,
  tagId: 1,
  type: 'text',
  content: 'First line of the note\nSecond line with useful detail.',
  desc: 'Project plan',
  url: '',
  deleted: 0,
  createdAt: 1_700_000_000_000,
  ...overrides,
})

test('reference IDs and drag MIME identify a record without serializing its body', () => {
  const snapshot = createNoteReferenceSnapshot(mark())

  assert.equal(NOTE_REFERENCE_MIME, 'application/x-zeroxb-note-reference')
  assert.equal(noteReferenceId(42), 'record:42')
  assert.deepEqual(snapshot, {
    sourceNoteId: '42',
    sourceTitle: 'Project plan',
    sourceExcerpt: 'First line of the note Second line with useful detail.',
    sourceUpdatedAt: 1_700_000_000_000,
    sourceStatus: 'available',
    sourceSyncStatus: 'current',
  })
  assert.equal(Object.hasOwn(snapshot, 'content'), false)
})

test('all references to a source refresh together and retain no full source body', () => {
  const nodes = [
    { id: 'one', type: 'note', position: { x: 0, y: 0 }, data: { sourceNoteId: '42', sourceTitle: 'old', sourceExcerpt: 'old', sourceUpdatedAt: 1 } },
    { id: 'two', type: 'note', position: { x: 10, y: 10 }, data: { sourceNoteId: '42', sourceTitle: 'old', sourceExcerpt: 'old', sourceUpdatedAt: 1 } },
    { id: 'plain', type: 'text', position: { x: 20, y: 20 }, data: { label: 'leave me alone' } },
  ]
  const refreshed = refreshNoteReferences(nodes, [mark({ desc: 'Updated title', content: 'Updated body for a cached excerpt.' })])

  assert.deepEqual(refreshed.slice(0, 2).map(node => node.data), [
    {
      sourceNoteId: '42',
      sourceTitle: 'Updated title',
      sourceExcerpt: 'Updated body for a cached excerpt.',
      sourceUpdatedAt: 1_700_000_000_000,
      sourceStatus: 'available',
      sourceSyncStatus: 'current',
    },
    {
      sourceNoteId: '42',
      sourceTitle: 'Updated title',
      sourceExcerpt: 'Updated body for a cached excerpt.',
      sourceUpdatedAt: 1_700_000_000_000,
      sourceStatus: 'available',
      sourceSyncStatus: 'current',
    },
  ])
  assert.deepEqual(refreshed[2], nodes[2])
  assert.equal(JSON.stringify(refreshed).includes('Updated body for a cached excerpt.'.repeat(2)), false)
})

test('partial source views update matching caches but cannot orphan unloaded sources', () => {
  const reference = {
    id: 'one',
    type: 'note',
    position: { x: 0, y: 0 },
    data: {
      sourceNoteId: '42',
      sourceTitle: 'Last known title',
      sourceExcerpt: 'Last known excerpt',
      sourceUpdatedAt: 12,
      sourceStatus: 'available',
    },
  }
  const [incomplete] = refreshNoteReferences([reference], [])
  assert.strictEqual(incomplete, reference)

  const [incremental] = refreshNoteReferences([reference], [mark({ desc: 'Partial update' })])
  assert.equal(incremental.data.sourceTitle, 'Partial update')

  const [missing] = refreshNoteReferences([reference], [], { allowMissing: true })

  assert.deepEqual(missing.data, {
    sourceNoteId: '42',
    sourceTitle: 'Last known title',
    sourceExcerpt: 'Last known excerpt',
    sourceUpdatedAt: 12,
    sourceStatus: 'missing',
    sourceSyncStatus: 'stale',
  })
})

test('drop planners allow one checkpoint only after placement and reject failed drops', () => {
  const payload = JSON.stringify(createNoteReferenceLinkData(mark()))
  const ready = planNoteReferenceDrop(payload)
  assert.equal(ready.status, 'ready')
  assert.equal(ready.reference.sourceNoteId, '42')
  assert.deepEqual(planNoteReferencePlacement([{ id: 'canvas-reference' }]), {
    status: 'placed',
    checkpoint: true,
    placed: [{ id: 'canvas-reference' }],
  })
  assert.deepEqual(planNoteReferencePlacement(null), { status: 'no-space', checkpoint: false })
  assert.deepEqual(planNoteReferenceDrop('{not-json'), { status: 'invalid' })
})

test('relink, delete and record-tab planners isolate the source and model authority transitions', () => {
  const source = Object.freeze(mark())
  const relinked = createNoteReferenceLinkData(source)
  assert.equal(relinked.referenceId, 'record:42')
  assert.equal(source.id, 42)

  assert.deepEqual(planNoteReferenceDeletion('canvas-reference'), {
    nodeIds: ['canvas-reference'],
    sourceMutation: false,
  })
  assert.equal(source.id, 42)

  const incomplete = planNoteReferenceRecordOpen({
    sourceNoteId: '42',
    marks: [],
    referenceMarksAuthoritative: false,
    recordPath: 'record://mark/42',
    openTabs: [],
  })
  assert.deepEqual(incomplete, { status: 'load-authority' })

  const authoritativeMarks = mergeNoteReferenceMarks([source], [])
  const existing = planNoteReferenceRecordOpen({
    sourceNoteId: '42',
    marks: authoritativeMarks,
    referenceMarksAuthoritative: true,
    recordPath: 'record://mark/42',
    openTabs: [{ id: 'existing', path: 'record://mark/42' }],
  })
  assert.equal(existing.status, 'activate')
  assert.equal(existing.tabId, 'existing')
  assert.strictEqual(existing.source, source)

  const add = planNoteReferenceRecordOpen({
    sourceNoteId: '42',
    marks: authoritativeMarks,
    referenceMarksAuthoritative: true,
    recordPath: 'record://mark/42',
    openTabs: [],
  })
  assert.equal(add.status, 'add')
  assert.strictEqual(add.source, source)

  assert.deepEqual(planNoteReferenceRecordOpen({
    sourceNoteId: '404',
    marks: authoritativeMarks,
    referenceMarksAuthoritative: true,
    recordPath: 'record://mark/404',
    openTabs: [],
  }), { status: 'missing' })
})
