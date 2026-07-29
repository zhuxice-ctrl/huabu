import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

import {
  isRawSensitiveContextAllowed,
  prepareCanvasEvidenceForRequest,
} from '../../src/lib/canvas/sensitive-content.ts'

const anchor = (plainText, sensitive = false) => ({
  id: 'anchor-1',
  nodeId: 'node-1',
  plainText,
  userMarkedSensitive: sensitive,
})

test('raw sensitive context is allowed only for non-proxied direct http(s) loopback endpoints', () => {
  for (const baseUrl of ['http://localhost:11434', 'https://127.0.0.42/v1', 'http://[::1]:8080']) {
    assert.equal(isRawSensitiveContextAllowed({ baseUrl, proxyMode: 'disabled', redirectPolicyVerified: true }), true)
  }
  for (const config of [
    { baseUrl: 'http://192.168.1.10', proxyMode: 'disabled' },
    { baseUrl: 'http://localhost:11434', proxyMode: 'custom' },
    { baseUrl: 'http://localhost:11434', proxyMode: 'disabled', proxyURL: 'http://proxy.local' },
    { baseUrl: 'http://localhost:11434', proxyMode: 'disabled', redirectUrl: 'https://api.example.com' },
    { baseUrl: 'not a url', proxyMode: 'disabled' },
    { baseUrl: 'ftp://localhost', proxyMode: 'disabled' },
    { baseUrl: 'http://localhost:11434', proxyMode: 'disabled' },
  ]) {
    assert.equal(isRawSensitiveContextAllowed(config), false)
  }
})

test('cloud-bound evidence redacts credentials, passwords, identity numbers and user-marked nodes with stable placeholders', () => {
  const original = 'apiKey=example-test-api-key password=example-test-password client_secret=example-secret Authorization: Bearer example-token id=11010519491231002X'
  const first = prepareCanvasEvidenceForRequest([anchor(original), anchor('private note', true)], {
    baseUrl: 'https://api.example.com', proxyMode: 'disabled',
  })
  const second = prepareCanvasEvidenceForRequest([anchor(original)], {
    baseUrl: 'https://api.example.com', proxyMode: 'disabled',
  })

  assert.equal(first.rawSensitiveAllowed, false)
  assert.equal(first.anchors[0].plainText.includes('example-test-password'), false)
  assert.equal(first.anchors[0].plainText.includes('11010519491231002X'), false)
  assert.equal(first.anchors[0].plainText.includes('example-secret'), false)
  assert.equal(first.anchors[0].plainText.includes('example-token'), false)
  assert.match(first.anchors[0].plainText, /REDACTED:API_KEY/)
  assert.equal(first.anchors[0].plainText, second.anchors[0].plainText)
  assert.match(first.anchors[1].plainText, /USER_MARKED_SENSITIVE/)
})

test('production chat stays fail-closed for redirects and preserves non-canvas RAG', async () => {
  const source = await readFile(new URL('../../src/app/core/main/chat/chat-send.tsx', import.meta.url), 'utf8')
  assert.match(source, /redirectPolicyVerified:\s*false/)
  assert.match(source, /if \(capturedContext\?\.sourceCanvasId\)[\s\S]*else if \(isRagEnabled\)/)
  assert.match(source, /getContextForQueryInFolder[\s\S]*getContextForQuery/)
  assert.match(source, /buildSteeringContext\(text\)/)
})

test('sensitive canvas originals require a per-request confirmation display', async () => {
  const [chatSource, displaySource] = await Promise.all([
    readFile(new URL('../../src/app/core/main/chat/chat-send.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../src/lib/agent/tool-confirmation-display.ts', import.meta.url), 'utf8'),
  ])
  assert.match(chatSource, /requestConfirmation\('canvas_inspect_sensitive_image'/)
  assert.match(chatSource, /decision !== 'approved'/)
  assert.match(displaySource, /canvas_inspect_sensitive_image/)
  assert.match(displaySource, /summaryFields:\s*\['imageLabel', 'model'\]/)
})
