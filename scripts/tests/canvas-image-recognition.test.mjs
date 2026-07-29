import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  imageRecognitionCacheKey,
  planCanvasImageRecognition,
  recognitionKnowledgeParts,
} from '../../src/lib/canvas/canvas-image-recognition.ts'

test('cache identity changes with image bytes, node revision or model', () => {
  assert.notEqual(
    imageRecognitionCacheKey({ canvasId: 'c', nodeId: 'n', contentRevision: 'r1', imageHash: 'h1', modelKey: 'm1' }),
    imageRecognitionCacheKey({ canvasId: 'c', nodeId: 'n', contentRevision: 'r2', imageHash: 'h1', modelKey: 'm1' }),
  )
})

test('sensitive background recognition is local only', () => {
  assert.deepEqual(planCanvasImageRecognition({ enabled: true, sensitive: true, modelConfigured: true, explicitRequest: false, confirmed: false }), {
    runOcr: true, runVision: false, requiresConfirmation: false,
  })
  assert.equal(planCanvasImageRecognition({ enabled: true, sensitive: true, modelConfigured: true, explicitRequest: true, confirmed: false }).requiresConfirmation, true)
})

test('OCR and vision become separate image anchors', () => {
  assert.deepEqual(recognitionKnowledgeParts({ ocrText: '按钮文字', visionDescription: '一张飞书聊天截图' }), [
    { contentType: 'image-ocr', text: '按钮文字' },
    { contentType: 'image-description', text: '一张飞书聊天截图' },
  ])
})

test('derived cache stores only recognition metadata and bound values', async () => {
  const dbSource = await readFile(new URL('../../src/db/canvas-image-recognition.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(dbSource, /base64|credentialRef|Authorization|Bearer/)
  assert.match(dbSource, /canvas_image_recognition/)
  assert.match(dbSource, /\$1/)
})
