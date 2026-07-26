'use client'

import { memo, useEffect, useRef, useState, type CSSProperties } from 'react'
import Image from 'next/image'
import { Handle, NodeResizer, Position, useReactFlow, type Node, type NodeProps } from '@xyflow/react'
import { CheckSquare2, ExternalLink, FileArchive, FileText, ImageIcon, Square } from 'lucide-react'
import { openPath, openUrl } from '@tauri-apps/plugin-opener'
import { BaseNode, BaseNodeContent } from '@/components/base-node'
import emitter from '@/lib/emitter'
import type { CanvasNodeData, CanvasNodeType } from '@/types/canvas'
import useArticleStore from '@/stores/article'
import { useSidebarStore } from '@/stores/sidebar'
import useMarkStore from '@/stores/mark'
import { cn, convertImageByWorkspace } from '@/lib/utils'
import { getFilePathOptions } from '@/lib/workspace'
import { normalizeContentScaleForRead } from '@/lib/canvas/content-ingest'
import {
  createNoteReferenceLinkData,
  mergeNoteReferenceMarks,
  normalizeLiveNoteReferenceMarks,
  planNoteReferenceDeletion,
  planNoteReferenceRecordOpen,
} from '@/lib/canvas/note-reference'
import { createRecordTab, getRecordTabPath } from '@/app/core/main/mark/mark-record-tab'
import { getAllMarks } from '@/db/marks'

export type FlowCanvasNode = Node<CanvasNodeData, CanvasNodeType>

const ConnectionHandles = memo(function ConnectionHandles() {
  return (
    <>
      <Handle type="target" position={Position.Top} id="top" />
      <Handle type="source" position={Position.Bottom} id="bottom" />
      <Handle type="target" position={Position.Left} id="left" />
      <Handle type="source" position={Position.Right} id="right" />
    </>
  )
})

function previewClassName(state?: CanvasNodeData['previewState']) {
  return cn(
    state === 'add' && 'border-primary bg-primary/5 ring-2 ring-primary/40',
    state === 'update' && 'border-primary ring-2 ring-primary/30',
    state === 'delete' && 'border-destructive bg-destructive/5 opacity-60 ring-2 ring-destructive/40'
  )
}

const TEXT_BACKGROUND_DEFAULT = '#F2F1ED'
const TEXT_COLOR_DEFAULT = '#202321'
const TEXT_BORDER_DEFAULT = '#D8D6CF'
const TEXT_SHADOW_DEFAULT = '0 6px 18px rgba(0, 0, 0, 0.14)'

function transientNodeClassName(selected: boolean) {
  return cn(
    selected && 'shadow-[inset_0_0_0_calc(1px*var(--canvas-visual-scale,1))_#F7FBFF,0_0_0_calc(2px*var(--canvas-visual-scale,1))_#66D9FF,0_0_calc(12px*var(--canvas-visual-scale,1))_rgba(102,217,255,0.32)]',
    'in-[.canvas-geometry-invalid]:!border-[calc(2px*var(--canvas-visual-scale,1))] in-[.canvas-geometry-invalid]:!border-solid in-[.canvas-geometry-invalid]:!border-[#FF5D5D] in-[.canvas-geometry-invalid]:!shadow-[0_0_calc(12px*var(--canvas-visual-scale,1))_rgba(255,93,93,0.32)]',
    'in-[.canvas-legacy-conflict]:!border-[calc(2px*var(--canvas-visual-scale,1))] in-[.canvas-legacy-conflict]:!border-dashed in-[.canvas-legacy-conflict]:!border-[#F2B84B]',
    'in-[.canvas-placement-preview]:opacity-70 in-[.canvas-placement-preview]:ring-[calc(2px*var(--canvas-visual-scale,1))] in-[.canvas-placement-preview]:ring-[#66D9FF]',
  )
}

function SolidNodeResizer({ selected, type }: { selected: boolean; type: CanvasNodeType }) {
  return (
    <NodeResizer
      isVisible={selected}
      minWidth={1}
      minHeight={1}
      keepAspectRatio={type === 'image'}
      color="#66D9FF"
    />
  )
}

function nodeStyle(data: CanvasNodeData): CSSProperties | undefined {
  const { color, borderStyle, borderWidth, fillColor, fillStyle } = data
  const backgroundColor = data.backgroundColor ?? fillColor
  const borderColor = data.borderColor ?? color
  if (!borderColor && !borderStyle && !borderWidth && !backgroundColor && !fillStyle && !data.textColor && !data.fontSize) return undefined
  return {
    ...(borderColor ? {
      borderColor,
      boxShadow: `0 0 0 1px ${borderColor}20`,
    } : {}),
    ...(borderStyle ? { borderStyle: borderStyle === 'none' ? 'none' : borderStyle } : {}),
    ...(borderWidth ? { borderWidth } : {}),
    ...(backgroundColor
      ? { backgroundColor }
      : fillStyle === 'tint' && color
        ? { backgroundColor: `color-mix(in srgb, ${color} 12%, var(--card))` }
        : {}),
    ...(data.textColor ? { color: data.textColor } : {}),
    ...(data.fontSize ? { fontSize: data.fontSize } : {}),
  }
}

function contentScale(data: CanvasNodeData): number {
  return normalizeContentScaleForRead(data.contentScale)
}

function scaledContentStyle(
  data: CanvasNodeData,
  input: { padding?: number; gap?: number } = {},
): CSSProperties {
  const scale = contentScale(data)
  return {
    ...(input.padding !== undefined ? { padding: input.padding * scale } : {}),
    ...(input.gap !== undefined ? { gap: input.gap * scale } : {}),
  }
}

function scaledSquareStyle(data: CanvasNodeData, size: number): CSSProperties {
  const scaled = size * contentScale(data)
  return { width: scaled, height: scaled }
}

function fontStyle(data: CanvasNodeData, ratio = 1): CSSProperties | undefined {
  return typeof data.fontSize === 'number' && Number.isFinite(data.fontSize) && data.fontSize > 0
    ? { fontSize: data.fontSize * ratio }
    : undefined
}

const EditableLabel = memo(function EditableLabel({ id, value, className, style }: { id: string; value: string; className?: string; style?: CSSProperties }) {
  const { updateNodeData } = useReactFlow<FlowCanvasNode>()
  return (
    <input
      className={`nodrag w-full bg-transparent text-center outline-none ${className || ''}`}
      style={style}
      value={value}
      onFocus={() => emitter.emit('canvas-history-checkpoint')}
      onChange={event => updateNodeData(id, { label: event.target.value })}
      onPointerDown={event => event.stopPropagation()}
      aria-label="Node label"
    />
  )
})

export const ProcessNode = memo(function ProcessNode({ id, data, selected }: NodeProps<FlowCanvasNode>) {
  return (
    <BaseNode style={nodeStyle(data)} className={cn('size-full min-h-0 min-w-0 shadow-sm', transientNodeClassName(selected), previewClassName(data.previewState))}>
      <SolidNodeResizer selected={selected} type="process" />
      <ConnectionHandles />
      <BaseNodeContent className="items-center text-center text-sm" style={scaledContentStyle(data, { padding: 12, gap: 8 })}>
        <EditableLabel id={id} value={data.label || '处理步骤'} style={fontStyle(data)} />
      </BaseNodeContent>
    </BaseNode>
  )
})

export const DecisionNode = memo(function DecisionNode({ id, data, selected }: NodeProps<FlowCanvasNode>) {
  return (
    <div style={nodeStyle(data)} className={cn('relative flex size-full min-h-0 min-w-0 rotate-45 items-center justify-center border bg-card text-card-foreground shadow-sm in-[.selected]:shadow-lg', transientNodeClassName(selected), previewClassName(data.previewState))}>
      <SolidNodeResizer selected={selected} type="decision" />
      <ConnectionHandles />
      <EditableLabel id={id} value={data.label || '判断条件'} className="max-w-24 -rotate-45 text-sm" style={fontStyle(data)} />
    </div>
  )
})

export const TerminatorNode = memo(function TerminatorNode({ id, data, selected }: NodeProps<FlowCanvasNode>) {
  return (
    <div style={{ ...nodeStyle(data), paddingInline: 24 * contentScale(data) }} className={cn('relative flex size-full min-h-0 min-w-0 items-center justify-center rounded-full border bg-card text-card-foreground shadow-sm in-[.selected]:shadow-lg', transientNodeClassName(selected), previewClassName(data.previewState))}>
      <SolidNodeResizer selected={selected} type="terminator" />
      <ConnectionHandles />
      <EditableLabel id={id} value={data.label || '开始 / 结束'} className="text-sm" style={fontStyle(data)} />
    </div>
  )
})

export const TextCanvasNode = memo(function TextCanvasNode({ id, data, selected }: NodeProps<FlowCanvasNode>) {
  const { updateNodeData } = useReactFlow<FlowCanvasNode>()
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const savedStyle = nodeStyle(data)

  useEffect(() => {
    const focusNode = (nodeId: string) => {
      if (nodeId !== id) return
      textareaRef.current?.focus()
    }
    emitter.on('canvas-focus-node', focusNode)
    return () => emitter.off('canvas-focus-node', focusNode)
  }, [id])

  return (
    <div
      style={{
        ...savedStyle,
        backgroundColor: data.backgroundColor ?? data.fillColor ?? TEXT_BACKGROUND_DEFAULT,
        color: data.textColor ?? TEXT_COLOR_DEFAULT,
        borderColor: data.borderColor ?? data.color ?? TEXT_BORDER_DEFAULT,
        // A selected node must not retain an inline shadow: it would override
        // the selected/priority visual-state utilities below.
        boxShadow: selected
          ? undefined
          : `${savedStyle?.boxShadow ? `${savedStyle.boxShadow}, ` : ''}${TEXT_SHADOW_DEFAULT}`,
        padding: 8 * contentScale(data),
      }}
      className={cn(
        'relative size-full min-h-0 min-w-0 overflow-hidden rounded-xl border bg-card p-2 text-card-foreground shadow-sm',
        transientNodeClassName(selected),
        previewClassName(data.previewState),
      )}
    >
      <NodeResizer
        isVisible={selected}
        minWidth={1}
        minHeight={1}
        color="#66D9FF"
      />
      <ConnectionHandles />
      <textarea
        ref={textareaRef}
        className="nodrag nowheel size-full resize-none bg-transparent text-left leading-6 text-inherit outline-none placeholder:text-muted-foreground"
        style={{ fontSize: data.fontSize }}
        value={data.label || ''}
        placeholder="输入内容…"
        onFocus={() => emitter.emit('canvas-history-checkpoint')}
        onChange={event => updateNodeData(id, { label: event.target.value })}
        onPointerDown={event => event.stopPropagation()}
        aria-label="文本区块"
      />
    </div>
  )
})

export const NoteCanvasNode = memo(function NoteCanvasNode({ id, data, selected }: NodeProps<FlowCanvasNode>) {
  const { updateNodeData, deleteElements } = useReactFlow<FlowCanvasNode>()
  const filePath = data.filePath || ''
  const sourceNoteId = data.sourceNoteId

  return (
    <BaseNode
      style={nodeStyle(data)}
      className={cn('size-full min-h-0 min-w-0 shadow-sm', transientNodeClassName(selected), previewClassName(data.previewState))}
      onDoubleClick={async function () {
        if (sourceNoteId) {
          const articleStore = useArticleStore.getState()
          const markStore = useMarkStore.getState()
          const recordPath = getRecordTabPath(Number(sourceNoteId))
          let marks = mergeNoteReferenceMarks(markStore.allMarks, markStore.marks)
          let plan = planNoteReferenceRecordOpen({
            sourceNoteId,
            marks,
            referenceMarksAuthoritative: markStore.referenceMarksAuthoritative,
            recordPath,
            openTabs: articleStore.openTabs,
          })
          if (plan.status === 'load-authority') {
            try {
              const authoritative = normalizeLiveNoteReferenceMarks(await getAllMarks())
              marks = mergeNoteReferenceMarks(authoritative, markStore.marks)
              plan = planNoteReferenceRecordOpen({
                sourceNoteId,
                marks,
                referenceMarksAuthoritative: true,
                recordPath,
                openTabs: articleStore.openTabs,
              })
            } catch (error) {
              console.error('Failed to open note reference:', error)
              return
            }
          }
          if (plan.status === 'missing' || plan.status === 'load-authority') return
          if (plan.status === 'activate') await articleStore.setActiveTabId(plan.tabId)
          else await articleStore.addTab(createRecordTab(plan.source, data.sourceTitle || '记录'))
          await articleStore.setActiveFilePath('')
          const sidebarStore = useSidebarStore.getState()
          if (!sidebarStore.centerPanelVisible) await sidebarStore.showCenterPanel()
          return
        }
        if (!filePath) return
        await useSidebarStore.getState().setLeftSidebarTab('files')
        await useArticleStore.getState().setActiveFilePath(filePath)
      }}
    >
      <SolidNodeResizer selected={selected} type="note" />
      <ConnectionHandles />
      <BaseNodeContent className="gap-1" style={scaledContentStyle(data, { padding: 12, gap: 4 })}>
        <span className="flex items-center text-sm font-medium" style={{ gap: 8 * contentScale(data), ...fontStyle(data) }}>
          <FileText className="shrink-0 text-muted-foreground" style={scaledSquareStyle(data, 16)} />
          <span className="truncate">{data.sourceTitle || data.label || filePath.split('/').pop() || '笔记'}</span>
        </span>
        {sourceNoteId ? (
          data.sourceStatus === 'missing' ? (
            <div className="flex items-center gap-2 text-xs text-destructive" style={fontStyle(data, 0.8)}>
              <span>来源已不存在</span>
              <button
                type="button"
                className="nodrag underline"
                onClick={async function () {
                  const nextId = globalThis.prompt('请输入要关联的记录 ID')
                  if (!nextId) return
                  const markStore = useMarkStore.getState()
                  let marks = mergeNoteReferenceMarks(markStore.allMarks, markStore.marks)
                  let source = marks.find(mark => String(mark.id) === nextId.trim())
                  if (!source && !markStore.referenceMarksAuthoritative) {
                    try {
                      const authoritative = normalizeLiveNoteReferenceMarks(await getAllMarks())
                      marks = mergeNoteReferenceMarks(authoritative, markStore.marks)
                      source = marks.find(mark => String(mark.id) === nextId.trim())
                    } catch (error) {
                      console.error('Failed to relink note reference:', error)
                    }
                  }
                  if (source) updateNodeData(id, createNoteReferenceLinkData(source))
                }}
              >重新关联</button>
              <button
                type="button"
                className="nodrag underline"
                onClick={function () {
                  const deletion = planNoteReferenceDeletion(id)
                  void deleteElements({ nodes: [{ id: deletion.nodeIds[0] }] })
                }}
              >删除引用</button>
            </div>
          ) : <span className="line-clamp-3 text-xs text-muted-foreground" style={fontStyle(data, 0.8)}>{data.sourceExcerpt}</span>
        ) : <span className="truncate text-xs text-muted-foreground" style={fontStyle(data, 0.8)}>{filePath}</span>}
      </BaseNodeContent>
    </BaseNode>
  )
})

export const LinkCanvasNode = memo(function LinkCanvasNode({ id, data, selected }: NodeProps<FlowCanvasNode>) {
  return (
    <BaseNode
      style={nodeStyle(data)}
      className={cn('size-full min-h-0 min-w-0 shadow-sm', transientNodeClassName(selected), previewClassName(data.previewState))}
      onDoubleClick={() => data.url && void openUrl(data.url)}
    >
      <SolidNodeResizer selected={selected} type="link" />
      <ConnectionHandles />
      <BaseNodeContent className="gap-1" style={scaledContentStyle(data, { padding: 12, gap: 4 })}>
        <span className="flex items-center text-sm font-medium" style={{ gap: 8 * contentScale(data) }}>
          <ExternalLink className="shrink-0 text-muted-foreground" style={scaledSquareStyle(data, 16)} />
          <EditableLabel id={id} value={data.label || '网页链接'} className="text-left" style={fontStyle(data)} />
        </span>
        <span className="truncate text-xs text-muted-foreground" style={fontStyle(data, 0.8)}>{data.url}</span>
      </BaseNodeContent>
    </BaseNode>
  )
})

export const FileCanvasNode = memo(function FileCanvasNode({ data, selected }: NodeProps<FlowCanvasNode>) {
  const filePath = data.filePath || ''
  const fileName = data.label || filePath.split('/').pop() || '文件'
  const extension = fileName.includes('.') ? fileName.split('.').pop()?.toUpperCase() : 'FILE'

  const openStoredFile = async () => {
    if (!filePath) return
    const pathOptions = await getFilePathOptions(filePath)
    await openPath(pathOptions.path)
  }

  return (
    <BaseNode
      style={nodeStyle(data)}
      className={cn('size-full min-h-0 min-w-0 shadow-sm', transientNodeClassName(selected), previewClassName(data.previewState))}
      onDoubleClick={() => void openStoredFile()}
    >
      <SolidNodeResizer selected={selected} type="file" />
      <ConnectionHandles />
      <BaseNodeContent className="flex-row items-center" style={scaledContentStyle(data, { padding: 12, gap: 12 })}>
        <div className="flex shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground" style={scaledSquareStyle(data, 40)}>
          <FileArchive style={scaledSquareStyle(data, 20)} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium" style={fontStyle(data)}>{fileName}</div>
          <div className="text-xs text-muted-foreground" style={{ marginTop: 2 * contentScale(data), ...fontStyle(data, 0.8) }}>{extension}</div>
        </div>
      </BaseNodeContent>
    </BaseNode>
  )
})

export const TodoCanvasNode = memo(function TodoCanvasNode({ id, data, selected }: NodeProps<FlowCanvasNode>) {
  const { updateNodeData } = useReactFlow<FlowCanvasNode>()
  return (
    <BaseNode style={nodeStyle(data)} className={cn('size-full min-h-0 min-w-0 shadow-sm', transientNodeClassName(selected), previewClassName(data.previewState))}>
      <SolidNodeResizer selected={selected} type="todo" />
      <ConnectionHandles />
      <BaseNodeContent className="flex-row items-center" style={scaledContentStyle(data, { padding: 12, gap: 8 })}>
        <button
          type="button"
          className="nodrag text-muted-foreground"
          onClick={() => updateNodeData(id, { checked: !data.checked })}
          aria-label={data.checked ? 'Mark incomplete' : 'Mark complete'}
        >
          {data.checked ? <CheckSquare2 style={scaledSquareStyle(data, 20)} /> : <Square style={scaledSquareStyle(data, 20)} />}
        </button>
        <EditableLabel
          id={id}
          value={data.label || '待办事项'}
          className={cn('text-left', data.checked && 'text-muted-foreground line-through')}
          style={fontStyle(data)}
        />
      </BaseNodeContent>
    </BaseNode>
  )
})

export const ImageCanvasNode = memo(function ImageCanvasNode({ id, data, selected }: NodeProps<FlowCanvasNode>) {
  const [imageUrl, setImageUrl] = useState('')

  useEffect(() => {
    let cancelled = false
    if (!data.imagePath) {
      setImageUrl('')
      return
    }
    void convertImageByWorkspace(data.imagePath).then(url => {
      if (!cancelled) setImageUrl(url)
    })
    return () => { cancelled = true }
  }, [data.imagePath])

  return (
    <BaseNode style={nodeStyle(data)} className={cn('size-full min-h-0 min-w-0 overflow-hidden shadow-sm', transientNodeClassName(selected), previewClassName(data.previewState))}>
      <SolidNodeResizer selected={selected} type="image" />
      <ConnectionHandles />
      {imageUrl ? (
        <Image
          src={imageUrl}
          alt=""
          width={256}
          height={144}
          unoptimized
          className="w-full rounded-t-lg object-cover"
          style={{ height: 144 * contentScale(data) }}
        />
      ) : (
        <div className="flex items-center justify-center bg-muted text-muted-foreground" style={{ height: 144 * contentScale(data) }}><ImageIcon style={scaledSquareStyle(data, 24)} /></div>
      )}
      <BaseNodeContent style={scaledContentStyle(data, { padding: 8, gap: 8 })}>
        <EditableLabel id={id} value={data.label || '图片'} style={fontStyle(data)} />
      </BaseNodeContent>
    </BaseNode>
  )
})

export const GroupCanvasNode = memo(function GroupCanvasNode({ id, data, selected }: NodeProps<FlowCanvasNode>) {
  return (
    <div style={nodeStyle(data)} className={cn('relative size-full rounded-2xl border border-dashed bg-muted/30', transientNodeClassName(selected), previewClassName(data.previewState))}>
      <NodeResizer
        isVisible={selected}
        minWidth={240}
        minHeight={160}
      />
      <div className="absolute left-3 top-2 max-w-[calc(100%-1.5rem)] text-sm font-medium text-muted-foreground">
        <EditableLabel id={id} value={data.label || '分组'} className="text-left" />
      </div>
    </div>
  )
})

export const FreehandNode = memo(function FreehandNode({ id, data, selected }: NodeProps<FlowCanvasNode>) {
  const width = data.width || 4
  const height = data.height || 4
  const pathStrokeWidth = data.pathStrokeWidth ?? data.strokeWidth
  const widthAdjustment = typeof pathStrokeWidth === 'number' && typeof data.strokeWidth === 'number'
    ? (data.strokeWidth - pathStrokeWidth) / 2
    : 0
  const filterRadius = Math.abs(widthAdjustment)
  const filterId = `freehand-width-${id}`
  const color = data.color || 'currentColor'
  const opacity = data.opacity ?? 1

  return (
    <div className="relative size-full">
      <NodeResizer
        isVisible={selected}
        minWidth={4}
        minHeight={4}
      />
      <svg className="size-full overflow-visible" viewBox={`0 0 ${width} ${height}`}>
        {filterRadius > 0 && (
          <defs>
            <filter
              id={filterId}
              x={-filterRadius * 2}
              y={-filterRadius * 2}
              width={width + filterRadius * 4}
              height={height + filterRadius * 4}
              filterUnits="userSpaceOnUse"
              colorInterpolationFilters="sRGB"
            >
              <feMorphology
                in="SourceAlpha"
                operator={widthAdjustment > 0 ? 'dilate' : 'erode'}
                radius={filterRadius}
                result="adjusted"
              />
              <feFlood floodColor={color} floodOpacity={opacity} result="paint" />
              <feComposite in="paint" in2="adjusted" operator="in" />
            </filter>
          </defs>
        )}
        <path
          d={data.path || ''}
          fill={color}
          fillOpacity={filterRadius > 0 ? 1 : opacity}
          filter={filterRadius > 0 ? `url(#${filterId})` : undefined}
        />
      </svg>
    </div>
  )
})
