'use client'

import { memo, useMemo } from 'react'
import { MessageCircleMore } from 'lucide-react'
import useChatStore from '@/stores/chat'
import { getCollapsedChatSummary } from '@/stores/chat-hud'

interface CanvasChatSummaryProps {
  onExpand: () => void
}

export const CanvasChatSummary = memo(function CanvasChatSummary({ onExpand }: CanvasChatSummaryProps) {
  const chats = useChatStore(state => state.chats)
  const summary = useMemo(() => getCollapsedChatSummary(chats), [chats])

  return (
    <button
      type="button"
      onClick={onExpand}
      className="flex w-full items-start gap-2 rounded-t-xl border-x border-t bg-background/92 px-3 py-2 text-left shadow-sm backdrop-blur-xl hover:bg-muted/90"
      aria-label="展开对话记录"
    >
      <MessageCircleMore className="mt-0.5 size-4 shrink-0 text-primary" />
      <span className="min-w-0 flex-1 space-y-1">
        <span className="block truncate text-xs font-medium text-foreground">
          {summary.user || '在当前画布中开始提问'}
        </span>
        <span className="line-clamp-3 block whitespace-pre-line text-xs leading-4 text-muted-foreground">
          {summary.assistant || '完整对话会保留在画布底部，不会成为画布节点。'}
        </span>
      </span>
    </button>
  )
})

CanvasChatSummary.displayName = 'CanvasChatSummary'
