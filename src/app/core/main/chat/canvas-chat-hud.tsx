'use client'

import { useEffect, useMemo, useRef, type WheelEvent } from 'react'
import { ChevronDown, ChevronUp, MessageSquareDashed, MessageSquarePlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import useCanvasStore from '@/stores/canvas'
import useChatStore, {
  startNewChatConversation,
  startTemporaryChatConversation,
} from '@/stores/chat'
import useChatHudStore, {
  createChatHudDraftKey,
  getExpandedChatHudHeight,
  setChatHudExpanded,
  setChatHudHistoryOpen,
  setChatHudVisibleCanvasHeight,
} from '@/stores/chat-hud'
import ChatContent from './chat-content'
import { ChatInput } from './chat-input'
import { CanvasChatSummary } from './canvas-chat-summary'
import { CanvasChatHistoryPopover } from './canvas-chat-history-popover'

function stopHudWheelPropagation(event: WheelEvent) {
  event.stopPropagation()
}

function CanvasChatConversationActions() {
  const chatsLength = useChatStore(state => state.chats.length)
  const isTemporaryConversation = useChatStore(state => state.isTemporaryConversation)
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="临时对话"
        disabled={isTemporaryConversation}
        onClick={() => void startTemporaryChatConversation()}
      >
        <MessageSquareDashed className="size-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="新建对话"
        disabled={chatsLength === 0 && !isTemporaryConversation}
        onClick={() => void startNewChatConversation()}
      >
        <MessageSquarePlus className="size-4" />
      </Button>
    </>
  )
}

export function CanvasChatHud() {
  const hostRef = useRef<HTMLDivElement>(null)
  const activeCanvasId = useCanvasStore(state => state.activeCanvasId)
  const currentConversationId = useChatStore(state => state.currentConversationId)
  const expanded = useChatHudStore(state => state.expanded)
  const historyOpen = useChatHudStore(state => state.historyOpen)
  const visibleCanvasHeight = useChatHudStore(state => state.visibleCanvasHeight)
  const temporarySessionId = useChatHudStore(state => state.temporarySessionId)
  const conversationKey = useMemo(() => createChatHudDraftKey(
    currentConversationId,
    temporarySessionId,
    activeCanvasId,
  ), [activeCanvasId, currentConversationId, temporarySessionId])

  useEffect(() => {
    const host = hostRef.current?.parentElement
    if (!host) return
    const updateHeight = () => setChatHudVisibleCanvasHeight(host.clientHeight)
    updateHeight()
    const observer = new ResizeObserver(updateHeight)
    observer.observe(host)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      if (historyOpen) setChatHudHistoryOpen(false)
      else if (expanded) setChatHudExpanded(false)
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [expanded, historyOpen])

  const expandedHeight = getExpandedChatHudHeight(visibleCanvasHeight)

  return (
    <div
      ref={hostRef}
      data-canvas-chat-hud
      className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex justify-center px-3 pb-3"
    >
      <section
        className="pointer-events-auto flex w-full max-w-3xl flex-col"
        aria-label="画布对话"
        onWheel={stopHudWheelPropagation}
      >
        {expanded ? (
          <div
            className="flex min-h-0 flex-col overflow-hidden rounded-t-xl border-x border-t bg-background/95 shadow-xl backdrop-blur-xl"
            style={{ height: expandedHeight }}
          >
            <div className="flex h-10 shrink-0 items-center justify-between border-b px-2">
              <span className="px-2 text-xs font-medium">当前画布对话</span>
              <div className="flex items-center gap-1">
                <CanvasChatConversationActions />
                <CanvasChatHistoryPopover />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="收起对话记录"
                  onClick={() => setChatHudExpanded(false)}
                >
                  <ChevronDown className="size-4" />
                </Button>
              </div>
            </div>
            <ChatContent
              layoutVariant="hud"
              scrollerId="canvas-chat-hud-scroller"
              conversationKey={conversationKey}
            />
          </div>
        ) : (
          <div className="relative">
            <CanvasChatSummary onExpand={() => setChatHudExpanded(true)} />
            <div className="absolute right-2 top-1.5 flex items-center gap-1">
              <CanvasChatConversationActions />
              <CanvasChatHistoryPopover />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="展开对话记录"
                onClick={() => setChatHudExpanded(true)}
              >
                <ChevronUp className="size-4" />
              </Button>
            </div>
          </div>
        )}
        <div className="rounded-b-xl border bg-background/96 shadow-xl backdrop-blur-xl">
          <ChatInput key={conversationKey} />
        </div>
      </section>
    </div>
  )
}
