import test from 'node:test'
import assert from 'node:assert/strict'
import { buildRelationPath } from '../../src/lib/canvas/relation-routing.ts'

test('manual routing includes every persisted waypoint', () => {
  const result = buildRelationPath({
    source: { x: 0, y: 0 }, target: { x: 200, y: 100 }, routeType: 'manual',
    waypoints: [{ x: 50, y: 80 }, { x: 150, y: 20 }], obstacles: [],
  })
  assert.match(result.path, /50 80/)
  assert.match(result.path, /150 20/)
  assert.deepEqual(result.editablePoints, [{ x: 50, y: 80 }, { x: 150, y: 20 }])
})

test('auto routing inserts an outside route when a block intersects the direct corridor', () => {
  const result = buildRelationPath({
    source: { x: 0, y: 50 }, target: { x: 200, y: 50 }, routeType: 'auto', waypoints: [],
    obstacles: [{ x: 80, y: 20, width: 40, height: 60 }],
  })
  assert.equal(result.avoidedObstacle, true)
  assert.notEqual(result.path, 'M 0 50 L 200 50')
})

test('straight and bezier modes use distinct paths', () => {
  const common = { source: { x: 0, y: 0 }, target: { x: 100, y: 50 }, waypoints: [], obstacles: [] }
  assert.equal(buildRelationPath({ ...common, routeType: 'straight' }).path, 'M 0 0 L 100 50')
  assert.match(buildRelationPath({ ...common, routeType: 'bezier' }).path, /^M 0 0 C /)
})

test('orthogonal mode routes through the midpoint column', () => {
  const result = buildRelationPath({
    source: { x: 0, y: 0 }, target: { x: 100, y: 80 }, routeType: 'orthogonal', waypoints: [], obstacles: [],
  })
  assert.match(result.path, /50 0/)
  assert.match(result.path, /50 80/)
})
