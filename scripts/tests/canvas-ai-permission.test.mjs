import assert from 'node:assert/strict'
import test from 'node:test'

import {
  authorizeCanvasOperation,
  authorizeCanvasProposal,
  createCanvasEditingSession,
  parseCanvasOperations,
  resolveEffectiveAgentPermissionMode,
  resolveCanvasAiMode,
} from '../../src/lib/canvas/ai-permission.ts'

const viewport = Object.freeze({
  x: 0,
  y: 0,
  zoom: 1,
  containerLeft: 0,
  containerTop: 0,
  capturedAt: 1,
})

function node(id, x = 0, y = 0) {
  return {
    id,
    type: 'process',
    position: { x, y },
    width: 100,
    height: 60,
    data: { label: id },
  }
}

function documentWith(count) {
  return {
    schemaVersion: 1,
    nodes: Array.from({ length: count }, (_, index) => node(`n${index}`, index * 200, 0)),
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    settings: { layoutDirection: 'TB', showGrid: true, snapToGrid: false },
  }
}

test('strictly parses the complete operation batch before authorization', () => {
  const valid = parseCanvasOperations([
    { type: 'update_node', id: ' n1 ', x: 20, label: ' hello ' },
    { type: 'add_edge', id: 'e1', source: 'n1', target: 'n2' },
  ])
  assert.equal(valid.ok, true)
  assert.equal(valid.operations[0].id, 'n1')
  assert.equal(valid.operations[0].label, 'hello')

  for (const operations of [
    [{ type: 'update_node', id: 'n1', x: Number.NaN }],
    [{ type: 'delete_node', id: 'n1', injected: true }],
    [{ type: 'unknown', id: 'n1' }],
    [{ type: 'update_node', id: 'n1' }],
    [{ type: 'add_node', nodeType: 'process', width: -1 }],
    [{ type: 'add_node', nodeType: 'pdf' }],
    [{ type: 'read_canvas' }, 'not-an-operation'],
  ]) {
    const parsed = parseCanvasOperations(operations)
    assert.equal(parsed.ok, false)
    assert.equal('operations' in parsed, false)
  }
})

test('management permits only reads, evidence focus and derived overlay changes', () => {
  const allowed = [
    { type: 'read_canvas' },
    { type: 'focus_evidence', nodeId: 'n1' },
    { type: 'upsert_ai_tag', id: 't1', nodeId: 'n1', label: '旅行', confidence: 0.9 },
    { type: 'delete_ai_tag', id: 't1' },
    { type: 'upsert_ai_relation', id: 'r1', source: 'n1', target: 'n2', relationType: 'same_topic', confidence: 0.8 },
    { type: 'delete_ai_relation', id: 'r1' },
  ]
  for (const operation of allowed) {
    assert.equal(authorizeCanvasOperation('management', operation).status, 'allowed')
  }

  const denied = [
    { type: 'add_node', nodeType: 'process' },
    { type: 'update_node', id: 'n1', label: 'changed' },
    { type: 'update_node', id: 'n1', x: 1 },
    { type: 'delete_node', id: 'n1' },
    { type: 'add_edge', source: 'n1', target: 'n2' },
    { type: 'delete_edge', id: 'e1' },
    { type: 'layout', direction: 'LR' },
    { type: 'clear' },
  ]
  for (const operation of denied) {
    assert.equal(authorizeCanvasOperation('management', operation).status, 'denied')
  }
})

test('editing sessions are memory-only and expire on timeout or security failure', () => {
  const session = createCanvasEditingSession()
  assert.equal(resolveCanvasAiMode('auto-edit', session, 100), 'management')
  session.grant({ now: 100, ttlMs: 50 })
  assert.equal(resolveCanvasAiMode('auto-edit', session, 149), 'editing')
  assert.equal(resolveCanvasAiMode('auto-edit', session, 150), 'management')

  session.grant({ now: 200, ttlMs: 50 })
  session.reportSecurityFailure()
  assert.equal(resolveCanvasAiMode('auto-edit', session, 201), 'management')
  assert.equal(resolveEffectiveAgentPermissionMode('auto-edit', session, 201), 'ask')
  assert.equal(createCanvasEditingSession().isActive(0), false)
})

test('delete, source overwrite and each large-movement condition requires confirmation', () => {
  const document = documentWith(40)
  for (const operation of [
    { type: 'delete_node', id: 'n1' },
    { type: 'delete_edge', id: 'e1' },
    { type: 'clear' },
    { type: 'update_node', id: 'n1', label: 'overwritten' },
  ]) {
    assert.equal(authorizeCanvasOperation('editing', operation).requiresConfirmation, true)
  }

  const nineMoves = Array.from({ length: 9 }, (_, index) => ({
    type: 'update_node', id: `n${index}`, x: index * 200 + 1,
  }))
  const nineDecision = authorizeCanvasProposal('editing', nineMoves, { document, viewport })
  assert.equal(nineDecision.status, 'allowed')
  assert.equal(nineDecision.requiresConfirmation, true)
  assert.equal(nineDecision.impact.movesMoreThanEightSolidNodes, true)

  const farDecision = authorizeCanvasProposal('editing', [
    { type: 'update_node', id: 'n0', x: 400.01 },
  ], { document, viewport })
  assert.equal(farDecision.requiresConfirmation, true)
  assert.equal(farDecision.impact.movesAnyNodeMoreThan400ScreenPixels, true)

  const geometryDecision = authorizeCanvasProposal('editing', Array.from({ length: 11 }, (_, index) => ({
    type: 'update_node', id: `n${index}`, width: 101,
  })), { document, viewport })
  assert.equal(geometryDecision.requiresConfirmation, true)
  assert.equal(geometryDecision.impact.changesMoreThanQuarterOfSolidNodes, true)
})

test('threshold boundaries do not require confirmation until strictly exceeded', () => {
  const document = documentWith(40)
  const decision = authorizeCanvasProposal('editing', Array.from({ length: 8 }, (_, index) => ({
    type: 'update_node', id: `n${index}`, x: index * 200 + (index === 0 ? 400 : 1),
  })), { document, viewport })
  assert.equal(decision.status, 'allowed')
  assert.equal(decision.requiresConfirmation, false)
  assert.equal(decision.impact.geometryChangeRatio, 0.2)
})
