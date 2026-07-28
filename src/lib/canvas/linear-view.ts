import type { AiRelationRecord } from './ai-overlay'
import type { CanvasEdge, CanvasNode } from '@/types/canvas'

export type LinearSortMode = 'time' | 'relevance' | 'distance' | 'manual'

export interface LinearViewFilters {
  tags?: string[]
  people?: string[]
  projects?: string[]
  time?: { from?: number; to?: number } | null
}

export interface LinearProjectionInput {
  nodes: readonly CanvasNode[]
  manualRelations: readonly CanvasEdge[]
  aiRelations: readonly AiRelationRecord[]
  filters: LinearViewFilters
  relationDepth: 0 | 1 | 2
  includeManualRelations: boolean
  includeAiRelations: boolean
  sortMode: LinearSortMode
}

export interface LinearViewControls {
  filters: LinearViewFilters
  relationDepth: 0 | 1 | 2
  includeManualRelations: boolean
  includeAiRelations: boolean
  sortMode: LinearSortMode
}

export type LinearViewControlCommand =
  | { type: 'set-filter-values'; field: 'tags' | 'people' | 'projects'; value: string }
  | { type: 'set-time-boundary'; boundary: 'from' | 'to'; value: string }
  | { type: 'set-relation-depth'; value: 0 | 1 | 2 }
  | { type: 'set-relation-source'; source: 'manual' | 'ai'; value: boolean }
  | { type: 'set-sort-mode'; value: LinearSortMode }
  | { type: 'apply-saved-view'; value: LinearViewControls }

export const DEFAULT_LINEAR_VIEW_CONTROLS: LinearViewControls = {
  filters: {},
  relationDepth: 1,
  includeManualRelations: true,
  includeAiRelations: true,
  sortMode: 'manual',
}

/** A reference only: source node bodies and geometry remain authoritative elsewhere. */
export interface LinearProjectionReference {
  nodeId: string
  depth: number
  relationIds: string[]
}

interface TraversalRelation {
  id: string
  sourceNodeId: string
  targetNodeId: string
}

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

export function planLinearViewControls(
  current: LinearViewControls,
  command: LinearViewControlCommand,
): LinearViewControls {
  if (command.type === 'set-filter-values') {
    return {
      ...current,
      filters: { ...current.filters, [command.field]: filterValues(command.value) },
    }
  }
  if (command.type === 'set-time-boundary') {
    return {
      ...current,
      filters: withTimeBoundary(current.filters, command.boundary, command.value),
    }
  }
  if (command.type === 'set-relation-depth') {
    return { ...current, relationDepth: command.value }
  }
  if (command.type === 'set-relation-source') {
    return command.source === 'manual'
      ? { ...current, includeManualRelations: command.value }
      : { ...current, includeAiRelations: command.value }
  }
  if (command.type === 'set-sort-mode') return { ...current, sortMode: command.value }
  return {
    filters: { ...command.value.filters },
    relationDepth: command.value.relationDepth,
    includeManualRelations: command.value.includeManualRelations,
    includeAiRelations: command.value.includeAiRelations,
    sortMode: command.value.sortMode,
  }
}

function normalizedValues(value: unknown): string[] {
  const values = Array.isArray(value) ? value : [value]
  return values
    .filter((item): item is string => typeof item === 'string')
    .map(item => item.trim().toLocaleLowerCase())
    .filter(Boolean)
}

function includesAll(candidate: string[], required: string[] | undefined): boolean {
  if (!required?.length) return true
  const available = new Set(candidate)
  return required.every(value => available.has(value.trim().toLocaleLowerCase()))
}

function nodeTimestamp(node: CanvasNode): number | null {
  const raw = node.data.timestamp ?? node.data.createdAt ?? node.data.updatedAt
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  if (typeof raw === 'string') {
    const parsed = Date.parse(raw)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function nodeRelevance(node: CanvasNode): number {
  const value = node.data.relevance
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function matchesFilters(node: CanvasNode, filters: LinearViewFilters): boolean {
  const tags = normalizedValues(node.data.tags)
  const people = normalizedValues(node.data.people ?? node.data.person)
  const projects = normalizedValues(node.data.projects ?? node.data.project)
  const timestamp = nodeTimestamp(node)
  const time = filters.time
  return includesAll(tags, filters.tags)
    && includesAll(people, filters.people)
    && includesAll(projects, filters.projects)
    && (!time || (
      timestamp !== null
      && (time.from === undefined || timestamp >= time.from)
      && (time.to === undefined || timestamp <= time.to)
    ))
}

function selectedRelations(input: LinearProjectionInput): TraversalRelation[] {
  const manual = input.includeManualRelations
    ? input.manualRelations
      .filter(relation => relation.data?.source !== 'ai')
      .map(relation => ({
        id: relation.id,
        sourceNodeId: relation.source,
        targetNodeId: relation.target,
      }))
    : []
  const ai = input.includeAiRelations
    ? input.aiRelations
      .filter(relation => relation.state !== 'hidden')
      .map(relation => ({
        id: relation.id,
        sourceNodeId: relation.sourceNodeId,
        targetNodeId: relation.targetNodeId,
      }))
    : []
  return [...manual, ...ai]
}

export function buildLinearProjection(input: LinearProjectionInput): LinearProjectionReference[] {
  const nodesById = new Map(input.nodes.map(node => [node.id, node]))
  const sourceIds = input.nodes.filter(node => matchesFilters(node, input.filters)).map(node => node.id)
  const seen = new Map<string, LinearProjectionReference>()
  const queue = sourceIds.map(nodeId => ({ nodeId, depth: 0, relationIds: [] as string[] }))
  const relations = selectedRelations(input)

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor]
    if (!nodesById.has(current.nodeId) || seen.has(current.nodeId)) continue
    seen.set(current.nodeId, {
      nodeId: current.nodeId,
      depth: current.depth,
      relationIds: [...current.relationIds],
    })
    if (current.depth >= input.relationDepth) continue
    for (const relation of relations) {
      const neighbor = relation.sourceNodeId === current.nodeId
        ? relation.targetNodeId
        : relation.targetNodeId === current.nodeId
          ? relation.sourceNodeId
          : null
      if (!neighbor || seen.has(neighbor)) continue
      queue.push({ nodeId: neighbor, depth: current.depth + 1, relationIds: [relation.id] })
    }
  }

  const originalOrder = new Map(input.nodes.map((node, index) => [node.id, index]))
  const result = [...seen.values()]
  return result.sort((left, right) => {
    const leftNode = nodesById.get(left.nodeId)!
    const rightNode = nodesById.get(right.nodeId)!
    if (input.sortMode === 'time') {
      const difference = (nodeTimestamp(leftNode) ?? Number.POSITIVE_INFINITY)
        - (nodeTimestamp(rightNode) ?? Number.POSITIVE_INFINITY)
      if (difference) return difference
    } else if (input.sortMode === 'relevance') {
      const difference = nodeRelevance(rightNode) - nodeRelevance(leftNode)
      if (difference) return difference
    } else if (input.sortMode === 'distance') {
      const difference = left.depth - right.depth
      if (difference) return difference
    }
    return (originalOrder.get(left.nodeId) ?? 0) - (originalOrder.get(right.nodeId) ?? 0)
  })
}
