import assert from 'node:assert/strict'
import test from 'node:test'

import {
  EVIDENCE_AUTO_NAVIGATION_CONFIDENCE,
  advanceEvidenceNavigation,
  canAutoNavigateEvidence,
  createEvidenceNavigationSession,
  evidenceFocusFor,
  returnToEvidenceOrigin,
} from '../../src/lib/canvas/evidence-navigation.ts'

const viewport = { x: -120, y: 48, zoom: 0.8 }
const evidence = (id, score, overrides = {}) => ({
  anchor: {
    id,
    workspaceId: 'workspace-a',
    canvasId: 'canvas-a',
    nodeId: `node-${id}`,
    startOffset: 12,
    endOffset: 28,
    nodePosition: { x: 400, y: 220 },
    contentRevision: 'revision-a',
    plainText: 'The precisely matched text.',
    entities: [],
    timeHints: [],
    contentType: 'text',
    ...overrides,
  },
  score,
  matchedBy: ['keyword'],
})

test('evidence navigation stores an immutable pre-query viewport and exact result anchors outside CanvasDocument', () => {
  const session = createEvidenceNavigationSession('canvas-a', viewport, [
    evidence('first', 1), evidence('second', 0.9),
  ])

  assert.deepEqual(session, {
    canvasId: 'canvas-a',
    originViewport: viewport,
    resultAnchorIds: ['first', 'second'],
    activeIndex: 0,
  })
  assert.notEqual(session.originViewport, viewport)
  assert.deepEqual(returnToEvidenceOrigin(session), viewport)
})

test('only confident evidence auto-navigates; lower-confidence matches require the candidate strip', () => {
  assert.equal(canAutoNavigateEvidence(evidence('accepted', EVIDENCE_AUTO_NAVIGATION_CONFIDENCE)), true)
  assert.equal(canAutoNavigateEvidence(evidence('candidate', EVIDENCE_AUTO_NAVIGATION_CONFIDENCE - 0.001)), false)
})

test('next and previous navigation preserves result order and focuses only the exact node range', () => {
  const results = [evidence('first', 0.9), evidence('second', 0.9)]
  const session = createEvidenceNavigationSession('canvas-a', viewport, results)
  const next = advanceEvidenceNavigation(session, 'next')
  const previous = advanceEvidenceNavigation(next, 'previous')

  assert.equal(next.activeIndex, 1)
  assert.equal(previous.activeIndex, 0)
  assert.deepEqual(evidenceFocusFor(next, results), {
    canvasId: 'canvas-a',
    nodeId: 'node-second',
    startOffset: 12,
    endOffset: 28,
  })
  assert.equal(advanceEvidenceNavigation(next, 'next').activeIndex, 1)
  assert.equal(advanceEvidenceNavigation(previous, 'previous').activeIndex, 0)
})
