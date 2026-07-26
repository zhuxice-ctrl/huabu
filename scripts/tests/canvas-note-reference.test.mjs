import test from 'node:test'
import assert from 'node:assert/strict'
import {
  commitNoteReferenceDrop,
  createNoteReferenceLinkData,
  NOTE_REFERENCE_MIME,
  createNoteReferenceSnapshot,
  deleteNoteReference,
  noteReferenceId,
  openNoteReferenceRecord,
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

test('drop transactions commit once only after placement and leave failed drops unchanged', async () => {
  const payload = JSON.stringify(createNoteReferenceLinkData(mark()))
  const calls = { place: 0, commit: 0 }
  const placed = await commitNoteReferenceDrop({
    payload,
    place: async reference => {
      calls.place += 1
      return { id: 'canvas-reference', reference }
    },
    commit: () => { calls.commit += 1 },
  })
  assert.equal(placed, 'placed')
  assert.deepEqual(calls, { place: 1, commit: 1 })

  const noSpace = await commitNoteReferenceDrop({
    payload,
    place: async () => null,
    commit: () => { calls.commit += 1 },
  })
  assert.equal(noSpace, 'no-space')
  assert.equal(calls.commit, 1)

  const unreadable = await commitNoteReferenceDrop({
    payload: '{not-json',
    place: async () => {
      calls.place += 1
      return { id: 'unexpected' }
    },
    commit: () => { calls.commit += 1 },
  })
  assert.equal(unreadable, 'invalid')
  assert.deepEqual(calls, { place: 1, commit: 1 })
})

test('relinking and deleting a reference do not mutate its source, and opening reuses the record tab', async () => {
  const source = Object.freeze(mark())
  const relinked = createNoteReferenceLinkData(source)
  assert.equal(relinked.referenceId, 'record:42')
  assert.equal(source.id, 42)

  const removed = []
  deleteNoteReference('canvas-reference', id => removed.push(id))
  assert.deepEqual(removed, ['canvas-reference'])
  assert.equal(source.id, 42)

  const calls = []
  const opened = await openNoteReferenceRecord({
    sourceNoteId: '42',
    marks: [source],
    createTab: item => ({ id: `record:${item.id}`, path: `record://mark/${item.id}` }),
    openTabs: [{ id: 'existing', path: 'record://mark/42' }],
    setActiveTabId: async id => { calls.push(`active:${id}`) },
    addTab: async () => { calls.push('add') },
    setActiveFilePath: async path => { calls.push(`file:${path}`) },
    centerPanelVisible: false,
    showCenterPanel: async () => { calls.push('panel') },
  })
  assert.equal(opened, true)
  assert.deepEqual(calls, ['active:existing', 'file:', 'panel'])

  const deferredCalls = []
  const openedAfterAuthorityLoad = await openNoteReferenceRecord({
    sourceNoteId: '42',
    marks: [],
    referenceMarksAuthoritative: false,
    loadAuthoritativeMarks: async () => [source],
    createTab: item => ({ id: `record:${item.id}`, path: `record://mark/${item.id}` }),
    openTabs: [],
    setActiveTabId: async () => { deferredCalls.push('active') },
    addTab: async () => { deferredCalls.push('add') },
    setActiveFilePath: async () => { deferredCalls.push('file') },
    centerPanelVisible: true,
    showCenterPanel: async () => { deferredCalls.push('panel') },
  })
  assert.equal(openedAfterAuthorityLoad, true)
  assert.deepEqual(deferredCalls, ['add', 'file'])
})
