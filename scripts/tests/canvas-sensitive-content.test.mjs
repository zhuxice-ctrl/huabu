import assert from 'node:assert/strict'
import test from 'node:test'

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
    assert.equal(isRawSensitiveContextAllowed({ baseUrl, proxyMode: 'disabled' }), true)
  }
  for (const config of [
    { baseUrl: 'http://192.168.1.10', proxyMode: 'disabled' },
    { baseUrl: 'http://localhost:11434', proxyMode: 'custom' },
    { baseUrl: 'http://localhost:11434', proxyMode: 'disabled', proxyURL: 'http://proxy.local' },
    { baseUrl: 'http://localhost:11434', proxyMode: 'disabled', redirectUrl: 'https://api.example.com' },
    { baseUrl: 'not a url', proxyMode: 'disabled' },
    { baseUrl: 'ftp://localhost', proxyMode: 'disabled' },
  ]) {
    assert.equal(isRawSensitiveContextAllowed(config), false)
  }
})

test('cloud-bound evidence redacts credentials, passwords, identity numbers and user-marked nodes with stable placeholders', () => {
  const original = 'apiKey=example-test-api-key password=example-test-password id=11010519491231002X'
  const first = prepareCanvasEvidenceForRequest([anchor(original), anchor('private note', true)], {
    baseUrl: 'https://api.example.com', proxyMode: 'disabled',
  })
  const second = prepareCanvasEvidenceForRequest([anchor(original)], {
    baseUrl: 'https://api.example.com', proxyMode: 'disabled',
  })

  assert.equal(first.rawSensitiveAllowed, false)
  assert.equal(first.anchors[0].plainText.includes('example-test-password'), false)
  assert.equal(first.anchors[0].plainText.includes('11010519491231002X'), false)
  assert.match(first.anchors[0].plainText, /REDACTED:API_KEY/)
  assert.equal(first.anchors[0].plainText, second.anchors[0].plainText)
  assert.match(first.anchors[1].plainText, /USER_MARKED_SENSITIVE/)
})
