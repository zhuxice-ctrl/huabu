import type { CanvasSize, CanvasViewport } from '@/types/canvas'

export const INITIAL_CANVAS_ZOOM = 0.65
export const MIN_CANVAS_ZOOM = 0.1
export const MAX_CANVAS_ZOOM = 6

const MIN_CONTENT_SCALE = 0.1667
const MAX_CONTENT_SCALE = 10
const DEFAULT_CANVAS_FONT_SIZE = 15

export interface ViewportSnapshot {
  x: number
  y: number
  zoom: number
  containerLeft: number
  containerTop: number
  capturedAt: number
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isPositiveFiniteNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value > 0
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits
  const result = Math.round((value + Number.EPSILON) * factor) / factor
  return Object.is(result, -0) ? 0 : result
}

function round4(value: number): number {
  return round(value, 4)
}

function round2(value: number): number {
  return round(value, 2)
}

function normalizeZoom(value: unknown, fallback = INITIAL_CANVAS_ZOOM): number {
  const resolved = isPositiveFiniteNumber(value)
    ? value
    : isPositiveFiniteNumber(fallback)
      ? fallback
      : INITIAL_CANVAS_ZOOM
  return clamp(resolved, MIN_CANVAS_ZOOM, MAX_CANVAS_ZOOM)
}

function fallbackCoordinate(value: unknown, lastValid: number | undefined): number {
  if (isFiniteNumber(value)) return value
  return isFiniteNumber(lastValid) ? lastValid : 0
}

function snapshotZoom(snapshot: ViewportSnapshot): number {
  return normalizeZoom(snapshot.zoom)
}

export function captureViewportSnapshot(input: {
  viewport: CanvasViewport
  containerRect: Pick<DOMRect, 'left' | 'top'> | null
  lastValid?: ViewportSnapshot | null
}): Readonly<ViewportSnapshot> | null {
  const { containerRect, lastValid, viewport } = input
  if (!containerRect || !isFiniteNumber(containerRect.left) || !isFiniteNumber(containerRect.top)) {
    return null
  }

  return Object.freeze({
    x: fallbackCoordinate(viewport.x, lastValid?.x),
    y: fallbackCoordinate(viewport.y, lastValid?.y),
    zoom: normalizeZoom(viewport.zoom, lastValid?.zoom),
    containerLeft: containerRect.left,
    containerTop: containerRect.top,
    capturedAt: Date.now(),
  })
}

export function screenPointToCanvas(
  point: { clientX: number; clientY: number },
  snapshot: ViewportSnapshot,
): { x: number; y: number } {
  const zoom = snapshotZoom(snapshot)
  return {
    x: round4((point.clientX - snapshot.containerLeft - snapshot.x) / zoom),
    y: round4((point.clientY - snapshot.containerTop - snapshot.y) / zoom),
  }
}

export function screenDistanceToCanvas(value: number, snapshot: ViewportSnapshot): number {
  return round4(value / snapshotZoom(snapshot))
}

export function screenSizeToCanvas(size: CanvasSize, snapshot: ViewportSnapshot): CanvasSize {
  return {
    width: screenDistanceToCanvas(size.width, snapshot),
    height: screenDistanceToCanvas(size.height, snapshot),
  }
}

export function canvasSizeToScreen(size: CanvasSize, snapshot: ViewportSnapshot): CanvasSize {
  const zoom = snapshotZoom(snapshot)
  return {
    width: round2(size.width * zoom),
    height: round2(size.height * zoom),
  }
}

export function contentScaleForZoom(zoom: number): number {
  return clamp(round4(1 / normalizeZoom(zoom)), MIN_CONTENT_SCALE, MAX_CONTENT_SCALE)
}

export function normalizeCanvasFontSize(value: unknown, fallback = DEFAULT_CANVAS_FONT_SIZE): number {
  if (isPositiveFiniteNumber(value)) return value
  return isPositiveFiniteNumber(fallback) ? fallback : DEFAULT_CANVAS_FONT_SIZE
}
