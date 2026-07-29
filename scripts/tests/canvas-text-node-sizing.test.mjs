import assert from 'node:assert/strict'
import test from 'node:test'
import {
  normalizeTextManualMinHeight,
  resolveTextNodeHeight,
  resolveTextResize,
} from '../../src/lib/canvas/text-node-sizing.ts'

test('drawn height becomes the minimum and wrapped content grows only vertically', () => {
  assert.equal(normalizeTextManualMinHeight(undefined, 73), 73)
  assert.equal(resolveTextNodeHeight({ measuredContentHeight: 110, chromeHeight: 16, manualMinHeight: 73 }), 126)
  assert.equal(resolveTextNodeHeight({ measuredContentHeight: 20, chromeHeight: 16, manualMinHeight: 73 }), 73)
})

test('horizontal resize preserves width and recomputes height while vertical resize replaces the minimum', () => {
  assert.deepEqual(resolveTextResize({ width: 240, height: 120, previousManualMinHeight: 73, changedWidth: true, changedHeight: false }), {
    width: 240, manualMinHeight: 73, shouldMeasure: true,
  })
  assert.deepEqual(resolveTextResize({ width: 240, height: 120, previousManualMinHeight: 73, changedWidth: false, changedHeight: true }), {
    width: 240, manualMinHeight: 120, shouldMeasure: true,
  })
})

test('invalid measurements retain the manual minimum', () => {
  assert.equal(resolveTextNodeHeight({ measuredContentHeight: Number.NaN, chromeHeight: 16, manualMinHeight: 73 }), 73)
})
