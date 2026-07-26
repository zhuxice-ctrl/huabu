import test from 'node:test'
import assert from 'node:assert/strict'
import { CanvasSpatialIndex } from '../../src/lib/canvas/spatial-index.ts'

const record = (id, x, y, width, height, geometryVersion = 1) => ({
  id,
  rect: { x, y, width, height },
  geometryVersion,
})

test('rebuild stores finite records, normalizes rectangles, and increments version', () => {
  const index = new CanvasSpatialIndex()
  assert.equal(index.version, 0)
  const rebuilt = index.rebuild([
    record('b', 20, 20, -5, -5, 4),
    record('a', 0, 0, 10, 10, 3),
    record('bad', Number.NaN, 0, 10, 10, 1),
  ])
  assert.equal(rebuilt, 2)
  assert.equal(index.version, 1)
  assert.deepEqual(index.query({ x: -100, y: -100, width: 1000, height: 1000 }), [
    record('a', 0, 0, 10, 10, 3),
    record('b', 15, 15, 5, 5, 4),
  ])
})

test('upsert, remove, and rebuild expose monotonic content versions', () => {
  const index = new CanvasSpatialIndex([record('a', 0, 0, 10, 10)])
  assert.equal(index.version, 1)
  assert.equal(index.upsert(record('a', 50, 0, 10, 10, 2)), true)
  assert.equal(index.version, 2)
  assert.equal(index.upsert(record('a', 50, 0, 10, 10, 2)), false)
  assert.equal(index.version, 2)
  assert.equal(index.remove('missing'), false)
  assert.equal(index.version, 2)
  assert.equal(index.remove('a'), true)
  assert.equal(index.version, 3)
  index.rebuild([])
  assert.equal(index.version, 4)
})

test('queries are normalized, inclusive, deterministic, and return defensive copies', () => {
  const index = new CanvasSpatialIndex([
    record('z', 10, 10, 5, 5),
    record('a', 0, 0, 10, 10),
    record('outside', 100, 100, 1, 1),
  ])
  const hits = index.query({ x: 12, y: 12, width: -2, height: -2 })
  assert.deepEqual(hits.map(hit => hit.id), ['a', 'z'])
  hits[0].rect.x = 999
  assert.equal(index.query({ x: 0, y: 0, width: 1, height: 1 })[0].rect.x, 0)
  assert.deepEqual(index.query({ x: 0, y: 0, width: Number.NaN, height: 1 }), [])
})

test('invalid upserts and geometry versions are rejected without changing the index', () => {
  const index = new CanvasSpatialIndex()
  assert.equal(index.upsert(record('bad-rect', 0, 0, Number.POSITIVE_INFINITY, 1)), false)
  assert.equal(index.upsert(record('bad-version', 0, 0, 1, 1, Number.NaN)), false)
  assert.equal(index.version, 0)
  assert.deepEqual(index.query({ x: -10, y: -10, width: 20, height: 20 }), [])
})
