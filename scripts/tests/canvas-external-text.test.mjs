import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  chooseExternalText,
  insertExternalText,
  normalizeExternalText,
} from '../../src/lib/canvas/external-text.ts'

test('system plain text wins over external html and normalizes separators', () => {
  const value = chooseExternalText({
    plainText: '\ufeff第一段\r\n第二段\u2028第三段\u00a0结尾\u200b',
    htmlText: '<p>错误 HTML</p>',
    htmlToText: () => '不应使用',
  })
  assert.equal(value, '第一段\n第二段\n第三段 结尾')
})

test('html is used only when plain text is empty', () => {
  assert.equal(chooseExternalText({
    plainText: '',
    htmlText: '<p>A</p><p>B</p>',
    htmlToText: () => 'A\nB\n',
  }), 'A\nB')
})

test('tabs repeated ascii spaces and internal blank lines are preserved', () => {
  assert.equal(normalizeExternalText('  A\t  B\n\nC  '), 'A\t  B\n\nC')
})

test('selection insertion replaces exactly one range and returns the caret', () => {
  assert.deepEqual(insertExternalText('abcd', 1, 3, '甲\n乙'), {
    value: 'a甲\n乙d',
    caret: 4,
  })
})

test('text node leaves an empty clipboard paste to the native no-op path', async () => {
  const renderer = await readFile(new URL('../../src/app/core/main/canvas/nodes/canvas-nodes.tsx', import.meta.url), 'utf8')
  const pasteHandler = renderer.slice(renderer.indexOf('onPaste={event => {'), renderer.indexOf('onPointerDown=', renderer.indexOf('onPaste={event => {')))
  assert.match(pasteHandler, /const inserted = chooseExternalText/)
  assert.match(pasteHandler, /if \(!inserted\) return[\s\S]*event\.preventDefault\(\)/)
})
