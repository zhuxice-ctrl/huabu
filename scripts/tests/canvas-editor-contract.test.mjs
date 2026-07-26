import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = path => readFileSync(join(root, path), 'utf8')
const editorSource = read('src/app/core/main/canvas/canvas-editor.tsx')
const nodesSource = read('src/app/core/main/canvas/nodes/canvas-nodes.tsx')
const edgeSource = read('src/app/core/main/canvas/canvas-edge.tsx')
const relationEditorSource = read('src/app/core/main/canvas/canvas-relation-editor.tsx')

test('canvas editor registers custom relation edges and right-drag marquee behavior', () => {
  assert.match(editorSource, /const edgeTypes: EdgeTypes = \{ relation: CanvasRelationEdge \}/)
  assert.match(editorSource, /edgeTypes=\{edgeTypes\}/)
  assert.match(editorSource, /intersectingRectIds/)
  assert.match(editorSource, /marqueeSessionRef/)
  assert.match(editorSource, /relation-target-active/)
  assert.match(editorSource, /type: 'relation'/)
})

test('relationship preview and saved edges use editable curved paths', () => {
  assert.match(editorSource, /relationPreviewPath/)
  assert.match(editorSource, /strokeDasharray="7 6"/)
  assert.match(edgeSource, /interactionWidth=\{24\}/)
  assert.match(edgeSource, /relation\.routeType === 'manual'/)
  assert.match(edgeSource, /canvas-history-checkpoint/)
  assert.match(relationEditorSource, /自动绕行/)
  assert.match(relationEditorSource, /增加节点/)
  assert.match(relationEditorSource, /清除节点/)
})

test('pointer sessions clean up capture loss and auto routes subscribe to node changes', () => {
  assert.match(editorSource, /onLostPointerCapture=/)
  assert.match(editorSource, /window\.addEventListener\('blur', cancelAll\)/)
  assert.match(edgeSource, /control\.addEventListener\('lostpointercapture', cleanup\)/)
  assert.match(edgeSource, /window\.addEventListener\('blur', cleanup\)/)
  assert.match(edgeSource, /const nodes = useNodes/)
  assert.doesNotMatch(edgeSource, /getNodes\(\)/)
})

test('obsolete shape quick-create buttons are absent', () => {
  assert.doesNotMatch(editorSource, /onClick=\{\(\) => addNode\('process'\)\}/)
  assert.doesNotMatch(editorSource, /onClick=\{\(\) => addNode\('decision'\)\}/)
  assert.doesNotMatch(editorSource, /onClick=\{\(\) => addNode\('terminator'\)\}/)
  assert.doesNotMatch(editorSource, /onClick=\{\(\) => addNode\('text'\)\}/)
})

test('text nodes use exact drawn dimensions without the former minimum', () => {
  assert.doesNotMatch(nodesSource, /min-h-\[72px\]/)
  assert.doesNotMatch(nodesSource, /min-w-\[120px\]/)
  assert.match(nodesSource, /minWidth=\{1\}/)
  assert.match(nodesSource, /minHeight=\{1\}/)
  assert.match(editorSource, /hasDrawableArea\(draft\.start, draft\.current\)/)
  assert.doesNotMatch(editorSource, /width: Math\.max\(120, end\.x - position\.x\)/)
})

test('runtime batch ingest materializes and stacks through its captured viewport', () => {
  assert.match(editorSource, /stackIngestDrafts\(materializedDrafts, capturedViewport\)/)
  assert.match(editorSource, /screenPointToCanvas\([^]*screenOrigin[^]*capturedViewport/)
  assert.doesNotMatch(editorSource, /offsetIngestDrafts/)
})
