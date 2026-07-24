import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_RELATION,
  isValidRelationTarget,
  relationEdgeVisuals,
} from '../../src/lib/canvas/relation-policy.ts'

test('bidirectional dotted relation has two markers and dotted stroke', () => {
  const visuals = relationEdgeVisuals({ label: '相关', direction: 'both', lineStyle: 'dotted', color: '#0ea5e9', source: 'manual' })
  assert.equal(visuals.markerStart, true)
  assert.equal(visuals.markerEnd, true)
  assert.equal(visuals.strokeDasharray, '2 6')
})

test('relations require two different existing nodes', () => {
  const nodeIds = new Set(['a', 'b'])
  assert.equal(isValidRelationTarget('a', 'b', nodeIds), true)
  assert.equal(isValidRelationTarget('a', 'a', nodeIds), false)
  assert.equal(isValidRelationTarget('a', null, nodeIds), false)
  assert.equal(isValidRelationTarget('a', 'missing', nodeIds), false)
})

test('forward relation has no start marker', () => {
  const visuals = relationEdgeVisuals({ ...DEFAULT_RELATION, direction: 'forward' })
  assert.equal(visuals.markerStart, false)
  assert.equal(visuals.markerEnd, true)
})
