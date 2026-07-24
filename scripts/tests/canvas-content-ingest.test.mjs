import test from 'node:test'
import assert from 'node:assert/strict'
import {
  classifyTextContent,
  draftsFromTransfer,
  estimateTextBlockSize,
  offsetIngestDrafts,
} from '../../src/lib/canvas/content-ingest.ts'

test('urls become link cards and normal text becomes text blocks', () => {
  assert.equal(classifyTextContent('https://example.com').kind, 'link')
  assert.equal(classifyTextContent('旅行计划').kind, 'text')
})

test('text size stays inside the contract', () => {
  const size = estimateTextBlockSize('行程 '.repeat(300))
  assert.ok(size.width >= 240 && size.width <= 520)
  assert.ok(size.height >= 72)
})

test('files take precedence over text and retain their media kind', () => {
  const image = new File(['png'], 'map.png', { type: 'image/png' })
  const document = new File(['hello'], 'plan.txt', { type: 'text/plain' })
  const drafts = draftsFromTransfer({ files: [image, document], html: '<b>ignored</b>', text: 'ignored' })
  assert.deepEqual(drafts.map(draft => draft.kind), ['image', 'file'])
})

test('sanitized html falls back to text and empty input creates nothing', () => {
  assert.equal(draftsFromTransfer({ files: [], html: '<p>旅行<br>清单</p>', text: '' })[0].kind, 'text')
  assert.deepEqual(draftsFromTransfer({ files: [], html: '', text: '   ' }), [])
})

test('multiple drafts cascade by 28 pixels', () => {
  assert.deepEqual(offsetIngestDrafts([{ kind: 'text' }, { kind: 'link' }], { x: 100, y: 80 }), [
    { draft: { kind: 'text' }, position: { x: 100, y: 80 } },
    { draft: { kind: 'link' }, position: { x: 128, y: 108 } },
  ])
})
