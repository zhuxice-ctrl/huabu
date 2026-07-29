import assert from 'node:assert/strict'
import test from 'node:test'

const moduleUrl = new URL('../../src/stores/chat-hud.ts', import.meta.url)

test('collapsed summaries clip the latest user to one line and assistant to three', async () => {
  const { getCollapsedChatSummary } = await import(moduleUrl.href)
  const summary = getCollapsedChatSummary([
    { id: 1, role: 'user', content: 'old user' },
    { id: 2, role: 'system', content: 'old answer' },
    { id: 3, role: 'user', content: 'latest\nuser ' + 'x'.repeat(100) },
    { id: 4, role: 'system', content: ['one', 'two', 'three', 'four'].join('\n') },
  ])
  assert.equal(summary.user.split('\n').length, 1)
  assert.equal(summary.assistant.split('\n').length, 3)
  assert.match(summary.user, /^latest user/)
  assert.equal(summary.assistant, 'one\ntwo\nthree')
})

test('expanded and history dimensions follow the screen-space contract', async () => {
  const {
    CHAT_HISTORY_HEIGHT,
    CHAT_HISTORY_WIDTH,
    getExpandedChatHudHeight,
  } = await import(moduleUrl.href)
  assert.equal(getExpandedChatHudHeight(1000), 420)
  assert.equal(getExpandedChatHudHeight(2000), 560)
  assert.equal(getExpandedChatHudHeight(Number.NaN), 0)
  assert.equal(CHAT_HISTORY_WIDTH, 360)
  assert.equal(CHAT_HISTORY_HEIGHT, 420)
})

test('draft keys isolate conversations, temporary sessions and canvases', async () => {
  const { createChatHudDraftKey } = await import(moduleUrl.href)
  assert.equal(createChatHudDraftKey(12, 'temp-a', 'canvas-a'), '12:canvas-a')
  assert.equal(createChatHudDraftKey(null, 'temp-a', 'canvas-a'), 'temp-a:canvas-a')
  assert.notEqual(
    createChatHudDraftKey(null, 'temp-a', 'canvas-a'),
    createChatHudDraftKey(null, 'temp-a', 'canvas-b'),
  )
})

test('10,000-message histories mount forty initially and keep a bounded window', async () => {
  const {
    appendMessageWindow,
    createInitialMessageWindow,
    prependMessageWindow,
    reconcileMessageWindow,
  } = await import(moduleUrl.href)
  const initial = createInitialMessageWindow(10_000)
  assert.deepEqual(initial, { start: 9960, end: 10_000 })
  const firstPrepend = prependMessageWindow(initial, 10_000)
  assert.deepEqual(firstPrepend, { start: 9920, end: 10_000 })
  let window = firstPrepend
  for (let index = 0; index < 10; index += 1) window = prependMessageWindow(window, 10_000)
  assert.ok(window.end - window.start <= 120)
  const later = appendMessageWindow(window, 10_000)
  assert.ok(later.end > window.end)
  assert.ok(later.end - later.start <= 120)
  assert.deepEqual(
    reconcileMessageWindow({ start: 0, end: 0 }, 0, 10_000),
    { start: 9960, end: 10_000 },
  )
})

test('session HUD defaults collapsed and keeps draft data on its memory-only path', async () => {
  const source = await import('node:fs/promises').then(fs => fs.readFile(moduleUrl, 'utf8'))
  assert.match(source, /expanded: false/)
  assert.match(source, /drafts: \{\}/)
  assert.match(source, /scrollPositions: \{\}/)
  const memoryOnlyStart = source.indexOf('export function getChatHudDraft')
  assert.ok(memoryOnlyStart >= 0)
  const memoryOnlySource = source.slice(memoryOnlyStart)
  assert.doesNotMatch(memoryOnlySource, /localStorage|Store\.load|persistComposerCollapsed|insertChat|upload/)
})

test('collapsing the composer preserves an existing draft and closes transient HUD layers', async () => {
  const {
    default: useChatHudStore,
    clearChatHudDraft,
    saveChatHudDraft,
    setChatHudComposerCollapsed,
  } = await import(moduleUrl.href)
  const key = 'test-conversation:canvas-a'
  const draft = {
    text: '保留这份草稿',
    attachedImages: [],
    fileAttachments: [],
    linkedResource: null,
    pendingQuote: null,
    editorSelectionQuote: null,
  }
  useChatHudStore.setState({ expanded: true, historyOpen: true })
  saveChatHudDraft(key, draft)
  setChatHudComposerCollapsed(true)
  const state = useChatHudStore.getState()
  assert.equal(state.composerCollapsed, true)
  assert.equal(state.expanded, false)
  assert.equal(state.historyOpen, false)
  assert.deepEqual(state.drafts[key], draft)
  clearChatHudDraft(key)
})
