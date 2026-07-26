import test from 'node:test'
import assert from 'node:assert/strict'
import {
  NOTE_REFERENCE_MIME,
  createNoteReferenceSnapshot,
  noteReferenceId,
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

test('missing sources preserve their cached metadata and are marked stale', () => {
  const [missing] = refreshNoteReferences([{
    id: 'one',
    type: 'note',
    position: { x: 0, y: 0 },
    data: {
      sourceNoteId: '404',
      sourceTitle: 'Last known title',
      sourceExcerpt: 'Last known excerpt',
      sourceUpdatedAt: 12,
      sourceStatus: 'available',
    },
  }], [])

  assert.deepEqual(missing.data, {
    sourceNoteId: '404',
    sourceTitle: 'Last known title',
    sourceExcerpt: 'Last known excerpt',
    sourceUpdatedAt: 12,
    sourceStatus: 'missing',
    sourceSyncStatus: 'stale',
  })
})
