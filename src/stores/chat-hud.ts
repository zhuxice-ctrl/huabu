import { create } from 'zustand'
import { Store } from '@tauri-apps/plugin-store'

export const CHAT_HISTORY_WIDTH = 360
export const CHAT_HISTORY_HEIGHT = 420
export const CHAT_WINDOW_SEGMENT_SIZE = 40
export const CHAT_WINDOW_MAX_SIZE = 120

const CHAT_HUD_COMPOSER_COLLAPSED_KEY = 'canvasChatHudComposerCollapsed'

function initialComposerCollapsed() {
  if (typeof window === 'undefined') return false
  return localStorage.getItem(CHAT_HUD_COMPOSER_COLLAPSED_KEY) === 'true'
}

async function persistComposerCollapsed(collapsed: boolean) {
  const store = await Store.load('store.json')
  await store.set(CHAT_HUD_COMPOSER_COLLAPSED_KEY, collapsed)
  await store.save()
}

export interface ChatHudDraft {
  text: string
  promptOrigin?: 'keyboard' | 'microphone'
  attachedImages: unknown[]
  fileAttachments: unknown[]
  linkedResource: unknown | null
  pendingQuote: unknown | null
  editorSelectionQuote: unknown | null
}

export interface MessageWindow {
  start: number
  end: number
}

interface ChatHudState {
  expanded: boolean
  historyOpen: boolean
  historyQuery: string
  visibleCanvasHeight: number
  temporarySessionId: string
  composerCollapsed: boolean
  drafts: Record<string, ChatHudDraft>
  scrollPositions: Record<string, number>
  messageWindows: Record<string, MessageWindow>
}

function normalizeSummaryText(value: unknown) {
  return typeof value === 'string'
    ? value.replace(/\r\n?/g, '\n').trim()
    : ''
}

function wrapSummaryLines(value: string, maximumLines: number, charactersPerLine: number) {
  const words = value.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean)
  const lines: string[] = []
  let current = ''

  for (const word of words) {
    const candidates = word.length > charactersPerLine
      ? word.match(new RegExp(`.{1,${charactersPerLine}}`, 'g')) || [word]
      : [word]
    for (const candidate of candidates) {
      const next = current ? `${current} ${candidate}` : candidate
      if (next.length <= charactersPerLine) {
        current = next
        continue
      }
      if (current) lines.push(current)
      current = candidate
      if (lines.length === maximumLines) return lines
    }
  }
  if (current && lines.length < maximumLines) lines.push(current)
  return lines
}

export function getCollapsedChatSummary(chats: Array<{
  role?: string
  content?: string | null
}>) {
  let latestUser = ''
  let latestAssistant = ''
  for (let index = chats.length - 1; index >= 0; index -= 1) {
    const chat = chats[index]
    if (!latestUser && chat.role === 'user') latestUser = normalizeSummaryText(chat.content)
    if (!latestAssistant && chat.role === 'system') latestAssistant = normalizeSummaryText(chat.content)
    if (latestUser && latestAssistant) break
  }

  const user = wrapSummaryLines(latestUser, 1, 72).join('\n')
  const assistantParagraphs = latestAssistant
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .flatMap(line => wrapSummaryLines(line, 3, 72))
    .slice(0, 3)

  return { user, assistant: assistantParagraphs.join('\n') }
}

export function getExpandedChatHudHeight(visibleCanvasHeight: number) {
  if (!Number.isFinite(visibleCanvasHeight) || visibleCanvasHeight <= 0) return 0
  return Math.min(visibleCanvasHeight * 0.42, 560)
}

export function createChatHudDraftKey(
  conversationId: number | null,
  temporarySessionId: string,
  canvasId: string | null,
) {
  return `${conversationId ?? temporarySessionId}:${canvasId ?? 'no-canvas'}`
}

export function createInitialMessageWindow(totalMessages: number): MessageWindow {
  const end = Math.max(0, Math.floor(totalMessages))
  return { start: Math.max(0, end - CHAT_WINDOW_SEGMENT_SIZE), end }
}

export function prependMessageWindow(window: MessageWindow, totalMessages: number): MessageWindow {
  const total = Math.max(0, Math.floor(totalMessages))
  const start = Math.max(0, window.start - CHAT_WINDOW_SEGMENT_SIZE)
  const end = Math.min(total, Math.max(window.end, start + CHAT_WINDOW_SEGMENT_SIZE))
  return end - start > CHAT_WINDOW_MAX_SIZE
    ? { start, end: start + CHAT_WINDOW_MAX_SIZE }
    : { start, end }
}

export function appendMessageWindow(window: MessageWindow, totalMessages: number): MessageWindow {
  const total = Math.max(0, Math.floor(totalMessages))
  const end = Math.min(total, window.end + CHAT_WINDOW_SEGMENT_SIZE)
  return end - window.start > CHAT_WINDOW_MAX_SIZE
    ? { start: end - CHAT_WINDOW_MAX_SIZE, end }
    : { start: window.start, end }
}

export function reconcileMessageWindow(
  current: MessageWindow,
  previousTotal: number,
  totalMessages: number,
) {
  if (previousTotal === 0 || totalMessages < previousTotal) {
    return createInitialMessageWindow(totalMessages)
  }
  if (totalMessages > previousTotal && current.end >= previousTotal) {
    return {
      start: Math.max(current.start, totalMessages - CHAT_WINDOW_MAX_SIZE),
      end: totalMessages,
    }
  }
  return current
}

const useChatHudStore = create<ChatHudState>(() => ({
  expanded: false,
  historyOpen: false,
  historyQuery: '',
  visibleCanvasHeight: 0,
  temporarySessionId: crypto.randomUUID(),
  composerCollapsed: initialComposerCollapsed(),
  drafts: {},
  scrollPositions: {},
  messageWindows: {},
}))

let chatHudPreferencesInitialized = false

export function initChatHudPreferences() {
  if (chatHudPreferencesInitialized || typeof window === 'undefined') return
  chatHudPreferencesInitialized = true
  void Store.load('store.json').then(async store => {
    const persisted = await store.get<boolean>(CHAT_HUD_COMPOSER_COLLAPSED_KEY)
    if (typeof persisted !== 'boolean') return
    localStorage.setItem(CHAT_HUD_COMPOSER_COLLAPSED_KEY, String(persisted))
    useChatHudStore.setState({ composerCollapsed: persisted })
  })
}

export function setChatHudComposerCollapsed(composerCollapsed: boolean) {
  useChatHudStore.setState({
    composerCollapsed,
    ...(composerCollapsed ? { expanded: false, historyOpen: false } : {}),
  })
  if (typeof window !== 'undefined') {
    localStorage.setItem(CHAT_HUD_COMPOSER_COLLAPSED_KEY, String(composerCollapsed))
    void persistComposerCollapsed(composerCollapsed)
  }
}

export function setChatHudExpanded(expanded: boolean) {
  useChatHudStore.setState({ expanded })
}

export function setChatHudHistoryOpen(historyOpen: boolean) {
  useChatHudStore.setState({ historyOpen })
}

export function setChatHudHistoryQuery(historyQuery: string) {
  useChatHudStore.setState({ historyQuery })
}

export function setChatHudVisibleCanvasHeight(visibleCanvasHeight: number) {
  if (!Number.isFinite(visibleCanvasHeight) || visibleCanvasHeight < 0) return
  useChatHudStore.setState({ visibleCanvasHeight })
}

export function renewChatHudTemporarySession() {
  useChatHudStore.setState({ temporarySessionId: crypto.randomUUID() })
}

export function getChatHudDraft(key: string) {
  return useChatHudStore.getState().drafts[key] ?? null
}

export function saveChatHudDraft(key: string, draft: ChatHudDraft) {
  useChatHudStore.setState(state => ({
    drafts: draft.text
      || draft.attachedImages.length
      || draft.fileAttachments.length
      || draft.linkedResource
      || draft.pendingQuote
      || draft.editorSelectionQuote
      ? { ...state.drafts, [key]: draft }
      : Object.fromEntries(Object.entries(state.drafts).filter(([draftKey]) => draftKey !== key)),
  }))
}

export function clearChatHudDraft(key: string) {
  useChatHudStore.setState(state => {
    const drafts = { ...state.drafts }
    delete drafts[key]
    return { drafts }
  })
}

export function getChatHudScrollPosition(key: string) {
  return useChatHudStore.getState().scrollPositions[key] ?? null
}

export function saveChatHudScrollPosition(key: string, scrollTop: number) {
  if (!Number.isFinite(scrollTop) || scrollTop < 0) return
  useChatHudStore.setState(state => ({
    scrollPositions: { ...state.scrollPositions, [key]: scrollTop },
  }))
}

export function ensureChatHudMessageWindow(key: string, totalMessages: number) {
  useChatHudStore.setState(state => ({
    messageWindows: state.messageWindows[key]
      ? state.messageWindows
      : { ...state.messageWindows, [key]: createInitialMessageWindow(totalMessages) },
  }))
}

export function syncChatHudMessageWindow(
  key: string,
  previousTotal: number,
  totalMessages: number,
) {
  useChatHudStore.setState(state => {
    const current = state.messageWindows[key] ?? createInitialMessageWindow(previousTotal)
    const next = reconcileMessageWindow(current, previousTotal, totalMessages)
    return { messageWindows: { ...state.messageWindows, [key]: next } }
  })
}

export function prependChatHudMessageWindow(
  key: string,
  totalMessages: number,
  preserveFocusedContent: boolean,
) {
  useChatHudStore.setState(state => {
    const current = state.messageWindows[key] ?? createInitialMessageWindow(totalMessages)
    const next = preserveFocusedContent
      ? { start: Math.max(0, current.start - CHAT_WINDOW_SEGMENT_SIZE), end: current.end }
      : prependMessageWindow(current, totalMessages)
    return { messageWindows: { ...state.messageWindows, [key]: next } }
  })
}

export function appendChatHudMessageWindow(key: string, totalMessages: number) {
  useChatHudStore.setState(state => {
    const current = state.messageWindows[key] ?? createInitialMessageWindow(totalMessages)
    return {
      messageWindows: {
        ...state.messageWindows,
        [key]: appendMessageWindow(current, totalMessages),
      },
    }
  })
}

export default useChatHudStore
