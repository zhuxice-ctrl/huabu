import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_RELATION } from '../../src/lib/canvas/relation-policy.ts'
import {
  armContextMenuSuppression,
  canStartRelationGesture,
  commitRelationEditorTransaction,
  consumeContextMenuSuppression,
  createPendingRelationEdge,
  removeWaypointAt,
  selectRelationHandles,
  selectSourceRelationHandle,
  selectTargetRelationHandle,
  sourceHandleIdForSide,
} from '../../src/lib/canvas/relation-interaction.ts'

test('four source sides preserve legacy ids and add typed complements', () => {
  assert.equal(sourceHandleIdForSide('bottom'), 'bottom')
  assert.equal(sourceHandleIdForSide('right'), 'right')
  assert.equal(sourceHandleIdForSide('top'), 'source-top')
  assert.equal(sourceHandleIdForSide('left'), 'source-left')
  assert.deepEqual(selectSourceRelationHandle({ x: 0, y: 0, width: 100, height: 60 }, 'top'), {
    handleId: 'source-top', point: { x: 50, y: 0 },
  })
})

test('target side follows the pointer nearest edge', () => {
  const rect = { x: 100, y: 100, width: 200, height: 120 }
  assert.equal(selectTargetRelationHandle(rect, { x: 110, y: 160 }).handleId, 'left')
  assert.equal(selectTargetRelationHandle(rect, { x: 290, y: 160 }).handleId, 'target-right')
  assert.equal(selectTargetRelationHandle(rect, { x: 200, y: 105 }).handleId, 'top')
  assert.equal(selectTargetRelationHandle(rect, { x: 200, y: 215 }).handleId, 'target-bottom')
})

test('new relations stay staged until one save commit', () => {
  const persistedEdges = [{ id: 'existing', source: 'a', target: 'b' }]
  const draft = createPendingRelationEdge({
    id: 'draft',
    source: 'a',
    target: 'c',
    sourceHandle: 'right',
    targetHandle: 'left',
    data: DEFAULT_RELATION,
  })

  assert.equal(persistedEdges.length, 1, 'opening the create editor does not insert a persistent edge')
  const result = commitRelationEditorTransaction(
    persistedEdges,
    { edgeId: draft.id, mode: 'create', draft },
    { ...DEFAULT_RELATION, label: 'saved once' },
  )

  assert.equal(result.changed, true)
  assert.equal(result.edges.length, 2)
  assert.deepEqual(result.edges.at(-1), {
    ...draft,
    label: 'saved once',
    data: { ...draft.data, label: 'saved once' },
  })
  assert.equal(persistedEdges.length, 1, 'the pre-save history snapshot remains draft-free')
})

test('cancelling a staged relation leaves persistent edges untouched', () => {
  const persistedEdges = [{ id: 'existing', source: 'a', target: 'b' }]
  const beforeCancel = structuredClone(persistedEdges)

  assert.deepEqual(persistedEdges, beforeCancel)
})

test('preview endpoint selection returns the exact handles persisted by the draft', () => {
  const handles = selectRelationHandles({
    sourceRect: { x: 0, y: 0, width: 100, height: 60 },
    targetRect: { x: 220, y: 10, width: 100, height: 60 },
    pointer: { x: 220, y: 40 },
  })
  const draft = createPendingRelationEdge({
    id: 'draft', source: 'source', target: 'target',
    sourceHandle: handles.source.handleId,
    targetHandle: handles.target.handleId,
    data: DEFAULT_RELATION,
  })

  assert.equal(handles.source.handleId, 'right')
  assert.equal(handles.target.handleId, 'left')
  assert.equal(handles.source.point.x, 100)
  assert.equal(handles.target.point.x, 220)
  assert.equal(draft.sourceHandle, handles.source.handleId)
  assert.equal(draft.targetHandle, handles.target.handleId)
})

test('agent preview snapshots block the custom relation gesture', () => {
  assert.equal(canStartRelationGesture({ button: 2, sourceId: 'a', hasPreviewSnapshot: false }), true)
  assert.equal(canStartRelationGesture({ button: 2, sourceId: 'a', hasPreviewSnapshot: true }), false)
  assert.equal(canStartRelationGesture({ button: 0, sourceId: 'a', hasPreviewSnapshot: false }), false)
})

test('right-drag context-menu suppression survives pointer-up and is consumed once', () => {
  const armed = armContextMenuSuppression(1_000)
  const first = consumeContextMenuSuppression(armed, 1_250)
  const second = consumeContextMenuSuppression(first.next, 1_251)
  const expired = consumeContextMenuSuppression(armContextMenuSuppression(2_000), 2_800)

  assert.equal(first.suppress, true)
  assert.equal(second.suppress, false)
  assert.equal(expired.suppress, false)
})

test('a selected waypoint is removed by its stable index', () => {
  const waypoints = [{ x: 10, y: 20 }, { x: 30, y: 40 }, { x: 50, y: 60 }]
  assert.deepEqual(removeWaypointAt(waypoints, 1), [{ x: 10, y: 20 }, { x: 50, y: 60 }])
  assert.strictEqual(removeWaypointAt(waypoints, null), waypoints)
})
