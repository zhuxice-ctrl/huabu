'use client'

import type { Mark } from '@/db/marks'
import { createNoteReferenceSnapshot } from '@/lib/canvas/note-reference'

interface MarkPreviewPopoverProps {
  mark: Mark
  open: boolean
  onPointerEnter: () => void
  onPointerLeave: () => void
  onOpen: () => void
}

export function MarkPreviewPopover({ mark, open, onPointerEnter, onPointerLeave, onOpen }: MarkPreviewPopoverProps) {
  if (!open) return null
  const preview = createNoteReferenceSnapshot(mark)

  return (
    <div
      role="dialog"
      aria-label="记录预览"
      className="absolute left-0 top-full z-30 mt-1 w-80 rounded-md border bg-popover p-3 text-popover-foreground shadow-md"
      onMouseEnter={onPointerEnter}
      onMouseLeave={onPointerLeave}
    >
      <p className="truncate text-sm font-medium">{preview.sourceTitle}</p>
      <p className="mt-1 line-clamp-4 whitespace-pre-wrap text-xs text-muted-foreground">{preview.sourceExcerpt}</p>
      <button
        type="button"
        className="mt-2 text-xs text-primary underline-offset-4 hover:underline"
        onClick={onOpen}
      >
        打开记录
      </button>
    </div>
  )
}
