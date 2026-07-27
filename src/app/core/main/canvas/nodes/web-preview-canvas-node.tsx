'use client'

import { Handle, NodeResizer, Position, type Node, type NodeProps } from '@xyflow/react'
import Image from 'next/image'
import { ExternalLink, Globe2 } from 'lucide-react'
import { openUrl } from '@tauri-apps/plugin-opener'
import { BaseNode } from '@/components/base-node'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { CanvasNodeData, CanvasWebPreviewMetadata } from '@/types/canvas'

type WebPreviewFlowNode = Node<CanvasNodeData, 'web-preview'>

export function WebPreviewCanvasNode({ data, selected }: NodeProps<WebPreviewFlowNode>) {
  const metadata = data.metadata?.kind === 'web-preview'
    ? data.metadata as CanvasWebPreviewMetadata
    : null
  const url = data.url || ''
  const title = metadata?.title || data.label || url || '网页预览'

  return (
    <BaseNode
      data-content-trust="untrusted-display-only"
      className={cn(
        'size-full min-h-0 min-w-0 overflow-hidden shadow-sm',
        selected && 'shadow-[inset_0_0_0_calc(1px*var(--canvas-visual-scale,1))_#F7FBFF,0_0_0_calc(2px*var(--canvas-visual-scale,1))_#66D9FF,0_0_calc(12px*var(--canvas-visual-scale,1))_rgba(102,217,255,0.32)]',
        'in-[.canvas-geometry-invalid]:!border-[calc(2px*var(--canvas-visual-scale,1))] in-[.canvas-geometry-invalid]:!border-solid in-[.canvas-geometry-invalid]:!border-[#FF5D5D] in-[.canvas-geometry-invalid]:!shadow-[0_0_calc(12px*var(--canvas-visual-scale,1))_rgba(255,93,93,0.32)]',
        'in-[.canvas-legacy-conflict]:!border-[calc(2px*var(--canvas-visual-scale,1))] in-[.canvas-legacy-conflict]:!border-dashed in-[.canvas-legacy-conflict]:!border-[#F2B84B]',
        'in-[.canvas-placement-preview]:opacity-70 in-[.canvas-placement-preview]:ring-[calc(2px*var(--canvas-visual-scale,1))] in-[.canvas-placement-preview]:ring-[#66D9FF]',
      )}
      onDoubleClick={() => url && void openUrl(url)}
    >
      <NodeResizer isVisible={selected} minWidth={1} minHeight={1} color="#66D9FF" />
      <Handle type="target" position={Position.Top} id="top" />
      <Handle type="source" position={Position.Bottom} id="bottom" />
      <Handle type="target" position={Position.Left} id="left" />
      <Handle type="source" position={Position.Right} id="right" />
      <div className="flex h-full min-w-0 flex-col">
        <div className="relative flex min-h-0 flex-1 items-center justify-center bg-muted">
          {metadata?.imageUrl ? (
            // Metadata is persisted display data. It is never interpreted as an operation.
            <Image src={metadata.imageUrl} alt="" fill sizes="320px" unoptimized className="object-cover" />
          ) : <Globe2 className="size-8 text-muted-foreground" />}
        </div>
        <div className="flex min-w-0 items-center gap-2 border-t p-3">
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{title}</div>
            <div className="truncate text-xs text-muted-foreground">{metadata?.siteName || url}</div>
            {metadata?.description && <div className="line-clamp-2 text-xs text-muted-foreground">{metadata.description}</div>}
          </div>
          <Button type="button" variant="ghost" size="icon-sm" title="打开网页" aria-label="打开网页" onClick={() => url && void openUrl(url)}>
            <ExternalLink className="size-4" />
          </Button>
        </div>
      </div>
    </BaseNode>
  )
}
