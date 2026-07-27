import type { CanvasDocument, CanvasEdge, CanvasNodeType } from '@/types/canvas'
import { resolveAiNodeContentScale, resolveAiNodeFontSize, resolveAiNodeSize } from './content-ingest.ts'
import {
  parseCanvasOperations,
  type SourceCanvasOperation,
  type ValidatedCanvasOperation,
} from './ai-permission.ts'

const AI_CREATABLE_NODE_TYPES: CanvasNodeType[] = [
  'process', 'decision', 'terminator', 'text', 'note', 'image', 'file', 'link', 'todo',
]

function isSourceOperation(operation: ValidatedCanvasOperation): operation is SourceCanvasOperation {
  return ['add_node', 'update_node', 'delete_node', 'add_edge', 'delete_edge', 'layout', 'clear']
    .includes(operation.type)
}

export function applyValidatedCanvasOperations(
  document: CanvasDocument,
  operations: ValidatedCanvasOperation[],
) {
  let nodes = structuredClone(document.nodes)
  let edges = structuredClone(document.edges)
  let settings = structuredClone(document.settings)
  let applied = 0

  for (const operation of operations) {
    if (!isSourceOperation(operation)) continue
    const { type } = operation

    if (type === 'clear') {
      nodes = []
      edges = []
      applied += 1
      continue
    }

    if (type === 'add_node') {
      const requestedType = operation.nodeType
      const nodeType: CanvasNodeType = AI_CREATABLE_NODE_TYPES.includes(requestedType)
        ? requestedType
        : 'process'
      const id = operation.id || crypto.randomUUID()
      if (nodes.some(node => node.id === id)) continue
      const index = nodes.length
      const targetNode = nodes.find(node => node.id === operation.targetNodeId)
      const position = {
        x: operation.x ?? (index % 4) * 240,
        y: operation.y ?? Math.floor(index / 4) * 140,
      }
      const requestedWidth = operation.width ?? Number.NaN
      const requestedHeight = operation.height ?? Number.NaN
      const sizingInput = {
        requestedType: nodeType,
        requestedSize: { width: requestedWidth, height: requestedHeight },
        targetNode,
        nearbySameType: nodes.filter(node => node.type === nodeType),
        referencePoint: position,
      }
      const size = resolveAiNodeSize(sizingInput)
      nodes.push({
        id,
        type: nodeType,
        position,
        width: size.width,
        height: size.height,
        data: {
          label: operation.label || (nodeType === 'decision' ? '判断条件' : nodeType === 'terminator' ? '开始 / 结束' : '处理步骤'),
          description: operation.description || undefined,
          contentScale: resolveAiNodeContentScale(sizingInput),
          fontSize: resolveAiNodeFontSize(sizingInput),
        },
      })
      applied += 1
      continue
    }

    if (type === 'update_node') {
      const { id } = operation
      const index = nodes.findIndex(node => node.id === id)
      if (index < 0) continue
      const current = nodes[index]
      nodes[index] = {
        ...current,
        position: {
          x: operation.x ?? current.position.x,
          y: operation.y ?? current.position.y,
        },
        ...(operation.width !== undefined ? { width: operation.width } : {}),
        ...(operation.height !== undefined ? { height: operation.height } : {}),
        data: {
          ...current.data,
          ...(operation.label !== undefined ? { label: operation.label } : {}),
          ...(operation.description !== undefined ? { description: operation.description } : {}),
        },
      }
      applied += 1
      continue
    }

    if (type === 'delete_node') {
      const { id } = operation
      if (!nodes.some(node => node.id === id)) continue
      nodes = nodes.filter(node => node.id !== id)
      edges = edges.filter(edge => edge.source !== id && edge.target !== id)
      applied += 1
      continue
    }

    if (type === 'add_edge') {
      const { source, target } = operation
      if (!nodes.some(node => node.id === source) || !nodes.some(node => node.id === target)) continue
      const id = operation.id || crypto.randomUUID()
      if (edges.some(edge => edge.id === id)) continue
      const edge: CanvasEdge = {
        id,
        source,
        target,
        type: 'smoothstep',
        label: operation.label || undefined,
      }
      edges.push(edge)
      applied += 1
      continue
    }

    if (type === 'delete_edge') {
      const { id } = operation
      if (!edges.some(edge => edge.id === id)) continue
      edges = edges.filter(edge => edge.id !== id)
      applied += 1
      continue
    }

    if (type === 'layout' && settings.layoutDirection !== operation.direction) {
      settings = { ...settings, layoutDirection: operation.direction }
      applied += 1
    }
  }

  return {
    document: { ...document, nodes, edges, settings },
    applied,
    issues: [] as string[],
  }
}

export function applyCanvasOperations(document: CanvasDocument, rawOperations: unknown[]) {
  const parsed = parseCanvasOperations(rawOperations)
  if (!parsed.ok) {
    return { document: structuredClone(document), applied: 0, issues: parsed.issues }
  }
  return applyValidatedCanvasOperations(document, parsed.operations)
}
