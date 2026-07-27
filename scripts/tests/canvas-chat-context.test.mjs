import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../../', import.meta.url)

async function source(path) {
  return readFile(new URL(path, root), 'utf8')
}

test('canvas chat context captures a stable source snapshot and tolerates old data', async () => {
  const context = await source('src/lib/chat/canvas-context.ts')
  assert.match(context, /export interface CanvasChatContext/)
  assert.match(context, /sourceCanvasId: string \| null/)
  assert.match(context, /sourceCanvasTitle: string \| null/)
  assert.match(context, /sourceNodeIds\?: string\[\]/)
  assert.match(context, /sentAt: number/)
  assert.match(context, /function parseCanvasChatContext/)
  assert.match(context, /function mergeCanvasContextNodeIds/)
  assert.match(context, /sourceNodeIds: validatedNodeIds/)
  assert.match(context, /catch/)
  assert.match(context, /来源未记录/)
})

test('chat send captures one canvas snapshot before asynchronous work and shares it with the reply', async () => {
  const send = await source('src/app/core/main/chat/chat-send.tsx')
  assert.match(send, /const canvasContext = createCanvasChatContext\(/)
  assert.match(send, /const sentAt = Date\.now\(\)/)
  assert.match(send, /canvasContext,/)
  assert.match(send, /handleAgentMode\(imageUrls, canvasContext\)/)
  assert.match(send, /canvasContext: currentMessage\?\.canvasContext \?\? canvasContext/)
})

test('chat content hides absent sources and renders renamed, missing, and invalid source states', async () => {
  const content = await source('src/app/core/main/chat/chat-content.tsx')
  const context = await source('src/lib/chat/canvas-context.ts')
  assert.match(content, /parseCanvasChatContext/)
  assert.match(content, /if \(canvasContext\.sourceCanvasId === null\) \{\s*return null\s*\}/)
  assert.match(content, /currentProject\?\.title \?\? canvasContext\.sourceCanvasTitle/)
  assert.match(content, /来源画布已删除/)
  assert.match(context, /来源未记录/)
  assert.match(content, /useCanvasStore\.setState\(\{ activeCanvasId: canvasContext\.sourceCanvasId \}\)/)
  assert.doesNotMatch(content, /setActiveCanvasId\(canvasContext\.sourceCanvasId\)/)
  assert.match(content, /canvas-focus-node/)
})
