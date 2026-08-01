'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactElement } from 'react'
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
  type Connection,
  type Edge,
  type EdgeChange,
  type EdgeTypes,
  type NodeChange,
  type NodeTypes,
  MarkerType,
  Panel,
  SelectionMode,
} from '@xyflow/react'
import ELK from 'elkjs/lib/elk.bundled.js'
import type { ElkNode } from 'elkjs/lib/elk-api'
import { open } from '@tauri-apps/plugin-dialog'
import { mkdir, readFile, readTextFile, remove, writeFile } from '@tauri-apps/plugin-fs'
import { appDataDir, join } from '@tauri-apps/api/path'
import { assertWorkspaceAttachmentWriteAllowed } from '@/lib/recovery/startup-recovery'
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
  LocateFixed,
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
import useMarkStore from '@/stores/mark'
import { getAllMarks } from '@/db/marks'
import type {
  CanvasDocument,
  CanvasEdge,
  CanvasHistorySnapshot,
  CanvasNode,
  CanvasNodeType,
  CanvasPoint,
  CanvasTool,
  CanvasRelationData,
  CanvasRelationWaypoint,
  CanvasViewport,
} from '@/types/canvas'
import { flattenFileTree } from '@/app/core/main/file/file-selection'
import { applyCanvasOperations } from '@/lib/canvas/operations'
import {
  clearCanvasAiRuntimeSnapshot,
  publishCanvasAiRuntimeSnapshot,
} from '@/lib/canvas/ai-transaction'
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
import { PdfCanvasNode } from './nodes/pdf-canvas-node'
import { VideoCanvasNode } from './nodes/video-canvas-node'
import { WebPreviewCanvasNode } from './nodes/web-preview-canvas-node'
import { CanvasFooter } from './canvas-footer'
import { CanvasNodeStyleMenu } from './canvas-node-style-menu'
import { CanvasGeometryOverlays } from './canvas-geometry-overlays'
import { CanvasAiOverlay } from './canvas-ai-overlay'
import { CanvasLinearView } from './canvas-linear-view'
import {
  planEvidenceFocusViewport,
  recordCanvasViewportSnapshot,
  type EvidenceFocus,
} from '@/lib/canvas/evidence-navigation'
import { markCanvasEvidenceRuntimeReady } from '@/lib/canvas/evidence-navigation-runtime'
import {
  animateCanvasViewportState,
  initializeCanvasViewportState,
  publishCanvasViewportState,
  useCanvasViewportState,
} from '@/stores/canvas-view'
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
  RELATION_DRAG_THRESHOLD,
  relationSourceSideFromVector,
  type CanvasRect,
  type RelationSide,
} from '@/lib/canvas/gesture-policy'
import { resolveTextResize } from '@/lib/canvas/text-node-sizing'
import {
  appendPointerSample,
  inertiaProgress,
  planNodeInertia,
  releaseVelocity,
  type PointerSample,
} from '@/lib/canvas/node-inertia'
import {
  armContextMenuSuppression,
  canStartRelationGesture,
  commitRelationEditorTransaction,
  consumeContextMenuSuppression,
  createPendingRelationEdge,
  selectSourceRelationHandle,
  selectTargetRelationHandle,
  type ContextMenuSuppressionState,
} from '@/lib/canvas/relation-interaction'
import {
  canvasFontSizeForScreenInput,
  draftsFromTransfer,
  materializeIngestDraft,
  screenFontSizeForCanvasFont,
  stackIngestDrafts,
  transferUrlChoice,
  type CanvasTransferInput,
} from '@/lib/canvas/content-ingest'
import {
  captureViewportSnapshot,
  contentScaleForZoom,
  MAX_CANVAS_ZOOM,
  MIN_CANVAS_ZOOM,
  screenDistanceToCanvas,
  screenPointToCanvas,
  screenSizeToCanvas,
  resolveZoomAwareTextDrawRect,
  type ViewportSnapshot,
} from '@/lib/canvas/viewport-sizing'
import {
  conflicts,
  isSolidCanvasNode,
  resolveActiveEdgeSnap,
  scoreLegacyConflicts,
  sweepRigidSet,
  thresholdsForSnapshot,
  type ActiveEdgeSnapState,
  type CollisionEntity,
  type LegacyConflictScore,
} from '@/lib/canvas/collision-policy'
import { CanvasSpatialIndex } from '@/lib/canvas/spatial-index'
import { findNearestFreePlacement } from '@/lib/canvas/placement-policy'
import { canvasNodeContentRevision } from '@/lib/canvas/canvas-index-jobs'
import {
  enqueueCanvasImageRecognition,
  useCanvasImageRecognitionStore,
} from '@/stores/canvas-image-recognition'
import useCanvasImageTagsStore, {
  clearCanvasImageTagFilter,
  initCanvasImageTags,
  mergeCanvasImageTagsFromNodes,
  registerCanvasImageTags,
  setCanvasImageTagFilter,
  stepCanvasImageTagMatch,
} from '@/stores/canvas-image-tags'
import { normalizeImageTags, orderedMatchingImageIds } from '@/lib/canvas/image-tags'
import { minimapNodeColor } from '@/lib/canvas/minimap'
import useSettingStore from '@/stores/setting'
import {
  mergeNoteReferenceMarks,
  NOTE_REFERENCE_MIME,
  noteReferenceId,
  planNoteReferenceDrop,
  planNoteReferencePlacement,
  refreshNoteReferences,
  type NoteReferenceAuthorityState,
  updateNoteReferenceAuthority,
} from '@/lib/canvas/note-reference'
import { CanvasImageInfo } from './canvas-image-info'
import { CanvasImageTagFilter } from './canvas-image-tag-filter'

const elk = new ELK()
const PLACEMENT_PREVIEW_MS = 120
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
  pdf: PdfCanvasNode,
  video: VideoCanvasNode,
  'web-preview': WebPreviewCanvasNode,
  file: FileCanvasNode,
  link: LinkCanvasNode,
  todo: TodoCanvasNode,
  group: GroupCanvasNode,
  freehand: FreehandNode,
}

interface CanvasEditorProps {
  canvasId: string
}

const EMPTY_IMAGE_TAGS: string[] = []

interface CanvasSnapshot {
  nodes: FlowCanvasNode[]
  edges: Edge[]
}

const TEXT_CAPABLE_NODE_TYPES = new Set<CanvasNodeType>([
  'process', 'decision', 'terminator', 'text', 'note', 'file', 'link', 'todo',
])

const edgeTypes: EdgeTypes = { relation: CanvasRelationEdge }

interface GeometrySessionBase {
  pointerId: number
  viewport: ViewportSnapshot
  indexVersion: number
  baselineDocumentRevision: number
  originalGeometry: Map<string, CanvasRect>
  lastAcceptedGeometry: Map<string, CanvasRect>
  baselineConflictPairs: Set<string>
  retainedPairMtd: Map<string, number>
  baselineScore: Pick<LegacyConflictScore, 'pairCount' | 'totalMtd'>
  controlledNodeIds: Set<string>
  collisionMemberIds: Set<string>
  historySnapshot: CanvasSnapshot
  invalid: boolean
}

type CanvasNodeVisualState = 'invalid' | 'legacy-conflict' | 'placement-preview'

interface CanvasSnapGuide {
  axis: 'x' | 'y'
  position: number
}

interface DrawGeometrySession extends GeometrySessionBase {
  kind: 'draw'
  start: { x: number; y: number }
  current: { x: number; y: number }
  candidate: CanvasRect | null
  snap: ActiveEdgeSnapState
}

interface DrawDraft extends DrawGeometrySession {
  viewport: ViewportSnapshot
}

interface ResizeGeometrySession extends GeometrySessionBase {
  kind: 'resize'
  nodeId: string
  snap: ActiveEdgeSnapState
}

interface MoveGeometrySession extends GeometrySessionBase {
  kind: 'move'
  activeNodeId: string
  samples: PointerSample[]
  inertiaFrame: number | null
}

type GeometrySession =
  | DrawGeometrySession
  | ResizeGeometrySession
  | MoveGeometrySession

interface PlacementPreview {
  nodes: FlowCanvasNode[]
  snapshot: ViewportSnapshot
  translation: { x: number; y: number }
}

interface GeometryUiState {
  drawDraft: DrawDraft | null
  snapGuides: CanvasSnapGuide[]
  legacyConflictIds: Set<string>
  nodeVisualStates: Map<string, CanvasNodeVisualState>
  placementPreview: PlacementPreview | null
}

interface RelationPointerSession {
  pointerId: number
  sourceId: string
  start: { x: number; y: number }
  current: { x: number; y: number }
  active: boolean
  targetId: string | null
  sourceHandle: string
  sourceSide: RelationSide | null
  targetHandle: string | null
  captureElement: HTMLDivElement
}

interface MarqueePointerSession {
  pointerId: number
  start: { x: number; y: number }
  current: { x: number; y: number }
  active: boolean
  captureElement: HTMLDivElement
}

interface RelationEditorState {
  edgeId: string
  mode: 'create' | 'edit'
  anchor: { x: number; y: number }
  suggestedWaypoint?: CanvasRelationWaypoint
  draft?: Edge
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

function expandGroupControlledNodeIds(
  nodes: FlowCanvasNode[],
  initialIds: Set<string>,
): Set<string> {
  const byId = new Map(nodes.map(node => [node.id, node]))
  const expanded = new Set<string>(initialIds)
  const queue = [...initialIds]
  while (queue.length > 0) {
    const node = byId.get(queue.shift()!)
    if (!node || node.type !== 'group' || !Array.isArray(node.data.childIds)) continue
    for (const childId of node.data.childIds) {
      if (typeof childId !== 'string' || !byId.has(childId) || expanded.has(childId)) continue
      expanded.add(childId)
      queue.push(childId)
    }
  }
  return expanded
}

function materializeSnapshotCopy(snapshot: CanvasSnapshot): CanvasSnapshot {
  const idMap = new Map(snapshot.nodes.map(node => [node.id, crypto.randomUUID()]))
  const nodes = snapshot.nodes.map(node => {
    const copy = structuredClone(node)
    const childIds = copy.type === 'group' && Array.isArray(copy.data.childIds)
      ? copy.data.childIds.flatMap(childId => {
        const mapped = idMap.get(childId)
        return mapped ? [mapped] : []
      })
      : undefined
    return {
      ...copy,
      id: idMap.get(node.id) || crypto.randomUUID(),
      data: childIds
        ? { ...copy.data, childIds }
        : copy.data,
    }
  })
  const edges = snapshot.edges.map(edge => ({
    ...structuredClone(edge),
    id: crypto.randomUUID(),
    source: idMap.get(edge.source) || edge.source,
    target: idMap.get(edge.target) || edge.target,
  }))
  return { nodes, edges }
}

function latestHistorySnapshot(
  nodesRef: { current: FlowCanvasNode[] },
  edgesRef: { current: Edge[] },
): CanvasSnapshot {
  return cloneSnapshot(nodesRef.current, edgesRef.current)
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

function screenRect(rect: DOMRect) {
  return { x: rect.left, y: rect.top, width: rect.width, height: rect.height }
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
    ...(edge.sourceHandle ? { sourceHandle: edge.sourceHandle } : {}),
    ...(edge.targetHandle ? { targetHandle: edge.targetHandle } : {}),
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
      || prior.sourceHandle !== edge.sourceHandle
      || prior.targetHandle !== edge.targetHandle
      || prior.label !== edge.label
      || prior.type !== edge.type
      || (prior.data !== edge.data && JSON.stringify(prior.data) !== JSON.stringify(edge.data))
  })
}

function nodeRect(node: FlowCanvasNode): CanvasRect | null {
  const width = node.width ?? node.measured?.width ?? (
    node.type === 'decision' ? 144
      : node.type === 'text' ? 120
        : node.type === 'image' ? 256
          : node.type === 'file' ? 320
            : node.type === 'note' || node.type === 'link' || node.type === 'todo' ? 208 : 160
  )
  const height = node.height ?? node.measured?.height ?? (
    node.type === 'decision' ? 144 : node.type === 'text' ? 40 : node.type === 'image' ? 192 : 56
  )
  if (![node.position.x, node.position.y, width, height].every(value => Number.isFinite(value))) return null
  if (width <= 0 || height <= 0) return null
  return { x: node.position.x, y: node.position.y, width, height }
}

function geometryForNodes(nodes: FlowCanvasNode[], ids?: Set<string>): Map<string, CanvasRect> {
  return new Map(nodes.flatMap(node => {
    if (ids && !ids.has(node.id)) return []
    const rect = nodeRect(node)
    return rect ? [[node.id, rect] as const] : []
  }))
}

function collisionEntities(nodes: FlowCanvasNode[]): CollisionEntity[] {
  return nodes.flatMap(node => {
    if (!isSolidCanvasNode(node as CanvasNode)) return []
    const rect = nodeRect(node)
    return rect ? [{ id: node.id, rect }] : []
  })
}

function applyGeometry(nodes: FlowCanvasNode[], geometry: Map<string, CanvasRect>): FlowCanvasNode[] {
  return nodes.map(node => {
    const rect = geometry.get(node.id)
    if (!rect) return node
    return {
      ...node,
      position: { x: rect.x, y: rect.y },
      width: rect.width,
      height: rect.height,
      style: { ...node.style, width: rect.width, height: rect.height },
    }
  })
}

interface GeometrySessionOutcome {
  pointerId: number
  shouldCommit: boolean
  geometry: Map<string, CanvasRect>
}

function executeGeometrySessionOutcome(input: {
  mode: 'cancel' | 'commit'
  session: GeometrySession
  authoritativeNodes: FlowCanvasNode[]
}): GeometrySessionOutcome {
  const { session } = input
  const shouldCommit = input.mode === 'commit' && session.kind !== 'draw'
  const geometry = shouldCommit
    ? session.lastAcceptedGeometry
    : session.kind === 'draw'
      ? new Map<string, CanvasRect>()
      : geometryForNodes(input.authoritativeNodes, session.controlledNodeIds)
  return { pointerId: session.pointerId, shouldCommit, geometry }
}

function geometryEqual(left: CanvasRect | undefined, right: CanvasRect | undefined): boolean {
  return Boolean(left && right)
    && left!.x === right!.x
    && left!.y === right!.y
    && left!.width === right!.width
    && left!.height === right!.height
}

function pairIdentity(ids: [string, string]): string {
  return ids[0] < ids[1] ? `${ids[0]}\u0000${ids[1]}` : `${ids[1]}\u0000${ids[0]}`
}

function conflictProfile(
  entities: CollisionEntity[],
  movingIds: Set<string>,
  thresholds: ReturnType<typeof thresholdsForSnapshot>,
  ignoreInternal: boolean,
) {
  const score = scoreLegacyConflicts({ entities, movingIds: [...movingIds], thresholds })
  if (!score.valid) return null
  const pairs = score.pairs.filter(pair => !ignoreInternal
    || !(movingIds.has(pair.ids[0]) && movingIds.has(pair.ids[1])))
  const totalMtd = Math.round((pairs.reduce((sum, pair) => sum + pair.mtd, 0) + Number.EPSILON) * 10_000) / 10_000
  return {
    pairCount: pairs.length,
    totalMtd,
    pairs: new Map(pairs.map(pair => [pairIdentity(pair.ids), pair.mtd])),
  }
}

function candidateConflictAccepted(
  session: GeometrySessionBase,
  entities: CollisionEntity[],
  ignoreInternal: boolean,
  final: boolean,
) {
  const thresholds = thresholdsForSnapshot(session.viewport)
  const profile = conflictProfile(entities, session.collisionMemberIds, thresholds, ignoreInternal)
  if (!profile) return false
  for (const [identity, mtd] of profile.pairs) {
    if (!session.baselineConflictPairs.has(identity)) return false
    const previous = session.retainedPairMtd.get(identity)
    if (previous !== undefined && mtd > previous + thresholds.epsilon) return false
  }
  if (!final) {
    session.retainedPairMtd = new Map([...session.baselineConflictPairs].map(identity => (
      [identity, profile.pairs.get(identity) ?? 0]
    )))
    return true
  }
  if (session.baselineScore.pairCount === 0) return profile.pairCount === 0
  return profile.pairCount === 0
    || profile.pairCount < session.baselineScore.pairCount
    || (profile.pairCount === session.baselineScore.pairCount
      && profile.totalMtd < session.baselineScore.totalMtd - thresholds.epsilon)
}

function geometryEntities(
  authoritativeNodes: FlowCanvasNode[],
  candidate: Map<string, CanvasRect>,
): CollisionEntity[] {
  return collisionEntities(authoritativeNodes).map(entity => ({
    id: entity.id,
    rect: candidate.get(entity.id) || entity.rect,
  }))
}

function hasAuthoritativeGeometryChanged(
  session: GeometrySessionBase,
  authoritativeNodes: FlowCanvasNode[],
): boolean {
  const latest = geometryForNodes(authoritativeNodes, session.controlledNodeIds)
  for (const [id, original] of session.originalGeometry) {
    if (!geometryEqual(original, latest.get(id))) return true
  }
  return false
}

function revalidateGeometrySession(
  session: GeometrySession,
  authoritativeNodes: FlowCanvasNode[],
): boolean {
  if (session.kind !== 'draw' && hasAuthoritativeGeometryChanged(session, authoritativeNodes)) return false
  const candidate = session.kind === 'draw'
    ? session.candidate ? new Map([['__draw__', session.candidate]]) : new Map<string, CanvasRect>()
    : session.lastAcceptedGeometry
  if (candidate.size === 0 || session.invalid) return false
  const entities = session.kind === 'draw'
    ? [...collisionEntities(authoritativeNodes), { id: '__draw__', rect: session.candidate! }]
    : geometryEntities(authoritativeNodes, candidate)
  return candidateConflictAccepted(session, entities, session.kind === 'move', true)
}

function constrainImageResize(original: CanvasRect, candidate: CanvasRect): CanvasRect {
  const ratio = original.width / original.height
  if (!Number.isFinite(ratio) || ratio <= 0) return candidate
  const widthScale = candidate.width / original.width
  const heightScale = candidate.height / original.height
  const useWidth = Math.abs(widthScale - 1) >= Math.abs(heightScale - 1)
  const width = useWidth ? candidate.width : candidate.height * ratio
  const height = useWidth ? candidate.width / ratio : candidate.height
  const movedLeft = candidate.x !== original.x
  const movedTop = candidate.y !== original.y
  return {
    x: movedLeft ? original.x + original.width - width : original.x,
    y: movedTop ? original.y + original.height - height : original.y,
    width,
    height,
  }
}

function unionRect(rects: CanvasRect[]): CanvasRect | null {
  if (rects.length === 0) return null
  const minX = Math.min(...rects.map(rect => rect.x))
  const minY = Math.min(...rects.map(rect => rect.y))
  const maxX = Math.max(...rects.map(rect => rect.x + rect.width))
  const maxY = Math.max(...rects.map(rect => rect.y + rect.height))
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

function expandRect(rect: CanvasRect, amount: number): CanvasRect {
  return {
    x: rect.x - amount,
    y: rect.y - amount,
    width: rect.width + amount * 2,
    height: rect.height + amount * 2,
  }
}

function screenRectFromCanvas(rect: CanvasRect, snapshot: ViewportSnapshot): CanvasRect {
  return {
    x: rect.x * snapshot.zoom + snapshot.x + snapshot.containerLeft,
    y: rect.y * snapshot.zoom + snapshot.y + snapshot.containerTop,
    width: rect.width * snapshot.zoom,
    height: rect.height * snapshot.zoom,
  }
}

function DrawGeometryPreview({
  draft,
  containerBounds,
}: {
  draft: DrawGeometrySession
  containerBounds: DOMRect | undefined
}) {
  const rect = draft.candidate
    ? screenRectFromCanvas(draft.candidate, draft.viewport)
    : normalizeDrawRect(draft.start, draft.current)
  return (
    <div
      className={cn(
        'pointer-events-none absolute rounded-xl border-2 bg-primary/10',
        draft.invalid
          ? 'border-[#FF5D5D] shadow-[0_0_12px_rgba(255,93,93,0.32)]'
          : 'border-primary/70 shadow-[0_0_0_1px_rgba(255,255,255,0.5)_inset]',
      )}
      style={{
        left: rect.x - (containerBounds?.left || 0),
        top: rect.y - (containerBounds?.top || 0),
        width: rect.width,
        height: rect.height,
      }}
    >
      {draft.invalid && (
        <span className="absolute left-2 top-2 rounded bg-[#FF5D5D] px-1.5 py-0.5 text-xs text-white">
          位置重叠
        </span>
      )}
    </div>
  )
}

function CanvasEditorInner({ canvasId }: CanvasEditorProps) {
  const t = useTranslations('canvas')
  const document = useCanvasStore(state => state.documents[canvasId])
  const viewport = useCanvasViewportState(
    canvasId,
    document?.viewport ?? { x: 0, y: 0, zoom: 0.65 },
  )
  const updateDocument = useCanvasStore(state => state.updateDocument)
  const updateHistory = useCanvasStore(state => state.updateHistory)
  const openProject = useCanvasStore(state => state.openProject)
  const projects = useCanvasStore(state => state.projects)
  const initialHistory = projects.find(project => project.id === canvasId)?.history
  const fileTree = useArticleStore(state => state.fileTree)
  const loadFileTree = useArticleStore(state => state.loadFileTree)
  const enableImageRecognition = useSettingStore(state => state.enableImageRecognition)
  const imageMethodModel = useSettingStore(state => state.imageMethodModel)
  const imageTagCatalog = useCanvasImageTagsStore(state => state.catalog)
  const recentImageTags = useCanvasImageTagsStore(state => state.recent)
  const selectedImageTags = useCanvasImageTagsStore(state => state.selectedByCanvas[canvasId] || EMPTY_IMAGE_TAGS)
  const imageTagMatchIndex = useCanvasImageTagsStore(state => state.activeIndexByCanvas[canvasId] ?? 0)
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
  const [imageInfoNodeId, setImageInfoNodeId] = useState<string | null>(null)
  const [contextTarget, setContextTarget] = useState<'pane' | 'node' | 'edge'>('pane')
  const [reactFlowReady, setReactFlowReady] = useState(false)
  const [evidenceHighlightNodeId, setEvidenceHighlightNodeId] = useState<string | null>(null)
  const [geometryUi, setDrawDraft] = useState<GeometryUiState>({
    drawDraft: null,
    snapGuides: [],
    legacyConflictIds: new Set(),
    nodeVisualStates: new Map(),
    placementPreview: null,
  })
  const { drawDraft, snapGuides, legacyConflictIds, nodeVisualStates, placementPreview } = geometryUi
  const updateGeometryUi = useCallback((patch: Partial<GeometryUiState>) => {
    setDrawDraft(current => ({ ...current, ...patch }))
  }, [])
  const updateFlowNodes = useCallback((updater: Parameters<typeof setNodes>[0]) => {
    setNodes(updater)
  }, [setNodes])
  useEffect(() => {
    const applyMeasuredHeight = (payload: unknown) => {
      if (!payload || typeof payload !== 'object') return
      const { nodeId, height } = payload as { nodeId?: unknown; height?: unknown }
      if (typeof nodeId !== 'string' || typeof height !== 'number') return
      updateFlowNodes(current => current.map(node => (
        node.id === nodeId
        && node.type === 'text'
        && !textResizeOriginRef.current.has(nodeId)
        && Number.isFinite(height)
        && Math.abs((node.height ?? 0) - height) >= 1
          ? { ...node, height, style: { ...node.style, height } }
          : node
      )))
    }
    emitter.on('canvas-text-node-measure', applyMeasuredHeight)
    return () => emitter.off('canvas-text-node-measure', applyMeasuredHeight)
  }, [updateFlowNodes])
  const [marqueePreview, setMarqueePreview] = useState<MarqueePointerSession | null>(null)
  const [relationPreview, setRelationPreview] = useState<RelationPointerSession | null>(null)
  const [relationEditor, setRelationEditor] = useState<RelationEditorState | null>(null)
  const [styleViewportSnapshot, setStyleViewportSnapshot] = useState<ViewportSnapshot | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const historyRef = useRef<CanvasSnapshot[]>((initialHistory?.undo || []).map(restoreHistorySnapshot))
  const redoRef = useRef<CanvasSnapshot[]>((initialHistory?.redo || []).map(restoreHistorySnapshot))
  const drawingFlowPointsRef = useRef<CanvasPoint[]>([])
  const erasingIdsRef = useRef(new Set<string>())
  const clipboardRef = useRef<CanvasSnapshot | null>(null)
  const pasteOffsetRef = useRef(0)
  const geometrySessionRef = useRef<GeometrySession | null>(null)
  const decorativeResizingRef = useRef(false)
  const textResizeOriginRef = useRef(new Map<string, {
    width: number
    height: number
    manualMinHeight: number
  }>())
  const spatialIndexRef = useRef(new CanvasSpatialIndex())
  const authoritativeNodesRef = useRef(nodes)
  const latestNodesRef = useRef(nodes)
  const latestEdgesRef = useRef(edges)
  latestNodesRef.current = nodes
  latestEdgesRef.current = edges
  const documentRevisionRef = useRef(0)
  const lastPointerIdRef = useRef(-1)
  const placementTokenRef = useRef(0)
  const freehandWidthHistoryRef = useRef(false)
  const relationSessionRef = useRef<RelationPointerSession | null>(null)
  const marqueeSessionRef = useRef<MarqueePointerSession | null>(null)
  const relationTargetRef = useRef<string | null>(null)
  const suppressContextMenuRef = useRef<ContextMenuSuppressionState | null>(null)
  const persistedNodesRef = useRef(nodes)
  const persistedEdgesRef = useRef(edges)
  const pendingDocumentRef = useRef<CanvasDocument | null>(null)
  const pendingDocumentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const noteReferenceRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastStoreDocumentRef = useRef(document)
  const styleHistoryPushedRef = useRef(false)
  const lastViewportSnapshotRef = useRef<ViewportSnapshot | null>(null)
  const { screenToFlowPosition, getNodesBounds, fitView } = useReactFlow()
  const transientEvidenceMoveRef = useRef(false)
  const transientEvidenceMoveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const evidenceHighlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const recognitionQueuedRevisionsRef = useRef(new Set<string>())
  const captureCurrentViewport = useCallback(() => {
    const bounds = containerRef.current?.getBoundingClientRect()
    if (!bounds) return null
    const snapshot = captureViewportSnapshot({
      viewport,
      containerRect: bounds,
      lastValid: lastViewportSnapshotRef.current,
    })
    if (snapshot) lastViewportSnapshotRef.current = snapshot
    return snapshot
  }, [viewport])
  const rebuildSpatialIndex = useCallback((nextNodes: FlowCanvasNode[]) => {
    documentRevisionRef.current += 1
    const geometryVersion = documentRevisionRef.current
    const entities = collisionEntities(nextNodes)
    spatialIndexRef.current.rebuild(entities.map(entity => ({ ...entity, geometryVersion })))
    authoritativeNodesRef.current = nextNodes
    const score = scoreLegacyConflicts({
      entities,
      thresholds: thresholdsForSnapshot(lastViewportSnapshotRef.current || {
        x: 0,
        y: 0,
        zoom: document?.viewport.zoom || 0.65,
        containerLeft: 0,
        containerTop: 0,
        capturedAt: Date.now(),
      }),
    })
    updateGeometryUi({
      legacyConflictIds: new Set(score.valid ? score.pairs.flatMap(pair => pair.ids) : []),
    })
  }, [document?.viewport.zoom, updateGeometryUi])
  const releaseGeometryPointerCapture = useCallback((pointerId: number) => {
    if (pointerId < 0) return
    const owners = [
      ...globalThis.document.querySelectorAll(`[data-canvas-geometry-pointer="${pointerId}"]`),
      containerRef.current,
    ]
    for (const owner of owners) {
      if (owner instanceof Element && owner.hasPointerCapture(pointerId)) {
        try { owner.releasePointerCapture(pointerId) } catch { /* capture may already be gone */ }
      }
    }
  }, [])
  useEffect(() => {
    if (!Number.isFinite(viewport.x) || !Number.isFinite(viewport.y) || !Number.isFinite(viewport.zoom)) return
    const bounds = containerRef.current?.getBoundingClientRect()
    if (!bounds) return
    const snapshot = captureViewportSnapshot({ viewport, containerRect: bounds })
    if (snapshot) lastViewportSnapshotRef.current = snapshot
  }, [viewport])
  useLayoutEffect(() => {
    if (!document) return
    const snapshot = captureCurrentViewport()
    if (!snapshot) return
    publishCanvasAiRuntimeSnapshot({
      canvasId,
      document: {
        ...document,
        nodes: serializeNodes(nodes),
        edges: serializeEdges(edges),
        viewport: { x: snapshot.x, y: snapshot.y, zoom: snapshot.zoom },
      },
      viewport: snapshot,
    })
  }, [canvasId, captureCurrentViewport, document, edges, nodes, viewport])
  useEffect(() => () => clearCanvasAiRuntimeSnapshot(canvasId), [canvasId])
  useEffect(() => {
    if (document) initializeCanvasViewportState(canvasId, document.viewport)
  }, [canvasId, document])
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
  const imageInfoNode = imageInfoNodeId
    ? nodes.find(node => node.id === imageInfoNodeId && node.type === 'image')
    : undefined
  const selectedImageRecognitionStatus = useCanvasImageRecognitionStore(state => (
    selectedStyleNode?.type === 'image'
      ? state.statuses[`${canvasId}:${selectedStyleNode.id}`]
      : undefined
  ))
  useEffect(() => {
    let current = true
    void initCanvasImageTags().then(() => {
      if (current) mergeCanvasImageTagsFromNodes(nodes)
    })
    return () => {
      current = false
    }
  }, [nodes])
  const selectedStyleNodes = nodes.filter(node => node.selected && node.type !== 'freehand')
  const selectedTextStyleNodes = selectedStyleNodes.filter(node => TEXT_CAPABLE_NODE_TYPES.has(node.type))
  const selectedFontSizes = selectedTextStyleNodes.map(node => (
    typeof node.data.fontSize === 'number' && Number.isFinite(node.data.fontSize) && node.data.fontSize > 0
      ? node.data.fontSize
      : 15
  ))
  const selectedFontSizeMixed = selectedFontSizes.some(size => size !== selectedFontSizes[0])
  const selectedScreenFontSize = styleViewportSnapshot && selectedFontSizes[0] !== undefined
    ? screenFontSizeForCanvasFont(selectedFontSizes[0], styleViewportSnapshot)
    : selectedFontSizes[0]
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
  const matchingImageIds = useMemo(
    () => orderedMatchingImageIds(nodes, selectedImageTags),
    [nodes, selectedImageTags],
  )
  const matchingImageIdSet = useMemo(() => new Set(matchingImageIds), [matchingImageIds])
  const filteringImageTags = selectedImageTags.length > 0
  const normalizedImageTagMatchIndex = matchingImageIds.length
    ? Math.min(imageTagMatchIndex, matchingImageIds.length - 1)
    : 0

  const displayNodes = useMemo(() => {
    const base = placementPreview
      ? [...nodes.map(node => ({ ...node, selected: false })), ...placementPreview.nodes]
      : previewSnapshot?.nodes || nodes
    const placementIds = new Set(placementPreview?.nodes.map(node => node.id) || [])
    return base.map(node => {
      const visual = nodeVisualStates.get(node.id)
      const imageTagMatch = filteringImageTags && matchingImageIdSet.has(node.id)
      const imageTagFilterState: 'match' | 'dim' | undefined = imageTagMatch
        ? 'match'
        : filteringImageTags ? 'dim' : undefined
      return {
        ...node,
        data: {
          ...node.data,
          ...(node.type === 'image' ? { canvasId } : {}),
          imageTagFilterState,
        },
        style: {
          ...node.style,
          ...(filteringImageTags && !imageTagMatch ? { opacity: 0.25 } : {}),
        },
        className: cn(
          node.className,
          imageTagMatch && 'canvas-image-tag-match',
          visual === 'invalid' && 'canvas-geometry-invalid',
          visual !== 'invalid' && legacyConflictIds.has(node.id) && 'canvas-legacy-conflict',
          placementIds.has(node.id) && 'canvas-placement-preview',
          evidenceHighlightNodeId === node.id
            && 'canvas-evidence-highlight !ring-4 !ring-primary/60 !ring-offset-2 !ring-offset-background',
        ),
      }
    })
  }, [canvasId, evidenceHighlightNodeId, filteringImageTags, legacyConflictIds, matchingImageIdSet, nodeVisualStates, nodes, placementPreview, previewSnapshot])
  const displayEdges = useMemo(() => (previewSnapshot?.edges || edges).map(edge => {
    const relation = edge.data as CanvasRelationData | undefined
    if (!relation) return filteringImageTags
      ? { ...edge, style: { ...(edge.style || {}), opacity: 0.25 } }
      : edge
    const normalized = normalizeRelationData(relation)
    const visuals = relationEdgeVisuals(normalized)
    return {
      ...edge,
      type: 'relation',
      data: normalized,
      style: {
        ...(edge.style || {}),
        stroke: visuals.stroke,
        strokeWidth: visuals.strokeWidth,
        strokeDasharray: visuals.strokeDasharray,
        ...(filteringImageTags ? { opacity: 0.25 } : {}),
      },
      markerStart: visuals.markerStart ? { type: MarkerType.ArrowClosed, color: normalized.color } : undefined,
      markerEnd: visuals.markerEnd ? { type: MarkerType.ArrowClosed, color: normalized.color } : undefined,
    }
  }), [edges, filteringImageTags, previewSnapshot])

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
    rebuildSpatialIndex(nextNodes)
    const savedHistory = useCanvasStore.getState().projects.find(project => project.id === canvasId)?.history
    historyRef.current = (savedHistory?.undo || []).map(restoreHistorySnapshot)
    redoRef.current = (savedHistory?.redo || []).map(restoreHistorySnapshot)
    setCanUndo(historyRef.current.length > 0)
    setCanRedo(redoRef.current.length > 0)
    const geometrySession = geometrySessionRef.current
    if (geometrySession && geometrySession.kind !== 'draw'
      && hasAuthoritativeGeometryChanged(geometrySession, nextNodes)) {
      geometrySessionRef.current = null
      updateGeometryUi({ drawDraft: null, snapGuides: [], nodeVisualStates: new Map() })
      releaseGeometryPointerCapture(geometrySession.pointerId)
      updateFlowNodes(nextNodes)
    } else if (geometrySession) {
      updateFlowNodes(current => {
        const currentById = new Map(current.map(node => [node.id, node]))
        return nextNodes.map(node => geometrySession.controlledNodeIds.has(node.id)
          ? currentById.get(node.id) || node
          : node)
      })
    } else {
      updateFlowNodes(nextNodes)
    }
    setEdges(nextEdges)
  }, [document, rebuildSpatialIndex, releaseGeometryPointerCapture, setEdges,
    updateFlowNodes, updateGeometryUi])

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
    if (!geometrySessionRef.current) rebuildSpatialIndex(nodes)
  }, [nodes, rebuildSpatialIndex])

  useEffect(() => {
    if (!document) return
    if (geometrySessionRef.current || placementPreview) return
    if (!havePersistentNodesChanged(persistedNodesRef.current, nodes)
      && !havePersistentEdgesChanged(persistedEdgesRef.current, edges)) return
    persistedNodesRef.current = nodes
    persistedEdgesRef.current = edges
    const nextDocument: CanvasDocument = {
      ...document,
      nodes: serializeNodes(geometrySessionRef.current ? authoritativeNodesRef.current : nodes),
      edges: serializeEdges(edges),
      viewport,
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
  }, [canvasId, document, edges, nodes, placementPreview, updateDocument, viewport])

  useEffect(() => {
    const initialStore = useMarkStore.getState()
    let referenceAuthority: NoteReferenceAuthorityState = {
      marks: [],
      status: 'unconfirmed',
    }
    let observedAllMarks = initialStore.allMarks
    let partialMarks = mergeNoteReferenceMarks(initialStore.allMarks, initialStore.marks)
    let authorityRequest = 0
    let authorityRefreshPending = false
    let disposed = false
    const initialNodes = latestNodesRef.current
    const initialRefresh = refreshNoteReferences(
      initialNodes as CanvasNode[],
      mergeNoteReferenceMarks(referenceAuthority.marks, partialMarks),
      { allowMissing: false },
    ) as FlowCanvasNode[]
    if (initialRefresh.some((node, index) => (
      node !== initialNodes[index] && JSON.stringify(node.data) !== JSON.stringify(initialNodes[index]?.data)
    ))) updateFlowNodes(initialRefresh)

    const initialAuthorityRequest = ++authorityRequest
    void getAllMarks().then(function (records) {
      if (disposed || initialAuthorityRequest !== authorityRequest) return
      referenceAuthority = updateNoteReferenceAuthority(referenceAuthority, {
        source: 'database',
        marks: records,
      })
      const current = latestNodesRef.current
      const refreshed = refreshNoteReferences(
        current as CanvasNode[],
        mergeNoteReferenceMarks(referenceAuthority.marks, partialMarks),
        { allowMissing: referenceAuthority.status === 'authoritative' },
      ) as FlowCanvasNode[]
      if (refreshed.some((node, index) => (
        node !== current[index] && JSON.stringify(node.data) !== JSON.stringify(current[index]?.data)
      ))) updateFlowNodes(refreshed)
    }).catch(function (error) {
      if (!disposed && initialAuthorityRequest === authorityRequest) {
        console.error('Failed to load authoritative note references:', error)
      }
    })

    const unsubscribe = useMarkStore.subscribe(function (markStore) {
      partialMarks = mergeNoteReferenceMarks(markStore.allMarks, markStore.marks)
      if (markStore.allMarks !== observedAllMarks) {
        observedAllMarks = markStore.allMarks
        authorityRequest += 1
        referenceAuthority = updateNoteReferenceAuthority(referenceAuthority, { source: 'store' })
        authorityRefreshPending = true
      }
      if (noteReferenceRefreshTimerRef.current) clearTimeout(noteReferenceRefreshTimerRef.current)
      noteReferenceRefreshTimerRef.current = setTimeout(function () {
        const current = latestNodesRef.current
        const refreshed = refreshNoteReferences(
          current as CanvasNode[],
          mergeNoteReferenceMarks(referenceAuthority.marks, partialMarks),
          { allowMissing: referenceAuthority.status === 'authoritative' },
        ) as FlowCanvasNode[]
        if (refreshed.some((node, index) => (
          node !== current[index] && JSON.stringify(node.data) !== JSON.stringify(current[index]?.data)
        ))) updateFlowNodes(refreshed)

        if (!authorityRefreshPending) return
        authorityRefreshPending = false
        const requestedAuthority = ++authorityRequest
        void getAllMarks().then(function (records) {
          if (disposed || requestedAuthority !== authorityRequest) return
          referenceAuthority = updateNoteReferenceAuthority(referenceAuthority, {
            source: 'database',
            marks: records,
          })
          const currentAfterAuthority = latestNodesRef.current
          const refreshedAfterAuthority = refreshNoteReferences(
            currentAfterAuthority as CanvasNode[],
            mergeNoteReferenceMarks(referenceAuthority.marks, partialMarks),
            { allowMissing: referenceAuthority.status === 'authoritative' },
          ) as FlowCanvasNode[]
          if (refreshedAfterAuthority.some((node, index) => (
            node !== currentAfterAuthority[index]
              && JSON.stringify(node.data) !== JSON.stringify(currentAfterAuthority[index]?.data)
          ))) updateFlowNodes(refreshedAfterAuthority)
        }).catch(function (error) {
          if (!disposed && requestedAuthority === authorityRequest) {
            console.error('Failed to refresh authoritative note references:', error)
          }
        })
      }, 120)
    })
    return () => {
      disposed = true
      authorityRequest += 1
      if (noteReferenceRefreshTimerRef.current) clearTimeout(noteReferenceRefreshTimerRef.current)
      unsubscribe()
    }
  }, [updateFlowNodes])

  const persistHistory = useCallback(() => {
    updateHistory(canvasId, {
      undo: historyRef.current.map(serializeHistorySnapshot),
      redo: redoRef.current.map(serializeHistorySnapshot),
    })
  }, [canvasId, updateHistory])

  const pushHistory = useCallback((snapshot?: CanvasSnapshot) => {
    const checkpoint = snapshot || latestHistorySnapshot(latestNodesRef, latestEdgesRef)
    const historyLimit = checkpoint.nodes.length > 500 ? 10 : checkpoint.nodes.length > 250 ? 20 : 50
    historyRef.current = [...historyRef.current.slice(-(historyLimit - 1)), checkpoint]
    redoRef.current = []
    persistHistory()
    setCanUndo(true)
    setCanRedo(false)
  }, [persistHistory])

  const saveImageInfo = useCallback((value: { name: string; comment: string; tags: string[] }) => {
    if (!imageInfoNodeId) return
    pushHistory()
    updateFlowNodes(current => current.map(node => node.id === imageInfoNodeId ? {
      ...node,
      data: {
        ...node.data,
        label: value.name,
        description: value.comment,
        imageTags: normalizeImageTags(value.tags),
      },
    } : node))
    registerCanvasImageTags(value.tags)
    setImageInfoNodeId(null)
  }, [imageInfoNodeId, pushHistory, updateFlowNodes])

  const toggleImageTagFilter = useCallback((tag: string) => {
    const key = tag.toLocaleLowerCase()
    const selected = selectedImageTags.some(value => value.toLocaleLowerCase() === key)
    setCanvasImageTagFilter(
      canvasId,
      selected
        ? selectedImageTags.filter(value => value.toLocaleLowerCase() !== key)
        : [...selectedImageTags, tag],
    )
  }, [canvasId, selectedImageTags])

  const moveImageTagMatch = useCallback((delta: -1 | 1) => {
    const matchCount = matchingImageIds.length
    if (!matchCount) return
    const currentIndex = ((imageTagMatchIndex % matchCount) + matchCount) % matchCount
    const nextIndex = (currentIndex + delta + matchCount) % matchCount
    const node = latestNodesRef.current.find(item => item.id === matchingImageIds[nextIndex])
    const bounds = containerRef.current?.getBoundingClientRect()
    if (!node || !bounds) return
    stepCanvasImageTagMatch(canvasId, matchCount, delta)
    const targetViewport = planEvidenceFocusViewport({
      nodePosition: node.position,
      nodeWidth: node.measured?.width ?? node.width ?? 180,
      nodeHeight: node.measured?.height ?? node.height ?? 72,
      viewportWidth: bounds.width,
      viewportHeight: bounds.height,
      currentZoom: Math.max(viewport.zoom, 0.8),
    })
    animateCanvasViewportState(canvasId, targetViewport, 260)
  }, [canvasId, imageTagMatchIndex, matchingImageIds, viewport.zoom])

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
      updateFlowNodes(nextDocument.nodes as FlowCanvasNode[])
      setEdges(nextDocument.edges as Edge[])
      requestAnimationFrame(() => void fitView({ padding: 0.2, duration: 300 }))
    }

    emitter.on('canvas-document-replace', replaceDocument)
    return () => emitter.off('canvas-document-replace', replaceDocument)
  }, [canvasId, fitView, pushHistory, setEdges, updateFlowNodes])

  useEffect(() => {
    recordCanvasViewportSnapshot(canvasId, viewport)
  }, [canvasId, viewport])

  useEffect(() => {
    if (!reactFlowReady) return
    return markCanvasEvidenceRuntimeReady(canvasId)
  }, [canvasId, reactFlowReady])

  useEffect(() => {
    if (!enableImageRecognition) return
    for (const node of nodes) {
      if (node.type !== 'image') continue
      const contentRevision = canvasNodeContentRevision(node as CanvasNode)
      const queueKey = `${canvasId}:${node.id}:${contentRevision}:${imageMethodModel || 'local-ocr'}`
      if (recognitionQueuedRevisionsRef.current.has(queueKey)) continue
      recognitionQueuedRevisionsRef.current.add(queueKey)
      void enqueueCanvasImageRecognition({
        canvasId,
        node: node as CanvasNode,
        contentRevision,
      })
    }
  }, [canvasId, enableImageRecognition, imageMethodModel, nodes])

  useEffect(() => {
    setEvidenceHighlightNodeId(null)
    return () => {
      if (evidenceHighlightTimerRef.current) clearTimeout(evidenceHighlightTimerRef.current)
      evidenceHighlightTimerRef.current = null
    }
  }, [canvasId])

  useEffect(() => {
    const armTransientEvidenceMove = () => {
      transientEvidenceMoveRef.current = true
      if (transientEvidenceMoveTimerRef.current) clearTimeout(transientEvidenceMoveTimerRef.current)
      transientEvidenceMoveTimerRef.current = setTimeout(() => {
        transientEvidenceMoveRef.current = false
        transientEvidenceMoveTimerRef.current = null
      }, 500)
    }
    const focusNode = (nodeId: string, transient = false) => {
      const node = latestNodesRef.current.find(item => item.id === nodeId)
      if (!node) return false
      const bounds = containerRef.current?.getBoundingClientRect()
      if (!bounds) return false
      const width = node.measured?.width ?? node.width ?? 180
      const height = node.measured?.height ?? node.height ?? 72
      const targetViewport = planEvidenceFocusViewport({
        nodePosition: node.position,
        nodeWidth: width,
        nodeHeight: height,
        viewportWidth: bounds.width,
        viewportHeight: bounds.height,
        currentZoom: viewport.zoom,
      })
      if (transient) armTransientEvidenceMove()
      animateCanvasViewportState(canvasId, targetViewport, 260)
      return true
    }
    const focusEvidence = (focus: EvidenceFocus) => {
      if (focus.canvasId !== canvasId) return
      if (!focusNode(focus.nodeId, true)) return
      setEvidenceHighlightNodeId(focus.nodeId)
      if (evidenceHighlightTimerRef.current) clearTimeout(evidenceHighlightTimerRef.current)
      evidenceHighlightTimerRef.current = setTimeout(() => {
        setEvidenceHighlightNodeId(current => current === focus.nodeId ? null : current)
        evidenceHighlightTimerRef.current = null
      }, 1_200)
      if (focus.field === 'text') emitter.emit('canvas-select-evidence-range', focus)
    }
    const returnToEvidenceOrigin = ({
      canvasId: targetCanvasId,
      viewport: origin,
    }: { canvasId: string; viewport: CanvasViewport }) => {
      if (targetCanvasId !== canvasId) return
      armTransientEvidenceMove()
      animateCanvasViewportState(canvasId, origin, 260)
    }
    emitter.on('canvas-focus-node', focusNode)
    emitter.on('canvas-focus-evidence', focusEvidence)
    emitter.on('canvas-evidence-return', returnToEvidenceOrigin)
    return () => {
      emitter.off('canvas-focus-node', focusNode)
      emitter.off('canvas-focus-evidence', focusEvidence)
      emitter.off('canvas-evidence-return', returnToEvidenceOrigin)
      if (transientEvidenceMoveTimerRef.current) clearTimeout(transientEvidenceMoveTimerRef.current)
    }
  }, [canvasId, viewport.zoom])

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

  const commitGeometrySessionCheckpoint = useCallback((session: GeometrySessionBase) => {
    const authoritativeSnapshot = cloneSnapshot(authoritativeNodesRef.current, latestEdgesRef.current)
    pushHistory(authoritativeSnapshot)
    void session
  }, [pushHistory])

  const createGeometrySessionBase = useCallback((input: {
    pointerId: number
    viewport: ViewportSnapshot
    controlledNodeIds: Set<string>
    collisionMemberIds: Set<string>
    ignoreInternal: boolean
  }): GeometrySessionBase => {
    const originalGeometry = geometryForNodes(authoritativeNodesRef.current, input.controlledNodeIds)
    const entities = collisionEntities(authoritativeNodesRef.current)
    const profile = conflictProfile(
      entities,
      input.collisionMemberIds,
      thresholdsForSnapshot(input.viewport),
      input.ignoreInternal,
    )
    return {
      pointerId: input.pointerId,
      viewport: input.viewport,
      indexVersion: spatialIndexRef.current.version,
      baselineDocumentRevision: documentRevisionRef.current,
      originalGeometry,
      lastAcceptedGeometry: new Map(originalGeometry),
      baselineConflictPairs: new Set(profile?.pairs.keys() || []),
      retainedPairMtd: new Map(profile?.pairs || []),
      baselineScore: {
        pairCount: profile?.pairCount || 0,
        totalMtd: profile?.totalMtd || 0,
      },
      controlledNodeIds: input.controlledNodeIds,
      collisionMemberIds: input.collisionMemberIds,
      historySnapshot: cloneSnapshot(authoritativeNodesRef.current, latestEdgesRef.current),
      invalid: false,
    }
  }, [])

  const cancelGeometrySession = useCallback((
    reason: 'invalid-release' | 'pointercancel' | 'lost-capture' | 'window-blur' | 'stale-authority' | 'no-change',
  ) => {
    const session = geometrySessionRef.current
    if (!session) return
    geometrySessionRef.current = null
    const outcome = executeGeometrySessionOutcome({
      mode: 'cancel',
      session,
      authoritativeNodes: authoritativeNodesRef.current,
    })
    updateGeometryUi({ drawDraft: null, snapGuides: [], nodeVisualStates: new Map() })
    if (outcome.geometry.size > 0) updateFlowNodes(current => applyGeometry(current, outcome.geometry))
    releaseGeometryPointerCapture(outcome.pointerId)
    if (reason === 'invalid-release') toast.error('位置重叠')
  }, [commitGeometrySessionCheckpoint, releaseGeometryPointerCapture, updateFlowNodes, updateGeometryUi])

  const finalizeResizeGeometrySession = useCallback(() => {
    const session = geometrySessionRef.current
    if (!session || session.kind !== 'resize') return
    if (session.invalid || !revalidateGeometrySession(session, authoritativeNodesRef.current)) {
      cancelGeometrySession('invalid-release')
      return
    }
    const changed = [...session.lastAcceptedGeometry].some(([id, rect]) => (
      !geometryEqual(rect, session.originalGeometry.get(id))
    ))
    if (!changed) {
      cancelGeometrySession('no-change')
      return
    }
    geometrySessionRef.current = null
    const outcome = executeGeometrySessionOutcome({
      mode: 'commit',
      session,
      authoritativeNodes: authoritativeNodesRef.current,
    })
    updateGeometryUi({ drawDraft: null, snapGuides: [], nodeVisualStates: new Map() })
    if (outcome.shouldCommit) {
      commitGeometrySessionCheckpoint(session)
      updateFlowNodes(current => applyGeometry(current, outcome.geometry))
    }
    releaseGeometryPointerCapture(outcome.pointerId)
  }, [cancelGeometrySession, commitGeometrySessionCheckpoint,
    releaseGeometryPointerCapture, updateFlowNodes, updateGeometryUi])

  const evaluateResizeGeometrySession = useCallback((
    session: ResizeGeometrySession,
    changes: NodeChange<FlowCanvasNode>[],
  ) => {
    const original = session.originalGeometry.get(session.nodeId)
    if (!original) return
    const dimensionChange = changes.find(change => change.type === 'dimensions' && change.id === session.nodeId)
    const positionChange = changes.find(change => change.type === 'position' && change.id === session.nodeId)
    const dimensions = dimensionChange?.type === 'dimensions' ? dimensionChange.dimensions : undefined
    const position = positionChange?.type === 'position' ? positionChange.position : undefined
    const previous = session.lastAcceptedGeometry.get(session.nodeId) || original
    let rawCandidate: CanvasRect = {
      x: position?.x ?? previous.x,
      y: position?.y ?? previous.y,
      width: dimensions?.width ?? previous.width,
      height: dimensions?.height ?? previous.height,
    }
    const targetNode = authoritativeNodesRef.current.find(node => node.id === session.nodeId)
    if (targetNode?.type === 'image') rawCandidate = constrainImageResize(original, rawCandidate)
    const activeEdges = {
      x: rawCandidate.width !== original.width
        ? (rawCandidate.x !== original.x ? 'min' as const : 'max' as const)
        : undefined,
      y: rawCandidate.height !== original.height
        ? (rawCandidate.y !== original.y ? 'min' as const : 'max' as const)
        : undefined,
    }
    const thresholds = thresholdsForSnapshot(session.viewport)
    const query = expandRect(rawCandidate, thresholds.snapBreak + thresholds.safetyGap)
    const obstacles = spatialIndexRef.current.query(query)
      .filter(record => record.id !== session.nodeId)
      .map(record => ({ id: record.id, rect: record.rect }))
    const snapped = resolveActiveEdgeSnap({
      candidate: rawCandidate,
      activeEdges,
      obstacles,
      thresholds,
      snap: session.snap,
    })
    session.snap = snapped.snap
    const candidate = new Map(session.lastAcceptedGeometry)
    candidate.set(session.nodeId, snapped.rect)
    const accepted = snapped.valid && candidateConflictAccepted(
      session,
      geometryEntities(authoritativeNodesRef.current, candidate),
      false,
      false,
    )
    session.invalid = !accepted
    if (accepted) session.lastAcceptedGeometry = candidate
    updateGeometryUi({
      snapGuides: [
        ...(snapped.snap.x ? [{ axis: 'x' as const, position: snapped.snap.x.boundary }] : []),
        ...(snapped.snap.y ? [{ axis: 'y' as const, position: snapped.snap.y.boundary }] : []),
      ],
      nodeVisualStates: accepted
        ? new Map()
        : new Map([[session.nodeId, 'invalid' as CanvasNodeVisualState]]),
    })
    updateFlowNodes(current => applyGeometry(current, candidate))
  }, [updateFlowNodes, updateGeometryUi])

  const applyGeometryNodeChanges = useCallback((changes: NodeChange<FlowCanvasNode>[]) => {
    const nodeById = new Map(nodes.map(node => [node.id, node]))
    for (const change of changes) {
      if (change.type !== 'dimensions' || change.resizing !== true) continue
      const node = nodeById.get(change.id)
      if (!node || node.type !== 'text' || textResizeOriginRef.current.has(change.id)) continue
      textResizeOriginRef.current.set(change.id, {
        width: node.width ?? change.dimensions?.width ?? 1,
        height: node.height ?? change.dimensions?.height ?? 1,
        manualMinHeight: typeof node.data.textManualMinHeight === 'number'
          ? node.data.textManualMinHeight
          : node.height ?? change.dimensions?.height ?? 1,
      })
    }
    const startsSolidResize = changes.find(change => {
      if (change.type !== 'dimensions' || change.resizing !== true) return false
      const node = nodeById.get(change.id)
      return Boolean(node && isSolidCanvasNode(node as CanvasNode))
    })
    let session = geometrySessionRef.current
    if (!session && startsSolidResize?.type === 'dimensions') {
      const viewport = captureCurrentViewport()
      if (viewport) {
        const controlledNodeIds = new Set([startsSolidResize.id])
        session = {
          ...createGeometrySessionBase({
            pointerId: lastPointerIdRef.current,
            viewport,
            controlledNodeIds,
            collisionMemberIds: new Set(controlledNodeIds),
            ignoreInternal: false,
          }),
          kind: 'resize',
          nodeId: startsSolidResize.id,
          snap: {},
        }
        geometrySessionRef.current = session
      }
    }

    if (session?.kind === 'resize') evaluateResizeGeometrySession(session, changes)

    const startsDecorativeResize = changes.some(change => {
      if (change.type !== 'dimensions' || change.resizing !== true) return false
      const node = nodeById.get(change.id)
      return Boolean(node && !isSolidCanvasNode(node as CanvasNode))
    })
    if (startsDecorativeResize && !decorativeResizingRef.current) pushHistory()
    if (startsDecorativeResize) decorativeResizingRef.current = true
    if (changes.some(change => change.type === 'dimensions' && change.resizing === false)) {
      decorativeResizingRef.current = false
    }
    if (changes.some(change => change.type === 'remove') && !session) pushHistory()

    const passThroughChanges = changes.filter(change => {
      if (change.type !== 'position' && change.type !== 'dimensions') return true
      const node = nodeById.get(change.id)
      if (!node || !isSolidCanvasNode(node as CanvasNode)) return true
      return change.type === 'dimensions'
        && change.resizing === undefined
        && geometrySessionRef.current?.kind !== 'resize'
    })
    onNodesChangeBase(passThroughChanges)

    const completedTextResizes = changes.filter(change => (
      change.type === 'dimensions'
      && change.resizing === false
      && nodeById.get(change.id)?.type === 'text'
    ))
    if (completedTextResizes.length > 0) {
      updateFlowNodes(current => current.map(node => {
        const change = completedTextResizes.find(candidate => (
          candidate.type === 'dimensions' && candidate.id === node.id
        ))
        if (!change || change.type !== 'dimensions') return node
        const origin = textResizeOriginRef.current.get(node.id)
        const width = change.dimensions?.width ?? node.width ?? origin?.width ?? 1
        const height = change.dimensions?.height ?? node.height ?? origin?.height ?? 1
        const resize = resolveTextResize({
          width,
          height,
          previousManualMinHeight: origin?.manualMinHeight
            ?? (typeof node.data.textManualMinHeight === 'number' ? node.data.textManualMinHeight : height),
          changedWidth: origin ? Math.abs(width - origin.width) >= 1 : true,
          changedHeight: origin ? Math.abs(height - origin.height) >= 1 : true,
        })
        textResizeOriginRef.current.delete(node.id)
        return {
          ...node,
          width: resize.width,
          height,
          style: { ...node.style, width: resize.width, height },
          data: { ...node.data, textManualMinHeight: resize.manualMinHeight },
        }
      }))
    }

    if (session?.kind === 'resize'
      && changes.some(change => change.type === 'dimensions'
        && change.id === session.nodeId && change.resizing === false)) {
      finalizeResizeGeometrySession()
    }
  }, [captureCurrentViewport, createGeometrySessionBase, evaluateResizeGeometrySession,
    finalizeResizeGeometrySession, nodes, onNodesChangeBase, pushHistory, updateFlowNodes])

  const onNodesChange = useCallback((changes: NodeChange<FlowCanvasNode>[]) => {
    applyGeometryNodeChanges(changes)
  }, [applyGeometryNodeChanges])

  const startMoveGeometrySession = useCallback((event: unknown, activeNode: FlowCanvasNode) => {
    const viewport = captureCurrentViewport()
    if (!viewport) return
    const sourceNodes = authoritativeNodesRef.current
    const selectedIds = new Set(activeNode.selected
      ? nodes.filter(node => node.selected).map(node => node.id)
      : [activeNode.id])
    const selected = sourceNodes.filter(node => selectedIds.has(node.id))
    const controlledNodeIds = expandGroupControlledNodeIds(sourceNodes, new Set(selected.map(node => node.id)))
    const collisionMemberIds = new Set(sourceNodes
      .filter(node => controlledNodeIds.has(node.id) && isSolidCanvasNode(node as CanvasNode))
      .map(node => node.id))
    const eventShape = event as { pointerId?: number; nativeEvent?: { pointerId?: number }; currentTarget?: EventTarget | null }
    const pointerId = eventShape.pointerId ?? eventShape.nativeEvent?.pointerId ?? lastPointerIdRef.current
    if (eventShape.currentTarget instanceof HTMLElement) {
      eventShape.currentTarget.dataset.canvasGeometryPointer = String(pointerId)
    }
    const session: MoveGeometrySession = {
      ...createGeometrySessionBase({
        pointerId,
        viewport,
        controlledNodeIds,
        collisionMemberIds,
        ignoreInternal: true,
      }),
      kind: 'move',
      activeNodeId: activeNode.id,
      samples: appendPointerSample([], {
        x: Number((event as { clientX?: number }).clientX ?? 0),
        y: Number((event as { clientY?: number }).clientY ?? 0),
        time: Number((event as { timeStamp?: number }).timeStamp ?? performance.now()),
      }),
      inertiaFrame: null,
    }
    geometrySessionRef.current = session
  }, [captureCurrentViewport, createGeometrySessionBase, nodes])

  const evaluateMoveGeometrySession = useCallback((event: unknown, activeNode: FlowCanvasNode) => {
    const session = geometrySessionRef.current
    if (!session || session.kind !== 'move' || session.activeNodeId !== activeNode.id) return
    const pointer = event as { clientX?: number; clientY?: number; timeStamp?: number }
    session.samples = appendPointerSample(session.samples, {
      x: Number(pointer.clientX ?? 0),
      y: Number(pointer.clientY ?? 0),
      time: Number(pointer.timeStamp ?? performance.now()),
    })
    const originalActive = session.originalGeometry.get(activeNode.id)
    const acceptedActive = session.lastAcceptedGeometry.get(activeNode.id)
    if (!originalActive || !acceptedActive) return
    const desiredDelta = {
      x: activeNode.position.x - originalActive.x,
      y: activeNode.position.y - originalActive.y,
    }
    const acceptedDelta = {
      x: acceptedActive.x - originalActive.x,
      y: acceptedActive.y - originalActive.y,
    }
    const frameDelta = {
      x: desiredDelta.x - acceptedDelta.x,
      y: desiredDelta.y - acceptedDelta.y,
    }
    const members = [...session.collisionMemberIds].flatMap(id => {
      const rect = session.lastAcceptedGeometry.get(id)
      return rect ? [{ id, rect }] : []
    })
    const thresholds = thresholdsForSnapshot(session.viewport)
    let acceptedFrameDelta = frameDelta
    if (members.length > 0) {
      const targetRects = members.map(member => ({
        ...member.rect,
        x: member.rect.x + frameDelta.x,
        y: member.rect.y + frameDelta.y,
      }))
      const broadPhase = unionRect([...members.map(member => member.rect), ...targetRects])
      if (!broadPhase) return
      const obstacles = spatialIndexRef.current.query(expandRect(broadPhase, thresholds.safetyGap))
        .filter(record => !session.controlledNodeIds.has(record.id))
        .map(record => ({ id: record.id, rect: record.rect }))
      const swept = sweepRigidSet({ members, obstacles, delta: frameDelta, thresholds, maxPasses: 4 })
      if (!swept.valid) return
      acceptedFrameDelta = swept.delta
    }
    const candidate = new Map(session.lastAcceptedGeometry)
    for (const id of session.controlledNodeIds) {
      const rect = session.lastAcceptedGeometry.get(id)
      if (!rect) continue
      candidate.set(id, {
        ...rect,
        x: rect.x + acceptedFrameDelta.x,
        y: rect.y + acceptedFrameDelta.y,
      })
    }
    const accepted = candidateConflictAccepted(
      session,
      geometryEntities(authoritativeNodesRef.current, candidate),
      true,
      false,
    )
    if (!accepted) return
    session.lastAcceptedGeometry = candidate
    session.invalid = false
    updateFlowNodes(current => applyGeometry(current, candidate))
  }, [updateFlowNodes])

  const commitMoveGeometrySession = useCallback((session: MoveGeometrySession) => {
    if (session.inertiaFrame !== null) cancelAnimationFrame(session.inertiaFrame)
    const changed = [...session.lastAcceptedGeometry].some(([id, rect]) => (
      !geometryEqual(rect, session.originalGeometry.get(id))
    ))
    if (!changed) {
      cancelGeometrySession('no-change')
      return
    }
    if (!revalidateGeometrySession(session, authoritativeNodesRef.current)) {
      cancelGeometrySession(hasAuthoritativeGeometryChanged(session, authoritativeNodesRef.current)
        ? 'stale-authority'
        : 'invalid-release')
      return
    }
    geometrySessionRef.current = null
    const outcome = executeGeometrySessionOutcome({
      mode: 'commit',
      session,
      authoritativeNodes: authoritativeNodesRef.current,
    })
    updateGeometryUi({ drawDraft: null, snapGuides: [], nodeVisualStates: new Map() })
    if (outcome.shouldCommit) {
      commitGeometrySessionCheckpoint(session)
      updateFlowNodes(current => applyGeometry(current, outcome.geometry))
    }
    releaseGeometryPointerCapture(outcome.pointerId)
  }, [cancelGeometrySession, commitGeometrySessionCheckpoint,
    releaseGeometryPointerCapture, updateFlowNodes, updateGeometryUi])

  const finalizeMoveGeometrySession = useCallback((event?: unknown) => {
    const session = geometrySessionRef.current
    if (!session || session.kind !== 'move') return
    const pointer = event as { clientX?: number; clientY?: number; timeStamp?: number } | undefined
    if (pointer) {
      session.samples = appendPointerSample(session.samples, {
        x: Number(pointer.clientX ?? 0),
        y: Number(pointer.clientY ?? 0),
        time: Number(pointer.timeStamp ?? performance.now()),
      })
    }
    const plan = planNodeInertia(releaseVelocity(session.samples))
    if (!plan) {
      commitMoveGeometrySession(session)
      return
    }
    const desiredDelta = {
      x: screenDistanceToCanvas(plan.delta.x, session.viewport),
      y: screenDistanceToCanvas(plan.delta.y, session.viewport),
    }
    const members = [...session.collisionMemberIds].flatMap(id => {
      const rect = session.lastAcceptedGeometry.get(id)
      return rect ? [{ id, rect }] : []
    })
    let acceptedDelta = desiredDelta
    if (members.length > 0) {
      const targetRects = members.map(member => ({
        ...member.rect,
        x: member.rect.x + desiredDelta.x,
        y: member.rect.y + desiredDelta.y,
      }))
      const broadPhase = unionRect([...members.map(member => member.rect), ...targetRects])
      if (!broadPhase) {
        commitMoveGeometrySession(session)
        return
      }
      const thresholds = thresholdsForSnapshot(session.viewport)
      const obstacles = spatialIndexRef.current.query(expandRect(broadPhase, thresholds.safetyGap))
        .filter(record => !session.controlledNodeIds.has(record.id))
        .map(record => ({ id: record.id, rect: record.rect }))
      const swept = sweepRigidSet({ members, obstacles, delta: desiredDelta, thresholds, maxPasses: 4 })
      if (!swept.valid) {
        commitMoveGeometrySession(session)
        return
      }
      acceptedDelta = swept.delta
    }
    const startGeometry = new Map(session.lastAcceptedGeometry)
    const targetGeometry = new Map(startGeometry)
    for (const id of session.controlledNodeIds) {
      const rect = startGeometry.get(id)
      if (rect) targetGeometry.set(id, { ...rect, x: rect.x + acceptedDelta.x, y: rect.y + acceptedDelta.y })
    }
    const startedAt = performance.now()
    const animate = (now: number) => {
      if (geometrySessionRef.current !== session) return
      const progress = inertiaProgress(now - startedAt, plan.durationMs)
      const geometry = new Map(startGeometry)
      for (const [id, target] of targetGeometry) {
        const start = startGeometry.get(id)
        if (!start) continue
        geometry.set(id, {
          ...target,
          x: start.x + (target.x - start.x) * progress,
          y: start.y + (target.y - start.y) * progress,
        })
      }
      session.lastAcceptedGeometry = geometry
      updateFlowNodes(current => applyGeometry(current, geometry))
      if (progress >= 1) {
        session.inertiaFrame = null
        commitMoveGeometrySession(session)
        return
      }
      session.inertiaFrame = requestAnimationFrame(animate)
    }
    session.inertiaFrame = requestAnimationFrame(animate)
  }, [commitMoveGeometrySession, updateFlowNodes])

  const finishActiveMoveInertia = useCallback(() => {
    const session = geometrySessionRef.current
    if (!session || session.kind !== 'move' || session.inertiaFrame === null) return
    cancelAnimationFrame(session.inertiaFrame)
    session.inertiaFrame = null
    commitMoveGeometrySession(session)
  }, [commitMoveGeometrySession])

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

  const evaluateDrawGeometrySession = useCallback((
    draft: DrawGeometrySession,
    current: { x: number; y: number },
  ) => {
    draft.current = current
    if (!hasDrawableArea(draft.start, current)) {
      draft.candidate = null
      draft.invalid = false
      draft.snap = {}
      updateGeometryUi({ snapGuides: [], drawDraft: { ...draft } })
      return
    }
    const startCanvas = screenPointToCanvas({ clientX: draft.start.x, clientY: draft.start.y }, draft.viewport)
    const currentCanvas = screenPointToCanvas({ clientX: current.x, clientY: current.y }, draft.viewport)
    const rawCandidate = resolveZoomAwareTextDrawRect(startCanvas, currentCanvas, draft.viewport.zoom)
    const thresholds = thresholdsForSnapshot(draft.viewport)
    const obstacles = spatialIndexRef.current
      .query(expandRect(rawCandidate, thresholds.snapBreak + thresholds.safetyGap))
      .map(record => ({ id: record.id, rect: record.rect }))
    const snapped = resolveActiveEdgeSnap({
      candidate: rawCandidate,
      activeEdges: {
        x: current.x >= draft.start.x ? 'max' : 'min',
        y: current.y >= draft.start.y ? 'max' : 'min',
      },
      obstacles,
      thresholds,
      snap: draft.snap,
    })
    draft.snap = snapped.snap
    draft.candidate = snapped.rect
    const accepted = snapped.valid && candidateConflictAccepted(
      draft,
      [...collisionEntities(authoritativeNodesRef.current), { id: '__draw__', rect: snapped.rect }],
      false,
      false,
    )
    draft.invalid = !accepted
    updateGeometryUi({
      snapGuides: [
        ...(snapped.snap.x ? [{ axis: 'x' as const, position: snapped.snap.x.boundary }] : []),
        ...(snapped.snap.y ? [{ axis: 'y' as const, position: snapped.snap.y.boundary }] : []),
      ],
      drawDraft: { ...draft },
    })
  }, [updateGeometryUi])

  const finalizeDrawGeometrySession = useCallback((draft: DrawGeometrySession) => {
    evaluateDrawGeometrySession(draft, draft.current)
    const session = geometrySessionRef.current
    if (!session || session.kind !== 'draw') return
    if (!hasDrawableArea(draft.start, draft.current)) {
      geometrySessionRef.current = null
      updateGeometryUi({ drawDraft: null, snapGuides: [] })
      setNodes(current => current.map(node => ({ ...node, selected: false })))
      setEdges(current => current.map(edge => ({ ...edge, selected: false })))
      releaseGeometryPointerCapture(session.pointerId)
      return
    }
    if (session.invalid || !revalidateGeometrySession(session, authoritativeNodesRef.current)) {
      cancelGeometrySession('invalid-release')
      return
    }
    const rect = session.candidate!
    const id = crypto.randomUUID()
    geometrySessionRef.current = null
    updateGeometryUi({ drawDraft: null, snapGuides: [] })
    pushHistory()
    setNodes(current => [
      ...current.map(node => ({ ...node, selected: false })),
      {
        id,
        type: 'text',
        position: { x: rect.x, y: rect.y },
        width: rect.width,
        height: rect.height,
        selected: true,
        data: {
          label: '',
          textManualMinHeight: rect.height,
          backgroundColor: '#F2F1ED',
          textColor: '#202321',
          borderColor: '#D8D6CF',
          fontSize: screenDistanceToCanvas(15, session.viewport),
          contentScale: contentScaleForZoom(session.viewport.zoom),
        },
      },
    ])
    setEdges(current => current.map(edge => ({ ...edge, selected: false })))
    releaseGeometryPointerCapture(session.pointerId)
    requestAnimationFrame(() => emitter.emit('canvas-focus-node', id))
  }, [cancelGeometrySession, evaluateDrawGeometrySession, pushHistory,
    releaseGeometryPointerCapture, setEdges, setNodes, updateGeometryUi])

  const setRelationTargetHighlight = useCallback((targetId: string | null, targetHandle: string | null = null) => {
    const root = containerRef.current
    if (relationTargetRef.current) {
      const previous = root?.querySelector(`[data-id="${CSS.escape(relationTargetRef.current)}"]`)
      previous?.classList.remove('relation-target-active')
      previous?.querySelector('.relation-handle-target-active')?.classList.remove('relation-handle-target-active')
    }
    relationTargetRef.current = targetId
    if (targetId) {
      const target = root?.querySelector(`[data-id="${CSS.escape(targetId)}"]`)
      target?.classList.add('relation-target-active')
      if (targetHandle) {
        target?.querySelector(`.react-flow__handle[data-handleid="${CSS.escape(targetHandle)}"]`)
          ?.classList.add('relation-handle-target-active')
      }
    }
  }, [])

  const updateRelationPointerGeometry = useCallback((
    relation: RelationPointerSession,
    pointer: { x: number; y: number },
    targetId: string | null,
  ) => {
    const root = containerRef.current
    const sourceElement = root?.querySelector(`[data-id="${CSS.escape(relation.sourceId)}"]`)
    const sourceBounds = sourceElement?.getBoundingClientRect()
    const validTargetId = targetId && targetId !== relation.sourceId ? targetId : null
    const targetElement = validTargetId
      ? root?.querySelector(`[data-id="${CSS.escape(validTargetId)}"]`)
      : null
    const targetBounds = targetElement?.getBoundingClientRect()
    if (!sourceBounds) {
      relation.current = pointer
      relation.targetId = null
      relation.targetHandle = null
      setRelationTargetHighlight(null)
      return
    }
    const source = selectSourceRelationHandle(screenRect(sourceBounds), relation.sourceSide ?? 'bottom')
    const target = targetBounds ? selectTargetRelationHandle(screenRect(targetBounds), pointer) : null
    relation.start = source.point
    relation.sourceHandle = source.handleId
    relation.current = target?.point || pointer
    relation.targetId = target ? validTargetId : null
    relation.targetHandle = target?.handleId || null
    setRelationTargetHighlight(relation.targetId, relation.targetHandle)
  }, [setRelationTargetHighlight])

  const cancelPointerSessions = useCallback((
    pointerId?: number,
    geometryReason: 'pointercancel' | 'lost-capture' | 'window-blur' = 'lost-capture',
  ) => {
    let cancelledRightButtonSession = false
    const relation = relationSessionRef.current
    if (relation && (pointerId === undefined || relation.pointerId === pointerId)) {
      cancelledRightButtonSession = true
      relationSessionRef.current = null
      if (relation.captureElement.hasPointerCapture(relation.pointerId)) {
        relation.captureElement.releasePointerCapture(relation.pointerId)
      }
      setRelationPreview(null)
      setRelationTargetHighlight(null)
    }
    const marquee = marqueeSessionRef.current
    if (marquee && (pointerId === undefined || marquee.pointerId === pointerId)) {
      cancelledRightButtonSession = true
      marqueeSessionRef.current = null
      if (marquee.captureElement.hasPointerCapture(marquee.pointerId)) {
        marquee.captureElement.releasePointerCapture(marquee.pointerId)
      }
      setMarqueePreview(null)
    }
    const geometry = geometrySessionRef.current
    if (geometry && (pointerId === undefined || geometry.pointerId === pointerId || geometry.pointerId < 0)) {
      if (geometry.kind === 'move' && geometry.inertiaFrame !== null) {
        cancelAnimationFrame(geometry.inertiaFrame)
        geometry.inertiaFrame = null
        commitMoveGeometrySession(geometry)
      } else {
        cancelGeometrySession(geometryReason)
      }
    }
    if (cancelledRightButtonSession) suppressContextMenuRef.current = null
  }, [cancelGeometrySession, commitMoveGeometrySession, setRelationTargetHighlight])

  useEffect(() => {
    const cancelAll = () => cancelPointerSessions(undefined, 'window-blur')
    const cancelUncapturedPointer = (event: PointerEvent) => {
      if (
        relationSessionRef.current?.pointerId === event.pointerId
        || marqueeSessionRef.current?.pointerId === event.pointerId
        || (event.type === 'pointercancel' && geometrySessionRef.current?.pointerId === event.pointerId)
      ) cancelPointerSessions(event.pointerId, 'pointercancel')
    }
    window.addEventListener('blur', cancelAll)
    window.addEventListener('pointerup', cancelUncapturedPointer)
    window.addEventListener('pointercancel', cancelUncapturedPointer)
    return () => {
      window.removeEventListener('blur', cancelAll)
      window.removeEventListener('pointerup', cancelUncapturedPointer)
      window.removeEventListener('pointercancel', cancelUncapturedPointer)
      cancelAll()
    }
  }, [cancelPointerSessions])

  const handleBlockDrawPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button === 2 && event.target instanceof Element) {
      const nodeElement = event.target.closest('.react-flow__node')
      const sourceId = nodeElement?.getAttribute('data-id') || null
      if (canStartRelationGesture({
        button: event.button,
        sourceId,
        hasPreviewSnapshot: Boolean(previewSnapshot),
      })) {
        const element = event.currentTarget
        const session: RelationPointerSession = {
          pointerId: event.pointerId,
          sourceId: sourceId!,
          start: { x: event.clientX, y: event.clientY },
          current: { x: event.clientX, y: event.clientY },
          active: false,
          targetId: null,
          sourceHandle: 'bottom',
          sourceSide: null,
          targetHandle: null,
          captureElement: element,
        }
        try { element.setPointerCapture(event.pointerId) } catch { /* window listeners still guarantee cleanup */ }
        relationSessionRef.current = session
        return
      }
      if (
        tool === 'select'
        && !previewSnapshot
        && event.target.classList.contains('react-flow__pane')
      ) {
        const point = { x: event.clientX, y: event.clientY }
        const capturedViewport = captureCurrentViewport()
        if (!capturedViewport) return
        event.preventDefault()
        event.stopPropagation()
        event.currentTarget.setPointerCapture(event.pointerId)
        event.currentTarget.dataset.canvasGeometryPointer = String(event.pointerId)
        const session: DrawGeometrySession = {
          ...createGeometrySessionBase({
            pointerId: event.pointerId,
            viewport: capturedViewport,
            controlledNodeIds: new Set(),
            collisionMemberIds: new Set(['__draw__']),
            ignoreInternal: false,
          }),
          kind: 'draw',
          start: point,
          current: point,
          candidate: null,
          snap: {},
        }
        geometrySessionRef.current = session
        updateGeometryUi({ drawDraft: session })
      }
      return
    }
  }, [captureCurrentViewport, createGeometrySessionBase, previewSnapshot,
    tool, updateGeometryUi, updateRelationPointerGeometry])

  const handleBlockDrawPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const relation = relationSessionRef.current
    if (relation?.pointerId === event.pointerId) {
      relation.current = { x: event.clientX, y: event.clientY }
      if (!relation.active && Math.hypot(
        relation.current.x - relation.start.x,
        relation.current.y - relation.start.y,
      ) >= RELATION_DRAG_THRESHOLD) {
        relation.active = true
        relation.sourceSide = relationSourceSideFromVector({
          x: relation.current.x - relation.start.x,
          y: relation.current.y - relation.start.y,
        })
        suppressContextMenuRef.current = armContextMenuSuppression(Date.now())
        updateRelationPointerGeometry(relation, relation.current, null)
      }
      if (relation.active) {
        const target = globalThis.document.elementFromPoint(event.clientX, event.clientY)?.closest('.react-flow__node')?.getAttribute('data-id') || null
        updateRelationPointerGeometry(relation, relation.current, target)
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
        suppressContextMenuRef.current = armContextMenuSuppression(Date.now())
        try { event.currentTarget.setPointerCapture(event.pointerId) } catch { /* pointer already released */ }
      }
      if (marquee.active) {
        event.preventDefault()
        event.stopPropagation()
        setMarqueePreview({ ...marquee })
      }
      return
    }
    const geometrySession = geometrySessionRef.current
    if (geometrySession?.kind === 'draw' && geometrySession.pointerId === event.pointerId) {
      evaluateDrawGeometrySession(geometrySession, { x: event.clientX, y: event.clientY })
    }
  }, [evaluateDrawGeometrySession, updateRelationPointerGeometry])

  const handleBlockDrawPointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const relation = relationSessionRef.current
    if (relation?.pointerId === event.pointerId) {
      relationSessionRef.current = null
      if (!relation.active) return
      event.preventDefault()
      event.stopPropagation()
      suppressContextMenuRef.current = armContextMenuSuppression(Date.now())
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
      setRelationPreview(null)
      const targetId = relation.targetId || globalThis.document.elementFromPoint(event.clientX, event.clientY)?.closest('.react-flow__node')?.getAttribute('data-id') || null
      updateRelationPointerGeometry(relation, { x: event.clientX, y: event.clientY }, targetId)
      setRelationTargetHighlight(null)
      const nodeIds = new Set(nodes.map(node => node.id))
      if (!isValidRelationTarget(relation.sourceId, relation.targetId, nodeIds) || !relation.targetHandle) return
      const edgeId = crypto.randomUUID()
      const draft = createPendingRelationEdge({
        id: edgeId,
        source: relation.sourceId,
        target: relation.targetId!,
        sourceHandle: relation.sourceHandle,
        targetHandle: relation.targetHandle,
        data: normalizeRelationData(DEFAULT_RELATION),
      }) as Edge
      const root = containerRef.current
      const sourceElement = root?.querySelector(`[data-id="${CSS.escape(relation.sourceId)}"]`)
      const targetElement = root?.querySelector(`[data-id="${CSS.escape(relation.targetId!)}"]`)
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
        draft,
      })
      return
    }
    const marquee = marqueeSessionRef.current
    if (marquee?.pointerId === event.pointerId) {
      marqueeSessionRef.current = null
      if (!marquee.active) return
      event.preventDefault()
      event.stopPropagation()
      suppressContextMenuRef.current = armContextMenuSuppression(Date.now())
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
    finalizeDrawGeometrySession(completed)
  }, [drawDraft, finalizeDrawGeometrySession, nodes, screenToFlowPosition, setEdges, setNodes, setRelationTargetHighlight, updateRelationPointerGeometry])

  const handleBlockDrawPointerCancel = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    cancelPointerSessions(event.pointerId, 'pointercancel')
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }, [cancelPointerSessions])

  const saveRelationEditor = useCallback((value: CanvasRelationData) => {
    if (!relationEditor) return
    const result = commitRelationEditorTransaction(edges, relationEditor, normalizeRelationData(value))
    if (!result.changed) {
      setRelationEditor(null)
      return
    }
    pushHistory()
    setEdges(result.edges)
    setRelationEditor(null)
  }, [edges, pushHistory, relationEditor, setEdges])

  const cancelRelationEditor = useCallback(() => {
    setRelationEditor(null)
  }, [])

  const cleanupPersistedResources = useCallback(async (paths: string[]) => {
    await Promise.all(paths.map(async path => {
      try {
        const options = await getFilePathOptions(path)
        await remove(options.path, options.baseDir ? { baseDir: options.baseDir } : undefined)
      } catch (error) {
        console.error('Failed to clean up rejected canvas resource:', error)
      }
    }))
  }, [])

  const revalidatePlacement = useCallback((preview: PlacementPreview) => {
    const thresholds = thresholdsForSnapshot(preview.snapshot)
    const members = preview.nodes.flatMap(node => {
      if (!isSolidCanvasNode(node as CanvasNode)) return []
      const rect = nodeRect(node)
      return rect ? [{ id: node.id, rect }] : []
    })
    const solidCount = preview.nodes.filter(node => isSolidCanvasNode(node as CanvasNode)).length
    if (members.length !== solidCount) return false
    for (let left = 0; left < members.length; left += 1) {
      for (let right = left + 1; right < members.length; right += 1) {
        if (conflicts(members[left].rect, members[right].rect, thresholds)) return false
      }
    }
    const memberIds = new Set(members.map(member => member.id))
    const obstacles = collisionEntities(authoritativeNodesRef.current)
      .filter(obstacle => !memberIds.has(obstacle.id))
    return members.every(member => obstacles.every(obstacle => (
      !conflicts(member.rect, obstacle.rect, thresholds)
    )))
  }, [])

  const previewNearestFreePlacement = useCallback(async (input: {
    nodes: FlowCanvasNode[]
    targetTranslation: { x: number; y: number }
    snapshot: ViewportSnapshot
    resourcePaths?: string[]
  }): Promise<FlowCanvasNode[] | null> => {
    const members = input.nodes.flatMap(node => {
      if (!isSolidCanvasNode(node as CanvasNode)) return []
      const rect = nodeRect(node)
      return rect ? [{ id: node.id, rect }] : []
    })
    const result = members.length === 0
      ? { status: 'placed' as const, translation: input.targetTranslation, checkedCandidates: 1 }
      : findNearestFreePlacement({
        members,
        obstacles: collisionEntities(authoritativeNodesRef.current),
        targetTranslation: input.targetTranslation,
        snapshot: input.snapshot,
      })
    if (result.status !== 'placed' || !result.translation) {
      await cleanupPersistedResources(input.resourcePaths || [])
      toast.error(result.status === 'invalid-source'
        ? '请先解决所选区块的重叠'
        : '附近没有足够空间')
      return null
    }
    const placedNodes = input.nodes.map(node => ({
      ...node,
      position: {
        x: node.position.x + result.translation!.x,
        y: node.position.y + result.translation!.y,
      },
    }))
    const preview: PlacementPreview = {
      nodes: placedNodes,
      snapshot: input.snapshot,
      translation: result.translation,
    }
    const token = ++placementTokenRef.current
    updateGeometryUi({ placementPreview: preview })
    await new Promise(resolve => window.setTimeout(resolve, PLACEMENT_PREVIEW_MS))
    if (token !== placementTokenRef.current || !revalidatePlacement(preview)) {
      if (token === placementTokenRef.current) updateGeometryUi({ placementPreview: null })
      await cleanupPersistedResources(input.resourcePaths || [])
      toast.error('附近没有足够空间')
      return null
    }
    updateGeometryUi({ placementPreview: null })
    return placedNodes
  }, [cleanupPersistedResources, revalidatePlacement, updateGeometryUi])

  const getSelectedSnapshot = useCallback((): CanvasSnapshot | null => {
    const selectedNodes = nodes.filter(node => node.selected)
    if (selectedNodes.length === 0) return null
    const selectedIds = expandGroupControlledNodeIds(nodes, new Set(selectedNodes.map(node => node.id)))
    return cloneSnapshot(
      nodes.filter(node => selectedIds.has(node.id)),
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

  const insertSnapshot = useCallback(async (snapshot: CanvasSnapshot) => {
    const capturedViewport = captureCurrentViewport()
    if (!capturedViewport) return
    const materialized = materializeSnapshotCopy(snapshot)
    const pastedNodes = snapshot.nodes.map((node, index) => ({
      ...structuredClone(node),
      ...materialized.nodes[index],
      selected: true,
    }))
    const pastedEdges = materialized.edges.map(edge => ({ ...edge, selected: true }))
    const repeatOffset = screenDistanceToCanvas(32 * (pasteOffsetRef.current + 1), capturedViewport)
    const placedNodes = await previewNearestFreePlacement({
      nodes: pastedNodes,
      targetTranslation: { x: repeatOffset, y: repeatOffset },
      snapshot: capturedViewport,
    })
    if (!placedNodes) return
    pushHistory()
    pasteOffsetRef.current += 1
    setNodes(current => [...current.map(node => ({ ...node, selected: false })), ...placedNodes])
    setEdges(current => [...current.map(edge => ({ ...edge, selected: false })), ...pastedEdges])
  }, [captureCurrentViewport, previewNearestFreePlacement, pushHistory, setEdges, setNodes])

  const pasteSelection = useCallback(() => {
    if (!clipboardRef.current) return
    void insertSnapshot(clipboardRef.current)
  }, [insertSnapshot])

  const duplicateSelection = useCallback(() => {
    const snapshot = getSelectedSnapshot()
    if (!snapshot) return
    pasteOffsetRef.current = 0
    void insertSnapshot(snapshot)
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
    let normalizedPatch = patch
    let fontOnly = false
    if (Object.prototype.hasOwnProperty.call(patch, 'fontSize')) {
      if (!styleViewportSnapshot || typeof patch.fontSize !== 'number') return
      const fontSize = canvasFontSizeForScreenInput(patch.fontSize, styleViewportSnapshot)
      if (fontSize === null) return
      normalizedPatch = { ...patch, fontSize }
      fontOnly = true
    }
    if (!styleHistoryPushedRef.current) {
      pushHistory()
      styleHistoryPushedRef.current = true
    }
    setNodes(current => current.map(node => (
      node.selected && (!fontOnly || TEXT_CAPABLE_NODE_TYPES.has(node.type))
        ? { ...node, data: { ...node.data, ...normalizedPatch } }
        : node
    )))
  }, [pushHistory, setNodes, styleViewportSnapshot])

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

  const addNoteNode = useCallback(async (filePath: string, name: string) => {
    const capturedViewport = captureCurrentViewport()
    if (!capturedViewport) return
    const bounds = containerRef.current!.getBoundingClientRect()
    const target = screenPointToCanvas({
      clientX: bounds.left + bounds.width / 2,
      clientY: bounds.top + bounds.height / 2,
    }, capturedViewport)
    const size = screenSizeToCanvas({ width: 320, height: 180 }, capturedViewport)
    const node: FlowCanvasNode = {
      id: crypto.randomUUID(),
      type: 'note',
      position: { x: 0, y: 0 },
      width: size.width,
      height: size.height,
      data: {
        label: name,
        filePath,
        fontSize: screenDistanceToCanvas(15, capturedViewport),
        contentScale: contentScaleForZoom(capturedViewport.zoom),
      },
    }
    const placed = await previewNearestFreePlacement({
      nodes: [node],
      targetTranslation: target,
      snapshot: capturedViewport,
    })
    if (!placed) return
    pushHistory()
    setNodes(current => [...current, ...placed])
    setNotePickerOpen(false)
    toast.success(t('noteNode.added', { name }))
  }, [captureCurrentViewport, previewNearestFreePlacement, pushHistory, setNodes, t])

  const addImageNode = useCallback(async () => {
    const capturedViewport = captureCurrentViewport()
    if (!capturedViewport) return
    const startBounds = containerRef.current?.getBoundingClientRect()
    if (!startBounds) return
    const capturedCenter = {
      clientX: startBounds.left + startBounds.width / 2,
      clientY: startBounds.top + startBounds.height / 2,
    }
    const sourcePath = await open({
      multiple: false,
      filters: [{ name: t('nodes.image'), extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'] }],
    })
    if (!sourcePath || Array.isArray(sourcePath)) return
    const sourceBytes = await readFile(sourcePath)
    const extension = sourcePath.split('.').pop()?.toLowerCase() || 'png'
    const relativePath = `画布资源/${crypto.randomUUID()}.${extension}`
    const directoryOptions = await getFilePathOptions('画布资源')
    const destinationDirectory = directoryOptions.baseDir
      ? await join(await appDataDir(), directoryOptions.path)
      : directoryOptions.path
    await mkdir(
      directoryOptions.path,
      directoryOptions.baseDir ? { baseDir: directoryOptions.baseDir, recursive: true } : { recursive: true }
    )
    await assertWorkspaceAttachmentWriteAllowed(sourceBytes.byteLength, destinationDirectory)
    const targetOptions = await getFilePathOptions(relativePath)
    await writeFile(
      targetOptions.path,
      sourceBytes,
      targetOptions.baseDir ? { baseDir: targetOptions.baseDir } : undefined
    )
    const target = screenPointToCanvas(capturedCenter, capturedViewport)
    const size = screenSizeToCanvas({ width: 320, height: 220 }, capturedViewport)
    const node: FlowCanvasNode = {
      id: crypto.randomUUID(),
      type: 'image',
      position: { x: 0, y: 0 },
      width: size.width,
      height: size.height,
      data: {
        label: sourcePath.split(/[\\/]/).pop() || t('nodes.image'),
        imagePath: relativePath,
        fontSize: screenDistanceToCanvas(15, capturedViewport),
        contentScale: contentScaleForZoom(capturedViewport.zoom),
      },
    }
    const placed = await previewNearestFreePlacement({
      nodes: [node],
      targetTranslation: target,
      snapshot: capturedViewport,
      resourcePaths: [relativePath],
    })
    if (!placed) return
    try {
      await loadFileTree({ skipRemoteSync: true })
    } catch (error) {
      await cleanupPersistedResources([relativePath])
      console.error('Failed to register placed canvas image:', error)
      toast.error('无法把此内容加入画布')
      return
    }
    pushHistory()
    setNodes(current => [...current, ...placed])
  }, [captureCurrentViewport, cleanupPersistedResources, loadFileTree,
    previewNearestFreePlacement, pushHistory, setNodes, t])

  const persistIngestFile = useCallback(async (file: File) => {
    const directoryOptions = await getFilePathOptions('画布资源')
    const destinationDirectory = directoryOptions.baseDir
      ? await join(await appDataDir(), directoryOptions.path)
      : directoryOptions.path
    await assertWorkspaceAttachmentWriteAllowed(file.size, destinationDirectory)
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
    capturedViewport: ViewportSnapshot,
  ) => {
    const drafts = draftsFromTransfer(input)
    if (drafts.length === 0) return false
    const resourcePaths: string[] = []

    try {
      if (drafts.some(draft => 'file' in draft && draft.file)) {
        const directoryOptions = await getFilePathOptions('画布资源')
        await mkdir(
          directoryOptions.path,
          directoryOptions.baseDir
            ? { baseDir: directoryOptions.baseDir, recursive: true }
            : { recursive: true },
        )
      }

      const origin = screenPointToCanvas({
        clientX: screenOrigin.x,
        clientY: screenOrigin.y,
      }, capturedViewport)
      const materializedDrafts = drafts.map(draft => materializeIngestDraft(draft, capturedViewport))
      const preparedItems: Array<{ node: FlowCanvasNode; resourcePath?: string }> = []
      for (const item of stackIngestDrafts(materializedDrafts, capturedViewport)) {
        const position = item.position
        const draft = item.draft
        const materialized = item.draft
        let resourcePath: string | undefined
        try {
          if (draft.kind === 'text') {
            preparedItems.push({ node: {
              id: crypto.randomUUID(),
              type: 'text',
              position,
              width: materialized.canvasSize.width,
              height: materialized.canvasSize.height,
              selected: true,
              data: {
                label: draft.text,
                backgroundColor: '#F2F1ED',
                textColor: '#202321',
                borderColor: '#D8D6CF',
                fontSize: materialized.fontSize,
                contentScale: materialized.contentScale,
              },
            } })
            continue
          }
          if (draft.kind === 'link' || draft.kind === 'web-preview' || (draft.kind === 'video' && !draft.file && draft.url)) {
            preparedItems.push({ node: {
              id: crypto.randomUUID(),
              type: draft.kind,
              position,
              width: materialized.canvasSize.width,
              height: materialized.canvasSize.height,
              selected: true,
              data: {
                label: draft.label,
                url: draft.url,
                ...('metadata' in draft ? { metadata: draft.metadata } : {}),
                fontSize: materialized.fontSize,
                contentScale: materialized.contentScale,
              },
            } })
            continue
          }
          if (!draft.file) throw new Error('Ingest file is missing')
          resourcePath = await persistIngestFile(draft.file)
          const nodeType = draft.kind === 'image'
            ? 'image' as const
            : draft.kind === 'pdf'
              ? 'pdf' as const
              : draft.kind === 'video'
                ? 'video' as const
                : 'file' as const
          preparedItems.push({
            resourcePath,
            node: {
              id: crypto.randomUUID(),
              type: nodeType,
              position,
              width: materialized.canvasSize.width,
              height: materialized.canvasSize.height,
              selected: true,
              data: draft.kind === 'image'
                ? { label: draft.label, imagePath: resourcePath, fontSize: materialized.fontSize, contentScale: materialized.contentScale }
                : {
                    label: draft.label,
                    filePath: resourcePath,
                    metadata: draft.metadata,
                    fontSize: materialized.fontSize,
                    contentScale: materialized.contentScale,
                  },
            },
          })
        } catch {
          if (resourcePath) await cleanupPersistedResources([resourcePath])
        }
      }
      const prepared = preparedItems.map(item => item.node)
      resourcePaths.push(...preparedItems.flatMap(item => item.resourcePath ? [item.resourcePath] : []))

      if (prepared.length === 0) {
        toast.error('无法把此内容加入画布')
        return false
      }

      if (drafts.some(draft => 'file' in draft && draft.file)) {
        await loadFileTree({ skipRemoteSync: true })
      }
      const placed = await previewNearestFreePlacement({
        nodes: prepared,
        targetTranslation: origin,
        snapshot: capturedViewport,
        resourcePaths,
      })
      if (!placed) return false
      pushHistory()
      setNodes(current => [
        ...current.map(node => ({ ...node, selected: false })),
        ...placed,
      ])
      setEdges(current => current.map(edge => ({ ...edge, selected: false })))
      return true
    } catch (error) {
      await cleanupPersistedResources(resourcePaths)
      console.error('Failed to ingest canvas content:', error)
      toast.error('无法把此内容加入画布')
      return false
    }
  }, [cleanupPersistedResources, loadFileTree, persistIngestFile,
    previewNearestFreePlacement, pushHistory, setEdges, setNodes])

  const requestTransferIngest = useCallback((
    input: CanvasTransferInput,
    screenOrigin: { x: number; y: number },
    snapshot: ViewportSnapshot,
  ) => {
    const choice = transferUrlChoice(input)
    if (choice) {
      toast('添加链接内容', {
        description: choice.url,
        duration: Infinity,
        action: {
          label: choice.mediaKind === 'video' ? '作为视频' : '生成网页预览',
          onClick: () => void ingestTransfer({ ...input, urlChoice: choice.mediaKind }, screenOrigin, snapshot),
        },
        cancel: {
          label: '作为链接',
          onClick: () => void ingestTransfer({ ...input, urlChoice: 'link' }, screenOrigin, snapshot),
        },
      })
      return
    }
    void ingestTransfer(input, screenOrigin, snapshot)
  }, [ingestTransfer])

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
      const capturedViewport = captureCurrentViewport()
      if (!capturedViewport) return
      event.preventDefault()
      const bounds = root.getBoundingClientRect()
      requestTransferIngest(
        input,
        { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 },
        capturedViewport,
      )
    }
    window.addEventListener('paste', handlePaste)
    return () => window.removeEventListener('paste', handlePaste)
  }, [canvasId, captureCurrentViewport, requestTransferIngest])

  const handleCanvasDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    if (event.dataTransfer.types.includes(NOTE_REFERENCE_MIME)
      || event.dataTransfer.types.includes('Files')
      || event.dataTransfer.types.includes('text/plain')) {
      event.preventDefault()
      event.dataTransfer.dropEffect = 'copy'
    }
  }, [])

  const placeNoteReference = useCallback(async (
    payload: string,
    screenOrigin: { x: number; y: number },
    capturedViewport: ViewportSnapshot,
  ) => {
    const dropPlan = planNoteReferenceDrop(payload)
    if (dropPlan.status === 'invalid') return dropPlan
    const target = screenPointToCanvas({ clientX: screenOrigin.x, clientY: screenOrigin.y }, capturedViewport)
    const size = screenSizeToCanvas({ width: 320, height: 156 }, capturedViewport)
    const node: FlowCanvasNode = {
      id: crypto.randomUUID(),
      type: 'note',
      position: { x: 0, y: 0 },
      width: size.width,
      height: size.height,
      selected: true,
      data: {
        referenceId: noteReferenceId(Number(dropPlan.reference.sourceNoteId)),
        ...dropPlan.reference,
        fontSize: screenDistanceToCanvas(15, capturedViewport),
        contentScale: contentScaleForZoom(capturedViewport.zoom),
      },
    }
    const placed = await previewNearestFreePlacement({ nodes: [node], targetTranslation: target, snapshot: capturedViewport })
    return planNoteReferencePlacement(placed)
  }, [previewNearestFreePlacement])

  const handleCanvasDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    if (event.dataTransfer.types.includes(NOTE_REFERENCE_MIME)) {
      const capturedViewport = captureCurrentViewport()
      if (!capturedViewport) return
      const payload = event.dataTransfer.getData(NOTE_REFERENCE_MIME)
      event.preventDefault()
      event.stopPropagation()
      void placeNoteReference(payload, { x: event.clientX, y: event.clientY }, capturedViewport).then(function (plan) {
        if (plan.status !== 'placed') return
        if (plan.checkpoint) pushHistory()
        updateFlowNodes(current => [...current.map(existing => ({ ...existing, selected: false })), ...plan.placed])
      })
      return
    }
    const input: CanvasTransferInput = {
      files: [...event.dataTransfer.files],
      html: event.dataTransfer.getData('text/html'),
      text: event.dataTransfer.getData('text/plain'),
    }
    if (draftsFromTransfer(input).length === 0) return
    const capturedViewport = captureCurrentViewport()
    if (!capturedViewport) return
    event.preventDefault()
    event.stopPropagation()
    requestTransferIngest(input, { x: event.clientX, y: event.clientY }, capturedViewport)
  }, [captureCurrentViewport, placeNoteReference, pushHistory, requestTransferIngest, updateFlowNodes])

  const commitValidatedGeometryMutation = useCallback((
    candidateNodes: FlowCanvasNode[],
    controlledNodeIds: Set<string>,
    recordHistory = true,
  ) => {
    const capturedViewport = captureCurrentViewport()
    if (!capturedViewport) return false
    const collisionMemberIds = new Set(candidateNodes
      .filter(node => controlledNodeIds.has(node.id) && isSolidCanvasNode(node as CanvasNode))
      .map(node => node.id))
    const session = createGeometrySessionBase({
      pointerId: -1,
      viewport: capturedViewport,
      controlledNodeIds,
      collisionMemberIds,
      ignoreInternal: false,
    })
    session.lastAcceptedGeometry = geometryForNodes(candidateNodes, controlledNodeIds)
    const accepted = candidateConflictAccepted(
      session,
      collisionEntities(candidateNodes),
      false,
      true,
    )
    if (!accepted) {
      toast.error('位置重叠')
      return false
    }
    if (recordHistory) pushHistory()
    setNodes(candidateNodes)
    return true
  }, [captureCurrentViewport, createGeometrySessionBase, pushHistory, setNodes])

  const alignSelection = useCallback((axis: 'horizontal' | 'vertical') => {
    const selected = nodes.filter(node => node.selected)
    if (selected.length < 2) return
    const selectedIds = new Set(selected.map(node => node.id))
    if (axis === 'horizontal') {
      const centerY = selected.reduce((sum, node) => sum + node.position.y + (node.measured?.height || node.height || 56) / 2, 0) / selected.length
      commitValidatedGeometryMutation(nodes.map(node => node.selected ? {
        ...node,
        position: { ...node.position, y: centerY - (node.measured?.height || node.height || 56) / 2 },
      } : node), selectedIds)
    } else {
      const centerX = selected.reduce((sum, node) => sum + node.position.x + (node.measured?.width || node.width || 180) / 2, 0) / selected.length
      commitValidatedGeometryMutation(nodes.map(node => node.selected ? {
        ...node,
        position: { ...node.position, x: centerX - (node.measured?.width || node.width || 180) / 2 },
      } : node), selectedIds)
    }
  }, [commitValidatedGeometryMutation, nodes])

  const distributeSelection = useCallback((axis: 'horizontal' | 'vertical') => {
    const selected = nodes.filter(node => node.selected)
    if (selected.length < 3) return
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
    commitValidatedGeometryMutation(
      nodes.map(node => positions.has(node.id) ? { ...node, position: positions.get(node.id)! } : node),
      new Set(selected.map(node => node.id)),
    )
  }, [commitValidatedGeometryMutation, nodes])

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
    const arranged = nodes.map(node => arrangedById.get(node.id) || node)
    if (commitValidatedGeometryMutation(arranged, new Set(arranged.map(node => node.id)), recordHistory)) {
      requestAnimationFrame(() => void fitView({ padding: 0.2, duration: 300 }))
    }
  }, [commitValidatedGeometryMutation, document?.settings.layoutDirection, edges, fitView, nodes])

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
      nodes: serializeNodes(geometrySessionRef.current ? authoritativeNodesRef.current : nodes),
      edges: serializeEdges(edges),
      viewport,
      settings: { ...document.settings, ...settings },
    }
    lastStoreDocumentRef.current = nextDocument
    updateDocument(canvasId, nextDocument)
  }, [canvasId, document, edges, nodes, updateDocument, viewport])

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
      nodes: serializeNodes(geometrySessionRef.current ? authoritativeNodesRef.current : nodes),
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
          finishActiveMoveInertia()
          lastPointerIdRef.current = event.pointerId
          event.currentTarget.dataset.canvasGeometryPointer = String(event.pointerId)
          if (event.target instanceof HTMLElement) {
            event.target.dataset.canvasGeometryPointer = String(event.pointerId)
          }
          if (!isInteractiveCanvasTarget(event.target)) {
            containerRef.current?.focus({ preventScroll: true })
          }
        }}
      >
        <ContextMenu onOpenChange={open => {
          if (open) return
          setContextTarget('pane')
          setStyleViewportSnapshot(null)
          styleHistoryPushedRef.current = false
        }}>
          <ContextMenuTrigger asChild>
            <div
              className="size-full"
              onContextMenu={event => {
                const result = consumeContextMenuSuppression(suppressContextMenuRef.current, Date.now())
                suppressContextMenuRef.current = result.next
                if (!result.suppress) return
                event.preventDefault()
                event.stopPropagation()
              }}
              onDragOver={handleCanvasDragOver}
              onDrop={handleCanvasDrop}
              onPointerDownCapture={handleBlockDrawPointerDown}
              onPointerMove={handleBlockDrawPointerMove}
              onPointerUp={handleBlockDrawPointerUp}
              onPointerCancel={handleBlockDrawPointerCancel}
              onLostPointerCapture={event => cancelPointerSessions(event.pointerId)}
            >
              <ReactFlow
        style={{ '--canvas-visual-scale': Math.min(10, 1 / Math.max(MIN_CANVAS_ZOOM, viewport.zoom)) } as CSSProperties}
        className={cn(
          tool === 'select' && '[&_.react-flow__pane]:!cursor-default [&_.react-flow__node.canvas-image-tag-match]:!ring-2 [&_.react-flow__node.canvas-image-tag-match]:!ring-primary [&_.react-flow__node.canvas-image-tag-match]:!ring-offset-2 [&_.react-flow__node.relation-target-active]:!ring-2 [&_.react-flow__node.relation-target-active]:!ring-primary/50 [&_.react-flow__node.relation-target-active]:!ring-offset-2 [&_.react-flow__node.relation-target-active]:!ring-offset-background [&_.react-flow__handle.relation-handle-target-active]:!size-3.5 [&_.react-flow__handle.relation-handle-target-active]:!border-2 [&_.react-flow__handle.relation-handle-target-active]:!border-background [&_.react-flow__handle.relation-handle-target-active]:!bg-primary [&_.react-flow__handle.relation-handle-target-active]:!shadow-[0_0_0_5px_hsl(var(--primary)/0.28)]',
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
          setStyleViewportSnapshot(captureCurrentViewport())
          styleHistoryPushedRef.current = false
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
        onPaneContextMenu={event => {
          event.preventDefault()
          event.stopPropagation()
        }}
        onInit={() => {
          recordCanvasViewportSnapshot(canvasId, viewport)
          setReactFlowReady(true)
        }}
        onViewportChange={nextViewport => publishCanvasViewportState(canvasId, nextViewport)}
        onMove={(_event, viewport) => recordCanvasViewportSnapshot(canvasId, viewport)}
        onMoveEnd={(_event, viewport) => {
          if (transientEvidenceMoveRef.current) {
            transientEvidenceMoveRef.current = false
            if (transientEvidenceMoveTimerRef.current) clearTimeout(transientEvidenceMoveTimerRef.current)
            transientEvidenceMoveTimerRef.current = null
            return
          }
          persistViewport(viewport)
        }}
        onNodeDragStart={(event, node) => startMoveGeometrySession(event, node)}
        onNodeDrag={(event, node) => evaluateMoveGeometrySession(event, node)}
        onNodeDragStop={finalizeMoveGeometrySession}
        deleteKeyCode={null}
        nodesDraggable={!previewSnapshot && tool === 'select'}
        nodesConnectable={!previewSnapshot && (tool === 'select' || tool === 'connector')}
        elementsSelectable={!previewSnapshot && tool === 'select'}
        panOnDrag={[1]}
        selectionOnDrag={true}
        selectionMode={SelectionMode.Partial}
        snapToGrid={document.settings.snapToGrid}
        snapGrid={[20, 20]}
        viewport={viewport}
        minZoom={MIN_CANVAS_ZOOM}
        maxZoom={MAX_CANVAS_ZOOM}
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
          <CanvasGeometryOverlays guides={snapGuides} />
          <CanvasAiOverlay canvasId={canvasId} nodes={displayNodes} />
          <Panel position="top-left" className="!m-3">
            <CanvasLinearView
              canvasId={canvasId}
              nodes={nodes as CanvasNode[]}
              manualRelations={edges as CanvasEdge[]}
            />
          </Panel>
          <Panel position="bottom-right" className="!bottom-28 !m-3">
            <Button
              type="button"
              variant="secondary"
              size="icon-sm"
              aria-label="回到中心"
              title="回到中心"
              onClick={() => void fitView({ padding: 0.2, duration: 300 })}
            >
              <LocateFixed />
            </Button>
          </Panel>
          <MiniMap pannable zoomable nodeColor={minimapNodeColor} />
              </ReactFlow>
              {drawDraft && (
                <DrawGeometryPreview
                  draft={drawDraft}
                  containerBounds={containerRef.current?.getBoundingClientRect()}
                />
              )}
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
              {relationPreview?.active && (() => {
                const bounds = containerRef.current?.getBoundingClientRect()
                const start = {
                  x: relationPreview.start.x - (bounds?.left || 0),
                  y: relationPreview.start.y - (bounds?.top || 0),
                }
                const end = {
                  x: relationPreview.current.x - (bounds?.left || 0),
                  y: relationPreview.current.y - (bounds?.top || 0),
                }
                return (
                  <svg className="canvas-relation-preview pointer-events-none absolute inset-0 z-20 size-full overflow-visible">
                    <path
                      d={relationPreviewPath(start, end)}
                      fill="none"
                      stroke="hsl(var(--primary))"
                      strokeWidth="2.25"
                      strokeLinecap="round"
                      style={{ filter: 'drop-shadow(0 0 5px hsl(var(--primary) / 0.45))' }}
                    />
                    <circle cx={end.x} cy={end.y} r="4" fill="hsl(var(--primary))" />
                  </svg>
                )
              })()}
              {relationEditor && (() => {
                const edge = relationEditor.mode === 'create'
                  ? relationEditor.draft
                  : edges.find(item => item.id === relationEditor.edgeId)
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
                  fontSize: selectedScreenFontSize,
                  borderColor: selectedStyleNode.data.borderColor as string | undefined ?? selectedStyleNode.data.color as string | undefined,
                  borderStyle: selectedStyleNode.data.borderStyle as 'none' | 'solid' | 'dashed' | 'dotted' | undefined,
                  tags: Array.isArray(selectedStyleNode.data.tags) ? selectedStyleNode.data.tags as string[] : [],
                }}
                fontSizeMixed={selectedFontSizeMixed}
                onSessionStart={() => {}}
                onChange={applySelectedNodeStylePatch}
              />
            )}
            {contextTarget === 'node' && <ContextMenuSeparator />}
            {contextTarget === 'node' && selectedStyleNode?.type === 'image' && (
              <>
                <ContextMenuGroup>
                  <ContextMenuItem onSelect={() => setImageInfoNodeId(selectedStyleNode.id)}>
                    图片信息
                  </ContextMenuItem>
                  <ContextMenuItem
                    disabled={selectedImageRecognitionStatus === 'running'}
                    onSelect={() => {
                      const contentRevision = canvasNodeContentRevision(selectedStyleNode as CanvasNode)
                      void enqueueCanvasImageRecognition({
                        canvasId,
                        node: selectedStyleNode as CanvasNode,
                        contentRevision,
                      }, { force: true })
                    }}
                  >
                    {selectedImageRecognitionStatus ? '重新识别' : '识别图片'}
                  </ContextMenuItem>
                </ContextMenuGroup>
                <ContextMenuSeparator />
              </>
            )}
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
          <CanvasImageTagFilter
            catalog={imageTagCatalog}
            selectedTags={selectedImageTags}
            matchIndex={normalizedImageTagMatchIndex}
            matchCount={matchingImageIds.length}
            onToggleTag={toggleImageTagFilter}
            onPrevious={() => moveImageTagMatch(-1)}
            onNext={() => moveImageTagMatch(1)}
            onClear={() => clearCanvasImageTagFilter(canvasId)}
          />
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
        onZoomChange={zoom => animateCanvasViewportState(canvasId, { ...viewport, zoom }, 120)}
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

      <CanvasImageInfo
        open={Boolean(imageInfoNode)}
        initial={{
          name: imageInfoNode?.data.label || '',
          comment: imageInfoNode?.data.description || '',
          tags: imageInfoNode?.data.imageTags || [],
        }}
        catalog={imageTagCatalog}
        recent={recentImageTags}
        onOpenChange={open => { if (!open) setImageInfoNodeId(null) }}
        onSave={saveImageInfo}
      />

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
