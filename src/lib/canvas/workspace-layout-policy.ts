export const LEFT_RAIL_DEFAULT_WIDTH = 320
export const LEFT_RAIL_MIN_WIDTH = 280
export const LEFT_RAIL_MAX_WIDTH = 420
export const LEFT_RAIL_COLLAPSED_WIDTH = 48
export const DOCUMENT_PANEL_DEFAULT_WIDTH = 420
export const DOCUMENT_PANEL_MIN_WIDTH = 360
export const DOCUMENT_PANEL_MAX_RATIO = 0.55
export const CANVAS_MIN_WIDTH = 480
export const WORKSPACE_DIVIDER_WIDTH = 4

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
  autoLeftCollapsed: boolean
  leftWidth: number
  documentPanelCollapsed: boolean
  autoDocumentPanelCollapsed: boolean
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

export function normalizeLeftRailWidth(width: number) {
  return clamp(width, LEFT_RAIL_MIN_WIDTH, LEFT_RAIL_MAX_WIDTH)
}

export function normalizeDocumentPanelWidth(width: number, windowWidth: number) {
  return clamp(
    width,
    DOCUMENT_PANEL_MIN_WIDTH,
    Math.max(DOCUMENT_PANEL_MIN_WIDTH, Math.max(0, windowWidth) * DOCUMENT_PANEL_MAX_RATIO),
  )
}

export function normalizeWorkspaceLayout(
  preferences: Partial<CanvasWorkspacePreferences>,
  windowWidth: number,
): ResolvedWorkspaceLayout {
  const safeWindowWidth = Math.max(0, windowWidth)
  const merged = { ...DEFAULT_CANVAS_WORKSPACE_PREFERENCES, ...preferences }
  const leftWidth = normalizeLeftRailWidth(merged.leftWidth)
  const documentPanelWidth = normalizeDocumentPanelWidth(merged.documentPanelWidth, safeWindowWidth)

  // The document panel yields first, then the left rail. The canvas is never collapsed.
  // A persisted manual collapse frees its space before we decide whether the other
  // panel needs to yield. Divider widths are part of the actual flex layout too.
  const manualLeftWidth = merged.leftCollapsed ? LEFT_RAIL_COLLAPSED_WIDTH : leftWidth
  const manualLeftDividerWidth = merged.leftCollapsed ? 0 : WORKSPACE_DIVIDER_WIDTH
  const autoDocumentPanelCollapsed = !merged.documentPanelCollapsed
    && safeWindowWidth < manualLeftWidth + manualLeftDividerWidth + CANVAS_MIN_WIDTH + WORKSPACE_DIVIDER_WIDTH + documentPanelWidth
  const resolvedDocumentPanelCollapsed = merged.documentPanelCollapsed || autoDocumentPanelCollapsed
  const autoLeftCollapsed = !merged.leftCollapsed
    && resolvedDocumentPanelCollapsed
    && safeWindowWidth < leftWidth + WORKSPACE_DIVIDER_WIDTH + CANVAS_MIN_WIDTH
  const resolvedLeftCollapsed = merged.leftCollapsed || autoLeftCollapsed
  const resolvedLeftWidth = resolvedLeftCollapsed ? LEFT_RAIL_COLLAPSED_WIDTH : leftWidth
  const resolvedDocumentWidth = resolvedDocumentPanelCollapsed ? 0 : documentPanelWidth
  const resolvedDividerWidth = (resolvedLeftCollapsed ? 0 : WORKSPACE_DIVIDER_WIDTH)
    + (resolvedDocumentPanelCollapsed ? 0 : WORKSPACE_DIVIDER_WIDTH)

  return {
    preferences: {
      ...merged,
      leftWidth,
      documentPanelWidth,
    },
    windowWidth: safeWindowWidth,
    leftCollapsed: resolvedLeftCollapsed,
    autoLeftCollapsed,
    leftWidth: resolvedLeftWidth,
    documentPanelCollapsed: resolvedDocumentPanelCollapsed,
    autoDocumentPanelCollapsed,
    documentPanelWidth: resolvedDocumentWidth,
    canvasWidth: Math.max(0, safeWindowWidth - resolvedLeftWidth - resolvedDocumentWidth - resolvedDividerWidth),
  }
}
