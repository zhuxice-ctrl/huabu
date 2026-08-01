import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  INITIAL_CANVAS_ZOOM,
  MAX_CANVAS_ZOOM,
  MIN_CANVAS_ZOOM,
  canvasSizeToScreen,
  captureViewportSnapshot,
  contentScaleForZoom,
  normalizeCanvasFontSize,
  resolveZoomAwareTextDrawRect,
  resolveZoomAwareTextDrawSize,
  screenDistanceToCanvas,
  screenPointToCanvas,
  screenSizeToCanvas,
} from '../../src/lib/canvas/viewport-sizing.ts'

test('drawn text soft minimum grows sublinearly above 100 percent', () => {
  assert.deepEqual(resolveZoomAwareTextDrawSize({ width: 40, height: 20 }, 1), { width: 160, height: 88 })
  assert.deepEqual(resolveZoomAwareTextDrawSize({ width: 40, height: 20 }, 2), { width: 160, height: 88 })
  assert.deepEqual(resolveZoomAwareTextDrawSize({ width: 40, height: 20 }, 6), { width: 160, height: 88 })
  assert.deepEqual(resolveZoomAwareTextDrawSize({ width: 300, height: 120 }, 6), { width: 300, height: 120 })
})

test('reverse drag expands the soft minimum toward the pointer direction', () => {
  assert.deepEqual(resolveZoomAwareTextDrawRect({ x: 200, y: 160 }, { x: 190, y: 150 }, 2), {
    x: 40, y: 72, width: 160, height: 88,
  })
})
import { DEFAULT_CANVAS_DOCUMENT, normalizeCanvasDocument } from '../../src/types/canvas.ts'

test('screen dimensions round-trip through one captured 65% snapshot', () => {
  const snapshot = captureViewportSnapshot({
    viewport: { x: 12, y: 8, zoom: 0.65 },
    containerRect: { left: 20, top: 30 },
  })

  assert.ok(snapshot)
  assert.deepEqual(screenSizeToCanvas({ width: 260, height: 130 }, snapshot), {
    width: 400,
    height: 200,
  })
  assert.deepEqual(canvasSizeToScreen({ width: 400, height: 200 }, snapshot), {
    width: 260,
    height: 130,
  })
  assert.equal(contentScaleForZoom(snapshot.zoom), 1.5385)
  assert.ok(Object.isFrozen(snapshot))
})

test('conversion clamps every finite captured zoom and uses persistent/display precision', () => {
  const zero = captureViewportSnapshot({
    viewport: { x: 0, y: 0, zoom: 0 },
    containerRect: { left: 0, top: 0 },
    lastValid: { x: 0, y: 0, zoom: 2, containerLeft: 0, containerTop: 0, capturedAt: 1 },
  })
  const negative = captureViewportSnapshot({
    viewport: { x: 0, y: 0, zoom: -2 },
    containerRect: { left: 0, top: 0 },
    lastValid: { x: 0, y: 0, zoom: 2, containerLeft: 0, containerTop: 0, capturedAt: 1 },
  })
  const nonFinite = captureViewportSnapshot({
    viewport: { x: 0, y: 0, zoom: Number.NaN },
    containerRect: { left: 0, top: 0 },
    lastValid: { x: 0, y: 0, zoom: 2, containerLeft: 0, containerTop: 0, capturedAt: 1 },
  })
  const maximum = captureViewportSnapshot({
    viewport: { x: 0, y: 0, zoom: 12 },
    containerRect: { left: 0, top: 0 },
  })

  assert.equal(MIN_CANVAS_ZOOM, 0.001)
  assert.equal(MAX_CANVAS_ZOOM, 1)
  assert.equal(zero?.zoom, MIN_CANVAS_ZOOM)
  assert.equal(negative?.zoom, MIN_CANVAS_ZOOM)
  assert.equal(nonFinite?.zoom, 1)
  assert.equal(maximum?.zoom, MAX_CANVAS_ZOOM)
  assert.equal(screenDistanceToCanvas(8.02, maximum), 8.02)
  assert.deepEqual(canvasSizeToScreen({ width: 1.3367, height: -0.001 }, maximum), {
    width: 1.34,
    height: 0,
  })
})

test('document normalization clamps finite zoom, uses defaults only for non-finite zoom, and preserves node data', () => {
  const nodes = [
    {
      id: 'missing-font',
      type: 'text',
      position: { x: 0, y: 0 },
      width: 321.2345,
      height: 123.4567,
      data: { contentScale: undefined },
    },
    {
      id: 'invalid-font',
      type: 'text',
      position: { x: 0, y: 0 },
      width: 456.7891,
      height: 987.6543,
      data: { fontSize: Number.NaN, contentScale: Number.POSITIVE_INFINITY },
    },
  ]

  const inRange = normalizeCanvasDocument({ nodes, edges: [], viewport: { x: 12, y: -8, zoom: 0.65 } })
  const zero = normalizeCanvasDocument({ nodes, edges: [], viewport: { x: 12, y: -8, zoom: 0 } })
  const negative = normalizeCanvasDocument({ nodes, edges: [], viewport: { x: 12, y: -8, zoom: -2 } })
  const nonFinite = normalizeCanvasDocument({ nodes, edges: [], viewport: { x: 12, y: -8, zoom: Number.NaN } })

  assert.deepEqual(inRange.viewport, { x: 12, y: -8, zoom: 0.65 })
  assert.equal(zero.viewport.zoom, MIN_CANVAS_ZOOM)
  assert.equal(negative.viewport.zoom, MIN_CANVAS_ZOOM)
  assert.equal(nonFinite.viewport.zoom, INITIAL_CANVAS_ZOOM)
  assert.equal(inRange.nodes[0], nodes[0])
  assert.equal(inRange.nodes[1], nodes[1])
  assert.equal(Object.hasOwn(inRange.nodes[0].data, 'fontSize'), false)
  assert.ok(Number.isNaN(inRange.nodes[1].data.fontSize))
  assert.equal(inRange.nodes[0].data.contentScale, undefined)
  assert.equal(inRange.nodes[1].data.contentScale, Number.POSITIVE_INFINITY)
  assert.equal(inRange.nodes[0].width, 321.2345)
  assert.equal(inRange.nodes[1].height, 987.6543)
})

test('blank and template defaults use 65%, and file import delegates to document normalization', () => {
  const templates = readFileSync(new URL('../../src/lib/canvas/templates.ts', import.meta.url), 'utf8')
  const fileFormat = readFileSync(new URL('../../src/lib/canvas/file-format.ts', import.meta.url), 'utf8')

  assert.equal(DEFAULT_CANVAS_DOCUMENT.viewport.zoom, INITIAL_CANVAS_ZOOM)
  assert.equal((templates.match(/viewport: \{ x: -?\d+, y: -?\d+, zoom: 0\.65 \}/g) || []).length, 6)
  assert.match(fileFormat, /const document = normalizeCanvasDocument\(rawDocument\)/)
})

test('font and content scaling retain valid values and safely fall back', () => {
  assert.equal(normalizeCanvasFontSize(23.0769), 23.0769)
  assert.equal(normalizeCanvasFontSize(Infinity), 15)
  assert.equal(normalizeCanvasFontSize(0, 18), 18)
  assert.equal(normalizeCanvasFontSize('15', 18), 18)
  assert.equal(contentScaleForZoom(MIN_CANVAS_ZOOM), 10)
  assert.equal(contentScaleForZoom(MAX_CANVAS_ZOOM), 1)
  assert.equal(contentScaleForZoom(Number.NaN), 1.5385)
  const negativeZero = screenDistanceToCanvas(-0, {
    x: 0,
    y: 0,
    zoom: 1,
    containerLeft: 0,
    containerTop: 0,
    capturedAt: 1,
  })
  assert.equal(negativeZero, 0)
  assert.equal(Object.is(negativeZero, -0), false)
})

test('point conversion applies the container origin and captured translation', () => {
  const snapshot = captureViewportSnapshot({
    viewport: { x: 12, y: 8, zoom: 0.65 },
    containerRect: { left: 20, top: 30 },
  })

  assert.ok(snapshot)
  assert.deepEqual(screenPointToCanvas({ clientX: 292, clientY: 168 }, snapshot), {
    x: 400,
    y: 200,
  })
})

test('invalid container coordinates cancel capture and viewport fields fall back independently', () => {
  assert.equal(captureViewportSnapshot({
    viewport: { x: 0, y: 0, zoom: INITIAL_CANVAS_ZOOM },
    containerRect: null,
  }), null)
  assert.equal(captureViewportSnapshot({
    viewport: { x: 0, y: 0, zoom: INITIAL_CANVAS_ZOOM },
    containerRect: { left: Number.NaN, top: 0 },
  }), null)

  const snapshot = captureViewportSnapshot({
    viewport: { x: Number.NaN, y: Number.POSITIVE_INFINITY, zoom: Number.NaN },
    containerRect: { left: 20, top: 30 },
    lastValid: { x: 12, y: -8, zoom: 2, containerLeft: 1, containerTop: 1, capturedAt: 1 },
  })

  assert.deepEqual(snapshot, {
    x: 12,
    y: -8,
    zoom: 1,
    containerLeft: 20,
    containerTop: 30,
    capturedAt: snapshot?.capturedAt,
  })
})
