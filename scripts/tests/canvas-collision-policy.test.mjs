import test from 'node:test'
import assert from 'node:assert/strict'
import {
  COLLISION_EPSILON_SCREEN,
  SAFETY_GAP_SCREEN,
  SNAP_BREAK_SCREEN,
  SNAP_ENTRY_SCREEN,
  conflicts,
  isSolidCanvasNode,
  normalizeAabb,
  resolveActiveEdgeSnap,
  scoreLegacyConflicts,
  sweepRigidSet,
  thresholdsForSnapshot,
} from '../../src/lib/canvas/collision-policy.ts'

const snapshot = zoom => ({
  x: 0,
  y: 0,
  zoom,
  containerLeft: 0,
  containerTop: 0,
  capturedAt: 1,
})

const thresholds = { safetyGap: 6, snapEntry: 8, snapBreak: 14, epsilon: 0.25 }

test('screen collision constants use one viewport conversion boundary', () => {
  assert.deepEqual(
    [SAFETY_GAP_SCREEN, SNAP_ENTRY_SCREEN, SNAP_BREAK_SCREEN, COLLISION_EPSILON_SCREEN],
    [6, 8, 14, 0.25],
  )
  assert.deepEqual(thresholdsForSnapshot(snapshot(0.65)), {
    safetyGap: 9.2308,
    snapEntry: 12.3077,
    snapBreak: 21.5385,
    epsilon: 0.3846,
  })
  assert.deepEqual(thresholdsForSnapshot(snapshot(2)), {
    safetyGap: 3,
    snapEntry: 4,
    snapBreak: 7,
    epsilon: 0.125,
  })
})

test('solid classification excludes only registered decorative node types', () => {
  for (const type of ['text', 'note', 'image', 'file', 'link', 'todo', 'process', 'decision', 'terminator', 'future-card']) {
    assert.equal(isSolidCanvasNode({ id: type, type }), true, type)
  }
  assert.equal(isSolidCanvasNode({ id: 'ink', type: 'freehand' }), false)
  assert.equal(isSolidCanvasNode({ id: 'backdrop', type: 'group' }), false)
})

test('AABB normalization rejects non-finite geometry and normalizes negative dimensions', () => {
  assert.deepEqual(normalizeAabb({ x: 10, y: 20, width: -4, height: -6 }), {
    x: 6,
    y: 14,
    width: 4,
    height: 6,
  })
  for (const field of ['x', 'y', 'width', 'height']) {
    assert.equal(normalizeAabb({ x: 0, y: 0, width: 10, height: 10, [field]: Number.NaN }), null)
  }
})

test('safety expansion permits contact and epsilon penetration but rejects more', () => {
  const obstacle = { x: 20, y: 0, width: 10, height: 10 }
  assert.equal(conflicts({ x: 4, y: 0, width: 10, height: 10 }, obstacle, thresholds), false)
  assert.equal(conflicts({ x: 4.25, y: 0, width: 10, height: 10 }, obstacle, thresholds), false)
  assert.equal(conflicts({ x: 4.2501, y: 0, width: 10, height: 10 }, obstacle, thresholds), true)
  assert.equal(conflicts({ x: 4.2501, y: 30, width: 10, height: 10 }, obstacle, thresholds), false)
  assert.equal(conflicts({ x: 0, y: 0, width: Number.POSITIVE_INFINITY, height: 10 }, obstacle, thresholds), false)
})

test('active edges snap independently with hysteresis and deterministic ID ties', () => {
  const obstacles = [
    { id: 'z', rect: { x: 40, y: 40, width: 10, height: 10 } },
    { id: 'a', rect: { x: 40, y: 40, width: 10, height: 10 } },
  ]
  const entered = resolveActiveEdgeSnap({
    candidate: { x: 0, y: 0, width: 27, height: 27 },
    activeEdges: { x: 'max', y: 'max' },
    obstacles,
    thresholds,
  })
  assert.deepEqual(entered.rect, { x: 0, y: 0, width: 34, height: 34 })
  assert.equal(entered.snap.x?.obstacleId, 'a')
  assert.equal(entered.snap.y?.obstacleId, 'a')

  const held = resolveActiveEdgeSnap({
    candidate: { x: 0, y: 20, width: 46, height: 20 },
    activeEdges: { x: 'max' },
    obstacles,
    thresholds,
    snap: entered.snap,
  })
  assert.equal(held.rect.width, 34)
  assert.equal(held.snap.x?.obstacleId, 'a')
  assert.equal(held.snap.y, undefined)

  const brokenTowardObstacle = resolveActiveEdgeSnap({
    candidate: { x: 0, y: 20, width: 49, height: 20 },
    activeEdges: { x: 'max' },
    obstacles,
    thresholds,
    snap: held.snap,
  })
  assert.equal(brokenTowardObstacle.rect.width, 49)
  assert.equal(brokenTowardObstacle.snap.x, undefined)

  const retreated = resolveActiveEdgeSnap({
    candidate: { x: 0, y: 20, width: 25, height: 20 },
    activeEdges: { x: 'max' },
    obstacles,
    thresholds,
    snap: held.snap,
  })
  assert.equal(retreated.rect.width, 25)
  assert.equal(retreated.snap.x, undefined)
})

test('active edge hysteresis releases stale or perpendicularly irrelevant obstacle ownership', () => {
  const obstacle = { id: 'owner', rect: { x: 40, y: 40, width: 10, height: 10 } }
  const entered = resolveActiveEdgeSnap({
    candidate: { x: 0, y: 40, width: 27, height: 10 },
    activeEdges: { x: 'max' },
    obstacles: [obstacle],
    thresholds,
  })
  assert.equal(entered.snap.x?.obstacleId, 'owner')

  for (const scenario of [
    { label: 'deleted', obstacles: [], candidate: { x: 0, y: 40, width: 40, height: 10 } },
    {
      label: 'moved',
      obstacles: [{ id: 'owner', rect: { x: 80, y: 40, width: 10, height: 10 } }],
      candidate: { x: 0, y: 40, width: 40, height: 10 },
    },
    {
      label: 'perpendicular release',
      obstacles: [obstacle],
      candidate: { x: 0, y: 100, width: 40, height: 10 },
    },
  ]) {
    const released = resolveActiveEdgeSnap({
      candidate: scenario.candidate,
      activeEdges: { x: 'max' },
      obstacles: scenario.obstacles,
      thresholds,
      snap: entered.snap,
    })
    assert.equal(released.rect.width, 40, scenario.label)
    assert.equal(released.snap.x, undefined, scenario.label)
  }
})

test('swept rigid movement selects earliest contact and cannot tunnel through a one-pixel wall', () => {
  const result = sweepRigidSet({
    members: [{ id: 'moving', rect: { x: 0, y: 0, width: 10, height: 10 } }],
    obstacles: [
      { id: 'far', rect: { x: 90, y: -20, width: 1, height: 50 } },
      { id: 'wall', rect: { x: 50, y: -20, width: 1, height: 50 } },
    ],
    delta: { x: 200, y: 0 },
    thresholds,
  })
  assert.equal(result.valid, true)
  assert.equal(result.delta.x, 34.25)
  assert.equal(result.delta.y, 0)
  assert.equal(result.contacts[0]?.obstacleId, 'wall')
  assert.equal(conflicts(result.members[0].rect, { x: 50, y: -20, width: 1, height: 50 }, thresholds), false)
})

test('swept AABB returns stable contact normals in all four directions', () => {
  const cases = [
    { start: { x: 0, y: 50 }, delta: { x: 100, y: 0 }, expected: { x: 34.25, y: 0 }, normal: -1, axis: 'x' },
    { start: { x: 100, y: 50 }, delta: { x: -100, y: 0 }, expected: { x: -34.25, y: 0 }, normal: 1, axis: 'x' },
    { start: { x: 50, y: 0 }, delta: { x: 0, y: 100 }, expected: { x: 0, y: 34.25 }, normal: -1, axis: 'y' },
    { start: { x: 50, y: 100 }, delta: { x: 0, y: -100 }, expected: { x: 0, y: -34.25 }, normal: 1, axis: 'y' },
  ]
  for (const scenario of cases) {
    const result = sweepRigidSet({
      members: [{ id: 'moving', rect: { ...scenario.start, width: 10, height: 10 } }],
      obstacles: [{ id: 'obstacle', rect: { x: 50, y: 50, width: 10, height: 10 } }],
      delta: scenario.delta,
      thresholds,
    })
    assert.deepEqual(result.delta, scenario.expected)
    assert.equal(result.contacts[0]?.normal, scenario.normal)
    assert.equal(result.contacts[0]?.axis, scenario.axis)
  }
})

test('four-pass rigid-set sliding preserves member geometry and stops at a corner', () => {
  const members = [
    { id: 'left', rect: { x: 0, y: 0, width: 10, height: 10 } },
    { id: 'right', rect: { x: 20, y: 0, width: 10, height: 10 } },
  ]
  const result = sweepRigidSet({
    members,
    obstacles: [
      { id: 'vertical', rect: { x: 50, y: -100, width: 10, height: 200 } },
      { id: 'horizontal', rect: { x: -100, y: 50, width: 200, height: 10 } },
    ],
    delta: { x: 100, y: 100 },
    thresholds,
    maxPasses: 4,
  })
  assert.equal(result.valid, true)
  assert.ok(result.passes <= 4)
  assert.deepEqual(result.delta, { x: 14.25, y: 34.25 })
  assert.equal(result.members[1].rect.x - result.members[0].rect.x, 20)
  assert.equal(result.members[1].rect.y - result.members[0].rect.y, 0)
})

test('a simultaneous corner contact blocks both axes while a tangent move stays free', () => {
  const corner = sweepRigidSet({
    members: [{ id: 'moving', rect: { x: 0, y: 0, width: 10, height: 10 } }],
    obstacles: [{ id: 'corner', rect: { x: 50, y: 50, width: 10, height: 10 } }],
    delta: { x: 100, y: 100 },
    thresholds,
  })
  assert.deepEqual(corner.delta, { x: 34.25, y: 34.25 })
  assert.deepEqual(corner.contacts.map(contact => contact.axis), ['x', 'y'])

  const tangent = sweepRigidSet({
    members: [{ id: 'moving', rect: { x: 34.25, y: 0, width: 10, height: 10 } }],
    obstacles: [{ id: 'wall', rect: { x: 50, y: 50, width: 10, height: 10 } }],
    delta: { x: 0, y: 100 },
    thresholds,
  })
  assert.deepEqual(tangent.delta, { x: 0, y: 100 })
  assert.deepEqual(tangent.contacts, [])
})

test('rigid-set member gaps stay empty rather than becoming a bounding-box obstacle', () => {
  const result = sweepRigidSet({
    members: [
      { id: 'left', rect: { x: 0, y: 0, width: 10, height: 10 } },
      { id: 'right', rect: { x: 30, y: 0, width: 10, height: 10 } },
    ],
    obstacles: [{ id: 'between', rect: { x: 18, y: 50, width: 4, height: 10 } }],
    delta: { x: 0, y: 100 },
    thresholds,
  })
  assert.deepEqual(result.delta, { x: 0, y: 100 })
  assert.equal(result.members[1].rect.x - result.members[0].rect.x, 30)
})

test('rigid-set sweep rejects non-finite input without returning non-finite geometry', () => {
  const result = sweepRigidSet({
    members: [{ id: 'bad', rect: { x: 0, y: 0, width: Number.NaN, height: 10 } }],
    obstacles: [],
    delta: { x: 10, y: 0 },
    thresholds,
  })
  assert.equal(result.valid, false)
  assert.deepEqual(result.members, [])
  assert.deepEqual(result.delta, { x: 0, y: 0 })
})

test('rigid-set sweep fails closed when any obstacle has non-finite geometry', () => {
  const result = sweepRigidSet({
    members: [{ id: 'moving', rect: { x: 0, y: 0, width: 10, height: 10 } }],
    obstacles: [{ id: 'bad-obstacle', rect: { x: 40, y: 0, width: Number.NaN, height: 10 } }],
    delta: { x: 100, y: 0 },
    thresholds,
  })
  assert.equal(result.valid, false)
  assert.deepEqual(result.members, [])
  assert.deepEqual(result.delta, { x: 0, y: 0 })
})

test('legacy conflict score is stable, scoped, and uses pair count then summed MTD', () => {
  const score = scoreLegacyConflicts({
    entities: [
      { id: 'b', rect: { x: 12, y: 0, width: 10, height: 10 } },
      { id: 'a', rect: { x: 0, y: 0, width: 10, height: 10 } },
      { id: 'unrelated', rect: { x: 100, y: 100, width: 10, height: 10 } },
    ],
    movingIds: ['a'],
    thresholds,
  })
  assert.deepEqual(score, {
    valid: true,
    pairCount: 1,
    totalMtd: 4,
    pairs: [{ ids: ['a', 'b'], mtd: 4 }],
  })
})

test('legacy conflict scoring stays finite for extreme finite rectangles and fails closed on total overflow', () => {
  const extremeRect = { x: -1e308, y: -1e308, width: 1e308, height: 1e308 }
  const finite = scoreLegacyConflicts({
    entities: [
      { id: 'a', rect: extremeRect },
      { id: 'b', rect: extremeRect },
    ],
    thresholds,
  })
  assert.equal(finite.valid, true)
  assert.equal(finite.pairCount, 1)
  assert.equal(Number.isFinite(finite.pairs[0]?.mtd), true)
  assert.equal(Number.isFinite(finite.totalMtd), true)
  assert.equal(finite.pairs[0]?.mtd, 1e308)
  assert.equal(finite.totalMtd, 1e308)

  const overflow = scoreLegacyConflicts({
    entities: [
      { id: 'a', rect: extremeRect },
      { id: 'b', rect: extremeRect },
      { id: 'c', rect: extremeRect },
    ],
    thresholds,
  })
  assert.deepEqual(overflow, {
    valid: false,
    pairCount: 0,
    totalMtd: 0,
    pairs: [],
  })
})
