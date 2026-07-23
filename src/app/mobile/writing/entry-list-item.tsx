'use client'

import { Fragment, ReactNode, useRef, useState } from 'react'
import { Cloud, FileText, Folder, LoaderCircle, MoreVertical } from 'lucide-react'
import { BrowserEntry } from './types'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

type EntryAction = {
  key: string
  label: string
  icon: ReactNode
  onClick: () => void | Promise<void>
  disabled?: boolean
  variant?: 'default' | 'outline' | 'destructive'
  separatorBefore?: boolean
}

interface EntryListItemProps {
  entry: BrowserEntry
  isActive: boolean
  onOpen: (entry: BrowserEntry) => void
  actions: EntryAction[]
  remoteLabel: string
  subtitle?: string
  dragDisabled?: boolean
  isDragging?: boolean
  dragOffset?: { x: number; y: number }
  isDropTarget?: boolean
  dropTargetRef?: (node: HTMLDivElement | null) => void
  onDragStart?: (entry: BrowserEntry, point: { x: number; y: number }) => void
  onDragMove?: (point: { x: number; y: number }) => void
  onDragEnd?: (point: { x: number; y: number }) => void
  onDragCancel?: () => void
}

export function EntryListItem({
  entry,
  isActive,
  onOpen,
  actions,
  remoteLabel,
  subtitle,
  dragDisabled = false,
  isDragging = false,
  dragOffset,
  isDropTarget = false,
  dropTargetRef,
  onDragStart,
  onDragMove,
  onDragEnd,
  onDragCancel,
}: EntryListItemProps) {
  const touchStartXRef = useRef(0)
  const touchStartYRef = useRef(0)
  const isSwipingRef = useRef(false)
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isDraggingRef = useRef(false)
  const suppressClickRef = useRef(false)
  const [translateX, setTranslateX] = useState(0)
  const [opened, setOpened] = useState(false)

  const quickActions = actions.filter((action) => action.key === 'rename' || action.key === 'delete')
  const actionWidth = quickActions.length * 60
  const itemTransform = isDragging && dragOffset
    ? `translate(${dragOffset.x}px, ${dragOffset.y}px)`
    : `translateX(${translateX}px)`

  function clearLongPressTimer() {
    if (!longPressTimerRef.current) return
    clearTimeout(longPressTimerRef.current)
    longPressTimerRef.current = null
  }

  function handleTouchStart(e: React.TouchEvent<HTMLDivElement>) {
    const touch = e.touches[0]
    touchStartXRef.current = touch.clientX
    touchStartYRef.current = touch.clientY
    isSwipingRef.current = false

    if (!dragDisabled && !opened) {
      clearLongPressTimer()
      longPressTimerRef.current = setTimeout(() => {
        isDraggingRef.current = true
        suppressClickRef.current = true
        setOpened(false)
        setTranslateX(0)
        onDragStart?.(entry, { x: touch.clientX, y: touch.clientY })
      }, 350)
    }
  }

  function handleTouchMove(e: React.TouchEvent<HTMLDivElement>) {
    const touch = e.touches[0]
    const deltaX = touch.clientX - touchStartXRef.current
    const deltaY = touch.clientY - touchStartYRef.current

    if (isDraggingRef.current) {
      e.preventDefault()
      onDragMove?.({ x: touch.clientX, y: touch.clientY })
      return
    }

    if (Math.hypot(deltaX, deltaY) > 10) {
      clearLongPressTimer()
    }

    if (quickActions.length === 0) return

    if (!isSwipingRef.current) {
      if (Math.abs(deltaX) < 8) return
      if (Math.abs(deltaX) <= Math.abs(deltaY)) return
      isSwipingRef.current = true
    }

    e.preventDefault()
    const maxLeft = -actionWidth
    const base = opened ? maxLeft : 0
    const next = Math.max(maxLeft, Math.min(0, base + deltaX))
    setTranslateX(next)
  }

  function handleTouchEnd(e: React.TouchEvent<HTMLDivElement>) {
    clearLongPressTimer()
    if (isDraggingRef.current) {
      const touch = e.changedTouches[0]
      isDraggingRef.current = false
      onDragEnd?.({ x: touch.clientX, y: touch.clientY })
      window.setTimeout(() => {
        suppressClickRef.current = false
      }, 0)
      return
    }

    if (quickActions.length === 0) return
    const maxLeft = -actionWidth
    const shouldOpen = translateX < maxLeft / 2
    setOpened(shouldOpen)
    setTranslateX(shouldOpen ? maxLeft : 0)
    isSwipingRef.current = false
  }

  function handleTouchCancel() {
    clearLongPressTimer()
    if (isDraggingRef.current) {
      onDragCancel?.()
    }
    isDraggingRef.current = false
    isSwipingRef.current = false
    window.setTimeout(() => {
      suppressClickRef.current = false
    }, 0)
  }

  return (
    <div
      ref={dropTargetRef}
      className={cn(
        "relative rounded-md bg-background",
        isDragging ? "z-50 overflow-visible" : "overflow-hidden",
        isDropTarget && "outline-2 outline-primary outline-offset-2"
      )}
    >
      {quickActions.length > 0 && (
        <div
          className={cn(
            "absolute inset-y-0 right-0 z-0 flex items-center gap-2 bg-background px-2",
            isDragging && "hidden"
          )}
        >
          {quickActions.map((action) => (
            <Button
              key={action.key}
              type="button"
              variant={action.variant || 'outline'}
              disabled={action.disabled}
              size="icon"
              className="size-11 rounded-xl shadow-sm"
              onClick={async () => {
                setOpened(false)
                setTranslateX(0)
                await action.onClick()
              }}
              aria-label={action.label}
              title={action.label}
            >
              {action.icon}
              <span className="sr-only">{action.label}</span>
            </Button>
          ))}
        </div>
      )}
      <div
        className={cn(
          "relative z-10 min-h-11 w-full rounded-md bg-background px-2 py-1.5 text-left transition-transform duration-200 ease-out hover:bg-accent active:bg-accent",
          isActive && "bg-accent text-accent-foreground",
          isDropTarget && "bg-primary/5",
          isDragging && "bg-background shadow-xl ring-1 ring-primary transition-none"
        )}
        style={{ transform: itemTransform }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchCancel}
      >
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              if (suppressClickRef.current) {
                suppressClickRef.current = false
                return
              }
              if (opened) {
                setOpened(false)
                setTranslateX(0)
                return
              }
              onOpen(entry)
            }}
            className="min-w-0 flex-1 text-left"
          >
            <div className="flex items-center gap-2">
              {entry.isLoading ? (
                <LoaderCircle className="size-4 shrink-0 animate-spin text-muted-foreground" />
              ) : entry.type === 'folder' ? (
                <Folder className="size-4 shrink-0 text-muted-foreground" />
              ) : (
                <FileText className="size-4 shrink-0 text-muted-foreground" />
              )}
              <p className="min-w-0 flex-1 truncate text-sm font-medium">{entry.name}</p>
              {!entry.isLocale && (
                <span
                  className="inline-flex shrink-0 items-center text-muted-foreground"
                  title={remoteLabel}
                  aria-label={remoteLabel}
                >
                  <Cloud className="size-4 stroke-[2.25]" />
                </span>
              )}
            </div>
            {subtitle && (
              <p className="mt-1 truncate text-xs text-muted-foreground">{subtitle}</p>
            )}
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-9 shrink-0"
                aria-label={entry.name}
                onClick={(event) => event.stopPropagation()}
                onTouchStart={(event) => event.stopPropagation()}
                data-vaul-no-drag
              >
                <MoreVertical />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {actions.map((action) => (
                <Fragment key={action.key}>
                  {action.separatorBefore && <DropdownMenuSeparator />}
                  <DropdownMenuItem
                    disabled={action.disabled}
                    className={cn(action.variant === 'destructive' && 'text-destructive focus:text-destructive')}
                    onSelect={() => void action.onClick()}
                  >
                    {action.icon}
                    {action.label}
                  </DropdownMenuItem>
                </Fragment>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  )
}
