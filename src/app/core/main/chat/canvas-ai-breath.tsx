import { cn } from '@/lib/utils'
import type { AiBreathState } from '@/lib/chat/voice-session'

const BREATH_LABELS: Record<AiBreathState, string> = {
  idle: 'AI 已就绪',
  listening: '正在聆听',
  thinking: '正在思考',
  retrieving: '正在检索',
  locating: '正在定位',
  managing: '正在整理',
  editing: '正在编辑',
  'awaiting-confirmation': '等待确认',
  complete: '已完成',
  failed: '执行失败',
}

const ACTIVE_STATES = new Set<AiBreathState>([
  'listening',
  'thinking',
  'retrieving',
  'locating',
  'managing',
  'editing',
])

export function CanvasAiBreath({ state }: { state: AiBreathState }) {
  const active = ACTIVE_STATES.has(state)

  return (
    <div
      data-ai-breath-state={state}
      className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground"
      role="status"
      aria-live={state === 'failed' || state === 'awaiting-confirmation' ? 'assertive' : 'polite'}
      aria-label={BREATH_LABELS[state]}
    >
      <span className="relative flex size-4 shrink-0 items-center justify-center" aria-hidden="true">
        <span
          className={cn(
            'absolute size-3 rounded-full bg-primary/25 blur-[2px] transition-[transform,opacity,filter] duration-700 motion-reduce:animate-none motion-reduce:transition-none',
            active && 'scale-125 opacity-80 animate-pulse',
            state === 'awaiting-confirmation' && 'scale-110 bg-amber-500/35 opacity-90',
            state === 'complete' && 'scale-100 bg-emerald-500/30 opacity-70',
            state === 'failed' && 'scale-100 bg-destructive/35 opacity-85',
            state === 'idle' && 'scale-75 opacity-35',
          )}
        />
        <span
          className={cn(
            'relative size-1.5 rounded-full bg-primary transition-[transform,opacity,filter] duration-500 motion-reduce:animate-none motion-reduce:transition-none',
            active && 'scale-110 opacity-100',
            state === 'awaiting-confirmation' && 'bg-amber-500',
            state === 'complete' && 'bg-emerald-500',
            state === 'failed' && 'bg-destructive',
            state === 'idle' && 'scale-75 opacity-50',
          )}
        />
      </span>
      <span className="truncate">{BREATH_LABELS[state]}</span>
    </div>
  )
}
