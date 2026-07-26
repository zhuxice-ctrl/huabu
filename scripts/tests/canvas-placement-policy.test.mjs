import test from 'node:test'
import assert from 'node:assert/strict'
import { findNearestFreePlacement } from '../../src/lib/canvas/placement-policy.ts'

const snapshot = zoom => ({
  x: 0,
  y: 0,
  zoom,
  containerLeft: 0,
  containerTop: 0,
  capturedAt: 1,
})

const rect = (x, y, width = 10, height = 10) => ({ x, y, width, height })

test('original target placement succeeds when free', () => {
  assert.deepEqual(findNearestFreePlacement({
    members: [{ id: 'source', rect: rect(0, 0) }],
    obstacles: [],
    targetTranslation: { x: 100, y: 80 },
    snapshot: snapshot(1),
  }), {
    status: 'placed',
    translation: { x: 100, y: 80 },
    checkedCandidates: 1,
  })
})

test('blocked target chooses the nearest candidate in up, right, down, left order', () => {
  const result = findNearestFreePlacement({
    members: [{ id: 'source', rect: rect(0, 0) }],
    obstacles: [{ id: 'block', rect: rect(0, 0) }],
    targetTranslation: { x: 0, y: 0 },
    snapshot: snapshot(1),
  })
  assert.deepEqual(result.translation, { x: 0, y: -32 })
  assert.equal(result.status, 'placed')
  assert.equal(result.checkedCandidates, 2)
})

test('candidate ties continue in cardinal order and are independent of member input order', () => {
  const obstacles = [
    { id: 'target-block', rect: rect(0, 0) },
    { id: 'up-block', rect: rect(0, -32) },
    { id: 'right-block', rect: rect(32, 0) },
    { id: 'down-block', rect: rect(0, 32) },
  ]
  const result = findNearestFreePlacement({
    members: [{ id: 'z-node', rect: rect(0, 0) }, { id: 'a-node', rect: rect(100, 100) }],
    obstacles,
    targetTranslation: { x: 0, y: 0 },
    snapshot: snapshot(1),
  })
  assert.deepEqual(result.translation, { x: -32, y: 0 })
})

test('rigid copy preserves relative member geometry', () => {
  const result = findNearestFreePlacement({
    members: [
      { id: 'a', rect: rect(0, 0, 10, 10) },
      { id: 'b', rect: rect(30, 20, 8, 6) },
    ],
    obstacles: [],
    targetTranslation: { x: 50, y: 60 },
    snapshot: snapshot(2),
  })
  assert.deepEqual(result.translation, { x: 50, y: 60 })
})

test('source members that already overlap are rejected', () => {
  const result = findNearestFreePlacement({
    members: [
      { id: 'a', rect: rect(0, 0, 10, 10) },
      { id: 'b', rect: rect(5, 5, 10, 10) },
    ],
    obstacles: [],
    targetTranslation: { x: 0, y: 0 },
    snapshot: snapshot(1),
  })
  assert.deepEqual(result, { status: 'invalid-source', checkedCandidates: 0 })
})

test('search honors radius and candidate caps', () => {
  const result = findNearestFreePlacement({
    members: [{ id: 'source', rect: rect(0, 0) }],
    obstacles: [{ id: 'block', rect: rect(-10000, -10000, 20000, 20000) }],
    targetTranslation: { x: 0, y: 0 },
    snapshot: snapshot(1),
    maxScreenRadius: 64,
    maxCandidates: 3,
  })
  assert.equal(result.status, 'no-space')
  assert.equal(result.checkedCandidates, 3)
})

test('default search cap is 4096 candidates at the 2400-screen-pixel radius', () => {
  const result = findNearestFreePlacement({
    members: [{ id: 'source', rect: rect(0, 0) }],
    obstacles: [{ id: 'block', rect: rect(-10000, -10000, 20000, 20000) }],
    targetTranslation: { x: 0, y: 0 },
    snapshot: snapshot(1),
  })
  assert.equal(result.status, 'no-space')
  assert.equal(result.checkedCandidates, 4096)
})
