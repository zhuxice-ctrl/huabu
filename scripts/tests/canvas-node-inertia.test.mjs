import test from 'node:test'
import assert from 'node:assert/strict'
import {
  appendPointerSample,
  inertiaProgress,
  planNodeInertia,
  releaseVelocity,
} from '../../src/lib/canvas/node-inertia.ts'

test('samples retain only the latest 80ms and calculate weighted release velocity', () => {
  let samples = []
  samples = appendPointerSample(samples, { x: 0, y: 0, time: 0 })
  samples = appendPointerSample(samples, { x: 10, y: 0, time: 50 })
  samples = appendPointerSample(samples, { x: 30, y: 0, time: 100 })
  assert.deepEqual(samples.map(item => item.time), [50, 100])
  assert.ok(releaseVelocity(samples).x > 0.35)
})

test('slow release has no inertia and fast release stays capped', () => {
  assert.equal(planNodeInertia({ x: 0.2, y: 0 }), null)
  const plan = planNodeInertia({ x: 4, y: 0 })
  assert.ok(plan)
  assert.equal(plan.durationMs, 160)
  assert.ok(plan.screenDistance >= 40 && plan.screenDistance <= 56)
  assert.equal(Math.hypot(plan.delta.x, plan.delta.y), plan.screenDistance)
})

test('inertia progress is monotonic and ends exactly at one', () => {
  const values = [0, 40, 80, 120, 160].map(time => inertiaProgress(time, 160))
  assert.deepEqual([...values].sort((a, b) => a - b), values)
  assert.equal(values[0], 0)
  assert.equal(values.at(-1), 1)
})
