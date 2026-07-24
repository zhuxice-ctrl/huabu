'use client'

import { memo, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import {
  BaseEdge,
  EdgeLabelRenderer,
  useNodes,
  useReactFlow,
  type Edge,
  type EdgeProps,
  type Node,
} from '@xyflow/react'
import emitter from '@/lib/emitter'
import { normalizeRelationData, relationEdgeVisuals } from '@/lib/canvas/relation-policy'
import { buildRelationPath } from '@/lib/canvas/relation-routing'
import { removeWaypointAt } from '@/lib/canvas/relation-interaction'
import type { CanvasNodeData, CanvasRelationData } from '@/types/canvas'

export type FlowRelationEdge = Edge<CanvasRelationData, 'relation'>

export const CanvasRelationEdge = memo(function CanvasRelationEdge(props: EdgeProps<FlowRelationEdge>) {
  const { setEdges, screenToFlowPosition } = useReactFlow<Node<CanvasNodeData>, FlowRelationEdge>()
  const nodes = useNodes<Node<CanvasNodeData>>()
  const [selectedWaypointIndex, setSelectedWaypointIndex] = useState<number | null>(null)
  const dragCleanupRef = useRef<(() => void) | null>(null)
  const relation = normalizeRelationData(props.data)
  const visuals = relationEdgeVisuals(relation)
  const obstacles = nodes
    .filter(node => node.id !== props.source && node.id !== props.target)
    .flatMap(node => {
      const width = node.measured?.width ?? node.width
      const height = node.measured?.height ?? node.height
      return typeof width === 'number' && typeof height === 'number'
        ? [{ x: node.position.x, y: node.position.y, width, height }]
        : []
    })
  const route = buildRelationPath({
    source: { x: props.sourceX, y: props.sourceY },
    target: { x: props.targetX, y: props.targetY },
    routeType: relation.routeType,
    waypoints: relation.waypoints,
    obstacles,
  })

  useEffect(() => {
    if (
      !props.selected
      || relation.routeType !== 'manual'
      || (selectedWaypointIndex !== null && selectedWaypointIndex >= relation.waypoints.length)
    ) setSelectedWaypointIndex(null)
  }, [props.selected, relation.routeType, relation.waypoints.length, selectedWaypointIndex])

  useEffect(() => () => dragCleanupRef.current?.(), [])

  useEffect(() => {
    if (selectedWaypointIndex === null) return
    const removeSelectedWaypoint = (event: KeyboardEvent) => {
      if (event.key !== 'Delete' && event.key !== 'Backspace') return
      if (event.target instanceof HTMLElement && event.target.closest('input, textarea, select, [contenteditable="true"]')) return
      event.preventDefault()
      event.stopPropagation()
      emitter.emit('canvas-history-checkpoint')
      setEdges(current => current.map(edge => {
        if (edge.id !== props.id) return edge
        const data = normalizeRelationData(edge.data)
        return { ...edge, data: { ...data, waypoints: removeWaypointAt(data.waypoints, selectedWaypointIndex) } }
      }))
      setSelectedWaypointIndex(null)
    }
    window.addEventListener('keydown', removeSelectedWaypoint, true)
    return () => window.removeEventListener('keydown', removeSelectedWaypoint, true)
  }, [props.id, selectedWaypointIndex, setEdges])

  const beginWaypointDrag = (event: ReactPointerEvent<HTMLButtonElement>, waypointIndex: number) => {
    event.preventDefault()
    event.stopPropagation()
    setSelectedWaypointIndex(waypointIndex)
    const pointerId = event.pointerId
    const control = event.currentTarget
    let stopped = false
    let checkpointed = false
    dragCleanupRef.current?.()

    try { control.setPointerCapture(pointerId) } catch { /* window listeners still guarantee cleanup */ }

    const move = (pointerEvent: PointerEvent) => {
      if (pointerEvent.pointerId !== pointerId) return
      if (!checkpointed) {
        checkpointed = true
        emitter.emit('canvas-history-checkpoint')
      }
      const position = screenToFlowPosition({ x: pointerEvent.clientX, y: pointerEvent.clientY })
      setEdges(current => current.map(edge => {
        if (edge.id !== props.id) return edge
        const data = normalizeRelationData(edge.data)
        const waypoints = data.waypoints.map((point, index) => (
          index === waypointIndex ? { x: position.x, y: position.y } : point
        ))
        return { ...edge, data: { ...data, routeType: 'manual', waypoints } }
      }))
    }
    const cleanup = () => {
      if (stopped) return
      stopped = true
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
      window.removeEventListener('pointercancel', stop)
      window.removeEventListener('blur', cleanup)
      control.removeEventListener('lostpointercapture', cleanup)
      if (control.hasPointerCapture(pointerId)) control.releasePointerCapture(pointerId)
      if (dragCleanupRef.current === cleanup) dragCleanupRef.current = null
    }
    const stop = (pointerEvent: PointerEvent) => {
      if (pointerEvent.pointerId !== pointerId) return
      cleanup()
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)
    window.addEventListener('blur', cleanup)
    control.addEventListener('lostpointercapture', cleanup)
    dragCleanupRef.current = cleanup
  }

  return (
    <>
      <BaseEdge
        id={props.id}
        path={route.path}
        markerStart={props.markerStart}
        markerEnd={props.markerEnd}
        interactionWidth={24}
        style={{
          ...props.style,
          stroke: visuals.stroke,
          strokeWidth: visuals.strokeWidth,
          strokeDasharray: visuals.strokeDasharray,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        }}
      />
      <EdgeLabelRenderer>
        {relation.label && (
          <div
            className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-md border border-border/70 bg-background/90 px-1.5 py-0.5 text-[11px] text-foreground shadow-sm backdrop-blur"
            style={{ transform: `translate(-50%, -50%) translate(${route.label.x}px, ${route.label.y}px)` }}
          >
            {relation.label}
          </div>
        )}
        {props.selected && relation.routeType === 'manual' && relation.waypoints.map((waypoint, index) => (
          <button
            key={`${props.id}-waypoint-${index}`}
            type="button"
            className={`nodrag nopan pointer-events-auto absolute size-6 -translate-x-1/2 -translate-y-1/2 rounded-full bg-transparent before:absolute before:left-1/2 before:top-1/2 before:size-2.5 before:-translate-x-1/2 before:-translate-y-1/2 before:rounded-full before:border-2 before:border-primary before:bg-background ${selectedWaypointIndex === index ? 'before:shadow-[0_0_0_5px_hsl(var(--primary)/0.32)]' : 'before:shadow-[0_0_0_3px_hsl(var(--primary)/0.18)]'}`}
            style={{ transform: `translate(-50%, -50%) translate(${waypoint.x}px, ${waypoint.y}px)` }}
            aria-label={`关系路径节点 ${index + 1}`}
            aria-pressed={selectedWaypointIndex === index}
            onPointerDown={event => beginWaypointDrag(event, index)}
          />
        ))}
      </EdgeLabelRenderer>
    </>
  )
})
