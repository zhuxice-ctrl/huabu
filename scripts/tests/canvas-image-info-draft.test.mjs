import test from 'node:test'
import assert from 'node:assert/strict'
import { imageInfoDraftInitialization } from '../../src/lib/canvas/image-info-draft.ts'

const initial = { name: '原始名称', comment: '原始评论', tags: [' 资料 ', '资料'] }

test('image metadata initializes on the closed-to-open transition', () => {
  assert.deepEqual(imageInfoDraftInitialization(false, true, initial), {
    name: '原始名称',
    comment: '原始评论',
    tags: ['资料'],
  })
})

test('an ordinary parent rerender cannot replace an open image metadata draft', () => {
  const rerenderedInitial = { name: '服务端名称', comment: '服务端评论', tags: ['新标签'] }
  assert.equal(imageInfoDraftInitialization(true, true, rerenderedInitial), null)
})

test('closing then reopening requests a fresh draft initialization', () => {
  assert.equal(imageInfoDraftInitialization(true, false, initial), null)
  assert.notEqual(imageInfoDraftInitialization(false, true, initial), null)
})
