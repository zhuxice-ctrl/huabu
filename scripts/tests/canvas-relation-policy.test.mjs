import test from 'node:test'
import assert from 'node:assert/strict'
import { relationEdgeVisuals } from '../../src/lib/canvas/relation-policy.ts'

test('bidirectional dotted relation has two markers and dotted stroke', () => {
  const visuals = relationEdgeVisuals({ label: '相关', direction: 'both', lineStyle: 'dotted', color: '#0ea5e9', source: 'manual' })
  assert.equal(visuals.markerStart, true)
  assert.equal(visuals.markerEnd, true)
  assert.equal(visuals.strokeDasharray, '2 6')
})
