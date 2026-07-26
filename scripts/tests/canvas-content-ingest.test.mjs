import test from 'node:test'
import assert from 'node:assert/strict'
import {
  classifyTextContent,
  draftsFromTransfer,
  estimateTextBlockSize,
  materializeIngestDraft,
  stackIngestDrafts,
  canvasFontSizeForScreenInput,
  screenFontSizeForCanvasFont,
} from '../../src/lib/canvas/content-ingest.ts'
import { captureViewportSnapshot } from '../../src/lib/canvas/viewport-sizing.ts'

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

test('multiple drafts stack vertically with a six-screen-pixel gap at non-unit zoom', () => {
  const snapshot = captureViewportSnapshot({
    viewport: { x: 0, y: 0, zoom: 2 },
    containerRect: { left: 0, top: 0 },
  })
  const drafts = [
    materializeIngestDraft({ kind: 'text', text: 'a', screenSize: { width: 100, height: 40 } }, snapshot),
    materializeIngestDraft({ kind: 'link', url: 'https://example.com', label: 'x', screenSize: { width: 100, height: 20 } }, snapshot),
  ]
  assert.deepEqual(stackIngestDrafts(drafts, snapshot).map(item => item.position), [
    { x: 0, y: 0 },
    { x: 0, y: 23 },
  ])
})

test('resource failures are compacted before vertical stacking', () => {
  const snapshot = captureViewportSnapshot({
    viewport: { x: 0, y: 0, zoom: 1 },
    containerRect: { left: 0, top: 0 },
  })
  const valid = materializeIngestDraft({ kind: 'text', text: 'a', screenSize: { width: 100, height: 40 } }, snapshot)
  const failed = { ...valid, canvasSize: { width: Number.NaN, height: 40 } }
  const result = stackIngestDrafts([failed, valid], snapshot)
  assert.deepEqual(result.map(item => item.position), [{ x: 0, y: 0 }])
})

test('ingest drafts materialize screen intent through one captured viewport', () => {
  const snapshot = captureViewportSnapshot({
    viewport: { x: 10, y: 20, zoom: 0.5 },
    containerRect: { left: 100, top: 200 },
  })
  const draft = draftsFromTransfer({ files: [], html: '', text: '旅行计划' })[0]
  const materialized = materializeIngestDraft(draft, snapshot)

  assert.deepEqual(materialized.canvasSize, {
    width: draft.screenSize.width * 2,
    height: draft.screenSize.height * 2,
  })
  assert.equal(materialized.fontSize, 30)
  assert.equal(materialized.contentScale, 2)
})

test('style font conversion observes captured zoom and rejects invalid submissions', () => {
  const snapshot = captureViewportSnapshot({
    viewport: { x: 0, y: 0, zoom: 0.65 },
    containerRect: { left: 0, top: 0 },
  })
  assert.equal(screenFontSizeForCanvasFont(23.0769, snapshot), 15)
  assert.equal(canvasFontSizeForScreenInput(15, snapshot), 23.0769)
  assert.equal(canvasFontSizeForScreenInput(7.99, snapshot), null)
  assert.equal(canvasFontSizeForScreenInput(96.01, snapshot), null)
  assert.equal(canvasFontSizeForScreenInput(Number.NaN, snapshot), null)
})
