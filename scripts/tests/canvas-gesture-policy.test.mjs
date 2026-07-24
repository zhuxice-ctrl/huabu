import test from 'node:test'
import assert from 'node:assert/strict'
import { classifyPointerRelease, normalizeDrawRect } from '../../src/lib/canvas/gesture-policy.ts'

test('short empty left drag is a click', () => {
  assert.equal(classifyPointerRelease({ button: 0, elapsedMs: 80, distance: 5, startedOnNode: false }), 'pane-click')
})

test('empty left drag draws a block', () => {
  assert.equal(classifyPointerRelease({ button: 0, elapsedMs: 120, distance: 40, startedOnNode: false }), 'draw-block')
})

test('short right press opens context and long right press links', () => {
  assert.equal(classifyPointerRelease({ button: 2, elapsedMs: 200, distance: 2, startedOnNode: true }), 'node-context')
  assert.equal(classifyPointerRelease({ button: 2, elapsedMs: 360, distance: 25, startedOnNode: true }), 'relation-drag')
  assert.equal(classifyPointerRelease({ button: 2, elapsedMs: 360, distance: 0, startedOnNode: true }), 'relation-drag')
})

test('draw rectangle keeps direction and minimum size', () => {
  assert.deepEqual(normalizeDrawRect({ x: 300, y: 220 }, { x: 100, y: 120 }), {
    x: 100, y: 120, width: 200, height: 100,
  })
})

test('small forward drag expands from the start point', () => {
  assert.deepEqual(normalizeDrawRect({ x: 100, y: 120 }, { x: 105, y: 125 }), {
    x: 100, y: 120, width: 120, height: 72,
  })
})

test('small reverse drag expands left and up from the start point', () => {
  assert.deepEqual(normalizeDrawRect({ x: 300, y: 220 }, { x: 295, y: 215 }), {
    x: 180, y: 148, width: 120, height: 72,
  })
})
