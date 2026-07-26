export const LEFT_RAIL_DEFAULT_WIDTH = 320
export const LEFT_RAIL_MIN_WIDTH = 280
export const LEFT_RAIL_MAX_WIDTH = 420
export const LEFT_RAIL_COLLAPSED_WIDTH = 48
export const DOCUMENT_PANEL_DEFAULT_WIDTH = 420
export const DOCUMENT_PANEL_MIN_WIDTH = 360
export const DOCUMENT_PANEL_MAX_RATIO = 0.55
export const CANVAS_MIN_WIDTH = 480

export interface CanvasWorkspacePreferences {
  leftCollapsed: boolean
  leftWidth: number
  leftTab: 'files' | 'notes' | 'canvases'
  documentPanelCollapsed: boolean
  documentPanelWidth: number
}

export interface ResolvedWorkspaceLayout {
  preferences: CanvasWorkspacePreferences
  windowWidth: number
  leftCollapsed: boolean
  leftWidth: number
  documentPanelCollapsed: boolean
  documentPanelWidth: number
  canvasWidth: number
}

export const DEFAULT_CANVAS_WORKSPACE_PREFERENCES: CanvasWorkspacePreferences = {
  leftCollapsed: false,
  leftWidth: LEFT_RAIL_DEFAULT_WIDTH,
  leftTab: 'files',
  documentPanelCollapsed: false,
  documentPanelWidth: DOCUMENT_PANEL_DEFAULT_WIDTH,
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

export function normalizeWorkspaceLayout(
  preferences: Partial<CanvasWorkspacePreferences>,
  windowWidth: number,
): ResolvedWorkspaceLayout {
  const safeWindowWidth = Math.max(0, windowWidth)
  const merged = { ...DEFAULT_CANVAS_WORKSPACE_PREFERENCES, ...preferences }
  const leftWidth = clamp(merged.leftWidth, LEFT_RAIL_MIN_WIDTH, LEFT_RAIL_MAX_WIDTH)
  const documentPanelWidth = clamp(
    merged.documentPanelWidth,
    DOCUMENT_PANEL_MIN_WIDTH,
    Math.max(DOCUMENT_PANEL_MIN_WIDTH, safeWindowWidth * DOCUMENT_PANEL_MAX_RATIO),
  )

  // The document panel yields first, then the left rail. The canvas is never collapsed.
  const mustCollapseDocument = safeWindowWidth < leftWidth + CANVAS_MIN_WIDTH + documentPanelWidth
  const resolvedDocumentPanelCollapsed = merged.documentPanelCollapsed || mustCollapseDocument
  const mustCollapseLeft = resolvedDocumentPanelCollapsed && safeWindowWidth < leftWidth + CANVAS_MIN_WIDTH
  const resolvedLeftCollapsed = merged.leftCollapsed || mustCollapseLeft
  const resolvedLeftWidth = resolvedLeftCollapsed ? LEFT_RAIL_COLLAPSED_WIDTH : leftWidth
  const resolvedDocumentWidth = resolvedDocumentPanelCollapsed ? 0 : documentPanelWidth

  return {
    preferences: {
      ...merged,
      leftWidth,
      documentPanelWidth,
    },
    windowWidth: safeWindowWidth,
    leftCollapsed: resolvedLeftCollapsed,
    leftWidth: resolvedLeftWidth,
    documentPanelCollapsed: resolvedDocumentPanelCollapsed,
    documentPanelWidth: resolvedDocumentWidth,
    canvasWidth: Math.max(0, safeWindowWidth - resolvedLeftWidth - resolvedDocumentWidth),
  }
}
