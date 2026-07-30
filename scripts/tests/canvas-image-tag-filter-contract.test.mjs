import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('canvas image tag filter is transient and navigates matching ids', async () => {
  const [filter, editor] = await Promise.all([
    readFile(new URL('../../src/app/core/main/canvas/canvas-image-tag-filter.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../src/app/core/main/canvas/canvas-editor.tsx', import.meta.url), 'utf8'),
  ])
  assert.match(filter, /selectedTags/)
  assert.match(filter, /onPrevious/)
  assert.match(filter, /onNext/)
  assert.match(filter, /清除筛选/)
  assert.match(filter, /OR 匹配当前画布/)
  assert.match(editor, /orderedMatchingImageIds/)
  assert.match(editor, /imageTagFilterState: 'match' \| 'dim' \| undefined/)
  assert.match(editor, /\? 'match'[\s\S]*\? 'dim'/)
  assert.match(editor, /animateCanvasViewportState\(canvasId, targetViewport, 260\)/)
  assert.match(editor, /currentZoom: Math\.max\(viewport\.zoom, 0\.8\)/)
  assert.doesNotMatch(editor, /updateDocument\([\s\S]{0,300}selectedImageTags/)
  assert.match(editor, /canvas-image-tag-match/)
  assert.match(editor, /opacity: 0\.25/)
})

test('image tag catalog recovery is connected without persisting the active filter', async () => {
  const [editor, store] = await Promise.all([
    readFile(new URL('../../src/app/core/main/canvas/canvas-editor.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../src/stores/canvas-image-tags.ts', import.meta.url), 'utf8'),
  ])
  assert.match(editor, /initCanvasImageTags\(\)/)
  assert.match(editor, /mergeCanvasImageTagsFromNodes\(nodes\)/)
  assert.doesNotMatch(store, /persistCatalog\([^)]*selectedByCanvas/)
  assert.doesNotMatch(store, /store\.set\([^\n]*selectedByCanvas/)
})
