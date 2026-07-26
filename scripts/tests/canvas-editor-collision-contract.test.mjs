import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import ts from 'typescript'
import { isSolidCanvasNode } from '../../src/lib/canvas/collision-policy.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = path => readFileSync(join(root, path), 'utf8')
const editorSource = read('src/app/core/main/canvas/canvas-editor.tsx')
const nodesSource = read('src/app/core/main/canvas/nodes/canvas-nodes.tsx')
const canvasTypesSource = read('src/types/canvas.ts')

const loadEditorFunctions = (names, globals = {}) => {
  const sourceFile = ts.createSourceFile(
    'canvas-editor.tsx',
    editorSource,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )
  const declarations = new Map(sourceFile.statements.flatMap(statement => (
    ts.isFunctionDeclaration(statement) && statement.name
      ? [[statement.name.text, statement.getText(sourceFile)]]
      : []
  )))
  const snippets = names.map(name => {
    assert.equal(declarations.has(name), true, `missing production function ${name}`)
    return declarations.get(name)
  })
  const compiled = ts.transpileModule(
    `${snippets.join('\n')}\nmodule.exports = { ${names.join(', ')} }`,
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText
  const module = { exports: {} }
  vm.runInNewContext(compiled, { module, exports: module.exports, structuredClone, ...globals })
  return module.exports
}

const production = loadEditorFunctions(
  ['serializeNodes', 'nodeRect', 'collisionEntities'],
  { isSolidCanvasNode },
)

test('geometry sessions own collision state outside persisted CanvasNodeData', () => {
  assert.match(editorSource, /interface GeometrySessionBase \{[^}]*pointerId: number[^}]*viewport: ViewportSnapshot[^}]*indexVersion: number[^}]*baselineDocumentRevision: number[^}]*originalGeometry: Map<string, CanvasRect>[^}]*lastAcceptedGeometry: Map<string, CanvasRect>[^}]*baselineConflictPairs: Set<string>/s)
  assert.match(editorSource, /type GeometrySession\s*=\s*\| DrawGeometrySession\s*\| ResizeGeometrySession\s*\| MoveGeometrySession/)
  assert.match(editorSource, /geometrySessionRef/)
  assert.match(editorSource, /snapGuides/)
  assert.match(editorSource, /legacyConflictIds/)

  const nodeData = canvasTypesSource.match(/export interface CanvasNodeData[^]*?\n\}/)?.[0] || ''
  assert.doesNotMatch(nodeData, /invalid|snapGuides?|legacyConflict|selectionGlow/)
  assert.match(editorSource, /type CanvasNodeVisualState = 'invalid' \| 'legacy-conflict' \| 'placement-preview'/)
})

test('controlled React Flow changes pass solid geometry through session validation', () => {
  assert.match(editorSource, /CanvasSpatialIndex/)
  assert.match(editorSource, /applyGeometryNodeChanges/)
  assert.match(editorSource, /change\.type === 'position'/)
  assert.match(editorSource, /change\.type === 'dimensions'/)
  assert.match(editorSource, /onNodesChangeBase\(passThroughChanges\)/)
  assert.match(editorSource, /rebuildSpatialIndex/)
  assert.match(editorSource, /isSolidCanvasNode/)
  assert.doesNotMatch(editorSource, /onNodeDragStart=\{\(_event, node\) => \{\s*pushHistory\(\)/)
})

test('production serialization drops transient renderer fields and collision entities keep group gaps empty', () => {
  const nodes = [
    {
      id: 'group',
      type: 'group',
      position: { x: 0, y: 0 },
      width: 100,
      height: 40,
      className: 'canvas-legacy-conflict',
      style: { width: 100, height: 40 },
      data: { label: 'group', childIds: ['left', 'right'] },
    },
    { id: 'left', type: 'text', position: { x: 0, y: 0 }, width: 10, height: 10, data: {} },
    { id: 'right', type: 'text', position: { x: 90, y: 0 }, width: 10, height: 10, data: {} },
    { id: 'ink', type: 'freehand', position: { x: 45, y: 0 }, width: 10, height: 10, data: {} },
  ]

  const entities = production.collisionEntities(nodes)
  assert.deepEqual(
    [...entities].map(entity => ({ id: entity.id, rect: { ...entity.rect } })),
    [
      { id: 'left', rect: { x: 0, y: 0, width: 10, height: 10 } },
      { id: 'right', rect: { x: 90, y: 0, width: 10, height: 10 } },
    ],
  )

  const serialized = production.serializeNodes(nodes)
  assert.equal('className' in serialized[0], false)
  assert.equal('style' in serialized[0], false)
  assert.deepEqual({ ...serialized[0].data }, { label: 'group', childIds: ['left', 'right'] })
})

test('solid renderers and resizers do not enlarge persisted collision rectangles at non-unit zoom', () => {
  const note = {
    id: 'note',
    type: 'note',
    position: { x: 0, y: 0 },
    width: 160,
    height: 90,
    data: {},
  }
  assert.deepEqual({ ...production.nodeRect(note) }, {
    x: 0,
    y: 0,
    width: 160,
    height: 90,
  })

  const solidResizer = nodesSource.match(/function SolidNodeResizer[^]*?\n\}/)?.[0] || ''
  assert.match(solidResizer, /minWidth=\{1\}/)
  assert.match(solidResizer, /minHeight=\{1\}/)
  assert.doesNotMatch(nodesSource, /\bmin-w-(?:20|36|40|52|80)\b/)
  assert.doesNotMatch(nodesSource, /\bmin-h-(?:14|20|36)\b/)
})

test('collision visuals are transient renderer state and selection uses the specified glow', () => {
  assert.match(editorSource, /canvas-geometry-invalid/)
  assert.match(editorSource, /canvas-legacy-conflict/)
  assert.match(editorSource, /canvas-placement-preview/)
  assert.match(nodesSource, /#F7FBFF/)
  assert.match(nodesSource, /#66D9FF/)
  assert.match(nodesSource, /#FF5D5D/)
  assert.match(nodesSource, /#F2B84B/)
  assert.match(nodesSource, /keepAspectRatio/)
  assert.doesNotMatch(editorSource, /data:\s*\{[^}]*?(?:invalid|snapGuides?|legacyConflictIds?|selectionGlow)/s)

  const serializer = editorSource.match(/function serializeNodes[^]*?\n\}/)?.[0] || ''
  assert.doesNotMatch(serializer, /className|canvas-geometry|canvas-legacy|canvas-placement/)
})
