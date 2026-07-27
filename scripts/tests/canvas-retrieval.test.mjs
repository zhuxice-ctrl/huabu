import assert from 'node:assert/strict'
import test from 'node:test'

import { retrieveCanvasEvidence } from '../../src/lib/canvas/canvas-retrieval.ts'

const anchor = (overrides = {}) => ({
  id: 'anchor-1',
  workspaceId: 'workspace-a',
  canvasId: 'canvas-a',
  nodeId: 'node-1',
  startOffset: 0,
  endOffset: 42,
  nodePosition: { x: 1, y: 2 },
  contentRevision: 'revision-a',
  plainText: 'Alice will book the train on 2026-08-12 for Project Alpha.',
  entities: ['@alice', '#project-alpha'],
  timeHints: ['2026-08-12'],
  contentType: 'text',
  ...overrides,
})

test('retrieval fuses keyword, semantic, entity and time evidence inside only the requested canvas', async () => {
  const result = await retrieveCanvasEvidence({
    canvasId: 'canvas-a',
    query: 'What will Alice do for Project Alpha on 2026-08-12?',
    anchors: [
      anchor(),
      anchor({ id: 'other-canvas', canvasId: 'canvas-b', plainText: 'Alice will fly instead.' }),
    ],
    rerankedAnchorIds: ['anchor-1'],
  })

  assert.equal(result.evidence.length, 1)
  assert.equal(result.evidence[0].anchor.canvasId, 'canvas-a')
  assert.match(result.context, /Alice will book the train/)
  assert.ok(result.evidence[0].matchedBy.includes('keyword'))
  assert.ok(result.evidence[0].matchedBy.includes('entity'))
  assert.ok(result.evidence[0].matchedBy.includes('time'))
})

test('retrieval remains useful offline and returns no-result language when evidence is insufficient', async () => {
  const offline = await retrieveCanvasEvidence({
    canvasId: 'canvas-a',
    query: 'train',
    anchors: [anchor()],
  })
  assert.equal(offline.evidence.length, 1)

  const missing = await retrieveCanvasEvidence({
    canvasId: 'canvas-a',
    query: 'unrelated quantum physics',
    anchors: [anchor()],
  })
  assert.equal(missing.evidence.length, 0)
  assert.match(missing.context, /没有找到/)
})

test('reranking accepts only original allowed anchor identities', async () => {
  const result = await retrieveCanvasEvidence({
    canvasId: 'canvas-a',
    query: 'train',
    anchors: [anchor()],
    rerankedAnchorIds: ['foreign', 'anchor-1', 'anchor-1'],
  })
  assert.equal(result.evidence.length, 1)
  assert.equal(result.evidence[0].anchor.id, 'anchor-1')
})
