import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  applyInverseCanvasPatch,
  canvasDocumentRevision,
  clearCanvasAiRuntimeSnapshot,
  createCanvasAiTransactionPreview,
  getCanvasAiRuntimeSnapshot,
  hashCanvasAiInstruction,
  publishCanvasAiRuntimeSnapshot,
  redactCanvasAiInstruction,
  validateCanvasAiGeometry,
} from '../../src/lib/canvas/ai-transaction.ts'

const viewport = Object.freeze({
  x: 0,
  y: 0,
  zoom: 1,
  containerLeft: 0,
  containerTop: 0,
  capturedAt: 1,
})

function document(nodes = []) {
  return {
    schemaVersion: 1,
    nodes,
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    settings: { layoutDirection: 'TB', showGrid: true, snapToGrid: false },
  }
}

function node(id, x) {
  return { id, type: 'process', position: { x, y: 0 }, width: 100, height: 60, data: { label: id } }
}

test('ledger preview stores hash and redacted summary instead of raw credentials', async () => {
  const instruction = '整理旅行计划 apiKey=sk-super-secret-value password=hunter2'
  const before = document([node('n1', 0)])
  const after = document([node('n1', 20)])
  const record = await createCanvasAiTransactionPreview({
    transactionId: 'tx1',
    canvasId: 'canvas1',
    mode: 'editing',
    userInstruction: instruction,
    modelId: 'local-model',
    before,
    after,
    operations: [{ type: 'update_node', id: 'n1', x: 20 }],
    createdAt: 10,
  })
  assert.equal(record.state, 'previewed')
  assert.equal(record.beforeRevision, canvasDocumentRevision(before))
  assert.equal(record.afterRevision, canvasDocumentRevision(after))
  assert.equal(record.userInstructionHash, await hashCanvasAiInstruction(instruction))
  assert.equal(record.userInstructionSummary, redactCanvasAiInstruction(instruction))
  assert.doesNotMatch(JSON.stringify(record), /super-secret-value|hunter2/)
  assert.deepEqual(record.affectedIds, ['n1'])
})

test('inverse patch restores the complete before snapshot as one AI transaction', async () => {
  const before = document([node('n1', 0)])
  const after = document([node('n1', 20), node('n2', 220)])
  const record = await createCanvasAiTransactionPreview({
    canvasId: 'canvas1', mode: 'editing', userInstruction: 'move', modelId: 'm',
    before, after,
    operations: [{ type: 'update_node', id: 'n1', x: 20 }, { type: 'add_node', id: 'n2', nodeType: 'process', x: 220 }],
  })
  assert.deepEqual(applyInverseCanvasPatch(after, record.inversePatch), before)
})

test('the editor publishes one captured runtime snapshot and readers receive defensive copies', () => {
  const current = document([node('n1', 0)])
  publishCanvasAiRuntimeSnapshot({ canvasId: 'canvas1', document: current, viewport })
  const first = getCanvasAiRuntimeSnapshot('canvas1')
  assert.equal(first.revision, canvasDocumentRevision(current))
  first.document.nodes[0].position.x = 999
  assert.equal(getCanvasAiRuntimeSnapshot('canvas1').document.nodes[0].position.x, 0)
  clearCanvasAiRuntimeSnapshot('canvas1')
  assert.equal(getCanvasAiRuntimeSnapshot('canvas1'), null)
})

test('collision revalidation rejects new overlap and accepts unchanged legacy overlap', () => {
  const safeBefore = document([node('n1', 0), node('n2', 200)])
  const overlappingAfter = document([node('n1', 0), node('n2', 50)])
  assert.equal(validateCanvasAiGeometry({ before: safeBefore, after: overlappingAfter, viewport }).valid, false)

  const legacyBefore = document([node('n1', 0), node('n2', 50)])
  const improvingAfter = document([node('n1', 0), node('n2', 55)])
  assert.equal(validateCanvasAiGeometry({ before: legacyBefore, after: improvingAfter, viewport }).valid, true)
})

test('agent mutation path previews and commits through the AI ledger without direct updateDocument', async () => {
  const source = await readFile(new URL('../../src/lib/agent/tools/canvas-tools.ts', import.meta.url), 'utf8')
  assert.match(source, /createCanvasAiTransactionPreview/)
  assert.match(source, /commitCanvasAiTransaction/)
  assert.match(source, /authorizeCanvasProposal/)
  assert.match(source, /stageDocumentForAiPreview/)
  assert.match(source, /getCanvasAiRuntimeSnapshot/)
  assert.doesNotMatch(source, /store\.updateDocument\s*\(/)
})

test('database commit revalidates revision, permission and collision inside the SQL transaction', async () => {
  const source = await readFile(new URL('../../src/db/canvas-ai-transactions.ts', import.meta.url), 'utf8')
  const begin = source.indexOf("BEGIN IMMEDIATE")
  assert.ok(begin >= 0)
  const commitBody = source.slice(begin, source.indexOf("COMMIT", begin))
  assert.match(commitBody, /canvasDocumentRevision/)
  assert.match(commitBody, /authorizeCanvasProposal/)
  assert.match(commitBody, /validateCanvasAiGeometry/)
  assert.match(commitBody, /applyValidatedCanvasOperations/)
})
