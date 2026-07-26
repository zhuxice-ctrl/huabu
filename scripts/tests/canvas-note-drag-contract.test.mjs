import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

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
  const referenceBranch = editorSource.indexOf('NOTE_REFERENCE_MIME')
  const genericBranch = editorSource.indexOf('draftsFromTransfer(input)')
  assert.ok(referenceBranch >= 0)
  assert.ok(genericBranch >= 0)
  assert.ok(referenceBranch < genericBranch)
  assert.match(editorSource, /captureCurrentViewport\(\)/)
  assert.match(editorSource, /previewNearestFreePlacement/)
  assert.match(editorSource, /pushHistory\(\)/)
  assert.match(editorSource, /refreshNoteReferences/)
})

test('reference nodes open record tabs, expose a missing-source state, and remove only themselves', () => {
  assert.match(nodesSource, /sourceStatus === 'missing'/)
  assert.match(nodesSource, /来源已不存在/)
  assert.match(nodesSource, /createRecordTab/)
  assert.match(nodesSource, /sourceNoteId/)
  assert.doesNotMatch(nodesSource, /delMark\(|deleteMarks\(/)
})
