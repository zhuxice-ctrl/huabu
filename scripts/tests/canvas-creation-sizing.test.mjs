import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  normalizeContentScaleForRead,
  resolveAiNodeContentScale,
  resolveAiNodeFontSize,
  resolveAiNodeSize,
} from '../../src/lib/canvas/content-ingest.ts'
import { applyCanvasOperations } from '../../src/lib/canvas/operations.ts'

const baseNode = (id, type, x, y, width, height, contentScale = 1) => ({
  id,
  type,
  position: { x, y },
  width,
  height,
  data: { label: id, contentScale },
})

test('AI sizing prefers target and otherwise uses deterministic nearby same-type median', () => {
  const target = baseNode('target', 'text', 0, 0, 333, 177, 1.25)
  const nearby = [
    baseNode('c', 'text', 100, 0, 500, 100, 2),
    baseNode('a', 'text', 100, 0, 300, 300, 1.5),
    baseNode('b', 'text', 200, 0, 400, 200, 1.75),
    baseNode('far', 'text', 5000, 0, 900, 900, 9),
    baseNode('other', 'image', 50, 0, 999, 999, 9),
  ]

  assert.deepEqual(resolveAiNodeSize({ requestedType: 'text', targetNode: target, nearbySameType: nearby }), {
    width: 333,
    height: 177,
  })
  assert.equal(resolveAiNodeContentScale({ requestedType: 'text', targetNode: target, nearbySameType: nearby }), 1.25)
  assert.equal(resolveAiNodeFontSize({ requestedType: 'text', targetNode: target, nearbySameType: nearby }), 15)
  assert.deepEqual(resolveAiNodeSize({ requestedType: 'text', nearbySameType: nearby }), {
    width: 400,
    height: 200,
  })
  assert.equal(resolveAiNodeContentScale({ requestedType: 'text', nearbySameType: nearby }), 1.75)
})

test('AI requested size ignores camera zoom and invalid scale falls back to one', () => {
  assert.deepEqual(resolveAiNodeSize({
    requestedType: 'text',
    requestedSize: { width: 640, height: 360 },
    nearbySameType: [],
  }), { width: 640, height: 360 })
  assert.equal(resolveAiNodeContentScale({
    requestedType: 'text',
    targetNode: baseNode('bad', 'text', 0, 0, 100, 100, Number.NaN),
    nearbySameType: [],
  }), 1)
  assert.equal(normalizeContentScaleForRead(0.1667), 0.1667)
  assert.equal(normalizeContentScaleForRead(10), 10)
  assert.equal(normalizeContentScaleForRead(0.1666), 1)
  assert.equal(normalizeContentScaleForRead(10.0001), 1)
})

test('AI sizing ignores cross-type targets and resolves width and height independently', () => {
  const crossTypeTarget = baseNode('image-target', 'image', 0, 0, 900, 700, 9)
  const partialTarget = {
    ...baseNode('text-target', 'text', 0, 0, 360, 180, 1.5),
    height: Number.NaN,
  }
  const nearby = [
    baseNode('a', 'text', 100, 0, 300, 120, 1.2),
    { ...baseNode('b', 'text', 200, 0, 500, 240, 1.4), width: Number.NaN },
    baseNode('c', 'text', 300, 0, 700, 360, 1.6),
  ]

  assert.deepEqual(resolveAiNodeSize({
    requestedType: 'text',
    targetNode: crossTypeTarget,
    nearbySameType: nearby,
    referencePoint: { x: 0, y: 0 },
  }), { width: 500, height: 240 })
  assert.equal(resolveAiNodeContentScale({
    requestedType: 'text',
    targetNode: crossTypeTarget,
    nearbySameType: nearby,
    referencePoint: { x: 0, y: 0 },
  }), 1.4)

  assert.deepEqual(resolveAiNodeSize({
    requestedType: 'text',
    targetNode: partialTarget,
    nearbySameType: nearby,
  }), { width: 360, height: 240 })
})

test('AI sizing resolves requested dimensions independently and rounds even medians', () => {
  const nearby = [
    baseNode('a', 'text', 10, 0, 301.11111, 101.11111, 1),
    baseNode('b', 'text', 20, 0, 501.11111, 301.11111, 1),
  ]
  assert.deepEqual(resolveAiNodeSize({
    requestedType: 'text',
    requestedSize: { width: 640, height: Number.NaN },
    nearbySameType: nearby,
    referencePoint: { x: 0, y: 0 },
  }), { width: 640, height: 201.1111 })
})

test('AI font sizing uses same-type target then nearby per-field fallback', () => {
  const target = { ...baseNode('target', 'text', 0, 0, 300, 100, 1), data: { fontSize: 23.0769 } }
  const crossType = { ...baseNode('image', 'image', 0, 0, 300, 100, 1), data: { fontSize: 99 } }
  const nearby = [
    { ...baseNode('a', 'text', 100, 0, 300, 100, 1), data: { fontSize: 10 } },
    { ...baseNode('b', 'text', 200, 0, 300, 100, 1), data: { fontSize: 20 } },
  ]
  assert.equal(resolveAiNodeFontSize({ requestedType: 'text', targetNode: target, nearbySameType: nearby }), 23.0769)
  assert.equal(resolveAiNodeFontSize({ requestedType: 'text', targetNode: crossType, nearbySameType: nearby }), 15)
})

test('AI add-node operations inherit target geometry without consulting a viewport', () => {
  const target = baseNode('target', 'text', 0, 0, 360, 180, 1.4)
  const result = applyCanvasOperations({
    schemaVersion: 1,
    nodes: [target],
    edges: [],
    viewport: { x: 999, y: 999, zoom: 6 },
    settings: { showGrid: true, snapToGrid: false, layoutDirection: 'TB' },
  }, [{ type: 'add_node', id: 'new', nodeType: 'text', targetNodeId: 'target', label: '新节点' }])
  const created = result.document.nodes.find(node => node.id === 'new')
  assert.equal(created.width, 360)
  assert.equal(created.height, 180)
  assert.equal(created.data.contentScale, 1.4)
  assert.equal(created.data.fontSize, 15)
})

test('direct creation sessions retain one viewport while duplicate and imports retain stored geometry', () => {
  const editor = readFileSync(new URL('../../src/app/core/main/canvas/canvas-editor.tsx', import.meta.url), 'utf8')
  const renderer = readFileSync(new URL('../../src/app/core/main/canvas/nodes/canvas-nodes.tsx', import.meta.url), 'utf8')

  assert.match(editor, /interface DrawDraft[\s\S]*viewport: ViewportSnapshot/)
  assert.match(editor, /materializeIngestDraft\(draft, capturedViewport\)/)
  assert.match(editor, /screenPointToCanvas\([\s\S]*draft\.viewport\)/)
  assert.match(editor, /const capturedCenter =[\s\S]*const sourcePath = await open/)
  assert.match(editor, /const pastedNodes = snapshot\.nodes\.map[\s\S]*\.\.\.structuredClone\(node\)/)
  assert.match(editor, /setNodes\(nextDocument\.nodes as FlowCanvasNode\[\]\)/)
  assert.match(renderer, /function contentScale\(data: CanvasNodeData\)/)
  assert.match(renderer, /padding: 8 \* contentScale\(data\)/)
  assert.doesNotMatch(editor, /onNodesChange[\s\S]{0,900}contentScale:/)
})
