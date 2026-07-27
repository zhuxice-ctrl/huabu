'use client'

import { useEffect, useMemo } from 'react'
import { Check, RefreshCw, Sparkles, X } from 'lucide-react'
import { Panel, ViewportPortal, type Node } from '@xyflow/react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { useCanvasAiStore } from '@/stores/canvas-ai'
import type { AiRelationRecord, AiTagRecord } from '@/lib/canvas/ai-overlay'
import { cn } from '@/lib/utils'

const RELATION_LABELS: Record<AiRelationRecord['type'], string> = {
  same_topic: '同一主题',
  supplement: '补充说明',
  time_continuation: '时间延续',
  plan_execution: '计划与执行',
  problem_solution: '问题与解决',
  person_or_place: '人物或地点',
  citation_or_source: '引用或来源',
  possible_duplicate: '可能重复',
  credential_ownership: '凭据归属',
}

function OverlayFeedback({ kind, record }: {
  kind: 'tag' | 'relation'
  record: AiTagRecord | AiRelationRecord
}) {
  const accept = useCanvasAiStore(state => state.accept)
  const rejectCanvasAiOverlayRecord = useCanvasAiStore(state => state.reject)
  return (
    <span className="pointer-events-auto ml-1 inline-flex gap-0.5">
      {record.state === 'candidate' && (
        <button
          type="button"
          className="rounded p-0.5 hover:bg-emerald-500/15"
          aria-label="接受 AI 建议"
          title="接受"
          onClick={() => void accept(kind, record.id)}
        >
          <Check className="size-3" />
        </button>
      )}
      <button
        type="button"
        className="rounded p-0.5 hover:bg-destructive/15"
        aria-label="拒绝并隐藏同类 AI 建议"
        title="拒绝"
        onClick={() => void rejectCanvasAiOverlayRecord(kind, record.id)}
      >
        <X className="size-3" />
      </button>
    </span>
  )
}

export function CanvasAiOverlay({ canvasId, nodes }: {
  canvasId: string
  nodes: readonly Node[]
}) {
  const nodesById = useMemo(() => new Map(nodes.map(node => [node.id, node])), [nodes])
  const visible = useCanvasAiStore(state => state.visible)
  const tags = useCanvasAiStore(state => state.tags)
  const relations = useCanvasAiStore(state => state.relations)
  const load = useCanvasAiStore(state => state.load)
  const setVisible = useCanvasAiStore(state => state.setVisible)
  const rebuild = useCanvasAiStore(state => state.rebuild)

  useEffect(() => {
    void load(canvasId).catch(error => {
      console.error('Failed to load canvas AI overlay:', error)
    })
  }, [canvasId, load])

  const displayTags = visible ? tags.filter(tag => tag.state !== 'retrieval-only') : []
  const displayRelations = visible
    ? relations.filter(relation => relation.state !== 'retrieval-only')
    : []

  return (
    <>
      <Panel position="top-right" className="!m-3">
        <div className="flex h-8 items-center gap-2 rounded-md border bg-background/95 px-2 shadow-sm backdrop-blur">
          <Sparkles className="size-3.5 text-cyan-600" aria-hidden="true" />
          <span className="text-xs font-medium">AI 关联</span>
          <Switch
            size="sm"
            checked={visible}
            onCheckedChange={setVisible}
            aria-label="显示 AI 标签和关系"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label="重建 AI 关联"
            title="重建"
            onClick={() => void rebuild(canvasId)}
          >
            <RefreshCw />
          </Button>
        </div>
      </Panel>
      <ViewportPortal>
        <div className="pointer-events-none absolute left-0 top-0 z-20 overflow-visible">
          {displayRelations.map(relation => {
            const source = nodesById.get(relation.sourceNodeId)
            const target = nodesById.get(relation.targetNodeId)
            if (!source || !target) return null
            const sourceX = source.position.x + (source.measured?.width ?? source.width ?? 160) / 2
            const sourceY = source.position.y + (source.measured?.height ?? source.height ?? 80) / 2
            const targetX = target.position.x + (target.measured?.width ?? target.width ?? 160) / 2
            const targetY = target.position.y + (target.measured?.height ?? target.height ?? 80) / 2
            const left = Math.min(sourceX, targetX)
            const top = Math.min(sourceY, targetY)
            const width = Math.max(1, Math.abs(targetX - sourceX))
            const height = Math.max(1, Math.abs(targetY - sourceY))
            const candidate = relation.state === 'candidate'
            const stale = relation.state === 'stale'
            return (
              <div key={relation.id} className="absolute overflow-visible" style={{ left, top, width, height }}>
                <svg className="absolute inset-0 size-full overflow-visible" aria-hidden="true">
                  <line
                    x1={sourceX - left}
                    y1={sourceY - top}
                    x2={targetX - left}
                    y2={targetY - top}
                    className={cn(
                      'stroke-cyan-600',
                      candidate && 'stroke-amber-500',
                      stale && 'stroke-muted-foreground',
                    )}
                    strokeWidth={2}
                    strokeDasharray={candidate || stale ? '6 5' : undefined}
                    opacity={stale ? 0.42 : 0.78}
                  />
                </svg>
                <span
                  className={cn(
                    'pointer-events-auto absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center whitespace-nowrap rounded border bg-background/95 px-1.5 py-0.5 text-[10px] shadow-sm',
                    candidate && 'border-amber-500/60 text-amber-700',
                    stale && 'text-muted-foreground opacity-70',
                  )}
                  title={relation.reason}
                >
                  {RELATION_LABELS[relation.type]} · {Math.round(relation.confidence * 100)}%
                  <OverlayFeedback kind="relation" record={relation} />
                </span>
              </div>
            )
          })}
          {displayTags.map(tag => {
            const node = nodesById.get(tag.nodeId)
            if (!node) return null
            return (
              <span
                key={tag.id}
                className={cn(
                  'pointer-events-auto absolute flex -translate-y-full items-center whitespace-nowrap rounded border border-cyan-600/45 bg-background/95 px-1.5 py-0.5 text-[10px] text-cyan-700 shadow-sm',
                  tag.state === 'candidate' && 'border-amber-500/60 text-amber-700',
                  tag.state === 'stale' && 'border-muted-foreground/40 text-muted-foreground opacity-70',
                )}
                style={{ left: node.position.x, top: node.position.y - 5 }}
                title={tag.reason}
              >
                <Sparkles className="mr-1 size-2.5" aria-hidden="true" />
                {tag.label} · {Math.round(tag.confidence * 100)}%
                <OverlayFeedback kind="tag" record={tag} />
              </span>
            )
          })}
        </div>
      </ViewportPortal>
    </>
  )
}
