import test from 'node:test'
import assert from 'node:assert/strict'
import { classifyTextContent, estimateTextBlockSize } from '../../src/lib/canvas/content-ingest.ts'

test('urls become link cards and normal text becomes text blocks', () => {
  assert.equal(classifyTextContent('https://example.com').kind, 'link')
  assert.equal(classifyTextContent('旅行计划').kind, 'text')
})

test('text size stays inside the contract', () => {
  const size = estimateTextBlockSize('行程 '.repeat(300))
  assert.ok(size.width >= 240 && size.width <= 520)
  assert.ok(size.height >= 72)
})
