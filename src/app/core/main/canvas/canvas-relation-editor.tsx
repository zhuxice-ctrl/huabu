'use client'

import { useEffect, useState } from 'react'
import { normalizeRelationData } from '@/lib/canvas/relation-policy'
import type {
  CanvasRelationData,
  CanvasRelationRouteType,
  CanvasRelationWaypoint,
} from '@/types/canvas'

export function CanvasRelationEditor({
  initial,
  mode,
  suggestedWaypoint,
  onSave,
  onCancel,
}: {
  initial: CanvasRelationData
  mode: 'create' | 'edit'
  suggestedWaypoint?: CanvasRelationWaypoint
  onSave: (value: CanvasRelationData) => void
  onCancel: () => void
}) {
  const [value, setValue] = useState(() => normalizeRelationData(initial))

  useEffect(() => setValue(normalizeRelationData(initial)), [initial])

  const patch = (next: Partial<CanvasRelationData>) => setValue(current => ({ ...current, ...next }))

  return (
    <div
      className="w-72 rounded-xl border border-border/80 bg-popover p-3 text-popover-foreground shadow-xl"
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
      <div className="mt-2 grid grid-cols-2 gap-2">
        <select className="h-8 rounded-md border bg-background px-2 text-xs" value={value.routeType} onChange={event => patch({ routeType: event.target.value as CanvasRelationRouteType })}>
          <option value="auto">自动绕行</option>
          <option value="bezier">弧形线</option>
          <option value="straight">直线</option>
          <option value="orthogonal">折线</option>
          <option value="manual">手动节点</option>
        </select>
        <label className="flex h-8 items-center gap-2 rounded-md border bg-background px-2 text-[11px] text-muted-foreground">
          粗细
          <input
            type="range"
            min={1}
            max={8}
            step={1}
            value={value.strokeWidth}
            onChange={event => patch({ strokeWidth: Number(event.target.value) })}
            className="min-w-0 flex-1"
          />
        </label>
      </div>
      <div className="mt-2 flex gap-1.5">
        <button
          type="button"
          disabled={!suggestedWaypoint}
          className="rounded-md border px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-45"
          onClick={() => suggestedWaypoint && patch({
            routeType: 'manual',
            waypoints: [...(value.waypoints || []), suggestedWaypoint],
          })}
        >
          增加节点
        </button>
        <button
          type="button"
          disabled={!value.waypoints?.length}
          className="rounded-md border px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-45"
          onClick={() => patch({ waypoints: [] })}
        >
          清除节点
        </button>
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
