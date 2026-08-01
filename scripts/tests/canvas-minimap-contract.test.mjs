import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  canvasTagColor,
  minimapNodeColor,
  normalizeCanvasTags,
} from '../../src/lib/canvas/minimap.ts'

test('canvas tags normalize case-insensitively and map deterministically to a palette', () => {
  assert.deepEqual(normalizeCanvasTags(['  资料 ', '资料', '参考']), ['资料', '参考'])
  assert.equal(canvasTagColor('资料'), canvasTagColor(' 资料 '))
  assert.match(canvasTagColor('参考'), /^#[0-9a-f]{6}$/i)
})

test('minimap uses generic tags, legacy image tags, then node color fallback', () => {
  assert.equal(minimapNodeColor({ id: 'tagged', type: 'text', position: { x: 0, y: 0 }, data: { tags: ['资料'] } }), canvasTagColor('资料'))
  assert.equal(minimapNodeColor({ id: 'legacy', type: 'image', position: { x: 0, y: 0 }, data: { imageTags: ['参考'] } }), canvasTagColor('参考'))
  assert.equal(minimapNodeColor({ id: 'colored', type: 'text', position: { x: 0, y: 0 }, data: { color: '#123456' } }), '#123456')
})

test('editor exposes center reset, minimap tag colors and editable node tags', async () => {
  const [editor, menu] = await Promise.all([
    readFile(new URL('../../src/app/core/main/canvas/canvas-editor.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../src/app/core/main/canvas/canvas-node-style-menu.tsx', import.meta.url), 'utf8'),
  ])
  assert.match(editor, /<MiniMap[^>]*nodeColor=\{minimapNodeColor\}/)
  assert.match(editor, /aria-label="回到中心"/)
  assert.match(editor, /fitView\(\{ padding: 0\.2, duration: 300 \}\)/)
  assert.match(menu, /节点标签/)
  assert.match(menu, /normalizeCanvasTags/)
})
