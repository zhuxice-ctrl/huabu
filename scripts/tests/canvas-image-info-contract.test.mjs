import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('image node hides the permanent label and exposes hover metadata', async () => {
  const source = await readFile(new URL('../../src/app/core/main/canvas/nodes/canvas-nodes.tsx', import.meta.url), 'utf8')
  const imageSection = source.slice(source.indexOf('export const ImageCanvasNode'), source.indexOf('export const GroupCanvasNode'))
  assert.doesNotMatch(imageSection, /<BaseNodeContent/)
  assert.match(imageSection, /group-hover:opacity-100/)
  assert.match(imageSection, /pointer-events-none/)
  assert.match(imageSection, /imageTags/)
})

test('image context menu opens one metadata editor and saves through one checkpoint', async () => {
  const editor = await readFile(new URL('../../src/app/core/main/canvas/canvas-editor.tsx', import.meta.url), 'utf8')
  assert.match(editor, /图片信息/)
  assert.match(editor, /setImageInfoNodeId/)
  assert.match(editor, /pushHistory\(\)[\s\S]*imageTags/)
})
