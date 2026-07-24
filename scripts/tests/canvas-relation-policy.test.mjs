import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_RELATION,
  isValidRelationTarget,
  normalizeRelationData,
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

test('legacy relations normalize to auto routing and width two', () => {
  const relation = normalizeRelationData({ label: '旧关系', direction: 'forward', lineStyle: 'solid', color: '#64748b', source: 'manual' })
  assert.equal(relation.routeType, 'auto')
  assert.equal(relation.strokeWidth, 2)
  assert.deepEqual(relation.waypoints, [])
})

test('invalid route values and waypoint coordinates are discarded', () => {
  const relation = normalizeRelationData({
    ...DEFAULT_RELATION,
    routeType: 'unknown',
    strokeWidth: 99,
    waypoints: [{ x: 20, y: 30 }, { x: Number.NaN, y: 8 }],
  })
  assert.equal(relation.routeType, 'auto')
  assert.equal(relation.strokeWidth, 8)
  assert.deepEqual(relation.waypoints, [{ x: 20, y: 30 }])
})
