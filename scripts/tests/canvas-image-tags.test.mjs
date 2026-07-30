import test from 'node:test'
import assert from 'node:assert/strict'
import {
  mergeImageTagCatalog,
  normalizeImageTags,
  orderedMatchingImageIds,
} from '../../src/lib/canvas/image-tags.ts'

const image = (id, x, y, tags) => ({ id, type: 'image', position: { x, y }, data: { imageTags: tags } })

test('image tags trim deduplicate case-insensitively and keep display order', () => {
  assert.deepEqual(normalizeImageTags([' 资料 ', '参考', '资料', '参考 ']), ['资料', '参考'])
})

test('catalog merges persisted and recovered document tags', () => {
  assert.deepEqual(mergeImageTagCatalog(['常用'], [['资料', '常用'], ['截图']]), ['常用', '资料', '截图'])
})

test('multiple selected tags use OR semantics and deterministic y-x-id order', () => {
  const nodes = [image('c', 200, 20, ['资料']), image('a', 20, 20, ['参考']), image('b', 10, 5, ['其他'])]
  assert.deepEqual(orderedMatchingImageIds(nodes, ['资料', '参考']), ['a', 'c'])
})
