import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  APPROVED_AI_RELATION_TYPES,
  aiOverlayStateForConfidence,
  createAiRelationRecord,
  createAiTagRecord,
  markOverlayRecordsStale,
  normalizeSemanticIdentity,
} from '../../src/lib/canvas/ai-overlay.ts'
import { runCanvasAiOverlayClassification } from '../../src/lib/canvas/ai-overlay-runtime.ts'

test('overlay confidence uses exact active, candidate and retrieval-only thresholds', () => {
  assert.equal(aiOverlayStateForConfidence(1), 'active')
  assert.equal(aiOverlayStateForConfidence(0.85), 'active')
  assert.equal(aiOverlayStateForConfidence(0.849), 'candidate')
  assert.equal(aiOverlayStateForConfidence(0.60), 'candidate')
  assert.equal(aiOverlayStateForConfidence(0.599), 'retrieval-only')
  for (const invalid of [Number.NaN, Infinity, -0.01, 1.01]) {
    assert.throws(() => aiOverlayStateForConfidence(invalid), /confidence/i)
  }
})

test('stable and free tags normalize identity while preserving labels', () => {
  const stable = createAiTagRecord({
    id: 'tag-1', canvasId: 'c1', nodeId: 'n1', normalizedTagId: ' Travel-Plan ',
    label: '旅行计划', confidence: 0.9, reason: '主题匹配', model: 'local', sourceRevision: 'r1',
  })
  const free = createAiTagRecord({
    id: 'tag-2', canvasId: 'c1', nodeId: 'n1', label: '  Summer  Ideas ',
    confidence: 0.7, reason: '文本主题', model: 'local', sourceRevision: 'r1',
  })
  assert.equal(stable.normalizedTagId, 'travel-plan')
  assert.equal(stable.label, '旅行计划')
  assert.equal(free.normalizedTagId, 'summer ideas')
  assert.equal(free.label, 'Summer Ideas')
})

test('only the nine approved relation types can be persisted', () => {
  assert.equal(APPROVED_AI_RELATION_TYPES.length, 9)
  for (const type of APPROVED_AI_RELATION_TYPES) {
    assert.equal(createAiRelationRecord({
      id: `r-${type}`, canvasId: 'c1', sourceNodeId: 'n1', targetNodeId: 'n2', type,
      sourceExcerpt: 'a', targetExcerpt: 'b', confidence: 0.9, reason: 'matched',
      model: 'local', sourceRevision: 'r1', targetRevision: 'r2',
    }).type, type)
  }
  assert.throws(() => createAiRelationRecord({
    id: 'bad', canvasId: 'c1', sourceNodeId: 'n1', targetNodeId: 'n2', type: 'similar-to',
    sourceExcerpt: 'a', targetExcerpt: 'b', confidence: 0.9, reason: 'bad',
    model: 'local', sourceRevision: 'r1', targetRevision: 'r2',
  }), /relation type/i)
})

test('source revision changes make prior overlay stale and semantic rejection is stable', () => {
  const tag = createAiTagRecord({
    id: 'tag-1', canvasId: 'c1', nodeId: 'n1', label: 'Travel', confidence: 0.9,
    reason: 'topic', model: 'local', sourceRevision: 'r1',
  })
  assert.equal(markOverlayRecordsStale([tag], new Map([['n1', 'r2']]))[0].state, 'stale')
  assert.equal(
    normalizeSemanticIdentity({ kind: 'tag', canvasId: 'c1', nodeId: 'n1', normalizedTagId: ' Travel ' }),
    normalizeSemanticIdentity({ kind: 'tag', canvasId: 'c1', nodeId: 'n1', normalizedTagId: 'travel' }),
  )
  assert.equal(
    normalizeSemanticIdentity({ kind: 'relation', canvasId: 'c1', sourceNodeId: 'n1', targetNodeId: 'n2', type: 'same_topic' }),
    normalizeSemanticIdentity({ kind: 'relation', canvasId: 'c1', sourceNodeId: 'n2', targetNodeId: 'n1', type: 'same_topic' }),
  )
  assert.notEqual(
    normalizeSemanticIdentity({ kind: 'relation', canvasId: 'c1', sourceNodeId: 'n1', targetNodeId: 'n2', type: 'supplement' }),
    normalizeSemanticIdentity({ kind: 'relation', canvasId: 'c1', sourceNodeId: 'n2', targetNodeId: 'n1', type: 'supplement' }),
  )
})

test('indexed source runs candidate-first classification and persists overlay records', async () => {
  const source = {
    canvasId: 'c1', nodeId: 'n1', contentRevision: 'r1', excerpt: 'Alpha', score: 1, matchedBy: ['vector'],
  }
  const target = {
    canvasId: 'c1', nodeId: 'n2', contentRevision: 'r2', excerpt: 'Beta', score: 0.8, matchedBy: ['entity'],
  }
  const persisted = []
  let refreshed = 0
  const result = await runCanvasAiOverlayClassification({
    canvasId: 'c1', source, text: 'Alpha', model: 'configured-model',
    classifier: async ({ candidates }) => {
      assert.deepEqual(candidates.map(candidate => candidate.nodeId), ['n2'])
      return [
        { kind: 'tag', label: 'Project', reason: 'topic', confidence: 0.9 },
        { kind: 'relation', targetNodeId: 'n2', type: 'same_topic', reason: 'match', confidence: 0.8 },
      ]
    },
  }, {
    recall: async () => [source, target, target],
    persistTag: async input => {
      const record = createAiTagRecord(input)
      persisted.push(record)
      return record
    },
    persistRelation: async input => {
      const record = createAiRelationRecord(input)
      persisted.push(record)
      return record
    },
    markStale: async () => assert.fail('successful classification must not mark stale'),
    refresh: async () => { refreshed += 1 },
  })
  assert.equal(result.status, 'complete')
  assert.equal(result.records.length, 2)
  assert.equal(persisted.length, 2)
  assert.equal(refreshed, 1)
})

test('unavailable recall and classifier failure stay non-blocking and mark stale', async () => {
  const source = {
    canvasId: 'c1', nodeId: 'n1', contentRevision: 'r1', excerpt: 'Alpha', score: 1, matchedBy: ['vector'],
  }
  let stale = 0
  let persisted = 0
  const dependencies = {
    persistTag: async () => { persisted += 1; return null },
    persistRelation: async () => { persisted += 1; return null },
    markStale: async () => { stale += 1 },
    refresh: async () => undefined,
  }
  const unavailable = await runCanvasAiOverlayClassification({
    canvasId: 'c1', source, text: 'Alpha', model: 'configured-model', classifier: async () => [],
  }, { ...dependencies, recall: async () => { throw new Error('offline') } })
  const failed = await runCanvasAiOverlayClassification({
    canvasId: 'c1', source, text: 'Alpha', model: 'configured-model',
    classifier: async () => { throw new Error('model failed') },
  }, { ...dependencies, recall: async () => [] })
  assert.equal(unavailable.status, 'index-unavailable')
  assert.equal(failed.status, 'classifier-failed')
  assert.equal(stale, 2)
  assert.equal(persisted, 0)
})

test('overlay storage, recall and rendering stay separate from authoritative edges and all-pairs calls', async () => {
  const [overlayDb, aiStore, component, editor, startup] = await Promise.all([
    readFile(new URL('../../src/db/canvas-ai-overlay.ts', import.meta.url), 'utf8'),
    readFile(new URL('../../src/stores/canvas-ai.ts', import.meta.url), 'utf8'),
    readFile(new URL('../../src/app/core/main/canvas/canvas-ai-overlay.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../src/app/core/main/canvas/canvas-editor.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../src/app/core/main/canvas/canvas-startup-controller.tsx', import.meta.url), 'utf8'),
  ])
  assert.match(overlayDb, /canvas_ai_tag_records/)
  assert.match(overlayDb, /canvas_ai_relation_records/)
  assert.match(overlayDb, /canvas_ai_overlay_suppressions/)
  assert.match(overlayDb, /semanticIdentity text primary key/)
  assert.match(overlayDb, /canvas_ai_relations_semantic_identity/)
  assert.match(overlayDb, /on conflict\(semanticIdentity\) do update set/)
  assert.match(overlayDb, /BEGIN IMMEDIATE[\s\S]*isSuppressed[\s\S]*insert into canvas_ai_relation_records/)
  assert.match(overlayDb, /where semanticIdentity = \$2/)
  assert.match(aiStore, /queryCanvasIndexCandidates/)
  assert.match(aiStore, /markCanvasOverlayStale/)
  assert.match(aiStore, /queueCanvasIndexRetry/)
  assert.doesNotMatch(aiStore, /allPairs|all-pairs/)
  assert.match(component, /rejectCanvasAiOverlayRecord/)
  assert.match(component, /candidate/)
  assert.match(editor, /<CanvasAiOverlay canvasId=\{canvasId\}/)
  assert.match(startup, /initializeCanvasAiOverlayClassification\(\)[\s\S]*startCanvasIndexWorker\(\)/)
  assert.doesNotMatch(overlayDb, /update canvases set content/)
  assert.doesNotMatch(component, /updateDocument|updateHistory/)
})
