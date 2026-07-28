'use client'

import { useEffect, useMemo, useState } from 'react'
import { ListTree, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { useCanvasAiStore } from '@/stores/canvas-ai'
import { deleteSavedCanvasView, getSavedCanvasViews, saveCanvasView, type SavedCanvasView } from '@/db/canvas-views'
import {
  buildLinearProjection,
  type LinearSortMode,
  type LinearViewFilters,
} from '@/lib/canvas/linear-view'
import emitter from '@/lib/emitter'
import type { CanvasEdge, CanvasNode } from '@/types/canvas'

const EMPTY_FILTERS: LinearViewFilters = {}

function filterValues(value: string) {
  return value.split(',').map(item => item.trim()).filter(Boolean)
}

function withTimeBoundary(
  filters: LinearViewFilters,
  boundary: 'from' | 'to',
  value: string,
): LinearViewFilters {
  const time = { ...(filters.time || {}) }
  if (value) time[boundary] = Number(value)
  else delete time[boundary]
  return { ...filters, time: Object.keys(time).length ? time : null }
}

export function CanvasLinearView({
  canvasId,
  nodes,
  manualRelations,
}: {
  canvasId: string
  nodes: readonly CanvasNode[]
  manualRelations: readonly CanvasEdge[]
}) {
  const aiRelations = useCanvasAiStore(state => state.relations)
  const [open, setOpen] = useState(false)
  const [savedViews, setSavedViews] = useState<SavedCanvasView[]>([])
  const [filters, setFilters] = useState<LinearViewFilters>(EMPTY_FILTERS)
  const [relationDepth, setRelationDepth] = useState<0 | 1 | 2>(1)
  const [includeManualRelations, setIncludeManualRelations] = useState(true)
  const [includeAiRelations, setIncludeAiRelations] = useState(true)
  const [sortMode, setSortMode] = useState<LinearSortMode>('manual')
  const projection = useMemo(() => buildLinearProjection({
    nodes,
    manualRelations,
    aiRelations: aiRelations.filter(relation => relation.canvasId === canvasId),
    filters,
    relationDepth,
    includeManualRelations,
    includeAiRelations,
    sortMode,
  }), [aiRelations, canvasId, filters, includeAiRelations, includeManualRelations, manualRelations, nodes, relationDepth, sortMode])
  const nodesById = useMemo(() => new Map(nodes.map(node => [node.id, node])), [nodes])

  const refreshSavedViews = async () => setSavedViews(await getSavedCanvasViews(canvasId))
  useEffect(() => {
    if (open) void refreshSavedViews()
  }, [canvasId, open])

  const applySavedView = (view: SavedCanvasView) => {
    setFilters(view.filters)
    setRelationDepth(view.relationDepth)
    setIncludeManualRelations(view.includeManualRelations)
    setIncludeAiRelations(view.includeAiRelations)
    setSortMode(view.sortMode)
  }
  const saveCurrentView = async () => {
    const name = globalThis.prompt('保存视图名称')?.trim()
    if (!name) return
    await saveCanvasView({
      id: crypto.randomUUID(), name, canvasId, filters, relationDepth,
      includeManualRelations, includeAiRelations, sortMode,
    })
    await refreshSavedViews()
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="gap-1.5" aria-label="打开线性浏览">
          <ListTree className="size-3.5" /> 线性浏览
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full gap-0 sm:max-w-md">
        <SheetHeader>
          <SheetTitle>线性浏览</SheetTitle>
          <p className="text-xs text-muted-foreground">临时投影；条目始终指向原始画布节点。</p>
        </SheetHeader>
        <div className="flex flex-wrap gap-2 border-y p-3">
          <input
            className="h-7 min-w-28 rounded border bg-background px-2 text-xs"
            aria-label="按标签筛选"
            placeholder="标签（逗号分隔）"
            value={(filters.tags || []).join(', ')}
            onChange={event => setFilters(current => ({ ...current, tags: filterValues(event.target.value) }))}
          />
          <input
            className="h-7 min-w-28 rounded border bg-background px-2 text-xs"
            aria-label="按人物筛选"
            placeholder="人物（逗号分隔）"
            value={(filters.people || []).join(', ')}
            onChange={event => setFilters(current => ({ ...current, people: filterValues(event.target.value) }))}
          />
          <input
            className="h-7 min-w-28 rounded border bg-background px-2 text-xs"
            aria-label="按项目筛选"
            placeholder="项目（逗号分隔）"
            value={(filters.projects || []).join(', ')}
            onChange={event => setFilters(current => ({ ...current, projects: filterValues(event.target.value) }))}
          />
          <input
            className="h-7 w-28 rounded border bg-background px-2 text-xs"
            aria-label="开始时间"
            type="number"
            placeholder="开始时间"
            value={filters.time?.from ?? ''}
            onChange={event => setFilters(current => withTimeBoundary(current, 'from', event.target.value))}
          />
          <input
            className="h-7 w-28 rounded border bg-background px-2 text-xs"
            aria-label="结束时间"
            type="number"
            placeholder="结束时间"
            value={filters.time?.to ?? ''}
            onChange={event => setFilters(current => withTimeBoundary(current, 'to', event.target.value))}
          />
          <label className="text-xs">关系深度
            <select className="ml-1 rounded border bg-background p-1" value={relationDepth} onChange={event => setRelationDepth(Number(event.target.value) as 0 | 1 | 2)}>
              <option value={0}>0</option><option value={1}>1</option><option value={2}>2</option>
            </select>
          </label>
          <label className="text-xs">排序
            <select className="ml-1 rounded border bg-background p-1" value={sortMode} onChange={event => setSortMode(event.target.value as LinearSortMode)}>
              <option value="manual">手动</option><option value="time">时间</option><option value="relevance">相关性</option><option value="distance">关系距离</option>
            </select>
          </label>
          <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={includeManualRelations} onChange={event => setIncludeManualRelations(event.target.checked)} /> 手动关系</label>
          <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={includeAiRelations} onChange={event => setIncludeAiRelations(event.target.checked)} /> AI 关系</label>
          <Button type="button" size="xs" variant="secondary" onClick={() => void saveCurrentView()}><Save /> 保存筛选</Button>
        </div>
        {savedViews.length > 0 && (
          <div className="flex flex-wrap gap-1 border-b p-3">
            {savedViews.map(view => (
              <span key={view.id} className="inline-flex items-center rounded border px-1 py-0.5 text-xs">
                <button type="button" onClick={() => applySavedView(view)}>{view.name}</button>
                <button type="button" className="ml-1 text-muted-foreground" aria-label={`删除 ${view.name}`} onClick={() => void deleteSavedCanvasView(view.id).then(refreshSavedViews)}>×</button>
              </span>
            ))}
          </div>
        )}
        <ol className="min-h-0 flex-1 space-y-1 overflow-y-auto p-3">
          {projection.map(reference => {
            const node = nodesById.get(reference.nodeId)
            const label = typeof node?.data.label === 'string' && node.data.label.trim()
              ? node.data.label.trim()
              : reference.nodeId
            return (
              <li key={reference.nodeId}>
                <button type="button" className="w-full rounded border px-2 py-1.5 text-left text-sm hover:bg-muted" onClick={() => emitter.emit('canvas-focus-node', reference.nodeId)}>
                  <span className="mr-2 text-xs text-muted-foreground">{reference.depth} 跳</span>{label}
                </button>
              </li>
            )
          })}
          {projection.length === 0 && <li className="text-sm text-muted-foreground">没有符合当前筛选的节点。</li>}
        </ol>
      </SheetContent>
    </Sheet>
  )
}
