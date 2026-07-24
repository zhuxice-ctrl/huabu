import test from 'node:test'
import assert from 'node:assert/strict'
import { chooseStartupCanvasId } from '../../src/lib/canvas/startup-policy.ts'

test('last canvas wins, then newest project', () => {
  const projects = [{ id: 'older', updatedAt: 10 }, { id: 'newer', updatedAt: 20 }]
  assert.equal(chooseStartupCanvasId(projects, 'older'), 'older')
  assert.equal(chooseStartupCanvasId(projects, 'missing'), 'newer')
  assert.equal(chooseStartupCanvasId([], null), null)
})

test('startup selection does not depend on a Markdown active tab', () => {
  assert.equal(chooseStartupCanvasId([{ id: 'canvas', updatedAt: 1 }], null), 'canvas')
})
