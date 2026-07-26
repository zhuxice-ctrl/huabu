'use client'

import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'

export interface CanvasNodeStyleValue {
  backgroundColor?: string
  textColor?: string
  fontSize?: number
  borderColor?: string
  borderStyle?: 'none' | 'solid' | 'dashed' | 'dotted'
}

export interface CanvasNodeStyleMenuProps {
  value: CanvasNodeStyleValue
  fontSizeMixed?: boolean
  onSessionStart: () => void
  onChange: (patch: Partial<CanvasNodeStyleValue>) => void
}

export const NODE_BACKGROUND_PRESETS = ['#F2F1ED', '#ffffff', '#f8fafc', '#dbeafe', '#dcfce7', '#fef3c7', '#fee2e2']
export const NODE_TEXT_PRESETS = ['#202321', '#0f172a', '#334155', '#1d4ed8', '#15803d', '#b45309', '#b91c1c']
export const NODE_BORDER_PRESETS = ['#D8D6CF', '#0f172a', '#334155', '#1d4ed8', '#15803d', '#b45309', '#b91c1c']
export const NODE_FONT_SIZE_PRESETS = [13, 15, 18, 24]

function ColorRow({
  label,
  colors,
  value,
  onChange,
}: {
  label: string
  colors: string[]
  value?: string
  onChange: (color: string) => void
}) {
  return (
    <div className="space-y-1.5">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="flex items-center gap-1.5">
        {colors.map(color => (
          <button
            key={color}
            type="button"
            aria-label={`${label} ${color}`}
            className={cn(
              'size-5 rounded-full border border-black/10 shadow-sm transition-transform hover:scale-110',
              value === color && 'ring-2 ring-primary ring-offset-1 ring-offset-popover',
            )}
            style={{ backgroundColor: color }}
            onClick={event => {
              event.preventDefault()
              event.stopPropagation()
              onChange(color)
            }}
          />
        ))}
        <label className="relative size-5 overflow-hidden rounded-full border border-border bg-[conic-gradient(red,yellow,lime,aqua,blue,magenta,red)] shadow-sm" aria-label={`${label}自定义`}>
          <input
            type="color"
            value={value?.startsWith('#') ? value : '#64748b'}
            className="absolute inset-0 size-8 cursor-pointer opacity-0"
            onChange={event => onChange(event.target.value)}
          />
        </label>
      </div>
    </div>
  )
}

export function CanvasNodeStyleMenu({ value, fontSizeMixed = false, onSessionStart, onChange }: CanvasNodeStyleMenuProps) {
  const startedRef = useRef(false)
  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    onSessionStart()
  }, [onSessionStart])

  return (
    <div className="w-64 space-y-3 p-2" onPointerDown={event => event.stopPropagation()}>
      <ColorRow label="区块背景" colors={NODE_BACKGROUND_PRESETS} value={value.backgroundColor} onChange={backgroundColor => onChange({ backgroundColor })} />
      <ColorRow label="字体颜色" colors={NODE_TEXT_PRESETS} value={value.textColor} onChange={textColor => onChange({ textColor })} />
      <ColorRow label="边框颜色" colors={NODE_BORDER_PRESETS} value={value.borderColor} onChange={borderColor => onChange({ borderColor })} />
      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1 text-[11px] text-muted-foreground">
          屏幕字号
          <input
            type="number"
            min="8"
            max="96"
            step="0.5"
            className="h-8 w-full rounded-md border bg-background px-2 text-xs text-foreground"
            value={fontSizeMixed ? '' : value.fontSize ?? ''}
            placeholder={fontSizeMixed ? '混合' : '15'}
            onChange={event => {
              if (event.target.value === '') return
              onChange({ fontSize: Number(event.target.value) })
            }}
          />
          <span className="grid grid-cols-4 gap-1 pt-1">
            {NODE_FONT_SIZE_PRESETS.map(size => (
              <button
                key={size}
                type="button"
                className="h-6 rounded border bg-background text-[10px] text-foreground hover:bg-accent"
                onClick={() => onChange({ fontSize: size })}
              >
                {size}
              </button>
            ))}
          </span>
        </label>
        <label className="space-y-1 text-[11px] text-muted-foreground">
          边框
          <select
            className="h-8 w-full rounded-md border bg-background px-2 text-xs text-foreground"
            value={value.borderStyle || 'solid'}
            onChange={event => onChange({ borderStyle: event.target.value as CanvasNodeStyleValue['borderStyle'] })}
          >
            <option value="none">无</option>
            <option value="solid">实线</option>
            <option value="dashed">虚线</option>
            <option value="dotted">点线</option>
          </select>
        </label>
      </div>
    </div>
  )
}
