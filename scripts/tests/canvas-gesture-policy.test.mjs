import test from 'node:test'
import assert from 'node:assert/strict'
import {
  classifyPointerRelease,
  hasDrawableArea,
  intersectingRectIds,
  normalizeDrawRect,
} from '../../src/lib/canvas/gesture-policy.ts'

test('clicks and single-axis drags do not draw blocks', () => {
  assert.equal(hasDrawableArea({ x: 10, y: 10 }, { x: 10, y: 10 }), false)
  assert.equal(hasDrawableArea({ x: 10, y: 10 }, { x: 80, y: 10 }), false)
  assert.equal(hasDrawableArea({ x: 10, y: 10 }, { x: 10, y: 80 }), false)
  assert.equal(hasDrawableArea({ x: 10, y: 10 }, { x: 13, y: 13 }), true)
})

test('draw rectangles preserve the exact two-axis drag size', () => {
  assert.deepEqual(normalizeDrawRect({ x: 105, y: 125 }, { x: 100, y: 120 }), {
    x: 100, y: 120, width: 5, height: 5,
  })
})

test('right-drag empty canvas is a marquee and right-click is context', () => {
  assert.equal(classifyPointerRelease({ button: 2, elapsedMs: 90, deltaX: 30, deltaY: 20, startedOnNode: false }), 'marquee-select')
  assert.equal(classifyPointerRelease({ button: 2, elapsedMs: 90, deltaX: 0, deltaY: 0, startedOnNode: false }), 'pane-context')
})

test('node right-click stays context while long hold starts a relation', () => {
  assert.equal(classifyPointerRelease({ button: 2, elapsedMs: 200, deltaX: 0, deltaY: 0, startedOnNode: true }), 'node-context')
  assert.equal(classifyPointerRelease({ button: 2, elapsedMs: 360, deltaX: 25, deltaY: 0, startedOnNode: true }), 'relation-drag')
  assert.equal(classifyPointerRelease({ button: 2, elapsedMs: 360, deltaX: 0, deltaY: 0, startedOnNode: true }), 'relation-drag')
})

test('marquee includes every partially intersecting rectangle', () => {
  assert.deepEqual(intersectingRectIds(
    { x: 20, y: 20, width: 40, height: 40 },
    [
      { id: 'inside', x: 30, y: 30, width: 10, height: 10 },
      { id: 'partial', x: 55, y: 55, width: 30, height: 30 },
      { id: 'outside', x: 100, y: 100, width: 10, height: 10 },
    ],
  ), ['inside', 'partial'])
})
