'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import {
  addEdge,
  Background,
  BackgroundVariant,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  useViewport,
  type Connection,
  type Edge,
  type EdgeChange,
  type EdgeTypes,
  type NodeChange,
  type NodeTypes,
  MarkerType,
  SelectionMode,
} from '@xyflow/react'
import ELK from 'elkjs/lib/elk.bundled.js'
import type { ElkNode } from 'elkjs/lib/elk-api'
import { open } from '@tauri-apps/plugin-dialog'
import { mkdir, readFile, readTextFile, writeFile } from '@tauri-apps/plugin-fs'
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignHorizontalDistributeCenter,
  AlignVerticalDistributeCenter,
  ClipboardPaste,
  CircleSlash2,
  Copy,
  CopyPlus,
  Eraser,
  FileText,
  FolderKanban,
  Hand,
  Highlighter,
  ImagePlus,
  MousePointer2,
  Palette,
  Pencil,
  Route,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'
import emitter from '@/lib/emitter'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { Input } from '@/components/ui/input'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Slider } from '@/components/ui/slider'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import useCanvasStore from '@/stores/canvas'
import useArticleStore from '@/stores/article'
import type {
  CanvasDocument,
  CanvasEdge,
  CanvasHistorySnapshot,
  CanvasNode,
  CanvasPoint,
  CanvasTool,
  CanvasRelationData,
  CanvasRelationWaypoint,
} from '@/types/canvas'
import { flattenFileTree } from '@/app/core/main/file/file-selection'
import { applyCanvasOperations } from '@/lib/canvas/operations'
import { getFilePathOptions } from '@/lib/workspace'
import {
  createFreehandGeometry,
  getFreehandOutline,
  getSvgPathFromStroke,
  HIGHLIGHTER_STYLE,
  PEN_STYLE,
} from '@/lib/canvas/freehand'
import {
  DecisionNode,
  FileCanvasNode,
  FreehandNode,
  GroupCanvasNode,
  ImageCanvasNode,
  LinkCanvasNode,
  NoteCanvasNode,
  ProcessNode,
  TerminatorNode,
  TextCanvasNode,
  TodoCanvasNode,
  type FlowCanvasNode,
} from './nodes/canvas-nodes'
import { CanvasFooter } from './canvas-footer'
import { CanvasNodeStyleMenu } from './canvas-node-style-menu'
import { mermaidToCanvasDocument } from '@/lib/canvas/mermaid'
import { parseCanvasProjectFile } from '@/lib/canvas/file-format'
import { cn } from '@/lib/utils'
import { DEFAULT_RELATION, isValidRelationTarget, normalizeRelationData, relationEdgeVisuals } from '@/lib/canvas/relation-policy'
import { CanvasRelationEditor } from './canvas-relation-editor'
import { CanvasRelationEdge } from './canvas-edge'
import {
  hasDrawableArea,
  intersectingRectIds,
  normalizeDrawRect,
  POINTER_DRAG_THRESHOLD,
} from '@/lib/canvas/gesture-policy'
import {
  draftsFromTransfer,
  offsetIngestDrafts,
  type CanvasIngestDraft,
  type CanvasTransferInput,
} from '@/lib/canvas/content-ingest'

const elk = new ELK()
const DRAWING_CURSORS = {
  pen: `url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'><path d='M4 20l3.5-1 11-11-2.5-2.5-11 11L4 20z' fill='%23fff' stroke='%2318181b' stroke-width='1.5'/><path d='M14.8 6.7l2.5 2.5' stroke='%2318181b' stroke-width='1.5'/></svg>") 4 20, crosshair`,
  highlighter: `url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'><path d='M4 19l4 1L20 8l-4-4L4 16z' fill='%23facc15' stroke='%2318181b' stroke-width='1.5'/><path d='M4 19h7' stroke='%2318181b' stroke-width='2'/></svg>") 4 19, crosshair`,
  eraser: `url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'><path d='M5 16L12 6l7 5-7 10H8z' fill='%23f4f4f5' stroke='%2318181b' stroke-width='1.5'/><path d='M5 16l7 5' stroke='%23f87171' stroke-width='4'/></svg>") 7 18, cell`,
} as const

const nodeTypes: NodeTypes = {
  process: ProcessNode,
  decision: DecisionNode,
  terminator: TerminatorNode,
  text: TextCanvasNode,
  note: NoteCanvasNode,
  image: ImageCanvasNode,
  file: FileCanvasNode,
  link: LinkCanvasNode,
  todo: TodoCanvasNode,
  group: GroupCanvasNode,
  freehand: FreehandNode,
}

interface CanvasEditorProps {
  canvasId: string
}

interface CanvasSnapshot {
  nodes: FlowCanvasNode[]
  edges: Edge[]
}

const edgeTypes: EdgeTypes = { relation: CanvasRelationEdge }

interface DrawDraft {
  pointerId: number
  start: { x: number; y: number }
  current: { x: number; y: number }
}

interface RelationPointerSession {
  pointerId: number
  sourceId: string
  startedAt: number
  start: { x: number; y: number }
  current: { x: number; y: number }
  active: boolean
  targetId: string | null
  timer?: ReturnType<typeof setTimeout>
}

interface MarqueePointerSession {
  pointerId: number
  start: { x: number; y: number }
  current: { x: number; y: number }
  active: boolean
}

interface RelationEditorState {
  edgeId: string
  mode: 'create' | 'edit'
  anchor: { x: number; y: number }
  suggestedWaypoint?: CanvasRelationWaypoint
}

function CanvasToolbarTooltip({
  label,
  disabled = false,
  children,
}: {
  label: string
  disabled?: boolean
  children: ReactElement
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {disabled ? <span className="inline-flex">{children}</span> : children}
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  )
}

function isInteractiveCanvasTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && Boolean(target.closest(
    'input, textarea, select, button, a, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="slider"], [role="menuitem"]'
  ))
}

function cloneSnapshot(nodes: FlowCanvasNode[], edges: Edge[]): CanvasSnapshot {
  return structuredClone({ nodes, edges })
}

function serializeHistorySnapshot(snapshot: CanvasSnapshot): CanvasHistorySnapshot {
  return {
    nodes: serializeNodes(snapshot.nodes),
    edges: serializeEdges(snapshot.edges),
  }
}

function restoreHistorySnapshot(snapshot: CanvasHistorySnapshot): CanvasSnapshot {
  return structuredClone({
    nodes: snapshot.nodes as FlowCanvasNode[],
    edges: snapshot.edges as Edge[],
  })
}

function serializeNodes(nodes: FlowCanvasNode[]): CanvasNode[] {
  return nodes.map(node => ({
    id: node.id,
    type: node.type || 'process',
    position: node.position,
    data: node.data,
    ...(typeof node.width === 'number' ? { width: node.width } : {}),
    ...(typeof node.height === 'number' ? { height: node.height } : {}),
    ...(node.connectable === false ? { connectable: false } : {}),
    ...(typeof node.zIndex === 'number' ? { zIndex: node.zIndex } : {}),
  }))
}

function nearestPointOnRect(rect: DOMRect, target: { x: number; y: number }) {
  const center = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
  const dx = target.x - center.x
  const dy = target.y - center.y
  if (Math.abs(dx / Math.max(rect.width, 1)) >= Math.abs(dy / Math.max(rect.height, 1))) {
    return { x: dx >= 0 ? rect.right : rect.left, y: Math.min(rect.bottom, Math.max(rect.top, target.y)) }
  }
  return { x: Math.min(rect.right, Math.max(rect.left, target.x)), y: dy >= 0 ? rect.bottom : rect.top }
}

function relationPreviewPath(start: { x: number; y: number }, end: { x: number; y: number }) {
  const direction = end.x >= start.x ? 1 : -1
  const control = Math.max(48, Math.abs(end.x - start.x) * 0.45)
  return `M ${start.x} ${start.y} C ${start.x + control * direction} ${start.y}, ${end.x - control * direction} ${end.y}, ${end.x} ${end.y}`
}

function serializeEdges(edges: Edge[]): CanvasEdge[] {
  return edges.map(edge => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label: typeof edge.label === 'string' ? edge.label : undefined,
    type: edge.type,
    ...(edge.data ? { data: edge.data as CanvasRelationData } : {}),
  }))
}

function havePersistentNodesChanged(previous: FlowCanvasNode[], current: FlowCanvasNode[]) {
  if (previous.length !== current.length) return true
  return current.some((node, index) => {
    const prior = previous[index]
    return !prior
      || prior.id !== node.id
      || prior.type !== node.type
      || prior.position.x !== node.position.x
      || prior.position.y !== node.position.y
      || (prior.data !== node.data && JSON.stringify(prior.data) !== JSON.stringify(node.data))
      || prior.width !== node.width
      || prior.height !== node.height
      || prior.draggable !== node.draggable
      || prior.connectable !== node.connectable
      || prior.zIndex !== node.zIndex
  })
}

function havePersistentEdgesChanged(previous: Edge[], current: Edge[]) {
  if (previous.length !== current.length) return true
  return current.some((edge, index) => {
    const prior = previous[index]
    return !prior
      || prior.id !== edge.id
      || prior.source !== edge.source
      || prior.target !== edge.target
      || prior.label !== edge.label
      || prior.type !== edge.type
      || (prior.data !== edge.data && JSON.stringify(prior.data) !== JSON.stringify(edge.data))
  })
}

function CanvasEditorInner({ canvasId }: CanvasEditorProps) {
  const t = useTranslations('canvas')
  const document = useCanvasStore(state => state.documents[canvasId])
  const updateDocument = useCanvasStore(state => state.updateDocument)
  const updateHistory = useCanvasStore(state => state.updateHistory)
  const openProject = useCanvasStore(state => state.openProject)
  const projects = useCanvasStore(state => state.projects)
  const initialHistory = projects.find(project => project.id === canvasId)?.history
  const fileTree = useArticleStore(state => state.fileTree)
  const loadFileTree = useArticleStore(state => state.loadFileTree)
  const [nodes, setNodes, onNodesChangeBase] = useNodesState<FlowCanvasNode>(
    ((document?.nodes || []) as FlowCanvasNode[]).map(node => (
      node.draggable === false ? { ...node, draggable: true } : node
    ))
  )
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(document?.edges || [])
  const [tool, setTool] = useState<CanvasTool>('select')
  const [penColor, setPenColor] = useState('#18181b')
  const [penSize, setPenSize] = useState(PEN_STYLE.size)
  const [highlighterColor, setHighlighterColor] = useState('#facc15')
  const [highlighterSize, setHighlighterSize] = useState(HIGHLIGHTER_STYLE.size)
  const [customNodeColor, setCustomNodeColor] = useState('#0f172a')
  const [customFillColor, setCustomFillColor] = useState('#dbeafe')
  const [selectedNodeBorderWidth, setSelectedNodeBorderWidth] = useState(1)
  const [selectedStrokeWidth, setSelectedStrokeWidth] = useState(PEN_STYLE.size)
  const [drawingPoints, setDrawingPoints] = useState<CanvasPoint[]>([])
  const [previewPath, setPreviewPath] = useState('')
  const [canUndo, setCanUndo] = useState(Boolean(initialHistory?.undo.length))
  const [canRedo, setCanRedo] = useState(Boolean(initialHistory?.redo.length))
  const [hasClipboard, setHasClipboard] = useState(false)
  const [notePickerOpen, setNotePickerOpen] = useState(false)
  const [agentPreviewOperations, setAgentPreviewOperations] = useState<unknown[] | null>(null)
  const [edgeEditorOpen, setEdgeEditorOpen] = useState(false)
  const [editingEdgeId, setEditingEdgeId] = useState<string | null>(null)
  const [edgeLabelDraft, setEdgeLabelDraft] = useState('')
  const [importContentOpen, setImportContentOpen] = useState(false)
  const [importContentDraft, setImportContentDraft] = useState('')
  const [contextTarget, setContextTarget] = useState<'pane' | 'node' | 'edge'>('pane')
  const [drawDraft, setDrawDraft] = useState<DrawDraft | null>(null)
  const [marqueePreview, setMarqueePreview] = useState<MarqueePointerSession | null>(null)
  const [relationPreview, setRelationPreview] = useState<RelationPointerSession | null>(null)
  const [relationEditor, setRelationEditor] = useState<RelationEditorState | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const historyRef = useRef<CanvasSnapshot[]>((initialHistory?.undo || []).map(restoreHistorySnapshot))
  const redoRef = useRef<CanvasSnapshot[]>((initialHistory?.redo || []).map(restoreHistorySnapshot))
  const drawingFlowPointsRef = useRef<CanvasPoint[]>([])
  const erasingIdsRef = useRef(new Set<string>())
  const clipboardRef = useRef<CanvasSnapshot | null>(null)
  const pasteOffsetRef = useRef(0)
  const resizingRef = useRef(false)
  const freehandWidthHistoryRef = useRef(false)
  const groupDragRef = useRef<{
    groupId: string
    start: { x: number; y: number }
    children: Map<string, { x: number; y: number }>
  } | null>(null)
  const relationSessionRef = useRef<RelationPointerSession | null>(null)
  const marqueeSessionRef = useRef<MarqueePointerSession | null>(null)
  const relationTargetRef = useRef<string | null>(null)
  const suppressContextMenuRef = useRef(false)
  const persistedNodesRef = useRef(nodes)
  const persistedEdgesRef = useRef(edges)
  const pendingDocumentRef = useRef<CanvasDocument | null>(null)
  const pendingDocumentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastStoreDocumentRef = useRef(document)
  const { screenToFlowPosition, getViewport, getNodesBounds, fitView, setViewport } = useReactFlow()
  const viewport = useViewport()
  const activeBrushColor = tool === 'highlighter' ? highlighterColor : penColor
  const activeBrushSize = tool === 'highlighter' ? highlighterSize : penSize
  const activeBrushStyle = useMemo(() => ({
    ...(tool === 'highlighter' ? HIGHLIGHTER_STYLE : PEN_STYLE),
    size: activeBrushSize,
  }), [activeBrushSize, tool])
  const selectedNodeCount = nodes.filter(node => node.selected).length
  const selectedEdgeCount = edges.filter(edge => edge.selected).length
  const selectedCount = selectedNodeCount + selectedEdgeCount
  const selectedFreehandNodes = nodes.filter(node => node.selected && node.type === 'freehand')
  const selectedFreehandIds = selectedFreehandNodes.map(node => node.id).join(':')
  const selectedOnlyFreehand = selectedNodeCount > 0 && selectedFreehandNodes.length === selectedNodeCount
  const selectedStyleNode = nodes.find(node => node.selected && node.type !== 'freehand')
  const selectedBoxNode = nodes.find(node => node.selected && node.type !== 'freehand' && node.type !== 'text')
  const selectedBorderStyle = selectedBoxNode?.data.borderStyle || (selectedBoxNode?.type === 'group' ? 'dashed' : 'solid')
  const selectedFillColor = selectedBoxNode?.data.fillColor
  const isDrawingTool = tool === 'pen' || tool === 'highlighter'
  const brushPanelIsHighlighter = isDrawingTool
    ? tool === 'highlighter'
    : selectedFreehandNodes[0]?.data.drawingTool === 'highlighter'
  const selectedFreehandWidth = typeof selectedFreehandNodes[0]?.data.strokeWidth === 'number'
    ? selectedFreehandNodes[0].data.strokeWidth
    : brushPanelIsHighlighter ? HIGHLIGHTER_STYLE.size : PEN_STYLE.size
  const brushPanelColor = isDrawingTool
    ? activeBrushColor
    : selectedFreehandNodes[0]?.data.color || '#18181b'
  const brushPanelWidth = isDrawingTool ? activeBrushSize : selectedStrokeWidth
  const shortcutModifier = typeof navigator !== 'undefined' && navigator.platform.includes('Mac') ? '⌘' : 'Ctrl+'
  const availableNotes = useMemo(() => flattenFileTree(fileTree).filter(entry => (
    entry.isFile && /\.(md|markdown|txt)$/i.test(entry.name)
  )), [fileTree])
  const previewSnapshot = useMemo(() => {
    if (!document || !agentPreviewOperations) return null
    const currentDocument: CanvasDocument = {
      ...document,
      nodes: serializeNodes(nodes),
      edges: serializeEdges(edges),
    }
    const result = applyCanvasOperations(currentDocument, agentPreviewOperations).document
    const currentNodeMap = new Map(currentDocument.nodes.map(node => [node.id, node]))
    const currentFlowNodeMap = new Map(nodes.map(node => [node.id, node]))
    const resultNodeIds = new Set(result.nodes.map(node => node.id))
    const previewNodes = result.nodes.map(node => {
      const current = currentNodeMap.get(node.id)
      const currentFlowNode = currentFlowNodeMap.get(node.id)
      const changed = current && (
        JSON.stringify(current.position) !== JSON.stringify(node.position)
        || JSON.stringify(current.data) !== JSON.stringify(node.data)
      )
      return {
        ...currentFlowNode,
        ...node,
        ...(!currentFlowNode ? {
          width: node.width || (node.type === 'decision' ? 144 : node.type === 'text' ? 120 : 180),
          height: node.height || (node.type === 'decision' ? 144 : node.type === 'text' ? 40 : 56),
        } : {}),
        data: {
          ...node.data,
          previewState: current ? (changed ? 'update' : undefined) : 'add',
        },
      } as FlowCanvasNode
    })
    for (const node of currentDocument.nodes) {
      if (!resultNodeIds.has(node.id)) {
        const currentFlowNode = currentFlowNodeMap.get(node.id)
        previewNodes.push({
          ...currentFlowNode,
          ...node,
          data: { ...node.data, previewState: 'delete' },
        } as FlowCanvasNode)
      }
    }

    const currentEdgeMap = new Map(currentDocument.edges.map(edge => [edge.id, edge]))
    const currentFlowEdgeMap = new Map(edges.map(edge => [edge.id, edge]))
    const resultEdgeIds = new Set(result.edges.map(edge => edge.id))
    const previewEdges: Edge[] = result.edges.map(edge => ({
      ...currentFlowEdgeMap.get(edge.id),
      ...edge,
      animated: !currentEdgeMap.has(edge.id),
      style: !currentEdgeMap.has(edge.id)
        ? { stroke: 'var(--primary)', strokeWidth: 2, strokeDasharray: '6 4' }
        : undefined,
    }))
    for (const edge of currentDocument.edges) {
      if (!resultEdgeIds.has(edge.id)) {
        previewEdges.push({
          ...currentFlowEdgeMap.get(edge.id),
          ...edge,
          animated: true,
          style: { stroke: 'var(--destructive)', strokeWidth: 2, strokeDasharray: '6 4' },
        })
      }
    }
    return { nodes: previewNodes, edges: previewEdges }
  }, [agentPreviewOperations, document, edges, nodes])
  const displayNodes = previewSnapshot?.nodes || nodes
  const displayEdges = useMemo(() => (previewSnapshot?.edges || edges).map(edge => {
    const relation = edge.data as CanvasRelationData | undefined
    if (!relation) return edge
    const normalized = normalizeRelationData(relation)
    const visuals = relationEdgeVisuals(normalized)
    return {
      ...edge,
      type: 'relation',
      data: normalized,
      style: { ...(edge.style || {}), stroke: visuals.stroke, strokeWidth: visuals.strokeWidth, strokeDasharray: visuals.strokeDasharray },
      markerStart: visuals.markerStart ? { type: MarkerType.ArrowClosed, color: normalized.color } : undefined,
      markerEnd: visuals.markerEnd ? { type: MarkerType.ArrowClosed, color: normalized.color } : undefined,
    }
  }), [edges, previewSnapshot])

  useEffect(() => {
    if (!document) {
      void openProject(canvasId)
    }
  }, [canvasId, document, openProject])

  useEffect(() => () => {
    if (pendingDocumentTimerRef.current) clearTimeout(pendingDocumentTimerRef.current)
    const pendingDocument = pendingDocumentRef.current
    if (pendingDocument) {
      useCanvasStore.getState().updateDocument(canvasId, pendingDocument)
      pendingDocumentRef.current = null
    }
    void useCanvasStore.getState().saveProject(canvasId)
  }, [canvasId])

  useEffect(() => {
    if (!document || document === lastStoreDocumentRef.current) return
    if (pendingDocumentTimerRef.current) clearTimeout(pendingDocumentTimerRef.current)
    pendingDocumentTimerRef.current = null
    pendingDocumentRef.current = null
    lastStoreDocumentRef.current = document
    const nextNodes = (document.nodes as FlowCanvasNode[]).map(node => (
      node.draggable === false ? { ...node, draggable: true } : node
    ))
    const nextEdges = document.edges as Edge[]
    persistedNodesRef.current = nextNodes
    persistedEdgesRef.current = nextEdges
    const savedHistory = useCanvasStore.getState().projects.find(project => project.id === canvasId)?.history
    historyRef.current = (savedHistory?.undo || []).map(restoreHistorySnapshot)
    redoRef.current = (savedHistory?.redo || []).map(restoreHistorySnapshot)
    setCanUndo(historyRef.current.length > 0)
    setCanRedo(redoRef.current.length > 0)
    setNodes(nextNodes)
    setEdges(nextEdges)
  }, [document, setEdges, setNodes])

  useEffect(() => {
    const showPreview = ({ operations }: { operations: unknown[] }) => setAgentPreviewOperations(operations)
    const clearPreview = () => setAgentPreviewOperations(null)
    emitter.on('canvas-agent-preview', showPreview)
    emitter.on('canvas-agent-preview-clear', clearPreview)
    return () => {
      emitter.off('canvas-agent-preview', showPreview)
      emitter.off('canvas-agent-preview-clear', clearPreview)
    }
  }, [])

  useEffect(() => {
    if (!agentPreviewOperations) return
    const timer = window.setTimeout(() => {
      void fitView({ padding: 0.2, duration: 300 })
    }, 120)
    return () => window.clearTimeout(timer)
  }, [agentPreviewOperations, fitView])

  useEffect(() => {
    if (notePickerOpen && fileTree.length === 0) {
      void loadFileTree({ skipRemoteSync: true })
    }
  }, [fileTree.length, loadFileTree, notePickerOpen])

  useEffect(() => {
    if (!document) return
    if (!havePersistentNodesChanged(persistedNodesRef.current, nodes)
      && !havePersistentEdgesChanged(persistedEdgesRef.current, edges)) return
    persistedNodesRef.current = nodes
    persistedEdgesRef.current = edges
    const nextDocument: CanvasDocument = {
      ...document,
      nodes: serializeNodes(nodes),
      edges: serializeEdges(edges),
      viewport: getViewport(),
    }
    pendingDocumentRef.current = nextDocument
    if (pendingDocumentTimerRef.current) clearTimeout(pendingDocumentTimerRef.current)
    pendingDocumentTimerRef.current = setTimeout(() => {
      const pendingDocument = pendingDocumentRef.current
      if (!pendingDocument) return
      pendingDocumentRef.current = null
      pendingDocumentTimerRef.current = null
      lastStoreDocumentRef.current = pendingDocument
      updateDocument(canvasId, pendingDocument)
    }, 180)
  }, [canvasId, document, edges, getViewport, nodes, updateDocument])

  const persistHistory = useCallback(() => {
    updateHistory(canvasId, {
      undo: historyRef.current.map(serializeHistorySnapshot),
      redo: redoRef.current.map(serializeHistorySnapshot),
    })
  }, [canvasId, updateHistory])

  const pushHistory = useCallback(() => {
    const historyLimit = nodes.length > 500 ? 10 : nodes.length > 250 ? 20 : 50
    historyRef.current = [...historyRef.current.slice(-(historyLimit - 1)), cloneSnapshot(nodes, edges)]
    redoRef.current = []
    persistHistory()
    setCanUndo(true)
    setCanRedo(false)
  }, [edges, nodes, persistHistory])

  useEffect(() => {
    const checkpoint = () => {
      if (useCanvasStore.getState().activeCanvasId === canvasId) pushHistory()
    }
    emitter.on('canvas-history-checkpoint', checkpoint)
    return () => emitter.off('canvas-history-checkpoint', checkpoint)
  }, [canvasId, pushHistory])

  useEffect(() => {
    const replaceDocument = ({ canvasId: targetCanvasId, document: nextDocument }: { canvasId: string; document: CanvasDocument }) => {
      if (targetCanvasId !== canvasId) return
      pushHistory()
      setNodes(nextDocument.nodes as FlowCanvasNode[])
      setEdges(nextDocument.edges as Edge[])
      requestAnimationFrame(() => void fitView({ padding: 0.2, duration: 300 }))
    }

    emitter.on('canvas-document-replace', replaceDocument)
    return () => emitter.off('canvas-document-replace', replaceDocument)
  }, [canvasId, fitView, pushHistory, setEdges, setNodes])

  const undo = useCallback(() => {
    const snapshot = historyRef.current.pop()
    if (!snapshot) return
    redoRef.current.push(cloneSnapshot(nodes, edges))
    setNodes(snapshot.nodes)
    setEdges(snapshot.edges)
    persistHistory()
    setCanUndo(historyRef.current.length > 0)
    setCanRedo(true)
  }, [edges, nodes, persistHistory, setEdges, setNodes])

  const redo = useCallback(() => {
    const snapshot = redoRef.current.pop()
    if (!snapshot) return
    historyRef.current.push(cloneSnapshot(nodes, edges))
    setNodes(snapshot.nodes)
    setEdges(snapshot.edges)
    persistHistory()
    setCanUndo(true)
    setCanRedo(redoRef.current.length > 0)
  }, [edges, nodes, persistHistory, setEdges, setNodes])

  useEffect(() => {
    const handleUndo = ({ canvasId: targetCanvasId }: { canvasId: string }) => {
      if (targetCanvasId === canvasId) undo()
    }
    const handleRedo = ({ canvasId: targetCanvasId }: { canvasId: string }) => {
      if (targetCanvasId === canvasId) redo()
    }
    const handleCanUndoRedo = ({
      canvasId: targetCanvasId,
      resolve,
    }: {
      canvasId: string
      resolve: (can: { undo: boolean; redo: boolean }) => void
    }) => {
      if (targetCanvasId !== canvasId) return
      resolve({
        undo: historyRef.current.length > 0,
        redo: redoRef.current.length > 0,
      })
    }

    emitter.on('canvas-undo', handleUndo)
    emitter.on('canvas-redo', handleRedo)
    emitter.on('canvas-can-undo-redo', handleCanUndoRedo)
    return () => {
      emitter.off('canvas-undo', handleUndo)
      emitter.off('canvas-redo', handleRedo)
      emitter.off('canvas-can-undo-redo', handleCanUndoRedo)
    }
  }, [canvasId, redo, undo])

  useEffect(() => {
    emitter.emit('canvas-undo-redo-changed', { canvasId, undo: canUndo, redo: canRedo })
  }, [canRedo, canUndo, canvasId])

  const onNodesChange = useCallback((changes: NodeChange<FlowCanvasNode>[]) => {
    const startsResize = changes.some(change => change.type === 'dimensions' && change.resizing === true)
    if (changes.some(change => change.type === 'remove') || (startsResize && !resizingRef.current)) {
      pushHistory()
    }
    if (startsResize) resizingRef.current = true
    if (changes.some(change => change.type === 'dimensions' && change.resizing === false)) {
      resizingRef.current = false
    }
    onNodesChangeBase(changes)
  }, [onNodesChangeBase, pushHistory])

  const onEdgesChangeTracked = useCallback((changes: EdgeChange<Edge>[]) => {
    if (changes.some(change => change.type === 'remove')) pushHistory()
    onEdgesChange(changes)
  }, [onEdgesChange, pushHistory])

  const onConnect = useCallback((connection: Connection) => {
    pushHistory()
    setEdges(current => addEdge({
      ...connection,
      type: 'relation',
      data: normalizeRelationData(DEFAULT_RELATION),
    }, current))
  }, [pushHistory, setEdges])

  const finishBlockDraw = useCallback((draft: DrawDraft) => {
    if (!hasDrawableArea(draft.start, draft.current)) {
      setNodes(current => current.map(node => ({ ...node, selected: false })))
      setEdges(current => current.map(edge => ({ ...edge, selected: false })))
      return
    }

    const screenRect = normalizeDrawRect(draft.start, draft.current)
    const position = screenToFlowPosition({ x: screenRect.x, y: screenRect.y })
    const end = screenToFlowPosition({
      x: screenRect.x + screenRect.width,
      y: screenRect.y + screenRect.height,
    })
    const id = crypto.randomUUID()
    pushHistory()
    setNodes(current => [
      ...current.map(node => ({ ...node, selected: false })),
      {
        id,
        type: 'text',
        position,
        width: end.x - position.x,
        height: end.y - position.y,
        selected: true,
        data: {
          label: '',
          fillColor: 'var(--card)',
          color: 'var(--border)',
        },
      },
    ])
    setEdges(current => current.map(edge => ({ ...edge, selected: false })))
    requestAnimationFrame(() => emitter.emit('canvas-focus-node', id))
  }, [pushHistory, screenToFlowPosition, setEdges, setNodes])

  const setRelationTargetHighlight = useCallback((targetId: string | null) => {
    if (relationTargetRef.current === targetId) return
    const root = containerRef.current
    if (relationTargetRef.current) {
      root?.querySelector(`[data-id="${CSS.escape(relationTargetRef.current)}"]`)?.classList.remove('relation-target-active')
    }
    relationTargetRef.current = targetId
    if (targetId) {
      root?.querySelector(`[data-id="${CSS.escape(targetId)}"]`)?.classList.add('relation-target-active')
    }
  }, [])

  const handleBlockDrawPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button === 2 && event.target instanceof Element) {
      const nodeElement = event.target.closest('.react-flow__node')
      const sourceId = nodeElement?.getAttribute('data-id')
      if (sourceId) {
        const element = event.currentTarget
        const session: RelationPointerSession = {
          pointerId: event.pointerId,
          sourceId,
          startedAt: Date.now(),
          start: { x: event.clientX, y: event.clientY },
          current: { x: event.clientX, y: event.clientY },
          active: false,
          targetId: null,
        }
        session.timer = setTimeout(() => {
          const current = relationSessionRef.current
          if (!current || current.pointerId !== event.pointerId) return
          current.active = true
          suppressContextMenuRef.current = true
          try { element.setPointerCapture(event.pointerId) } catch { /* pointer already released */ }
          setRelationPreview({ ...current })
        }, 320)
        relationSessionRef.current = session
        return
      }
      if (
        tool === 'select'
        && !previewSnapshot
        && event.target.classList.contains('react-flow__pane')
      ) {
        const point = { x: event.clientX, y: event.clientY }
        marqueeSessionRef.current = {
          pointerId: event.pointerId,
          start: point,
          current: point,
          active: false,
        }
      }
      return
    }
    if (
      event.button !== 0
      || tool !== 'select'
      || previewSnapshot
      || !(event.target instanceof Element)
      || !event.target.classList.contains('react-flow__pane')
    ) return

    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    const point = { x: event.clientX, y: event.clientY }
    setDrawDraft({ pointerId: event.pointerId, start: point, current: point })
  }, [previewSnapshot, tool])

  const handleBlockDrawPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const relation = relationSessionRef.current
    if (relation?.pointerId === event.pointerId) {
      relation.current = { x: event.clientX, y: event.clientY }
      if (relation.active) {
        const target = globalThis.document.elementFromPoint(event.clientX, event.clientY)?.closest('.react-flow__node')?.getAttribute('data-id') || null
        relation.targetId = target
        const sourceElement = containerRef.current?.querySelector(`[data-id="${CSS.escape(relation.sourceId)}"]`)
        const sourceRect = sourceElement?.getBoundingClientRect()
        if (sourceRect) relation.start = nearestPointOnRect(sourceRect, relation.current)
        setRelationTargetHighlight(target && target !== relation.sourceId ? target : null)
        event.preventDefault()
        setRelationPreview({ ...relation })
      }
      return
    }
    const marquee = marqueeSessionRef.current
    if (marquee?.pointerId === event.pointerId) {
      marquee.current = { x: event.clientX, y: event.clientY }
      if (!marquee.active && Math.hypot(
        marquee.current.x - marquee.start.x,
        marquee.current.y - marquee.start.y,
      ) >= POINTER_DRAG_THRESHOLD) {
        marquee.active = true
        suppressContextMenuRef.current = true
        try { event.currentTarget.setPointerCapture(event.pointerId) } catch { /* pointer already released */ }
      }
      if (marquee.active) {
        event.preventDefault()
        event.stopPropagation()
        setMarqueePreview({ ...marquee })
      }
      return
    }
    setDrawDraft(current => (
      current?.pointerId === event.pointerId
        ? { ...current, current: { x: event.clientX, y: event.clientY } }
        : current
    ))
  }, [setRelationTargetHighlight])

  const handleBlockDrawPointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const relation = relationSessionRef.current
    if (relation?.pointerId === event.pointerId) {
      if (relation.timer) clearTimeout(relation.timer)
      relationSessionRef.current = null
      if (!relation.active) return
      event.preventDefault()
      event.stopPropagation()
      suppressContextMenuRef.current = true
      window.setTimeout(() => { suppressContextMenuRef.current = false }, 0)
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
      setRelationPreview(null)
      setRelationTargetHighlight(null)
      const targetId = relation.targetId || globalThis.document.elementFromPoint(event.clientX, event.clientY)?.closest('.react-flow__node')?.getAttribute('data-id') || null
      const nodeIds = new Set(nodes.map(node => node.id))
      if (!isValidRelationTarget(relation.sourceId, targetId, nodeIds)) return
      const edgeId = crypto.randomUUID()
      pushHistory()
      setEdges(current => [...current, {
        id: edgeId,
        source: relation.sourceId,
        target: targetId!,
        type: 'relation',
        label: '',
        data: normalizeRelationData(DEFAULT_RELATION),
      }])
      const root = containerRef.current
      const sourceElement = root?.querySelector(`[data-id="${CSS.escape(relation.sourceId)}"]`)
      const targetElement = root?.querySelector(`[data-id="${CSS.escape(targetId!)}"]`)
      const sourceRect = sourceElement?.getBoundingClientRect()
      const targetRect = targetElement?.getBoundingClientRect()
      const anchor = sourceRect && targetRect
        ? { x: (sourceRect.left + sourceRect.width / 2 + targetRect.left + targetRect.width / 2) / 2, y: (sourceRect.top + sourceRect.height / 2 + targetRect.top + targetRect.height / 2) / 2 }
        : { x: relation.current.x, y: relation.current.y }
      const bounds = root?.getBoundingClientRect()
      setRelationEditor({
        edgeId,
        mode: 'create',
        anchor: { x: anchor.x - (bounds?.left || 0), y: anchor.y - (bounds?.top || 0) },
        suggestedWaypoint: sourceRect && targetRect
          ? screenToFlowPosition({ x: anchor.x, y: anchor.y })
          : undefined,
      })
      return
    }
    const marquee = marqueeSessionRef.current
    if (marquee?.pointerId === event.pointerId) {
      marqueeSessionRef.current = null
      if (!marquee.active) return
      event.preventDefault()
      event.stopPropagation()
      suppressContextMenuRef.current = false
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
      const completed = { ...marquee, current: { x: event.clientX, y: event.clientY } }
      setMarqueePreview(null)
      const selection = normalizeDrawRect(completed.start, completed.current)
      const candidates = Array.from(containerRef.current?.querySelectorAll('.react-flow__node[data-id]') || []).flatMap(element => {
        const id = element.getAttribute('data-id')
        const rect = element.getBoundingClientRect()
        return id ? [{ id, x: rect.left, y: rect.top, width: rect.width, height: rect.height }] : []
      })
      const selectedIds = new Set(intersectingRectIds(selection, candidates))
      setNodes(current => current.map(node => ({ ...node, selected: selectedIds.has(node.id) })))
      setEdges(current => current.map(edge => ({ ...edge, selected: false })))
      return
    }
    if (!drawDraft || drawDraft.pointerId !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    const completed = {
      ...drawDraft,
      current: { x: event.clientX, y: event.clientY },
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    setDrawDraft(null)
    finishBlockDraw(completed)
  }, [drawDraft, finishBlockDraw, nodes, pushHistory, screenToFlowPosition, setEdges, setNodes, setRelationTargetHighlight])

  const handleBlockDrawPointerCancel = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const relation = relationSessionRef.current
    if (relation?.pointerId === event.pointerId) {
      if (relation.timer) clearTimeout(relation.timer)
      relationSessionRef.current = null
      setRelationPreview(null)
      setRelationTargetHighlight(null)
      suppressContextMenuRef.current = false
      return
    }
    const marquee = marqueeSessionRef.current
    if (marquee?.pointerId === event.pointerId) {
      marqueeSessionRef.current = null
      setMarqueePreview(null)
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
      return
    }
    if (!drawDraft || drawDraft.pointerId !== event.pointerId) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    setDrawDraft(null)
  }, [drawDraft, setRelationTargetHighlight])

  const saveRelationEditor = useCallback((value: CanvasRelationData) => {
    if (!relationEditor) return
    const normalized = normalizeRelationData(value)
    pushHistory()
    setEdges(current => current.map(edge => edge.id === relationEditor.edgeId
      ? { ...edge, type: 'relation', label: normalized.label, data: normalized }
      : edge))
    setRelationEditor(null)
  }, [pushHistory, relationEditor, setEdges])

  const cancelRelationEditor = useCallback(() => {
    if (relationEditor?.mode === 'create') {
      setEdges(current => current.filter(edge => edge.id !== relationEditor.edgeId))
    }
    setRelationEditor(null)
  }, [relationEditor, setEdges])

  const getSelectedSnapshot = useCallback((): CanvasSnapshot | null => {
    const selectedNodes = nodes.filter(node => node.selected)
    if (selectedNodes.length === 0) return null
    const selectedIds = new Set(selectedNodes.map(node => node.id))
    return cloneSnapshot(
      selectedNodes,
      edges.filter(edge => selectedIds.has(edge.source) && selectedIds.has(edge.target))
    )
  }, [edges, nodes])

  const copySelection = useCallback(() => {
    const snapshot = getSelectedSnapshot()
    if (!snapshot) return
    clipboardRef.current = snapshot
    pasteOffsetRef.current = 0
    setHasClipboard(true)
  }, [getSelectedSnapshot])

  const insertSnapshot = useCallback((snapshot: CanvasSnapshot) => {
    pushHistory()
    pasteOffsetRef.current += 32
    const idMap = new Map(snapshot.nodes.map(node => [node.id, crypto.randomUUID()]))
    const offset = pasteOffsetRef.current
    const pastedNodes = snapshot.nodes.map(node => ({
      ...structuredClone(node),
      id: idMap.get(node.id) || crypto.randomUUID(),
      position: { x: node.position.x + offset, y: node.position.y + offset },
      selected: true,
    }))
    const pastedEdges = snapshot.edges.map(edge => ({
      ...structuredClone(edge),
      id: crypto.randomUUID(),
      source: idMap.get(edge.source) || edge.source,
      target: idMap.get(edge.target) || edge.target,
      selected: true,
    }))
    setNodes(current => [...current.map(node => ({ ...node, selected: false })), ...pastedNodes])
    setEdges(current => [...current.map(edge => ({ ...edge, selected: false })), ...pastedEdges])
  }, [pushHistory, setEdges, setNodes])

  const pasteSelection = useCallback(() => {
    if (!clipboardRef.current) return
    insertSnapshot(clipboardRef.current)
  }, [insertSnapshot])

  const duplicateSelection = useCallback(() => {
    const snapshot = getSelectedSnapshot()
    if (!snapshot) return
    pasteOffsetRef.current = 0
    insertSnapshot(snapshot)
  }, [getSelectedSnapshot, insertSnapshot])

  const deleteSelection = useCallback(() => {
    const selectedNodeIds = new Set(nodes.filter(node => node.selected).map(node => node.id))
    const selectedEdgeIds = new Set(edges.filter(edge => edge.selected).map(edge => edge.id))
    if (selectedNodeIds.size === 0 && selectedEdgeIds.size === 0) return
    pushHistory()
    setNodes(current => current.filter(node => !selectedNodeIds.has(node.id)))
    setEdges(current => current.filter(edge => (
      !selectedEdgeIds.has(edge.id)
      && !selectedNodeIds.has(edge.source)
      && !selectedNodeIds.has(edge.target)
    )))
  }, [edges, nodes, pushHistory, setEdges, setNodes])

  const selectAll = useCallback(() => {
    setNodes(current => current.map(node => ({ ...node, selected: true })))
    setEdges(current => current.map(edge => ({ ...edge, selected: true })))
  }, [setEdges, setNodes])

  const applySelectedNodeStylePatch = useCallback((patch: Record<string, unknown>) => {
    setNodes(current => current.map(node => node.selected ? { ...node, data: { ...node.data, ...patch } } : node))
  }, [setNodes])

  const updateCanvasBackground = useCallback((backgroundColor?: string) => {
    if (!document) return
    updateDocument(canvasId, {
      ...document,
      settings: { ...document.settings, backgroundColor },
    })
  }, [canvasId, document, updateDocument])

  useEffect(() => {
    const releaseCanvasFocus = (event: PointerEvent) => {
      const root = containerRef.current
      if (!root || !(event.target instanceof globalThis.Node) || root.contains(event.target)) return
      if (root.contains(globalThis.document.activeElement)) {
        (globalThis.document.activeElement as HTMLElement | null)?.blur()
      }
    }

    globalThis.document.addEventListener('pointerdown', releaseCanvasFocus, true)
    return () => globalThis.document.removeEventListener('pointerdown', releaseCanvasFocus, true)
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (useCanvasStore.getState().activeCanvasId !== canvasId) return
      const root = containerRef.current
      if (!root || !(event.target instanceof globalThis.Node) || !root.contains(event.target)) return
      const target = event.target
      if (isInteractiveCanvasTarget(target)) return

      const modifier = event.metaKey || event.ctrlKey
      const selection = window.getSelection()
      const selectionIsOutsideCanvas = Boolean(
        selection
        && !selection.isCollapsed
        && selection.anchorNode
        && !root.contains(selection.anchorNode)
      )
      if (modifier && selectionIsOutsideCanvas && ['c', 'x'].includes(event.key.toLowerCase())) return

      if (modifier && event.key.toLowerCase() === 'c') {
        event.preventDefault()
        copySelection()
      } else if (modifier && event.key.toLowerCase() === 'v') {
        if (clipboardRef.current) {
          event.preventDefault()
          pasteSelection()
        }
      } else if (modifier && event.key.toLowerCase() === 'd') {
        event.preventDefault()
        duplicateSelection()
      } else if (modifier && event.key.toLowerCase() === 'a') {
        event.preventDefault()
        selectAll()
      } else if (modifier && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) redo()
        else undo()
      } else if (!modifier && event.key.toLowerCase() === 'f') {
        event.preventDefault()
        void fitView({ padding: 0.2, duration: 300 })
      } else if (!modifier && event.code === 'Space') {
        event.preventDefault()
        setTool(current => current === 'select' ? 'hand' : current)
      } else if (event.key === 'Backspace' || event.key === 'Delete') {
        event.preventDefault()
        deleteSelection()
      }
    }

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') setTool(current => current === 'hand' ? 'select' : current)
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [canvasId, copySelection, deleteSelection, duplicateSelection, fitView, pasteSelection, redo, selectAll, undo])

  const addNoteNode = useCallback((filePath: string, name: string) => {
    pushHistory()
    const position = screenToFlowPosition({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    })
    setNodes(current => [...current, {
      id: crypto.randomUUID(),
      type: 'note',
      position,
      data: { label: name, filePath },
    }])
    setNotePickerOpen(false)
    toast.success(t('noteNode.added', { name }))
  }, [pushHistory, screenToFlowPosition, setNodes, t])

  const addImageNode = useCallback(async () => {
    const sourcePath = await open({
      multiple: false,
      filters: [{ name: t('nodes.image'), extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'] }],
    })
    if (!sourcePath || Array.isArray(sourcePath)) return
    const extension = sourcePath.split('.').pop()?.toLowerCase() || 'png'
    const relativePath = `画布资源/${crypto.randomUUID()}.${extension}`
    const directoryOptions = await getFilePathOptions('画布资源')
    await mkdir(
      directoryOptions.path,
      directoryOptions.baseDir ? { baseDir: directoryOptions.baseDir, recursive: true } : { recursive: true }
    )
    const targetOptions = await getFilePathOptions(relativePath)
    await writeFile(
      targetOptions.path,
      await readFile(sourcePath),
      targetOptions.baseDir ? { baseDir: targetOptions.baseDir } : undefined
    )
    await loadFileTree({ skipRemoteSync: true })
    pushHistory()
    const position = screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 })
    setNodes(current => [...current, {
      id: crypto.randomUUID(),
      type: 'image',
      position,
      data: { label: sourcePath.split(/[\\/]/).pop() || t('nodes.image'), imagePath: relativePath },
    }])
  }, [loadFileTree, pushHistory, screenToFlowPosition, setNodes, t])

  const persistIngestFile = useCallback(async (file: File) => {
    const rawExtension = file.name.includes('.')
      ? file.name.split('.').pop()
      : file.type.split('/').pop()?.replace('svg+xml', 'svg')
    const extension = (rawExtension || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12) || 'bin'
    const relativePath = `画布资源/${crypto.randomUUID()}.${extension}`
    const targetOptions = await getFilePathOptions(relativePath)
    await writeFile(
      targetOptions.path,
      new Uint8Array(await file.arrayBuffer()),
      targetOptions.baseDir ? { baseDir: targetOptions.baseDir } : undefined,
    )
    return relativePath
  }, [])

  const ingestTransfer = useCallback(async (
    input: CanvasTransferInput,
    screenOrigin: { x: number; y: number },
  ) => {
    const drafts = draftsFromTransfer(input)
    if (drafts.length === 0) return false

    try {
      if (drafts.some(draft => draft.kind === 'image' || draft.kind === 'file')) {
        const directoryOptions = await getFilePathOptions('画布资源')
        await mkdir(
          directoryOptions.path,
          directoryOptions.baseDir
            ? { baseDir: directoryOptions.baseDir, recursive: true }
            : { recursive: true },
        )
      }

      const prepared = await Promise.all(offsetIngestDrafts(drafts, screenOrigin).map(async item => {
        const position = screenToFlowPosition(item.position)
        const draft = item.draft as CanvasIngestDraft
        if (draft.kind === 'text') {
          return {
            id: crypto.randomUUID(),
            type: 'text' as const,
            position,
            width: draft.width,
            height: draft.height,
            selected: true,
            data: { label: draft.text, fillColor: 'var(--card)', color: 'var(--border)' },
          }
        }
        if (draft.kind === 'link') {
          return {
            id: crypto.randomUUID(),
            type: 'link' as const,
            position,
            width: draft.width,
            height: draft.height,
            selected: true,
            data: { label: draft.label, url: draft.url },
          }
        }
        const relativePath = await persistIngestFile(draft.file)
        return {
          id: crypto.randomUUID(),
          type: draft.kind,
          position,
          width: draft.width,
          height: draft.height,
          selected: true,
          data: draft.kind === 'image'
            ? { label: draft.label, imagePath: relativePath }
            : { label: draft.label, filePath: relativePath },
        }
      }))

      if (drafts.some(draft => draft.kind === 'image' || draft.kind === 'file')) {
        await loadFileTree({ skipRemoteSync: true })
      }
      pushHistory()
      setNodes(current => [
        ...current.map(node => ({ ...node, selected: false })),
        ...prepared,
      ])
      setEdges(current => current.map(edge => ({ ...edge, selected: false })))
      return true
    } catch (error) {
      console.error('Failed to ingest canvas content:', error)
      toast.error('无法把此内容加入画布')
      return false
    }
  }, [loadFileTree, persistIngestFile, pushHistory, screenToFlowPosition, setEdges, setNodes])

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      if (useCanvasStore.getState().activeCanvasId !== canvasId) return
      const root = containerRef.current
      if (!root || !(event.target instanceof globalThis.Node) || !root.contains(event.target)) return
      if (isInteractiveCanvasTarget(event.target)) return
      const clipboard = event.clipboardData
      if (!clipboard) return
      const input: CanvasTransferInput = {
        files: [...clipboard.files],
        html: clipboard.getData('text/html'),
        text: clipboard.getData('text/plain'),
      }
      if (draftsFromTransfer(input).length === 0) return
      event.preventDefault()
      const bounds = root.getBoundingClientRect()
      void ingestTransfer(input, { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 })
    }
    window.addEventListener('paste', handlePaste)
    return () => window.removeEventListener('paste', handlePaste)
  }, [canvasId, ingestTransfer])

  const handleCanvasDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    if (event.dataTransfer.types.includes('Files') || event.dataTransfer.types.includes('text/plain')) {
      event.preventDefault()
      event.dataTransfer.dropEffect = 'copy'
    }
  }, [])

  const handleCanvasDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    const input: CanvasTransferInput = {
      files: [...event.dataTransfer.files],
      html: event.dataTransfer.getData('text/html'),
      text: event.dataTransfer.getData('text/plain'),
    }
    if (draftsFromTransfer(input).length === 0) return
    event.preventDefault()
    event.stopPropagation()
    void ingestTransfer(input, { x: event.clientX, y: event.clientY })
  }, [ingestTransfer])

  const alignSelection = useCallback((axis: 'horizontal' | 'vertical') => {
    const selected = nodes.filter(node => node.selected)
    if (selected.length < 2) return
    pushHistory()
    if (axis === 'horizontal') {
      const centerY = selected.reduce((sum, node) => sum + node.position.y + (node.measured?.height || node.height || 56) / 2, 0) / selected.length
      setNodes(current => current.map(node => node.selected ? {
        ...node,
        position: { ...node.position, y: centerY - (node.measured?.height || node.height || 56) / 2 },
      } : node))
    } else {
      const centerX = selected.reduce((sum, node) => sum + node.position.x + (node.measured?.width || node.width || 180) / 2, 0) / selected.length
      setNodes(current => current.map(node => node.selected ? {
        ...node,
        position: { ...node.position, x: centerX - (node.measured?.width || node.width || 180) / 2 },
      } : node))
    }
  }, [nodes, pushHistory, setNodes])

  const distributeSelection = useCallback((axis: 'horizontal' | 'vertical') => {
    const selected = nodes.filter(node => node.selected)
    if (selected.length < 3) return
    pushHistory()
    const sorted = [...selected].sort((left, right) => axis === 'horizontal'
      ? left.position.x - right.position.x
      : left.position.y - right.position.y)
    const first = sorted[0]
    const last = sorted[sorted.length - 1]
    const distance = axis === 'horizontal'
      ? (last.position.x - first.position.x) / (sorted.length - 1)
      : (last.position.y - first.position.y) / (sorted.length - 1)
    const positions = new Map(sorted.map((node, index) => [node.id, axis === 'horizontal'
      ? { ...node.position, x: first.position.x + distance * index }
      : { ...node.position, y: first.position.y + distance * index }]))
    setNodes(current => current.map(node => positions.has(node.id) ? { ...node, position: positions.get(node.id)! } : node))
  }, [nodes, pushHistory, setNodes])

  const groupSelection = useCallback(() => {
    const selected = nodes.filter(node => node.selected && node.type !== 'group')
    if (selected.length < 2) return
    const bounds = getNodesBounds(selected)
    pushHistory()
    setNodes(current => [{
      id: crypto.randomUUID(),
      type: 'group',
      position: { x: bounds.x - 28, y: bounds.y - 48 },
      width: bounds.width + 56,
      height: bounds.height + 76,
      zIndex: -1,
      data: { label: t('group.defaultLabel'), childIds: selected.map(node => node.id) },
    }, ...current.map(node => ({ ...node, selected: false }))])
  }, [getNodesBounds, nodes, pushHistory, setNodes, t])

  const updateSelectedEdges = useCallback((type: 'smoothstep' | 'straight' | 'default') => {
    if (selectedEdgeCount === 0) return
    pushHistory()
    setEdges(current => current.map(edge => edge.selected ? { ...edge, type } : edge))
  }, [pushHistory, selectedEdgeCount, setEdges])

  const editSelectedEdgeLabel = useCallback(() => {
    const selected = edges.find(edge => edge.selected)
    if (!selected) return
    setEditingEdgeId(selected.id)
    setEdgeLabelDraft(typeof selected.label === 'string' ? selected.label : '')
    setEdgeEditorOpen(true)
  }, [edges])

  const saveEdgeLabel = useCallback(() => {
    if (!editingEdgeId) return
    pushHistory()
    setEdges(current => current.map(edge => edge.id === editingEdgeId ? { ...edge, label: edgeLabelDraft.trim() } : edge))
    setEdgeEditorOpen(false)
  }, [edgeLabelDraft, editingEdgeId, pushHistory, setEdges])

  const updateSelectedNodeStyle = useCallback((style: Partial<Pick<CanvasNode['data'], 'color' | 'borderStyle' | 'borderWidth' | 'fillColor' | 'fillStyle'>>) => {
    if (selectedNodeCount === 0) return
    pushHistory()
    setNodes(current => current.map(node => (
      node.selected && node.type !== 'freehand'
        ? { ...node, data: { ...node.data, ...style } }
        : node
    )))
  }, [pushHistory, selectedNodeCount, setNodes])

  const updateSelectedNodeColor = useCallback((color: string) => {
    updateSelectedNodeStyle({ color })
  }, [updateSelectedNodeStyle])

  const updateSelectedFreehandColor = useCallback((color: string) => {
    if (selectedFreehandNodes.length === 0) return
    pushHistory()
    setNodes(current => current.map(node => (
      node.selected && node.type === 'freehand'
        ? { ...node, data: { ...node.data, color } }
        : node
    )))
  }, [pushHistory, selectedFreehandNodes.length, setNodes])

  const updateSelectedNodeLayer = useCallback((action: 'front' | 'forward' | 'backward' | 'back') => {
    if (selectedNodeCount === 0) return
    pushHistory()
    setNodes(current => {
      const originalIndex = new Map(current.map((node, index) => [node.id, index]))
      const ordered = [...current].sort((left, right) => {
        const layerDifference = (left.zIndex ?? 0) - (right.zIndex ?? 0)
        return layerDifference || (originalIndex.get(left.id) ?? 0) - (originalIndex.get(right.id) ?? 0)
      })
      const selectedIds = new Set(ordered.filter(node => node.selected).map(node => node.id))

      if (action === 'front' || action === 'back') {
        const selected = ordered.filter(node => selectedIds.has(node.id))
        const unselected = ordered.filter(node => !selectedIds.has(node.id))
        ordered.splice(0, ordered.length, ...(action === 'front'
          ? [...unselected, ...selected]
          : [...selected, ...unselected]))
      } else if (action === 'forward') {
        for (let index = ordered.length - 2; index >= 0; index -= 1) {
          if (selectedIds.has(ordered[index].id) && !selectedIds.has(ordered[index + 1].id)) {
            ;[ordered[index], ordered[index + 1]] = [ordered[index + 1], ordered[index]]
          }
        }
      } else {
        for (let index = 1; index < ordered.length; index += 1) {
          if (selectedIds.has(ordered[index].id) && !selectedIds.has(ordered[index - 1].id)) {
            ;[ordered[index], ordered[index - 1]] = [ordered[index - 1], ordered[index]]
          }
        }
      }

      const layerById = new Map(ordered.map((node, index) => [node.id, index]))
      return current.map(node => ({ ...node, zIndex: layerById.get(node.id) ?? 0 }))
    })
  }, [pushHistory, selectedNodeCount, setNodes])

  const updateSelectedFreehandWidth = useCallback((size: number, recordHistory = true) => {
    if (selectedFreehandNodes.length === 0) return
    if (recordHistory) pushHistory()
    setNodes(current => current.map(node => {
      if (!node.selected || node.type !== 'freehand') return node
      if (!Array.isArray(node.data.points) || node.data.points.length === 0) {
        return {
          ...node,
          data: {
            ...node.data,
            pathStrokeWidth: node.data.pathStrokeWidth ?? node.data.strokeWidth ?? (
              node.data.drawingTool === 'highlighter' ? HIGHLIGHTER_STYLE.size : PEN_STYLE.size
            ),
            strokeWidth: size,
          },
        }
      }
      const baseStyle = node.data.drawingTool === 'highlighter' ? HIGHLIGHTER_STYLE : PEN_STYLE
      const geometry = createFreehandGeometry(node.data.points, { ...baseStyle, size })
      if (!geometry) return node
      return {
        ...node,
        position: { x: geometry.x, y: geometry.y },
        width: geometry.width,
        height: geometry.height,
        style: {
          ...node.style,
          width: geometry.width,
          height: geometry.height,
        },
        data: {
          ...node.data,
          path: geometry.path,
          width: geometry.width,
          height: geometry.height,
          strokeWidth: size,
          pathStrokeWidth: undefined,
        },
      }
    }))
  }, [pushHistory, selectedFreehandNodes.length, setNodes])

  useEffect(() => {
    if (selectedOnlyFreehand) setSelectedStrokeWidth(selectedFreehandWidth)
  }, [selectedFreehandWidth, selectedOnlyFreehand])

  useEffect(() => {
    freehandWidthHistoryRef.current = false
  }, [selectedFreehandIds])

  useEffect(() => {
    setSelectedNodeBorderWidth(selectedBoxNode?.data.borderWidth || 1)
  }, [selectedBoxNode?.data.borderWidth, selectedBoxNode?.id])

  const layoutNodes = useCallback(async (recordHistory = true) => {
    if (nodes.length === 0) return
    if (recordHistory) pushHistory()
    const layoutDirection = document?.settings.layoutDirection === 'LR' ? 'RIGHT' : 'DOWN'
    const layoutOptions = {
      'elk.algorithm': 'layered',
      'elk.direction': layoutDirection,
      'elk.spacing.nodeNode': '48',
      'elk.layered.spacing.nodeNodeBetweenLayers': '72',
    }
    const getLayoutSize = (node: FlowCanvasNode) => ({
      width: node.type === 'group'
        ? node.width || node.measured?.width || 360
        : node.measured?.width || node.width || 180,
      height: node.type === 'group'
        ? node.height || node.measured?.height || 240
        : node.measured?.height || node.height || 72,
    })
    const arrangedById = new Map(nodes.map(node => [node.id, structuredClone(node)]))
    const groupByChildId = new Map<string, string>()
    for (const group of nodes.filter(node => node.type === 'group')) {
      if (!Array.isArray(group.data.childIds)) continue
      for (const childId of group.data.childIds) {
        if (
          typeof childId === 'string'
          && childId !== group.id
          && arrangedById.has(childId)
          && !groupByChildId.has(childId)
        ) {
          groupByChildId.set(childId, group.id)
        }
      }
    }

    for (const originalGroup of nodes.filter(node => node.type === 'group')) {
      const group = arrangedById.get(originalGroup.id)
      if (!group || !Array.isArray(group.data.childIds)) continue
      const childIds = new Set(group.data.childIds.filter((id): id is string => (
        typeof id === 'string' && arrangedById.has(id)
      )))
      const children = [...childIds]
        .map(id => arrangedById.get(id))
        .filter((node): node is FlowCanvasNode => Boolean(node))
      if (children.length === 0) continue
      const innerGraph = await elk.layout<ElkNode>({
        id: `group-${group.id}`,
        layoutOptions,
        children: children.map(node => ({ id: node.id, ...getLayoutSize(node) })),
        edges: edges
          .filter(edge => childIds.has(edge.source) && childIds.has(edge.target))
          .map(edge => ({ id: edge.id, sources: [edge.source], targets: [edge.target] })),
      })
      const innerPositions = new Map((innerGraph.children || []).map(child => [child.id, child]))
      const graphWidth = innerGraph.width || Math.max(...children.map(node => {
        const position = innerPositions.get(node.id)
        return (position?.x || 0) + getLayoutSize(node).width
      }))
      const graphHeight = innerGraph.height || Math.max(...children.map(node => {
        const position = innerPositions.get(node.id)
        return (position?.y || 0) + getLayoutSize(node).height
      }))
      const currentSize = getLayoutSize(group)
      const groupWidth = Math.max(currentSize.width, Math.ceil(graphWidth + 56))
      const groupHeight = Math.max(currentSize.height, Math.ceil(graphHeight + 76))
      const contentX = group.position.x + 28 + Math.max(0, (groupWidth - 56 - graphWidth) / 2)
      const contentY = group.position.y + 48 + Math.max(0, (groupHeight - 76 - graphHeight) / 2)
      arrangedById.set(group.id, { ...group, width: groupWidth, height: groupHeight })
      for (const child of children) {
        const position = innerPositions.get(child.id)
        if (!position) continue
        arrangedById.set(child.id, {
          ...child,
          position: {
            x: contentX + (position.x || 0),
            y: contentY + (position.y || 0),
          },
        })
      }
    }

    const arrangedNodes = nodes.map(node => arrangedById.get(node.id) || node)
    const layoutUnits = arrangedNodes.filter(node => !groupByChildId.has(node.id))
    const layoutUnitIds = new Set(layoutUnits.map(node => node.id))
    const layoutEdgeKeys = new Set<string>()
    const layoutEdges = edges.flatMap(edge => {
      const source = groupByChildId.get(edge.source) || edge.source
      const target = groupByChildId.get(edge.target) || edge.target
      const key = `${source}:${target}`
      if (
        source === target
        || !layoutUnitIds.has(source)
        || !layoutUnitIds.has(target)
        || layoutEdgeKeys.has(key)
      ) return []
      layoutEdgeKeys.add(key)
      return [{ id: edge.id, sources: [source], targets: [target] }]
    })
    const graph = await elk.layout({
      id: 'root',
      layoutOptions,
      children: layoutUnits.map(node => ({ id: node.id, ...getLayoutSize(node) })),
      edges: layoutEdges,
    })
    const positions = new Map((graph.children || []).map(child => [child.id, child]))
    for (const group of layoutUnits.filter(node => node.type === 'group')) {
      const position = positions.get(group.id)
      if (!position) continue
      const offset = {
        x: (position.x || 0) - group.position.x,
        y: (position.y || 0) - group.position.y,
      }
      arrangedById.set(group.id, {
        ...group,
        position: { x: position.x || 0, y: position.y || 0 },
      })
      for (const [childId, groupId] of groupByChildId) {
        if (groupId !== group.id) continue
        const child = arrangedById.get(childId)
        if (!child) continue
        arrangedById.set(childId, {
          ...child,
          position: {
            x: child.position.x + offset.x,
            y: child.position.y + offset.y,
          },
        })
      }
    }
    for (const node of layoutUnits.filter(node => node.type !== 'group')) {
      const position = positions.get(node.id)
      if (!position) continue
      arrangedById.set(node.id, {
        ...node,
        position: { x: position.x || 0, y: position.y || 0 },
      })
    }
    setNodes(current => current.map(node => arrangedById.get(node.id) || node))
    requestAnimationFrame(() => void fitView({ padding: 0.2, duration: 300 }))
  }, [document?.settings.layoutDirection, edges, fitView, nodes, pushHistory, setNodes])

  useEffect(() => {
    const autoLayout = ({ recordHistory = true }: { recordHistory?: boolean }) => {
      if (useCanvasStore.getState().activeCanvasId === canvasId) {
        void layoutNodes(recordHistory)
      }
    }
    emitter.on('canvas-auto-layout', autoLayout)
    return () => emitter.off('canvas-auto-layout', autoLayout)
  }, [canvasId, layoutNodes])

  const updateCanvasSettings = useCallback((settings: Partial<CanvasDocument['settings']>) => {
    if (!document) return
    const nextDocument: CanvasDocument = {
      ...document,
      nodes: serializeNodes(nodes),
      edges: serializeEdges(edges),
      viewport: getViewport(),
      settings: { ...document.settings, ...settings },
    }
    lastStoreDocumentRef.current = nextDocument
    updateDocument(canvasId, nextDocument)
  }, [canvasId, document, edges, getViewport, nodes, updateDocument])

  const applyImportedContent = useCallback((source: string) => {
    const trimmedSource = source.trim()
    const nextDocument = trimmedSource.startsWith('{')
      ? parseCanvasProjectFile(trimmedSource).document
      : mermaidToCanvasDocument(trimmedSource)
    pushHistory()
    setNodes(nextDocument.nodes as FlowCanvasNode[])
    setEdges(nextDocument.edges as Edge[])
    updateDocument(canvasId, nextDocument)
    requestAnimationFrame(() => void fitView({ padding: 0.2, duration: 300 }))
    toast.success(t('import.success'))
  }, [canvasId, fitView, pushHistory, setEdges, setNodes, t, updateDocument])

  const importCanvasFile = useCallback(async () => {
    try {
      const path = await open({
        multiple: false,
        filters: [{ name: t('import.fileType'), extensions: ['json', 'canvas', 'mmd', 'mermaid'] }],
      })
      if (!path || Array.isArray(path)) return
      applyImportedContent(await readTextFile(path))
    } catch (error) {
      console.error('Failed to import canvas:', error)
      toast.error(t('import.error'))
    }
  }, [applyImportedContent, t])

  const importCanvasContent = useCallback(() => {
    try {
      applyImportedContent(importContentDraft)
      setImportContentOpen(false)
      setImportContentDraft('')
    } catch (error) {
      console.error('Failed to import canvas content:', error)
      toast.error(t('import.error'))
    }
  }, [applyImportedContent, importContentDraft, t])

  const drawOverlayEnabled = tool === 'pen' || tool === 'highlighter' || tool === 'eraser'

  const eraseAtPoint = useCallback((point: { x: number; y: number }) => {
    setNodes(current => current.filter(node => {
      if (node.type !== 'freehand' || erasingIdsRef.current.has(node.id)) return true
      const width = node.measured?.width || node.width || node.data.width || 0
      const height = node.measured?.height || node.height || node.data.height || 0
      const hit = point.x >= node.position.x - 8 && point.x <= node.position.x + width + 8
        && point.y >= node.position.y - 8 && point.y <= node.position.y + height + 8
      if (hit) erasingIdsRef.current.add(node.id)
      return !hit
    }))
  }, [setNodes])

  const handleDrawingPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!drawOverlayEnabled) return
    event.currentTarget.setPointerCapture(event.pointerId)
    if (tool === 'eraser') {
      pushHistory()
      erasingIdsRef.current.clear()
    }
    const bounds = event.currentTarget.getBoundingClientRect()
    const localPoint = { x: event.clientX - bounds.left, y: event.clientY - bounds.top, pressure: event.pressure || 0.5 }
    const flowPoint = screenToFlowPosition({ x: event.clientX, y: event.clientY })
    const point = { ...flowPoint, pressure: event.pressure || 0.5 }
    if (tool === 'eraser') eraseAtPoint(flowPoint)
    setDrawingPoints([localPoint])
    drawingFlowPointsRef.current = [point]
  }, [drawOverlayEnabled, eraseAtPoint, pushHistory, screenToFlowPosition, tool])

  const handleDrawingPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
    const bounds = event.currentTarget.getBoundingClientRect()
    const pressure = event.pressure || 0.5
    const localPoint = { x: event.clientX - bounds.left, y: event.clientY - bounds.top, pressure }
    const flowPosition = screenToFlowPosition({ x: event.clientX, y: event.clientY })
    const flowPoint = { ...flowPosition, pressure }

    if (tool === 'eraser') {
      eraseAtPoint(flowPoint)
      return
    }

    const nextLocalPoints = [...drawingPoints, localPoint]
    drawingFlowPointsRef.current = [...drawingFlowPointsRef.current, flowPoint]
    setDrawingPoints(nextLocalPoints)
    const outline = getFreehandOutline(nextLocalPoints, activeBrushStyle)
    setPreviewPath(getSvgPathFromStroke(outline))
  }, [activeBrushStyle, drawingPoints, eraseAtPoint, screenToFlowPosition, tool])

  const handleDrawingPointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
    event.currentTarget.releasePointerCapture(event.pointerId)
    if (tool !== 'eraser' && drawingFlowPointsRef.current.length > 0) {
      const completedPoints = drawingFlowPointsRef.current.map(point => ({ ...point }))
      const geometry = createFreehandGeometry(completedPoints, activeBrushStyle)
      if (geometry) {
        const drawingTool: 'pen' | 'highlighter' = tool === 'highlighter' ? 'highlighter' : 'pen'
        pushHistory()
        setNodes(current => [...current, {
          id: crypto.randomUUID(),
          type: 'freehand',
          position: { x: geometry.x, y: geometry.y },
          width: geometry.width,
          height: geometry.height,
          connectable: false,
          data: {
            points: completedPoints,
            path: geometry.path,
            width: geometry.width,
            height: geometry.height,
            color: activeBrushColor,
            opacity: tool === 'highlighter' ? 0.28 : 1,
            strokeWidth: activeBrushStyle.size,
            drawingTool,
          },
        }])
      }
    }
    setDrawingPoints([])
    drawingFlowPointsRef.current = []
    setPreviewPath('')
  }, [activeBrushColor, activeBrushStyle, pushHistory, setNodes, tool])

  const persistViewport = useCallback((viewport: CanvasDocument['viewport']) => {
    if (!document) return
    if (pendingDocumentTimerRef.current) clearTimeout(pendingDocumentTimerRef.current)
    pendingDocumentTimerRef.current = null
    const nextDocument: CanvasDocument = {
      ...(pendingDocumentRef.current || document),
      nodes: serializeNodes(nodes),
      edges: serializeEdges(edges),
      viewport,
    }
    pendingDocumentRef.current = null
    lastStoreDocumentRef.current = nextDocument
    updateDocument(canvasId, nextDocument)
  }, [canvasId, document, edges, nodes, updateDocument])

  const tools = useMemo(() => [
    { value: 'select', label: t('tools.select'), icon: MousePointer2 },
    { value: 'hand', label: t('tools.hand'), icon: Hand },
    { value: 'pen', label: t('tools.pen'), icon: Pencil },
    { value: 'highlighter', label: t('tools.highlighter'), icon: Highlighter },
    { value: 'eraser', label: t('tools.eraser'), icon: Eraser },
  ] as const, [t])

  if (!document) {
    return <div className="flex size-full items-center justify-center text-sm text-muted-foreground">{t('loading')}</div>
  }

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      className="flex size-full min-h-0 flex-col bg-background outline-none"
      style={document.settings.backgroundColor ? { backgroundColor: document.settings.backgroundColor } : undefined}
    >
      <div
        className="relative min-h-0 flex-1 overflow-hidden"
        onPointerDownCapture={event => {
          if (!isInteractiveCanvasTarget(event.target)) {
            containerRef.current?.focus({ preventScroll: true })
          }
        }}
      >
        <ContextMenu onOpenChange={open => { if (!open) setContextTarget('pane') }}>
          <ContextMenuTrigger asChild>
            <div
              className="size-full"
              onContextMenu={event => {
                if (!suppressContextMenuRef.current) return
                event.preventDefault()
                event.stopPropagation()
                suppressContextMenuRef.current = false
              }}
              onDragOver={handleCanvasDragOver}
              onDrop={handleCanvasDrop}
              onPointerDownCapture={handleBlockDrawPointerDown}
              onPointerMove={handleBlockDrawPointerMove}
              onPointerUp={handleBlockDrawPointerUp}
              onPointerCancel={handleBlockDrawPointerCancel}
            >
              <ReactFlow
        className={cn(
          tool === 'select' && '[&_.react-flow__pane]:!cursor-default [&_.react-flow__node.relation-target-active]:!ring-2 [&_.react-flow__node.relation-target-active]:!ring-primary [&_.react-flow__node.relation-target-active]:!ring-offset-2 [&_.react-flow__node.relation-target-active]:!ring-offset-background',
          tool === 'hand' && '[&_.react-flow__node]:!cursor-grab [&_.react-flow__node:active]:!cursor-grabbing [&_.react-flow__pane]:!cursor-grab [&_.react-flow__pane.dragging]:!cursor-grabbing'
        )}
        nodes={displayNodes}
        edges={displayEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChangeTracked}
        onConnect={onConnect}
        onNodeContextMenu={(_event, targetNode) => {
          setContextTarget('node')
          if (!targetNode.selected) {
            setNodes(current => current.map(node => ({ ...node, selected: node.id === targetNode.id })))
            setEdges(current => current.map(edge => ({ ...edge, selected: false })))
          }
        }}
        onEdgeContextMenu={(event, targetEdge) => {
          const relation = targetEdge.data as CanvasRelationData | undefined
          if (relation) {
            event.preventDefault()
            event.stopPropagation()
            setNodes(current => current.map(node => ({ ...node, selected: false })))
            setEdges(current => current.map(edge => ({ ...edge, selected: edge.id === targetEdge.id })))
            const root = containerRef.current
            const bounds = root?.getBoundingClientRect()
            const source = nodes.find(node => node.id === targetEdge.source)
            const target = nodes.find(node => node.id === targetEdge.target)
            const sourceWidth = source?.measured?.width ?? source?.width ?? 0
            const sourceHeight = source?.measured?.height ?? source?.height ?? 0
            const targetWidth = target?.measured?.width ?? target?.width ?? 0
            const targetHeight = target?.measured?.height ?? target?.height ?? 0
            const suggestedWaypoint = source && target ? {
              x: (source.position.x + sourceWidth / 2 + target.position.x + targetWidth / 2) / 2,
              y: (source.position.y + sourceHeight / 2 + target.position.y + targetHeight / 2) / 2,
            } : screenToFlowPosition({ x: event.clientX, y: event.clientY })
            setRelationEditor({
              edgeId: targetEdge.id,
              mode: 'edit',
              anchor: { x: event.clientX - (bounds?.left || 0), y: event.clientY - (bounds?.top || 0) },
              suggestedWaypoint,
            })
            return
          }
          setContextTarget('edge')
          if (!targetEdge.selected) {
            setNodes(current => current.map(node => ({ ...node, selected: false })))
            setEdges(current => current.map(edge => ({ ...edge, selected: edge.id === targetEdge.id })))
          }
        }}
        onEdgeDoubleClick={(event, targetEdge) => {
          const relation = targetEdge.data as CanvasRelationData | undefined
          if (relation) {
            const root = containerRef.current
            const bounds = root?.getBoundingClientRect()
            setRelationEditor({
              edgeId: targetEdge.id,
              mode: 'edit',
              anchor: { x: event.clientX - (bounds?.left || 0), y: event.clientY - (bounds?.top || 0) },
              suggestedWaypoint: screenToFlowPosition({ x: event.clientX, y: event.clientY }),
            })
            return
          }
          setEditingEdgeId(targetEdge.id)
          setEdgeLabelDraft(typeof targetEdge.label === 'string' ? targetEdge.label : '')
          setEdgeEditorOpen(true)
        }}
        onPaneContextMenu={() => setContextTarget('pane')}
        onMoveEnd={(_event, viewport) => persistViewport(viewport)}
        onNodeDragStart={(_event, node) => {
          pushHistory()
          if (node.type !== 'group' || !Array.isArray(node.data.childIds)) return
          const childIds = new Set(node.data.childIds.filter((id): id is string => typeof id === 'string'))
          groupDragRef.current = {
            groupId: node.id,
            start: { ...node.position },
            children: new Map(nodes.filter(item => childIds.has(item.id)).map(item => [item.id, { ...item.position }])),
          }
        }}
        onNodeDrag={(_event, node) => {
          const drag = groupDragRef.current
          if (!drag || drag.groupId !== node.id) return
          const delta = { x: node.position.x - drag.start.x, y: node.position.y - drag.start.y }
          setNodes(current => current.map(item => {
            const start = drag.children.get(item.id)
            return start ? { ...item, position: { x: start.x + delta.x, y: start.y + delta.y } } : item
          }))
        }}
        onNodeDragStop={() => { groupDragRef.current = null }}
        deleteKeyCode={null}
        nodesDraggable={!previewSnapshot && tool === 'select'}
        nodesConnectable={!previewSnapshot && (tool === 'select' || tool === 'connector')}
        elementsSelectable={!previewSnapshot && tool === 'select'}
        panOnDrag={[1]}
        selectionOnDrag={false}
        selectionMode={SelectionMode.Partial}
        snapToGrid={document.settings.snapToGrid}
        snapGrid={[20, 20]}
        defaultViewport={document.viewport}
        onlyRenderVisibleElements={nodes.length >= 150}
        colorMode="system"
        >
          {document.settings.showGrid && (
            <Background
              variant={BackgroundVariant.Dots}
              gap={22}
              size={1.35}
              color="hsl(var(--muted-foreground))"
            />
          )}
          <MiniMap pannable zoomable />
              </ReactFlow>
              {drawDraft && (() => {
                const rect = normalizeDrawRect(drawDraft.start, drawDraft.current)
                const bounds = containerRef.current?.getBoundingClientRect()
                return (
                  <div
                    className="pointer-events-none absolute rounded-xl border-2 border-primary/70 bg-primary/10 shadow-[0_0_0_1px_rgba(255,255,255,0.5)_inset]"
                    style={{
                      left: rect.x - (bounds?.left || 0),
                      top: rect.y - (bounds?.top || 0),
                      width: rect.width,
                      height: rect.height,
                    }}
                  />
                )
              })()}
              {marqueePreview?.active && (() => {
                const rect = normalizeDrawRect(marqueePreview.start, marqueePreview.current)
                const bounds = containerRef.current?.getBoundingClientRect()
                return (
                  <div
                    className="pointer-events-none absolute rounded-md border border-primary/80 bg-primary/10 shadow-[0_0_0_1px_hsl(var(--primary)/0.18)]"
                    style={{
                      left: rect.x - (bounds?.left || 0),
                      top: rect.y - (bounds?.top || 0),
                      width: rect.width,
                      height: rect.height,
                    }}
                  />
                )
              })()}
              {relationPreview?.active && (
                <svg className="pointer-events-none absolute inset-0 size-full overflow-visible">
                  <path
                    d={relationPreviewPath(
                      {
                        x: relationPreview.start.x - (containerRef.current?.getBoundingClientRect().left || 0),
                        y: relationPreview.start.y - (containerRef.current?.getBoundingClientRect().top || 0),
                      },
                      {
                        x: relationPreview.current.x - (containerRef.current?.getBoundingClientRect().left || 0),
                        y: relationPreview.current.y - (containerRef.current?.getBoundingClientRect().top || 0),
                      },
                    )}
                    fill="none"
                    stroke="var(--primary)"
                    strokeWidth="2.25"
                    strokeDasharray="7 6"
                    strokeLinecap="round"
                    style={{ filter: 'drop-shadow(0 0 5px hsl(var(--primary) / 0.45))' }}
                  />
                </svg>
              )}
              {relationEditor && (() => {
                const edge = edges.find(item => item.id === relationEditor.edgeId)
                const initial = (edge?.data as CanvasRelationData | undefined) || DEFAULT_RELATION
                return (
                  <div
                    className="absolute z-30"
                    style={{ left: relationEditor.anchor.x, top: relationEditor.anchor.y, transform: 'translate(-50%, -50%)' }}
                  >
                    <CanvasRelationEditor
                      initial={initial}
                      mode={relationEditor.mode}
                      suggestedWaypoint={relationEditor.suggestedWaypoint}
                      onSave={saveRelationEditor}
                      onCancel={cancelRelationEditor}
                    />
                  </div>
                )
              })()}
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent>
            {contextTarget === 'node' && selectedStyleNode && (
              <CanvasNodeStyleMenu
                value={{
                  backgroundColor: selectedStyleNode.data.backgroundColor as string | undefined ?? selectedStyleNode.data.fillColor as string | undefined,
                  textColor: selectedStyleNode.data.textColor as string | undefined,
                  fontSize: selectedStyleNode.data.fontSize as 13 | 15 | 18 | 24 | undefined,
                  borderColor: selectedStyleNode.data.borderColor as string | undefined ?? selectedStyleNode.data.color as string | undefined,
                  borderStyle: selectedStyleNode.data.borderStyle as 'none' | 'solid' | 'dashed' | 'dotted' | undefined,
                }}
                onSessionStart={pushHistory}
                onChange={applySelectedNodeStylePatch}
              />
            )}
            {contextTarget === 'node' && <ContextMenuSeparator />}
            {contextTarget === 'pane' && (
              <ContextMenuGroup>
                <ContextMenuItem onSelect={() => setTool('select')}>选择模式</ContextMenuItem>
                <ContextMenuItem onSelect={() => setTool('pen')}>画笔模式</ContextMenuItem>
                <ContextMenuItem onSelect={() => setTool('highlighter')}>荧光笔模式</ContextMenuItem>
                <ContextMenuItem onSelect={() => setTool('eraser')}>橡皮擦模式</ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem onSelect={() => updateCanvasBackground('#ffffff')}>浅色画布</ContextMenuItem>
                <ContextMenuItem onSelect={() => updateCanvasBackground('#0f172a')}>深色画布</ContextMenuItem>
                <ContextMenuItem onSelect={() => updateCanvasBackground(undefined)}>跟随主题</ContextMenuItem>
              </ContextMenuGroup>
            )}
            {contextTarget === 'pane' && selectedCount > 0 && (
              <>
                <ContextMenuSeparator />
                <ContextMenuGroup>
                  <ContextMenuItem variant="destructive" onSelect={deleteSelection}>
                    <Trash2 />
                    {t('contextMenu.delete')}
                    <ContextMenuShortcut>⌫</ContextMenuShortcut>
                  </ContextMenuItem>
                </ContextMenuGroup>
              </>
            )}
            {contextTarget !== 'pane' && <ContextMenuGroup>
              <ContextMenuItem onSelect={selectAll}>
                {t('contextMenu.selectAll')}
                <ContextMenuShortcut>{shortcutModifier}A</ContextMenuShortcut>
              </ContextMenuItem>
              <ContextMenuItem disabled={selectedNodeCount === 0} onSelect={copySelection}>
                <Copy />
                {t('contextMenu.copy')}
                <ContextMenuShortcut>{shortcutModifier}C</ContextMenuShortcut>
              </ContextMenuItem>
              <ContextMenuItem disabled={!hasClipboard} onSelect={pasteSelection}>
                <ClipboardPaste />
                {t('contextMenu.paste')}
                <ContextMenuShortcut>{shortcutModifier}V</ContextMenuShortcut>
              </ContextMenuItem>
              <ContextMenuItem disabled={selectedNodeCount === 0} onSelect={duplicateSelection}>
                <CopyPlus />
                {t('contextMenu.duplicate')}
                <ContextMenuShortcut>{shortcutModifier}D</ContextMenuShortcut>
              </ContextMenuItem>
            </ContextMenuGroup>}
            {contextTarget !== 'pane' && <ContextMenuSeparator />}
            {contextTarget !== 'pane' && <ContextMenuGroup>
              <ContextMenuItem disabled={selectedNodeCount === 0} onSelect={() => updateSelectedNodeLayer('front')}>
                {t('layer.front')}
              </ContextMenuItem>
              <ContextMenuItem disabled={selectedNodeCount === 0} onSelect={() => updateSelectedNodeLayer('forward')}>
                {t('layer.forward')}
              </ContextMenuItem>
              <ContextMenuItem disabled={selectedNodeCount === 0} onSelect={() => updateSelectedNodeLayer('backward')}>
                {t('layer.backward')}
              </ContextMenuItem>
              <ContextMenuItem disabled={selectedNodeCount === 0} onSelect={() => updateSelectedNodeLayer('back')}>
                {t('layer.back')}
              </ContextMenuItem>
            </ContextMenuGroup>}
            {contextTarget !== 'pane' && <ContextMenuSeparator />}
            {contextTarget !== 'pane' && <ContextMenuGroup>
              <ContextMenuItem variant="destructive" disabled={selectedCount === 0} onSelect={deleteSelection}>
                <Trash2 />
                {t('contextMenu.delete')}
                <ContextMenuShortcut>⌫</ContextMenuShortcut>
              </ContextMenuItem>
            </ContextMenuGroup>}
          </ContextMenuContent>
        </ContextMenu>

        {previewSnapshot && (
          <Badge variant="secondary" className="absolute left-1/2 top-16 -translate-x-1/2 shadow-sm">
            {t('aiPreview')}
          </Badge>
        )}

        <div className="absolute left-1/2 top-3 z-10 flex -translate-x-1/2 items-center gap-2 rounded-lg border bg-background p-1 shadow-sm">
          <div role="toolbar" aria-label={t('tools.label')} className="flex items-center gap-0.5">
            {tools.map(item => (
              <Tooltip key={item.value}>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={item.label}
                    aria-pressed={tool === item.value}
                    className={cn(
                      tool === item.value
                      && '!bg-primary !text-primary-foreground shadow-sm hover:!bg-primary/90 hover:!text-primary-foreground'
                    )}
                    onClick={() => setTool(item.value)}
                  >
                    <item.icon />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">{item.label}</TooltipContent>
              </Tooltip>
            ))}
          </div>

          <CanvasToolbarTooltip label={t('nodes.note')}>
            <Button variant="ghost" size="icon-sm" aria-label={t('nodes.note')} onClick={() => setNotePickerOpen(true)}>
              <FileText />
            </Button>
          </CanvasToolbarTooltip>
          <CanvasToolbarTooltip label={t('nodes.image')}>
            <Button variant="ghost" size="icon-sm" aria-label={t('nodes.image')} onClick={() => void addImageNode()}>
              <ImagePlus />
            </Button>
          </CanvasToolbarTooltip>
          <Popover>
            <CanvasToolbarTooltip label={t('arrange.title')} disabled={selectedNodeCount < 2}>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label={t('arrange.title')} disabled={selectedNodeCount < 2}>
                  <FolderKanban />
                </Button>
              </PopoverTrigger>
            </CanvasToolbarTooltip>
            <PopoverContent align="center" className="w-56">
              <PopoverHeader>
                <PopoverTitle>{t('arrange.title')}</PopoverTitle>
                <PopoverDescription>{t('arrange.description')}</PopoverDescription>
              </PopoverHeader>
              <div className="flex flex-col gap-1">
                <Button variant="ghost" className="justify-start" onClick={() => alignSelection('horizontal')}><AlignCenterHorizontal data-icon="inline-start" />{t('arrange.alignHorizontal')}</Button>
                <Button variant="ghost" className="justify-start" onClick={() => alignSelection('vertical')}><AlignCenterVertical data-icon="inline-start" />{t('arrange.alignVertical')}</Button>
                <Button variant="ghost" className="justify-start" disabled={selectedNodeCount < 3} onClick={() => distributeSelection('horizontal')}><AlignHorizontalDistributeCenter data-icon="inline-start" />{t('arrange.distributeHorizontal')}</Button>
                <Button variant="ghost" className="justify-start" disabled={selectedNodeCount < 3} onClick={() => distributeSelection('vertical')}><AlignVerticalDistributeCenter data-icon="inline-start" />{t('arrange.distributeVertical')}</Button>
                <Button variant="ghost" className="justify-start" onClick={groupSelection}><FolderKanban data-icon="inline-start" />{t('arrange.group')}</Button>
              </div>
            </PopoverContent>
          </Popover>
          {selectedEdgeCount > 0 && (
            <Popover>
              <CanvasToolbarTooltip label={t('edge.title')}>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon-sm" aria-label={t('edge.title')}><Route /></Button>
                </PopoverTrigger>
              </CanvasToolbarTooltip>
              <PopoverContent align="center" className="w-52">
                <PopoverHeader>
                  <PopoverTitle>{t('edge.title')}</PopoverTitle>
                  <PopoverDescription>{t('edge.description')}</PopoverDescription>
                </PopoverHeader>
                <div className="flex flex-col gap-1">
                  <Button variant="ghost" className="justify-start" onClick={() => updateSelectedEdges('smoothstep')}>{t('edge.orthogonal')}</Button>
                  <Button variant="ghost" className="justify-start" onClick={() => updateSelectedEdges('straight')}>{t('edge.straight')}</Button>
                  <Button variant="ghost" className="justify-start" onClick={() => updateSelectedEdges('default')}>{t('edge.curve')}</Button>
                  <Button variant="ghost" className="justify-start" onClick={editSelectedEdgeLabel}>{t('edge.editLabel')}</Button>
                </div>
              </PopoverContent>
            </Popover>
          )}
        </div>

        {(isDrawingTool || selectedOnlyFreehand) && (
          <Card className="absolute bottom-3 left-3 z-10 w-64 gap-3 py-3 shadow-sm">
            <CardHeader className="px-3">
              <CardTitle className="text-sm">
                {isDrawingTool
                  ? t(brushPanelIsHighlighter ? 'brush.highlighterTitle' : 'brush.penTitle')
                  : t('brush.strokeTitle')}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 px-3">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-muted-foreground">{t('brush.color')}</span>
                <label
                  className="relative size-8 cursor-pointer overflow-hidden rounded-full border shadow-sm"
                  style={{ backgroundColor: brushPanelColor }}
                >
                  <Input
                    type="color"
                    value={brushPanelColor}
                    aria-label={t('brush.color')}
                    onChange={event => {
                      if (!isDrawingTool) {
                        updateSelectedFreehandColor(event.target.value)
                      } else if (brushPanelIsHighlighter) {
                        setHighlighterColor(event.target.value)
                      } else {
                        setPenColor(event.target.value)
                      }
                    }}
                    className="absolute inset-0 size-full cursor-pointer appearance-none opacity-0"
                  />
                </label>
              </div>
              <div className="flex flex-col gap-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{t('brush.size')}</span>
                  <span>{brushPanelWidth}px</span>
                </div>
                <Slider
                  min={brushPanelIsHighlighter ? 8 : 1}
                  max={brushPanelIsHighlighter ? 64 : 32}
                  step={1}
                  value={[brushPanelWidth]}
                  onValueChange={value => {
                    const size = value[0] ?? brushPanelWidth
                    if (!isDrawingTool) {
                      if (!freehandWidthHistoryRef.current) {
                        pushHistory()
                        freehandWidthHistoryRef.current = true
                      }
                      setSelectedStrokeWidth(size)
                      updateSelectedFreehandWidth(size, false)
                    } else if (brushPanelIsHighlighter) {
                      setHighlighterSize(size)
                    } else {
                      setPenSize(size)
                    }
                  }}
                  onValueCommit={() => {
                    if (!isDrawingTool) freehandWidthHistoryRef.current = false
                  }}
                  aria-label={t('brush.size')}
                />
              </div>
            </CardContent>
          </Card>
        )}

        {!isDrawingTool && selectedNodeCount > 0 && !selectedOnlyFreehand && (
          <Card className="absolute bottom-3 left-3 z-10 w-64 gap-3 py-3 shadow-sm">
            <CardHeader className="px-3">
              <CardTitle className="text-sm">{t('selection.style')}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 px-3">
              <div className="flex flex-col gap-2 text-sm">
                <span className="text-muted-foreground">{t('selection.color')}</span>
                <div className="grid grid-cols-7 gap-1.5">
                  {['#64748b', '#3b82f6', '#8b5cf6', '#22c55e', '#f59e0b', '#ef4444'].map(color => (
                    <button key={color} type="button" aria-label={color} className="size-7 rounded-full border shadow-sm" style={{ backgroundColor: color }} onClick={() => updateSelectedNodeColor(color)} />
                  ))}
                  <label
                    className="relative flex size-7 cursor-pointer items-center justify-center overflow-hidden rounded-full border bg-[conic-gradient(#ef4444,#f59e0b,#22c55e,#3b82f6,#8b5cf6,#ef4444)] shadow-sm"
                    aria-label={t('selection.customColor')}
                  >
                    <Palette className="relative size-3.5 text-white drop-shadow-sm" aria-hidden="true" />
                    <Input
                      type="color"
                      value={customNodeColor}
                      aria-label={t('selection.customColor')}
                      onChange={event => {
                        setCustomNodeColor(event.target.value)
                        updateSelectedNodeColor(event.target.value)
                      }}
                      className="absolute inset-0 size-full cursor-pointer appearance-none opacity-0"
                    />
                  </label>
                </div>
              </div>
              {selectedBoxNode && <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-muted-foreground">{t('selection.border')}</span>
                <ToggleGroup
                  type="single"
                  variant="outline"
                  size="sm"
                  spacing={0}
                  value={selectedBorderStyle}
                  onValueChange={value => {
                    if (value === 'solid' || value === 'dashed' || value === 'dotted') {
                      updateSelectedNodeStyle({ borderStyle: value })
                    }
                  }}
                >
                  <ToggleGroupItem value="solid">{t('selection.solid')}</ToggleGroupItem>
                  <ToggleGroupItem value="dashed">{t('selection.dashed')}</ToggleGroupItem>
                  <ToggleGroupItem value="dotted">{t('selection.dotted')}</ToggleGroupItem>
                </ToggleGroup>
              </div>}
              {selectedBoxNode && <div className="flex flex-col gap-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{t('selection.borderWidth')}</span>
                  <span>{selectedNodeBorderWidth}px</span>
                </div>
                <Slider
                  min={1}
                  max={4}
                  step={1}
                  value={[selectedNodeBorderWidth]}
                  onValueChange={value => setSelectedNodeBorderWidth(value[0] ?? 1)}
                  onValueCommit={value => updateSelectedNodeStyle({ borderWidth: value[0] ?? 1 })}
                  aria-label={t('selection.borderWidth')}
                />
              </div>}
              {selectedBoxNode && <div className="flex flex-col gap-2 text-sm">
                <span className="text-muted-foreground">{t('selection.fill')}</span>
                <div className="grid grid-cols-7 gap-1.5">
                  <button
                    type="button"
                    aria-label={t('selection.transparent')}
                    className={cn(
                      'flex size-7 items-center justify-center rounded-full border bg-card text-muted-foreground shadow-sm',
                      selectedFillColor === 'transparent' && 'ring-2 ring-ring ring-offset-1 ring-offset-background'
                    )}
                    onClick={() => updateSelectedNodeStyle({ fillColor: 'transparent', fillStyle: undefined })}
                  >
                    <CircleSlash2 className="size-4" aria-hidden="true" />
                  </button>
                  {['#ffffff', '#e2e8f0', '#dbeafe', '#ede9fe', '#dcfce7'].map(color => (
                    <button
                      key={color}
                      type="button"
                      aria-label={color}
                      className={cn(
                        'size-7 rounded-full border shadow-sm',
                        selectedFillColor === color && 'ring-2 ring-ring ring-offset-1 ring-offset-background'
                      )}
                      style={{ backgroundColor: color }}
                      onClick={() => updateSelectedNodeStyle({ fillColor: color, fillStyle: undefined })}
                    />
                  ))}
                  <label
                    className={cn(
                      'relative flex size-7 cursor-pointer items-center justify-center overflow-hidden rounded-full border bg-[conic-gradient(#ef4444,#f59e0b,#22c55e,#3b82f6,#8b5cf6,#ef4444)] shadow-sm',
                      selectedFillColor === customFillColor && 'ring-2 ring-ring ring-offset-1 ring-offset-background'
                    )}
                    aria-label={t('selection.customFill')}
                  >
                    <Palette className="relative size-3.5 text-white drop-shadow-sm" aria-hidden="true" />
                    <Input
                      type="color"
                      value={customFillColor}
                      aria-label={t('selection.customFill')}
                      onChange={event => {
                        setCustomFillColor(event.target.value)
                        updateSelectedNodeStyle({ fillColor: event.target.value, fillStyle: undefined })
                      }}
                      className="absolute inset-0 size-full cursor-pointer appearance-none opacity-0"
                    />
                  </label>
                </div>
              </div>}
            </CardContent>
          </Card>
        )}

        {drawOverlayEnabled && (
          <div
            className="absolute inset-0 touch-none"
            style={{ cursor: DRAWING_CURSORS[tool as keyof typeof DRAWING_CURSORS] }}
            onPointerDown={handleDrawingPointerDown}
            onPointerMove={handleDrawingPointerMove}
            onPointerUp={handleDrawingPointerUp}
            onPointerCancel={handleDrawingPointerUp}
          >
            {previewPath && (
              <svg className="pointer-events-none size-full overflow-visible">
                <path d={previewPath} fill={activeBrushColor} fillOpacity={tool === 'highlighter' ? 0.28 : 1} />
              </svg>
            )}
          </div>
        )}
      </div>

      <CanvasFooter
        showGrid={document.settings.showGrid}
        snapToGrid={document.settings.snapToGrid}
        zoom={viewport.zoom}
        onToggleGrid={() => updateCanvasSettings({ showGrid: !document.settings.showGrid })}
        onToggleSnap={() => updateCanvasSettings({ snapToGrid: !document.settings.snapToGrid })}
        onZoomChange={zoom => void setViewport({ ...getViewport(), zoom }, { duration: 120 })}
        onFitView={() => void fitView({ padding: 0.2, duration: 300 })}
        onLayout={() => void layoutNodes()}
        onImportFile={() => void importCanvasFile()}
        onImportContent={() => setImportContentOpen(true)}
      />

      <Dialog open={notePickerOpen} onOpenChange={setNotePickerOpen}>
        <DialogContent className="p-0 sm:max-w-lg">
          <DialogHeader className="px-4 pt-4">
            <DialogTitle>{t('noteNode.title')}</DialogTitle>
            <DialogDescription>{t('noteNode.description')}</DialogDescription>
          </DialogHeader>
          <Command className="border-t">
            <CommandInput placeholder={t('noteNode.search')} />
            <CommandList>
              <CommandEmpty>{t('noteNode.empty')}</CommandEmpty>
              <CommandGroup heading={t('noteNode.group')}>
                {availableNotes.map(note => (
                  <CommandItem
                    key={note.path}
                    value={`${note.name} ${note.path}`}
                    onSelect={() => addNoteNode(note.path, note.name)}
                  >
                    <FileText />
                    <span className="min-w-0 flex-1 truncate">{note.name}</span>
                    <span className="max-w-48 truncate text-xs text-muted-foreground">{note.path}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>

      <Dialog open={edgeEditorOpen} onOpenChange={setEdgeEditorOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('edge.editLabel')}</DialogTitle>
            <DialogDescription>{t('edge.labelDescription')}</DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            value={edgeLabelDraft}
            onChange={event => setEdgeLabelDraft(event.target.value)}
            onKeyDown={event => { if (event.key === 'Enter') saveEdgeLabel() }}
            placeholder={t('edge.labelPrompt')}
          />
          <Button onClick={saveEdgeLabel}>{t('edge.saveLabel')}</Button>
        </DialogContent>
      </Dialog>

      <Dialog open={importContentOpen} onOpenChange={setImportContentOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('footer.import.contentTitle')}</DialogTitle>
            <DialogDescription>{t('footer.import.contentDescription')}</DialogDescription>
          </DialogHeader>
          <Textarea
            autoFocus
            value={importContentDraft}
            onChange={event => setImportContentDraft(event.target.value)}
            placeholder={t('footer.import.contentPlaceholder')}
            className="min-h-64 resize-y font-mono text-xs"
          />
          <Button disabled={!importContentDraft.trim()} onClick={importCanvasContent}>
            {t('footer.import.confirm')}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export function CanvasEditor(props: CanvasEditorProps) {
  return (
    <ReactFlowProvider>
      <CanvasEditorInner {...props} />
    </ReactFlowProvider>
  )
}
