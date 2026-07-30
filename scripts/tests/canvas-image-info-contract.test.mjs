import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('image metadata drafts initialize only when the dialog opens', async () => {
  const source = await readFile(new URL('../../src/app/core/main/canvas/canvas-image-info.tsx', import.meta.url), 'utf8')
  assert.match(source, /const wasOpenRef = useRef\(false\)/)
  assert.match(source, /imageInfoDraftInitialization\(wasOpenRef\.current, open, initial\)/)
  assert.match(source, /wasOpenRef\.current = open/)
})

test('image context menu opens one metadata editor and saves through one checkpoint', async () => {
  const editor = await readFile(new URL('../../src/app/core/main/canvas/canvas-editor.tsx', import.meta.url), 'utf8')
  const saveHandler = editor.match(/const saveImageInfo = useCallback\([\s\S]*?\r?\n  \}, \[imageInfoNodeId, pushHistory, updateFlowNodes\]\)/)?.[0] || ''
  assert.match(editor, /图片信息/)
  assert.match(editor, /setImageInfoNodeId/)
  assert.equal(saveHandler.match(/pushHistory\(\)/g)?.length, 1)
  assert.match(saveHandler, /pushHistory\(\)[\s\S]*imageTags:[\s\S]*registerCanvasImageTags\(value\.tags\)[\s\S]*setImageInfoNodeId\(null\)/)
})

test('cancel closes image metadata without invoking the save callback', async () => {
  const source = await readFile(new URL('../../src/app/core/main/canvas/canvas-image-info.tsx', import.meta.url), 'utf8')
  const cancelButton = source.match(/<Button[^>]*onClick=\{\(\) => onOpenChange\(false\)\}>取消<\/Button>/)?.[0] || ''
  assert.match(cancelButton, /onOpenChange\(false\)/)
  assert.doesNotMatch(cancelButton, /onSave/)
  assert.match(source, /onClick=\{\(\) => onSave\(/)
})
