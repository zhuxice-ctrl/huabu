'use client'

import { useEffect, useState } from 'react'
import type { CanvasRelationData } from '@/types/canvas'

export function CanvasRelationEditor({
  initial,
  mode,
  onSave,
  onCancel,
}: {
  initial: CanvasRelationData
  mode: 'create' | 'edit'
  onSave: (value: CanvasRelationData) => void
  onCancel: () => void
}) {
  const [value, setValue] = useState(initial)

  useEffect(() => setValue(initial), [initial])

  const patch = (next: Partial<CanvasRelationData>) => setValue(current => ({ ...current, ...next }))

  return (
    <div
      className="w-64 rounded-xl border border-border/80 bg-popover p-3 text-popover-foreground shadow-xl"
      onPointerDown={event => event.stopPropagation()}
      onKeyDown={event => {
        if (event.key === 'Escape') onCancel()
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) onSave(value)
      }}
    >
      <div className="mb-2 text-xs font-medium">{mode === 'create' ? '新建关系' : '编辑关系'}</div>
      <input
        autoFocus
        className="mb-2 h-8 w-full rounded-md border bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-primary/30"
        value={value.label}
        onChange={event => patch({ label: event.target.value })}
        placeholder="关系名称（可选）"
      />
      <div className="grid grid-cols-2 gap-2">
        <select className="h-8 rounded-md border bg-background px-2 text-xs" value={value.direction} onChange={event => patch({ direction: event.target.value as CanvasRelationData['direction'] })}>
          <option value="forward">单向</option>
          <option value="both">双向</option>
        </select>
        <select className="h-8 rounded-md border bg-background px-2 text-xs" value={value.lineStyle} onChange={event => patch({ lineStyle: event.target.value as CanvasRelationData['lineStyle'] })}>
          <option value="solid">实线</option>
          <option value="dashed">虚线</option>
          <option value="dotted">点线</option>
        </select>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
          颜色
          <input type="color" value={value.color} onChange={event => patch({ color: event.target.value })} className="size-7 cursor-pointer rounded border-0 bg-transparent p-0" />
        </label>
        <div className="flex gap-1.5">
          <button type="button" className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted" onClick={onCancel}>取消</button>
          <button type="button" className="rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground" onClick={() => onSave(value)}>保存</button>
        </div>
      </div>
    </div>
  )
}
