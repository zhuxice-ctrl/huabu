'use client'

import { useEffect, useRef } from 'react'
import { Handle, NodeResizer, Position, type Node, type NodeProps } from '@xyflow/react'
import { ExternalLink, VideoOff } from 'lucide-react'
import { openPath, openUrl } from '@tauri-apps/plugin-opener'
import { BaseNode } from '@/components/base-node'
import { Button } from '@/components/ui/button'
import { cn, convertImageByWorkspace } from '@/lib/utils'
import { getFilePathOptions } from '@/lib/workspace'
import type { CanvasNodeData } from '@/types/canvas'

type VideoFlowNode = Node<CanvasNodeData, 'video'>

function loadVisibleVideo(
  video: HTMLVideoElement,
  loader: HTMLDivElement,
  failure: HTMLDivElement,
  filePath: string,
  remoteUrl: string,
) {
  if (remoteUrl) {
    video.src = remoteUrl
    video.hidden = false
    loader.hidden = true
    return
  }
  if (!filePath) {
    loader.hidden = true
    failure.hidden = false
    return
  }
  void convertImageByWorkspace(filePath).then(url => {
    video.src = url
    video.hidden = false
    loader.hidden = true
  }).catch(() => {
    loader.hidden = true
    failure.hidden = false
  })
}

export function VideoCanvasNode({ data, selected }: NodeProps<VideoFlowNode>) {
  const rootRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const loaderRef = useRef<HTMLDivElement>(null)
  const brokenRef = useRef<HTMLDivElement>(null)
  const filePath = data.filePath || ''
  const remoteUrl = data.url || ''

  useEffect(() => {
    const element = rootRef.current
    const video = videoRef.current
    const loader = loaderRef.current
    const failure = brokenRef.current
    if (!element || !video || !loader || !failure) return
    video.hidden = true
    loader.hidden = false
    failure.hidden = true
    if (typeof IntersectionObserver === 'undefined') {
      loadVisibleVideo(video, loader, failure, filePath, remoteUrl)
      return
    }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        observer.disconnect()
        loadVisibleVideo(video, loader, failure, filePath, remoteUrl)
      }
    }, { rootMargin: '240px' })
    observer.observe(element)
    return () => observer.disconnect()
  }, [filePath, remoteUrl])

  const openSource = async () => {
    if (remoteUrl) {
      await openUrl(remoteUrl)
      return
    }
    if (!filePath) return
    const pathOptions = await getFilePathOptions(filePath)
    await openPath(pathOptions.path)
  }

  return (
    <div ref={rootRef} className="size-full">
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
      <video
        ref={videoRef}
        controls
        preload="metadata"
        hidden
        className="nodrag nowheel h-[calc(100%-2.75rem)] w-full bg-black object-contain"
        onError={event => {
          event.currentTarget.hidden = true
          if (loaderRef.current) loaderRef.current.hidden = true
          if (brokenRef.current) brokenRef.current.hidden = false
        }}
      />
      <div ref={loaderRef} className="h-[calc(100%-2.75rem)] animate-pulse bg-muted" />
      <div ref={brokenRef} hidden className="flex h-[calc(100%-2.75rem)] flex-col items-center justify-center gap-2 bg-muted p-4 text-center text-muted-foreground">
        <VideoOff className="size-6" />
        <span className="text-xs">视频无法播放，源内容仍保留</span>
      </div>
      <div className="flex h-11 min-w-0 items-center gap-2 border-t px-2">
        <span className="min-w-0 flex-1 truncate text-xs font-medium">{data.label || '视频'}</span>
        <Button type="button" variant="ghost" size="icon-sm" title="打开源内容" aria-label="打开源内容" onClick={() => void openSource()}>
          <ExternalLink className="size-4" />
        </Button>
      </div>
      </BaseNode>
    </div>
  )
}
