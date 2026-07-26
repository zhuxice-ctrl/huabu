import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  commitNoteReferenceDrop,
  createNoteReferenceLinkData,
} from '../../src/lib/canvas/note-reference.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = path => readFileSync(join(root, path), 'utf8')
const markSource = read('src/app/core/main/mark/mark-item.tsx')
const popoverSource = read('src/app/core/main/mark/mark-preview-popover.tsx')
const editorSource = read('src/app/core/main/canvas/canvas-editor.tsx')
const nodesSource = read('src/app/core/main/canvas/nodes/canvas-nodes.tsx')

test('mark previews observe the accessible timing and drag separates opening from dropping', () => {
  assert.match(markSource, /400/)
  assert.match(markSource, /160/)
  assert.match(popoverSource, /role="dialog"/)
  assert.match(markSource, /NOTE_REFERENCE_MIME/)
  assert.match(markSource, /dataTransfer\.setData\(NOTE_REFERENCE_MIME/)
  assert.match(markSource, /onFocus=/)
  assert.match(markSource, /onMouseEnter=/)
  assert.match(markSource, /onDragStart=/)
  assert.match(markSource, /onKeyDown=/)
  assert.match(markSource, /event\.key === 'Enter'/)
})

test('note reference drops are recognized before generic transfer content and use one safe transaction', () => {
  const referenceBranch = editorSource.indexOf("if (event.dataTransfer.types.includes(NOTE_REFERENCE_MIME))")
  const genericBranch = editorSource.indexOf('const input: CanvasTransferInput', referenceBranch)
  assert.ok(referenceBranch >= 0 && genericBranch > referenceBranch)
  assert.match(editorSource, /captureCurrentViewport\(\)/)
  assert.match(editorSource, /previewNearestFreePlacement/)
  assert.match(editorSource, /pushHistory\(\)/)
  assert.match(editorSource, /refreshNoteReferences/)
})

test('drag payload failures and no-space results cannot create a history checkpoint', async () => {
  const mark = {
    id: 7, tagId: 1, type: 'text', content: 'source', desc: 'Source', url: '', deleted: 0, createdAt: 7,
  }
  const payload = JSON.stringify(createNoteReferenceLinkData(mark))
  let checkpoints = 0
  assert.equal(await commitNoteReferenceDrop({
    payload,
    place: async () => null,
    commit: () => { checkpoints += 1 },
  }), 'no-space')
  assert.equal(await commitNoteReferenceDrop({
    payload: 'invalid',
    place: async () => ({ id: 'unexpected' }),
    commit: () => { checkpoints += 1 },
  }), 'invalid')
  assert.equal(checkpoints, 0)
})

test('reference nodes open record tabs, expose a missing-source state, and remove only themselves', () => {
  assert.match(nodesSource, /sourceStatus === 'missing'/)
  assert.match(nodesSource, /来源已不存在/)
  assert.match(nodesSource, /createRecordTab/)
  assert.match(nodesSource, /sourceNoteId/)
  assert.doesNotMatch(nodesSource, /delMark\(|deleteMarks\(/)
})
