import test from 'node:test'
import assert from 'node:assert/strict'
import {
  INITIAL_CANVAS_ZOOM,
  MAX_CANVAS_ZOOM,
  MIN_CANVAS_ZOOM,
  canvasSizeToScreen,
  captureViewportSnapshot,
  contentScaleForZoom,
  normalizeCanvasFontSize,
  screenDistanceToCanvas,
  screenPointToCanvas,
  screenSizeToCanvas,
} from '../../src/lib/canvas/viewport-sizing.ts'

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

test('conversion clamps captured zoom and uses persistent/display precision', () => {
  const minimum = captureViewportSnapshot({
    viewport: { x: 0, y: 0, zoom: -2 },
    containerRect: { left: 0, top: 0 },
    lastValid: { x: 0, y: 0, zoom: 0.02, containerLeft: 0, containerTop: 0, capturedAt: 1 },
  })
  const maximum = captureViewportSnapshot({
    viewport: { x: 0, y: 0, zoom: 12 },
    containerRect: { left: 0, top: 0 },
  })

  assert.equal(MIN_CANVAS_ZOOM, 0.1)
  assert.equal(MAX_CANVAS_ZOOM, 6)
  assert.equal(minimum?.zoom, MIN_CANVAS_ZOOM)
  assert.equal(maximum?.zoom, MAX_CANVAS_ZOOM)
  assert.equal(screenDistanceToCanvas(8.02, maximum), 1.3367)
  assert.deepEqual(canvasSizeToScreen({ width: 1.3367, height: -0.001 }, maximum), {
    width: 8.02,
    height: -0.01,
  })
})

test('font and content scaling retain valid values and safely fall back', () => {
  assert.equal(normalizeCanvasFontSize(23.0769), 23.0769)
  assert.equal(normalizeCanvasFontSize(Infinity), 15)
  assert.equal(normalizeCanvasFontSize(0, 18), 18)
  assert.equal(normalizeCanvasFontSize('15', 18), 18)
  assert.equal(contentScaleForZoom(MIN_CANVAS_ZOOM), 10)
  assert.equal(contentScaleForZoom(MAX_CANVAS_ZOOM), 0.1667)
  assert.equal(contentScaleForZoom(Number.NaN), 1.5385)
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
    zoom: 2,
    containerLeft: 20,
    containerTop: 30,
    capturedAt: snapshot?.capturedAt,
  })
})
