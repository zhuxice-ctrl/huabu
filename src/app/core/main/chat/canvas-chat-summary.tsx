'use client'

import { memo, useMemo } from 'react'
import { MessageCircleMore } from 'lucide-react'
import useChatStore from '@/stores/chat'
import { getCollapsedChatSummary } from '@/stores/chat-hud'

interface CanvasChatSummaryProps {
  onExpand: () => void
  variant?: 'summary' | 'compact'
  statusLabel?: string
}

export const CanvasChatSummary = memo(function CanvasChatSummary({ onExpand, variant = 'summary', statusLabel }: CanvasChatSummaryProps) {
  const chats = useChatStore(state => state.chats)
  const summary = useMemo(() => getCollapsedChatSummary(chats), [chats])

  if (variant === 'compact') {
    return (
      <button
        type="button"
        onClick={onExpand}
        className="flex h-10 w-full items-center gap-2 rounded-xl border bg-background/95 px-3 text-left shadow-xl backdrop-blur-xl hover:bg-muted/90"
        aria-label="展开 AI 输入框"
      >
        <MessageCircleMore className="size-4 shrink-0 text-primary" />
        <span className="min-w-0 flex-1 truncate text-xs text-foreground">
          {summary.assistant || summary.user || '在当前画布中开始提问'}
        </span>
        <span className="shrink-0 text-[11px] text-muted-foreground">{statusLabel || 'AI 已就绪'}</span>
      </button>
    )
  }

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
