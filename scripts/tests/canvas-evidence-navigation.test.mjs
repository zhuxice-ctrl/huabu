import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  EVIDENCE_AUTO_NAVIGATION_CONFIDENCE,
  advanceEvidenceNavigation,
  canAutoNavigateEvidence,
  captureEvidenceQueryOrigin,
  createEvidenceNavigationSession,
  evidenceFocusFor,
  getEvidenceQueryOrigin,
  isExactEvidenceTextSelection,
  reconcileEvidenceNavigationSession,
  recordCanvasViewportSnapshot,
  returnToEvidenceOrigin,
} from '../../src/lib/canvas/evidence-navigation.ts'
import {
  parseCanvasEvidenceMarkers,
  serializeCanvasEvidenceContext,
} from '../../src/lib/canvas/canvas-retrieval.ts'
import { extractCanvasKnowledgeAnchors } from '../../src/lib/canvas/knowledge-extraction.ts'

const viewport = { x: -120, y: 48, zoom: 0.8 }
const evidence = (id, score, overrides = {}) => ({
  anchor: {
    id,
    workspaceId: 'workspace-a',
    canvasId: 'canvas-a',
    nodeId: `node-${id}`,
    startOffset: 12,
    endOffset: 28,
    nodePosition: { x: 400, y: 220 },
    contentRevision: 'revision-a',
    plainText: 'The precisely matched text.',
    entities: [],
    timeHints: [],
    contentType: 'text',
    ...overrides,
  },
  score,
  matchedBy: ['keyword'],
})

test('evidence navigation stores an immutable pre-query viewport and exact result anchors outside CanvasDocument', () => {
  const session = createEvidenceNavigationSession('canvas-a', viewport, [
    evidence('first', 1), evidence('second', 0.9),
  ])

  assert.deepEqual(session, {
    canvasId: 'canvas-a',
    originViewport: viewport,
    resultAnchorIds: ['first', 'second'],
    activeIndex: 0,
  })
  assert.notEqual(session.originViewport, viewport)
  assert.deepEqual(returnToEvidenceOrigin(session), viewport)
})

test('only confident evidence auto-navigates; lower-confidence matches require the candidate strip', () => {
  assert.equal(canAutoNavigateEvidence(evidence('accepted', EVIDENCE_AUTO_NAVIGATION_CONFIDENCE)), true)
  assert.equal(canAutoNavigateEvidence(evidence('candidate', EVIDENCE_AUTO_NAVIGATION_CONFIDENCE - 0.001)), false)
})

test('serialized evidence preserves a real low confidence score through the chat navigation parser', async () => {
  const serialized = serializeCanvasEvidenceContext([evidence('candidate', 0.42)])
  const parsed = parseCanvasEvidenceMarkers(serialized, 'canvas-a')

  assert.equal(parsed.length, 1)
  assert.equal(parsed[0].score, 0.42)
  assert.equal(canAutoNavigateEvidence(parsed[0]), false)

  const chatSource = await readFile(
    new URL('../../src/app/core/main/chat/chat-content.tsx', import.meta.url),
    'utf8',
  )
  assert.match(chatSource, /parseCanvasEvidenceMarkers\(chat\.content \?\? '', canvasId\)/)
  assert.doesNotMatch(chatSource, /score:\s*1/)
})

test('next and previous navigation preserves result order and focuses only the exact node range', () => {
  const results = [evidence('first', 0.9), evidence('second', 0.9)]
  const session = createEvidenceNavigationSession('canvas-a', viewport, results)
  const next = advanceEvidenceNavigation(session, 'next')
  const previous = advanceEvidenceNavigation(next, 'previous')

  assert.equal(next.activeIndex, 1)
  assert.equal(previous.activeIndex, 0)
  assert.deepEqual(evidenceFocusFor(next, results), {
    canvasId: 'canvas-a',
    nodeId: 'node-second',
    startOffset: 12,
    endOffset: 28,
    field: 'text',
    textFingerprint: '00e39a65',
  })
  assert.equal(advanceEvidenceNavigation(next, 'next').activeIndex, 1)
  assert.equal(advanceEvidenceNavigation(previous, 'previous').activeIndex, 0)
})

test('exact range focus keeps field-local identity and fails safely for labels and mismatched text', () => {
  const extraction = extractCanvasKnowledgeAnchors({
    canvasId: 'canvas-a',
    workspaceId: 'workspace-a',
    contentRevision: 'revision-a',
    node: {
      id: 'node-fields',
      type: 'text',
      position: { x: 10, y: 20 },
      data: { label: 'Heading', text: '  Exact body text  ' },
    },
  })
  const labelAnchor = extraction.anchors.find(anchor => anchor.plainText === 'Heading')
  const textAnchor = extraction.anchors.find(anchor => anchor.plainText === 'Exact body text')

  assert.equal(labelAnchor?.contentType, 'field:label')
  assert.equal(textAnchor?.contentType, 'text')
  assert.deepEqual([textAnchor?.startOffset, textAnchor?.endOffset], [2, 17])

  const labelFocus = evidenceFocusFor(
    createEvidenceNavigationSession('canvas-a', viewport, [evidence('label', 0.9, labelAnchor)]),
    [evidence('label', 0.9, labelAnchor)],
  )
  const textResult = evidence('text-field', 0.9, textAnchor)
  const textFocus = evidenceFocusFor(
    createEvidenceNavigationSession('canvas-a', viewport, [textResult]),
    [textResult],
  )

  assert.equal(labelFocus?.field, null)
  assert.equal(isExactEvidenceTextSelection(labelFocus, 'Heading'), false)
  assert.equal(textFocus?.field, 'text')
  assert.equal(isExactEvidenceTextSelection(textFocus, '  Exact body text  '), true)
  assert.equal(isExactEvidenceTextSelection(textFocus, '  Different body  '), false)
})

test('query origin is captured before navigation and remains stable as the live viewport changes', async () => {
  const queryKey = 'chat:canvas-a:100'
  recordCanvasViewportSnapshot('canvas-a', viewport)
  assert.deepEqual(captureEvidenceQueryOrigin('canvas-a', queryKey), viewport)
  recordCanvasViewportSnapshot('canvas-a', { x: 900, y: -300, zoom: 1.4 })
  assert.deepEqual(getEvidenceQueryOrigin('canvas-a', queryKey), viewport)

  const sendSource = await readFile(
    new URL('../../src/app/core/main/chat/chat-send.tsx', import.meta.url),
    'utf8',
  )
  const editorSource = await readFile(
    new URL('../../src/app/core/main/canvas/canvas-editor.tsx', import.meta.url),
    'utf8',
  )
  const capture = sendSource.indexOf('captureEvidenceQueryOrigin(')
  const insert = sendSource.indexOf('await insert({', capture)
  const transientGuard = editorSource.indexOf('if (transientEvidenceMoveRef.current)')
  const viewportPersistence = editorSource.indexOf('persistViewport(viewport)', transientGuard)
  assert.ok(capture >= 0)
  assert.ok(insert > capture)
  assert.ok(transientGuard >= 0)
  assert.ok(viewportPersistence > transientGuard)
  assert.doesNotMatch(editorSource.slice(transientGuard, viewportPersistence), /updateHistory|pushHistory/)
})

test('navigation session reconciles streamed evidence and resets safely when the canvas changes', () => {
  const initialEvidence = [evidence('first', 0.9)]
  const session = createEvidenceNavigationSession('canvas-a', viewport, initialEvidence)
  const streamed = reconcileEvidenceNavigationSession(session, 'canvas-a', viewport, [
    ...initialEvidence,
    evidence('second', 0.8),
  ])
  const changedCanvasEvidence = [evidence('third', 0.9, { canvasId: 'canvas-b' })]
  const changedCanvas = reconcileEvidenceNavigationSession(
    streamed,
    'canvas-b',
    { x: 1, y: 2, zoom: 1.1 },
    changedCanvasEvidence,
  )

  assert.deepEqual(streamed.resultAnchorIds, ['first', 'second'])
  assert.deepEqual(changedCanvas.resultAnchorIds, ['third'])
  assert.equal(changedCanvas.activeIndex, 0)
  assert.deepEqual(changedCanvas.originViewport, { x: 1, y: 2, zoom: 1.1 })
})

test('editor routes evidence range selection to a distinct event without recursive re-emission', async () => {
  const editorSource = await readFile(
    new URL('../../src/app/core/main/canvas/canvas-editor.tsx', import.meta.url),
    'utf8',
  )
  const nodesSource = await readFile(
    new URL('../../src/app/core/main/canvas/nodes/canvas-nodes.tsx', import.meta.url),
    'utf8',
  )
  const handlerStart = editorSource.indexOf('const focusEvidence =')
  const handlerEnd = editorSource.indexOf('const returnToEvidenceOrigin =', handlerStart)
  const handler = editorSource.slice(handlerStart, handlerEnd)

  assert.ok(handlerStart >= 0 && handlerEnd > handlerStart)
  assert.doesNotMatch(handler, /emit\('canvas-focus-evidence'/)
  assert.match(handler, /emit\('canvas-select-evidence-range'/)
  assert.match(nodesSource, /on\('canvas-select-evidence-range'/)
})
