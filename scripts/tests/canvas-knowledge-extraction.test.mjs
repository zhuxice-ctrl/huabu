import assert from 'node:assert/strict'
import test from 'node:test'

import { extractCanvasKnowledgeAnchors } from '../../src/lib/canvas/knowledge-extraction.ts'

const node = (data, type = 'file') => ({
  id: 'node-1',
  type,
  position: { x: 12, y: 34 },
  data,
})

test('knowledge extraction creates recoverable node/range anchors for supported canvas content', () => {
  const result = extractCanvasKnowledgeAnchors({
    canvasId: 'canvas-a',
    workspaceId: 'workspace-a',
    contentRevision: 'revision-a',
    node: node({
      label: 'Travel plan',
      referenceExcerpt: 'Meet Alice at 09:00.',
      ocrText: 'Passport number appears on this image.',
      pdfText: 'PDF itinerary for 2026-08-12.',
      officeText: 'Office budget notes.',
      webSnapshot: 'Snapshot of the hotel page.',
      videoMetadata: { title: 'Trip briefing', description: 'Recorded planning session.' },
      subtitles: 'Alice: book the train.',
      notes: 'Bring umbrella.',
      attachment: { id: 'attachment-1', filename: 'trip.pdf', directory: 'travel/2026', notes: 'final copy' },
    }),
  })

  assert.equal(result.failures.length, 0)
  assert.ok(result.anchors.length >= 11)
  assert.ok(result.anchors.every(anchor => anchor.canvasId === 'canvas-a'))
  assert.ok(result.anchors.every(anchor => anchor.nodeId === 'node-1'))
  assert.ok(result.anchors.every(anchor => anchor.startOffset >= 0 && anchor.endOffset > anchor.startOffset))
  assert.ok(result.anchors.every(anchor => anchor.nodePosition.x === 12 && anchor.nodePosition.y === 34))
  assert.ok(result.anchors.some(anchor => anchor.contentType === 'image-ocr'))
  assert.ok(result.anchors.some(anchor => anchor.contentType === 'pdf-text'))
  assert.ok(result.anchors.some(anchor => anchor.contentType === 'office-text'))
  assert.ok(result.anchors.some(anchor => anchor.contentType === 'web-snapshot'))
  assert.ok(result.anchors.some(anchor => anchor.contentType === 'video-subtitle'))
  assert.ok(result.anchors.some(anchor => anchor.attachmentId === 'attachment-1'))
})

test('a failed extractor is isolated and leaves successful anchors recoverable', () => {
  const result = extractCanvasKnowledgeAnchors({
    canvasId: 'canvas-a',
    workspaceId: 'workspace-a',
    contentRevision: 'revision-a',
    node: node({ label: 'Still index this text' }, 'text'),
    extractors: [
      () => { throw new Error('token=super-secret') },
    ],
  })

  assert.ok(result.anchors.some(anchor => anchor.plainText === 'Still index this text'))
  assert.equal(result.failures.length, 1)
  assert.equal(result.failures[0].message.includes('super-secret'), false)
})

test('worker retries before replacing persisted anchors when extraction is incomplete', async () => {
  const source = await import('node:fs/promises').then(({ readFile }) => readFile(
    new URL('../../src/db/canvas-index.ts', import.meta.url), 'utf8',
  ))
  const failureGuard = source.indexOf('if (extraction.failures.length > 0)')
  const transaction = source.indexOf('const recorder = createStatementRecorder()', failureGuard)
  const replacement = source.indexOf('await replaceCanvasKnowledgeAnchors', failureGuard)
  assert.ok(failureGuard >= 0)
  assert.ok(transaction > failureGuard)
  assert.ok(replacement > failureGuard)
  assert.match(source.slice(failureGuard, transaction), /retryCanvasIndexJob[\s\S]*return 'retry'/)
})
