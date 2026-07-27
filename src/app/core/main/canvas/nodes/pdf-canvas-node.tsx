'use client'

import { useEffect, useRef } from 'react'
import { Handle, NodeResizer, Position, type Node, type NodeProps } from '@xyflow/react'
import { ExternalLink, FileWarning } from 'lucide-react'
import { openPath } from '@tauri-apps/plugin-opener'
import { BaseNode } from '@/components/base-node'
import { Button } from '@/components/ui/button'
import { cn, convertImageByWorkspace } from '@/lib/utils'
import { getFilePathOptions } from '@/lib/workspace'
import type { CanvasNodeData } from '@/types/canvas'

type PdfFlowNode = Node<CanvasNodeData, 'pdf'>

export function PdfCanvasNode({ data, selected }: NodeProps<PdfFlowNode>) {
  const frameRef = useRef<HTMLIFrameElement>(null)
  const loaderRef = useRef<HTMLDivElement>(null)
  const brokenRef = useRef<HTMLDivElement>(null)
  const filePath = data.filePath || ''

  useEffect(() => {
    const frame = frameRef.current
    const loader = loaderRef.current
    const failure = brokenRef.current
    if (!frame || !loader || !failure) return
    let cancelled = false
    frame.hidden = true
    loader.hidden = false
    failure.hidden = true
    if (!filePath) {
      loader.hidden = true
      failure.hidden = false
      return
    }
    void convertImageByWorkspace(filePath).then(url => {
      if (cancelled) return
      frame.src = url
      frame.hidden = false
      loader.hidden = true
    }).catch(() => {
      if (cancelled) return
      loader.hidden = true
      failure.hidden = false
    })
    return () => { cancelled = true }
  }, [filePath])

  const openSource = async () => {
    if (!filePath) return
    const pathOptions = await getFilePathOptions(filePath)
    await openPath(pathOptions.path)
  }

  return (
    <BaseNode className={cn(
      'size-full min-h-0 min-w-0 overflow-hidden shadow-sm',
      selected && 'shadow-[inset_0_0_0_calc(1px*var(--canvas-visual-scale,1))_#F7FBFF,0_0_0_calc(2px*var(--canvas-visual-scale,1))_#66D9FF,0_0_calc(12px*var(--canvas-visual-scale,1))_rgba(102,217,255,0.32)]',
      'in-[.canvas-geometry-invalid]:!border-[calc(2px*var(--canvas-visual-scale,1))] in-[.canvas-geometry-invalid]:!border-solid in-[.canvas-geometry-invalid]:!border-[#FF5D5D] in-[.canvas-geometry-invalid]:!shadow-[0_0_calc(12px*var(--canvas-visual-scale,1))_rgba(255,93,93,0.32)]',
      'in-[.canvas-legacy-conflict]:!border-[calc(2px*var(--canvas-visual-scale,1))] in-[.canvas-legacy-conflict]:!border-dashed in-[.canvas-legacy-conflict]:!border-[#F2B84B]',
      'in-[.canvas-placement-preview]:opacity-70 in-[.canvas-placement-preview]:ring-[calc(2px*var(--canvas-visual-scale,1))] in-[.canvas-placement-preview]:ring-[#66D9FF]',
    )}>
      <NodeResizer isVisible={selected} minWidth={1} minHeight={1} color="#66D9FF" />
      <Handle type="target" position={Position.Top} id="top" />
      <Handle type="source" position={Position.Bottom} id="bottom" />
      <Handle type="target" position={Position.Left} id="left" />
      <Handle type="source" position={Position.Right} id="right" />
      <iframe
        ref={frameRef}
        title={data.label || 'PDF'}
        loading="lazy"
        hidden
        className="nodrag nowheel h-[calc(100%-2.75rem)] w-full border-0 bg-muted"
        onError={event => {
          event.currentTarget.hidden = true
          if (loaderRef.current) loaderRef.current.hidden = true
          if (brokenRef.current) brokenRef.current.hidden = false
        }}
      />
      <div ref={loaderRef} className="h-[calc(100%-2.75rem)] animate-pulse bg-muted" />
      <div ref={brokenRef} hidden className="flex h-[calc(100%-2.75rem)] flex-col items-center justify-center gap-2 bg-muted p-4 text-center text-muted-foreground">
        <FileWarning className="size-6" />
        <span className="text-xs">PDF 无法显示，源文件仍保留</span>
      </div>
      <div className="flex h-11 min-w-0 items-center gap-2 border-t px-2">
        <span className="min-w-0 flex-1 truncate text-xs font-medium">{data.label || 'PDF'}</span>
        <Button type="button" variant="ghost" size="icon-sm" title="打开源文件" aria-label="打开源文件" onClick={() => void openSource()}>
          <ExternalLink className="size-4" />
        </Button>
      </div>
    </BaseNode>
  )
}
