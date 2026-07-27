'use client'

import { useMemo } from 'react'
import { Clock3, Search, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import useChatStore, {
  deleteChatConversation,
  switchChatConversation,
} from '@/stores/chat'
import useChatHudStore, {
  setChatHudHistoryOpen,
  setChatHudHistoryQuery,
} from '@/stores/chat-hud'

export function CanvasChatHistoryPopover() {
  const conversations = useChatStore(state => state.conversations)
  const currentConversationId = useChatStore(state => state.currentConversationId)
  const open = useChatHudStore(state => state.historyOpen)
  const query = useChatHudStore(state => state.historyQuery)

  const filtered = useMemo(() => conversations
    .filter(conversation => conversation.id !== currentConversationId)
    .filter(conversation => conversation.messageCount > 0)
    .filter(conversation => conversation.title.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((left, right) => {
      if (left.isPinned !== right.isPinned) return left.isPinned ? -1 : 1
      return right.updatedAt - left.updatedAt
    }), [conversations, currentConversationId, query])

  const handleSwitch = async (id: number) => {
    await switchChatConversation(id)
    setChatHudHistoryOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setChatHudHistoryOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="icon-sm" aria-label="对话历史">
          <Clock3 className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="end"
        className="h-[420px] w-[360px] gap-2 overflow-hidden p-3"
        onWheel={event => event.stopPropagation()}
      >
        <div className="relative shrink-0">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={event => setChatHudHistoryQuery(event.target.value)}
            placeholder="搜索对话"
            className="pl-8"
            autoFocus
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {filtered.length === 0 ? (
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
              没有匹配的对话
            </div>
          ) : filtered.map(conversation => (
            <div
              key={conversation.id}
              className="group flex items-center gap-2 rounded-md px-2 py-2 hover:bg-muted"
            >
              <button
                type="button"
                className="min-w-0 flex-1 truncate text-left text-sm"
                aria-current={conversation.id === currentConversationId ? 'page' : undefined}
                onClick={() => void handleSwitch(conversation.id)}
              >
                {conversation.title}
              </button>
              <button
                type="button"
                className="rounded p-1 text-muted-foreground opacity-0 hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
                aria-label={`删除 ${conversation.title}`}
                onClick={() => void deleteChatConversation(conversation.id)}
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
