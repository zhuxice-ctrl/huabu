import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import vm from 'node:vm'
import ts from 'typescript'
import {
  isSolidCanvasNode,
  scoreLegacyConflicts,
  sweepRigidSet,
  thresholdsForSnapshot,
} from '../../src/lib/canvas/collision-policy.ts'
import { findNearestFreePlacement } from '../../src/lib/canvas/placement-policy.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = path => readFileSync(join(root, path), 'utf8')
const editorSource = read('src/app/core/main/canvas/canvas-editor.tsx')
const nodesSource = read('src/app/core/main/canvas/nodes/canvas-nodes.tsx')
const viewport = Object.freeze({
  x: 0,
  y: 0,
  zoom: 1,
  containerLeft: 0,
  containerTop: 0,
  capturedAt: 1,
})
const section = (start, end) => {
  const startIndex = editorSource.indexOf(start)
  const endIndex = editorSource.indexOf(end, startIndex + start.length)
  assert.notEqual(startIndex, -1, start)
  assert.notEqual(endIndex, -1, end)
  return editorSource.slice(startIndex, endIndex)
}

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

const production = loadEditorFunctions([
  'nodeRect',
  'geometryForNodes',
  'collisionEntities',
  'applyGeometry',
  'geometryEqual',
  'pairIdentity',
  'conflictProfile',
  'candidateConflictAccepted',
  'geometryEntities',
  'hasAuthoritativeGeometryChanged',
  'revalidateGeometrySession',
  'constrainImageResize',
], {
  isSolidCanvasNode,
  scoreLegacyConflicts,
  thresholdsForSnapshot,
})

const flowNode = (id, x, y, width = 10, height = 10, type = 'text') => ({
  id,
  type,
  position: { x, y },
  width,
  height,
  data: {},
})

const createSession = ({ nodes, controlledIds, movingIds, kind = 'resize' }) => {
  const controlledNodeIds = new Set(controlledIds)
  const collisionMemberIds = new Set(movingIds)
  const originalGeometry = production.geometryForNodes(nodes, controlledNodeIds)
  const profile = production.conflictProfile(
    production.collisionEntities(nodes),
    collisionMemberIds,
    thresholdsForSnapshot(viewport),
    kind === 'move',
  )
  return {
    kind,
    pointerId: 1,
    viewport,
    indexVersion: 1,
    baselineDocumentRevision: 1,
    originalGeometry,
    lastAcceptedGeometry: new Map(originalGeometry),
    baselineConflictPairs: new Set(profile?.pairs.keys() || []),
    retainedPairMtd: new Map(profile?.pairs || []),
    baselineScore: {
      pairCount: profile?.pairCount || 0,
      totalMtd: profile?.totalMtd || 0,
    },
    controlledNodeIds,
    collisionMemberIds,
    historySnapshot: { nodes, edges: [] },
    invalid: false,
    ...(kind === 'resize' ? { nodeId: controlledIds[0], snap: {} } : {}),
    ...(kind === 'move' ? { activeNodeId: controlledIds[0] } : {}),
  }
}

test('draw and resize use soft snap, invalid previews, aspect ratio and rollback', () => {
  assert.match(editorSource, /resolveActiveEdgeSnap/)
  assert.match(editorSource, /thresholdsForSnapshot/)
  assert.match(editorSource, /evaluateDrawGeometrySession/)
  assert.match(editorSource, /finalizeDrawGeometrySession/)
  assert.match(editorSource, /evaluateResizeGeometrySession/)
  assert.match(editorSource, /constrainImageResize/)
  assert.match(editorSource, /cancelGeometrySession\('invalid-release'/)
  assert.match(nodesSource, /keepAspectRatio=\{type === 'image'\}/)

  const image = production.constrainImageResize(
    { x: 10, y: 20, width: 200, height: 100 },
    { x: 10, y: 20, width: 300, height: 100 },
  )
  assert.deepEqual({ ...image }, { x: 10, y: 20, width: 300, height: 150 })

  const authoritative = [flowNode('active', 0, 0), flowNode('obstacle', 20, 0)]
  const resize = createSession({ nodes: authoritative, controlledIds: ['active'], movingIds: ['active'] })
  resize.lastAcceptedGeometry = new Map([['active', { x: 5, y: 0, width: 10, height: 10 }]])
  assert.equal(production.revalidateGeometrySession(resize, authoritative), false)
  const invalidPreview = production.applyGeometry(authoritative, resize.lastAcceptedGeometry)
  const restored = production.applyGeometry(
    invalidPreview,
    production.geometryForNodes(authoritative, resize.controlledNodeIds),
  )
  assert.deepEqual({ ...restored[0].position }, { x: 0, y: 0 })

  const draw = {
    ...createSession({ nodes: authoritative, controlledIds: [], movingIds: ['__draw__'], kind: 'draw' }),
    start: { x: 0, y: 0 },
    current: { x: 10, y: 10 },
    candidate: { x: 5, y: 0, width: 10, height: 10 },
    snap: {},
  }
  assert.equal(production.revalidateGeometrySession(draw, authoritative), false)
})

test('draw, resize and move cancellation releases capture and writes no checkpoint', () => {
  assert.match(editorSource, /cancelGeometrySession/)
  assert.match(editorSource, /window\.addEventListener\('blur', cancelAll\)/)
  assert.match(editorSource, /window\.addEventListener\('pointercancel', cancelUncapturedPointer\)/)
  assert.match(editorSource, /onLostPointerCapture=\{event => cancelPointerSessions\(event\.pointerId\)\}/)
  assert.match(editorSource, /releaseGeometryPointerCapture/)
  assert.match(editorSource, /snapGuides: \[\]/)
  const cancellation = section('const cancelGeometrySession', 'const finalizeResizeGeometrySession')
  assert.match(cancellation, /mode:\s*'cancel'/)
  assert.doesNotMatch(cancellation, /pushHistory\(/)
})

test('move sessions sweep rigid members, preserve group children and checkpoint once', () => {
  assert.match(editorSource, /sweepRigidSet/)
  assert.match(editorSource, /startMoveGeometrySession/)
  assert.match(editorSource, /evaluateMoveGeometrySession/)
  assert.match(editorSource, /childIds/)
  assert.match(editorSource, /collisionMemberIds/)
  assert.match(editorSource, /commitGeometrySessionCheckpoint/)
  assert.match(editorSource, /onNodeDragStop=.*finalizeMoveGeometrySession/s)

  const resizeFinalization = section('const finalizeResizeGeometrySession', 'const evaluateResizeGeometrySession')
  const moveFinalization = section('const finalizeMoveGeometrySession', 'const onEdgesChangeTracked')
  const drawFinalization = section('const finalizeDrawGeometrySession', 'const setRelationTargetHighlight')
  assert.equal((resizeFinalization.match(/commitGeometrySessionCheckpoint\(/g) || []).length, 1)
  assert.equal((moveFinalization.match(/commitGeometrySessionCheckpoint\(/g) || []).length, 1)
  assert.equal((drawFinalization.match(/pushHistory\(\)/g) || []).length, 1)

  const moved = sweepRigidSet({
    members: [
      { id: 'left', rect: { x: 0, y: 0, width: 10, height: 10 } },
      { id: 'right', rect: { x: 30, y: 0, width: 10, height: 10 } },
    ],
    obstacles: [
      { id: 'wall', rect: { x: 50, y: -20, width: 1, height: 50 } },
      { id: 'gap-only', rect: { x: 22.25, y: 50, width: 4, height: 10 } },
    ],
    delta: { x: 200, y: 100 },
    thresholds: thresholdsForSnapshot(viewport),
    maxPasses: 4,
  })
  assert.equal(moved.valid, true)
  assert.equal(moved.delta.x < 200, true)
  assert.equal(moved.delta.y, 100)
  assert.equal(moved.members[1].rect.x - moved.members[0].rect.x, 30)
  assert.equal(moved.members[1].rect.y - moved.members[0].rect.y, 0)
})

test('legacy conflicts and stale authority use monotonic newest-index validation', () => {
  assert.match(editorSource, /scoreLegacyConflicts/)
  assert.match(editorSource, /pairCount/)
  assert.match(editorSource, /totalMtd/)
  assert.match(editorSource, /retainedPairMtd/)
  assert.match(editorSource, /baselineDocumentRevision/)
  assert.match(editorSource, /authoritativeNodesRef/)
  assert.match(editorSource, /hasAuthoritativeGeometryChanged/)
  assert.match(editorSource, /revalidateGeometrySession/)

  const legacyNodes = [flowNode('active', 0, 0), flowNode('legacy', 12, 0)]
  const legacy = createSession({
    nodes: legacyNodes,
    controlledIds: ['active'],
    movingIds: ['active'],
    kind: 'move',
  })
  legacy.lastAcceptedGeometry = new Map([['active', { x: -1, y: 0, width: 10, height: 10 }]])
  const improvedEntities = production.geometryEntities(legacyNodes, legacy.lastAcceptedGeometry)
  assert.equal(production.candidateConflictAccepted(legacy, improvedEntities, true, false), true)
  assert.equal(production.candidateConflictAccepted(legacy, improvedEntities, true, true), true)

  const normalNodes = [flowNode('active', 0, 0), flowNode('obstacle', 100, 0)]
  const stale = createSession({ nodes: normalNodes, controlledIds: ['active'], movingIds: ['active'], kind: 'move' })
  stale.lastAcceptedGeometry = new Map([['active', { x: 20, y: 0, width: 10, height: 10 }]])
  const externalActiveUpdate = [flowNode('active', 70, 0), flowNode('obstacle', 100, 0)]
  assert.equal(production.hasAuthoritativeGeometryChanged(stale, externalActiveUpdate), true)
  assert.equal(production.revalidateGeometrySession(stale, externalActiveUpdate), false)
  const restoredExternal = production.applyGeometry(
    production.applyGeometry(normalNodes, stale.lastAcceptedGeometry),
    production.geometryForNodes(externalActiveUpdate, stale.controlledNodeIds),
  )
  assert.deepEqual({ ...restoredExternal[0].position }, { x: 70, y: 0 })

  const obstacleOnlyUpdate = [flowNode('active', 0, 0), flowNode('obstacle', 32, 0)]
  assert.equal(production.hasAuthoritativeGeometryChanged(stale, obstacleOnlyUpdate), false)
  assert.equal(production.revalidateGeometrySession(stale, obstacleOnlyUpdate), false)
})

test('all materialized placement paths preview for 120ms and revalidate before commit', () => {
  assert.match(editorSource, /findNearestFreePlacement/)
  assert.match(editorSource, /const PLACEMENT_PREVIEW_MS = 120/)
  assert.match(editorSource, /previewNearestFreePlacement/)
  assert.match(editorSource, /await new Promise[^]*PLACEMENT_PREVIEW_MS/)
  assert.match(editorSource, /revalidatePlacement/)
  assert.match(editorSource, /cleanupPersistedResources/)
  assert.match(editorSource, /insertSnapshot = useCallback\(async/)
  assert.match(editorSource, /addNoteNode = useCallback\(async/)
  assert.match(editorSource, /addImageNode = useCallback\(async/)
  const placement = section('const previewNearestFreePlacement', 'const getSelectedSnapshot')
  assert.doesNotMatch(placement, /pushHistory|commitGeometrySessionCheckpoint/)

  const result = findNearestFreePlacement({
    members: [{ id: 'new', rect: { x: 0, y: 0, width: 10, height: 10 } }],
    obstacles: [{ id: 'existing', rect: { x: 0, y: 0, width: 10, height: 10 } }],
    targetTranslation: { x: 0, y: 0 },
    snapshot: viewport,
  })
  assert.equal(result.status, 'placed')
  assert.notDeepEqual(result.translation, { x: 0, y: 0 })
})

test('group snapshot expansion and copy materialization remap child ownership causally', () => {
  const {
    expandGroupControlledNodeIds,
    materializeSnapshotCopy,
  } = loadEditorFunctions(['expandGroupControlledNodeIds', 'materializeSnapshotCopy'], {
    crypto: { randomUUID },
  })
  const sourceNodes = [
    { ...flowNode('group', 0, 0, 100, 80, 'group'), data: { childIds: ['left', 'right'] } },
    flowNode('left', 10, 10),
    flowNode('right', 40, 10),
    flowNode('outside', 200, 0),
  ]
  const sourceEdges = [{ id: 'inside', source: 'left', target: 'right' }]
  const expanded = expandGroupControlledNodeIds(sourceNodes, new Set(['group']))
  assert.deepEqual([...expanded].sort(), ['group', 'left', 'right'])

  for (const selectedIds of [new Set(['group']), new Set(['group', 'left', 'right'])]) {
    const snapshotIds = expandGroupControlledNodeIds(sourceNodes, selectedIds)
    const snapshot = {
      nodes: sourceNodes.filter(node => snapshotIds.has(node.id)),
      edges: sourceEdges,
    }
    const copy = materializeSnapshotCopy(snapshot)
    assert.equal(copy.nodes.length, 3)
    const copiedGroup = copy.nodes.find(node => node.type === 'group')
    const copiedChildren = copy.nodes.filter(node => node.type !== 'group').map(node => node.id).sort()
    assert.deepEqual([...copiedGroup.data.childIds].sort(), copiedChildren)
    assert.equal(copiedGroup.data.childIds.some(id => ['left', 'right'].includes(id)), false)
    assert.equal(copiedChildren.includes(copy.edges[0].source), true)
    assert.equal(copiedChildren.includes(copy.edges[0].target), true)
    assert.notEqual(copy.edges[0].source, copy.edges[0].target)
  }
})

test('async placement history reads latest refs so undo preserves preview-time authority updates', () => {
  const { latestHistorySnapshot } = loadEditorFunctions(['cloneSnapshot', 'latestHistorySnapshot'])
  const initial = flowNode('initial', 0, 0)
  const external = flowNode('external-during-preview', 40, 0)
  const placed = flowNode('placed-after-preview', 80, 0)
  const latestNodesRef = { current: [initial] }
  const latestEdgesRef = { current: [] }
  const pushAfterAwait = () => latestHistorySnapshot(latestNodesRef, latestEdgesRef)

  latestNodesRef.current = [initial, external]
  const undoCheckpoint = pushAfterAwait()
  const committed = [...latestNodesRef.current, placed]
  assert.deepEqual(committed.map(node => node.id), [
    'initial',
    'external-during-preview',
    'placed-after-preview',
  ])
  assert.deepEqual(undoCheckpoint.nodes.map(node => node.id), [
    'initial',
    'external-during-preview',
  ])
})

test('executable geometry outcomes restore authority on cancel and checkpoint successful sessions once', () => {
  const { executeGeometrySessionOutcome } = loadEditorFunctions([
    'nodeRect',
    'geometryForNodes',
    'applyGeometry',
    'executeGeometrySessionOutcome',
  ])
  const authoritative = [flowNode('active', 70, 0), flowNode('obstacle', 100, 0)]

  for (const kind of ['draw', 'resize', 'move']) {
    const session = createSession({
      nodes: [flowNode('active', 0, 0), flowNode('obstacle', 100, 0)],
      controlledIds: kind === 'draw' ? [] : ['active'],
      movingIds: kind === 'draw' ? ['__draw__'] : ['active'],
      kind,
    })
    const cancelled = executeGeometrySessionOutcome({
      mode: 'cancel',
      session,
      authoritativeNodes: authoritative,
    })
    assert.equal(cancelled.shouldCommit, false, kind)
    assert.equal(cancelled.pointerId, session.pointerId, kind)
    const cancelledGeometry = kind === 'draw' ? [...cancelled.geometry] : [...cancelled.geometry.entries()]
    const expectedGeometry = kind === 'draw' ? [] : [['active', production.nodeRect(authoritative[0])]]
    assert.equal(JSON.stringify(cancelledGeometry), JSON.stringify(expectedGeometry), kind)
  }

  const move = createSession({
    nodes: [flowNode('active', 0, 0), flowNode('obstacle', 100, 0)],
    controlledIds: ['active'],
    movingIds: ['active'],
    kind: 'move',
  })
  move.lastAcceptedGeometry = new Map([['active', { x: 30, y: 0, width: 10, height: 10 }]])
  const committed = executeGeometrySessionOutcome({
    mode: 'commit',
    session: move,
    authoritativeNodes: [flowNode('active', 0, 0), flowNode('obstacle', 100, 0)],
  })
  assert.equal(committed.shouldCommit, true)
  assert.deepEqual([...committed.geometry.entries()], [['active', { x: 30, y: 0, width: 10, height: 10 }]])
})
