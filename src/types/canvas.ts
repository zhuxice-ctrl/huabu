export type CanvasProjectType =
  | 'blank'
  | 'flowchart'
  | 'mindmap'
  | 'timeline'
  | 'quadrant'
  | 'kanban'
  | 'swot'

export type CanvasTool =
  | 'select'
  | 'hand'
  | 'pen'
  | 'highlighter'
  | 'eraser'
  | 'rectangle'
  | 'text'
  | 'connector'

export type CanvasNodeType =
  | 'process'
  | 'decision'
  | 'terminator'
  | 'text'
  | 'note'
  | 'image'
  | 'file'
  | 'link'
  | 'todo'
  | 'group'
  | 'freehand'

export interface CanvasPoint {
  x: number
  y: number
  pressure: number
}

/** Persisted node payload. Geometry-session visuals and conflict state stay editor-only. */
export interface CanvasNodeData extends Record<string, unknown> {
  label?: string
  description?: string
  color?: string
  borderStyle?: 'none' | 'solid' | 'dashed' | 'dotted'
  backgroundColor?: string
  textColor?: string
  fontSize?: number
  borderColor?: string
  borderWidth?: number
  fillColor?: string
  fillStyle?: 'default' | 'tint'
  strokeWidth?: number
  pathStrokeWidth?: number
  opacity?: number
  contentScale?: number
  points?: CanvasPoint[]
  path?: string
  width?: number
  height?: number
  drawingTool?: 'pen' | 'highlighter'
  filePath?: string
  imagePath?: string
  url?: string
  checked?: boolean
  childIds?: string[]
  previewState?: 'add' | 'update' | 'delete'
}

export interface CanvasNode {
  id: string
  type: CanvasNodeType
  position: { x: number; y: number }
  data: CanvasNodeData
  width?: number
  height?: number
  selected?: boolean
  draggable?: boolean
  connectable?: boolean
  zIndex?: number
}

export type CanvasRelationRouteType = 'auto' | 'bezier' | 'straight' | 'orthogonal' | 'manual'

export interface CanvasRelationWaypoint {
  x: number
  y: number
}

export interface CanvasRelationData extends Record<string, unknown> {
  label: string
  direction: 'forward' | 'both'
  lineStyle: 'solid' | 'dashed' | 'dotted'
  color: string
  source: 'manual' | 'ai'
  routeType?: CanvasRelationRouteType
  strokeWidth?: number
  waypoints?: CanvasRelationWaypoint[]
}

export interface CanvasEdge {
  id: string
  source: string
  target: string
  sourceHandle?: string | null
  targetHandle?: string | null
  label?: string
  type?: string
  data?: CanvasRelationData
}

export interface CanvasViewport {
  x: number
  y: number
  zoom: number
}

export interface CanvasSize {
  width: number
  height: number
}

export interface CanvasDocument {
  schemaVersion: 1
  nodes: CanvasNode[]
  edges: CanvasEdge[]
  viewport: CanvasViewport
  settings: {
    layoutDirection: 'TB' | 'LR'
    showGrid: boolean
    snapToGrid: boolean
    backgroundColor?: string
  }
}

export interface CanvasHistorySnapshot {
  nodes: CanvasNode[]
  edges: CanvasEdge[]
}

export interface CanvasHistoryState {
  undo: CanvasHistorySnapshot[]
  redo: CanvasHistorySnapshot[]
}

export interface CanvasProject {
  id: string
  title: string
  canvasType: CanvasProjectType
  schemaVersion: number
  document: CanvasDocument
  history?: CanvasHistoryState
  thumbnailPath?: string | null
  thumbnailRevision?: number
  createdAt: number
  updatedAt: number
  pinnedAt?: number | null
  deletedAt?: number | null
}

export interface CanvasProjectRow {
  id: string
  title: string
  canvasType: CanvasProjectType
  schemaVersion: number
  content: string
  undoStack?: string | null
  redoStack?: string | null
  thumbnailPath?: string | null
  createdAt: number
  updatedAt: number
  pinnedAt?: number | null
  deletedAt?: number | null
}

export const DEFAULT_CANVAS_DOCUMENT: CanvasDocument = {
  schemaVersion: 1,
  nodes: [],
  edges: [],
  viewport: { x: 0, y: 0, zoom: 0.65 },
  settings: {
    layoutDirection: 'TB',
    showGrid: true,
    snapToGrid: false,
  },
}

export function normalizeCanvasDocument(value: unknown): CanvasDocument {
  if (!value || typeof value !== 'object') {
    return structuredClone(DEFAULT_CANVAS_DOCUMENT)
  }

  const candidate = value as Partial<CanvasDocument>
  const viewport = candidate.viewport
  return {
    schemaVersion: 1,
    nodes: Array.isArray(candidate.nodes) ? candidate.nodes : [],
    edges: Array.isArray(candidate.edges) ? candidate.edges : [],
    viewport: {
      x: typeof viewport?.x === 'number' && Number.isFinite(viewport.x) ? viewport.x : 0,
      y: typeof viewport?.y === 'number' && Number.isFinite(viewport.y) ? viewport.y : 0,
      zoom: typeof viewport?.zoom === 'number' && Number.isFinite(viewport.zoom)
        ? Math.min(6, Math.max(0.1, viewport.zoom))
        : 0.65,
    },
    settings: {
      ...DEFAULT_CANVAS_DOCUMENT.settings,
      ...(candidate.settings || {}),
    },
  }
}
