import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../../', import.meta.url)

test('canvas workspace mounts one screen-space HUD without subscribing the editor to chat tokens', async () => {
  const [workspace, hud] = await Promise.all([
    readFile(new URL('src/app/core/main/canvas/canvas-workspace.tsx', root), 'utf8'),
    readFile(new URL('src/app/core/main/chat/canvas-chat-hud.tsx', root), 'utf8'),
  ])
  assert.match(workspace, /<CanvasChatHud \/>/)
  assert.match(workspace, /getCanvasEditorRenderCountForTest/)
  assert.doesNotMatch(workspace, /useChatStore/)
  assert.match(hud, /pointer-events-none/)
  assert.match(hud, /pointer-events-auto/)
  assert.match(hud, /onWheel=\{stopHudWheelPropagation\}/)
  assert.doesNotMatch(hud, /CanvasDocument|ReactFlow|useReactFlow/)
})

test('HUD reuses ChatContent and owns summary, history and composer as siblings', async () => {
  const hud = await readFile(new URL('src/app/core/main/chat/canvas-chat-hud.tsx', root), 'utf8')
  assert.match(hud, /<ChatContent\s+layoutVariant="hud"/)
  assert.match(hud, /<CanvasChatSummary/)
  assert.match(hud, /<CanvasChatHistoryPopover/)
  assert.match(hud, /<ChatInput \/>/)
  assert.match(hud, /Escape/)
})

test('ChatContent exposes layout and scroller identity while windowing long histories', async () => {
  const content = await readFile(new URL('src/app/core/main/chat/chat-content.tsx', root), 'utf8')
  assert.match(content, /layoutVariant\?: 'panel' \| 'hud'/)
  assert.match(content, /scrollerId\?: string/)
  assert.match(content, /createInitialMessageWindow/)
  assert.match(content, /prependChatHudMessageWindow/)
  assert.match(content, /visibleChats\.map/)
  assert.doesNotMatch(content, /chats\.map\(\(chat\)/)
})

test('history uses the protected static transaction boundary and fixed popover bounds', async () => {
  const history = await readFile(new URL('src/app/core/main/chat/canvas-chat-history-popover.tsx', root), 'utf8')
  assert.match(history, /switchChatConversation/)
  assert.match(history, /deleteChatConversation/)
  assert.match(history, /w-\[360px\]/)
  assert.match(history, /h-\[420px\]/)
  assert.match(history, /Search/)
})

test('ChatInput saves and restores in-memory keyed drafts and clears only on accepted send', async () => {
  const [input, send] = await Promise.all([
    readFile(new URL('src/app/core/main/chat/chat-input.tsx', root), 'utf8'),
    readFile(new URL('src/app/core/main/chat/chat-send.tsx', root), 'utf8'),
  ])
  assert.match(input, /createChatHudDraftKey/)
  assert.match(input, /saveChatHudDraft/)
  assert.match(input, /getChatHudDraft/)
  assert.match(input, /clearChatHudDraft/)
  assert.match(send, /const insertedUserChat = await insert/)
  assert.match(send, /if \(!insertedUserChat\) return/)
})
