import assert from 'node:assert/strict'
import test from 'node:test'

import {
  CANVAS_MIN_WIDTH,
  DOCUMENT_PANEL_DEFAULT_WIDTH,
  DOCUMENT_PANEL_MAX_RATIO,
  DOCUMENT_PANEL_MIN_WIDTH,
  LEFT_RAIL_COLLAPSED_WIDTH,
  LEFT_RAIL_DEFAULT_WIDTH,
  LEFT_RAIL_MAX_WIDTH,
  LEFT_RAIL_MIN_WIDTH,
  normalizeWorkspaceLayout,
} from '../../src/lib/canvas/workspace-layout-policy.ts'

test('normalizes the desktop canvas workspace defaults and panel limits', () => {
  const layout = normalizeWorkspaceLayout({}, 1600)

  assert.equal(LEFT_RAIL_DEFAULT_WIDTH, 320)
  assert.equal(LEFT_RAIL_MIN_WIDTH, 280)
  assert.equal(LEFT_RAIL_MAX_WIDTH, 420)
  assert.equal(LEFT_RAIL_COLLAPSED_WIDTH, 48)
  assert.equal(DOCUMENT_PANEL_DEFAULT_WIDTH, 420)
  assert.equal(DOCUMENT_PANEL_MIN_WIDTH, 360)
  assert.equal(DOCUMENT_PANEL_MAX_RATIO, 0.55)
  assert.equal(layout.leftWidth, 320)
  assert.equal(layout.documentPanelWidth, 420)
  assert.equal(layout.canvasWidth, 860)

  const bounded = normalizeWorkspaceLayout({ leftWidth: 99, documentPanelWidth: 9_999 }, 2000)
  assert.equal(bounded.leftWidth, 280)
  assert.equal(bounded.documentPanelWidth, 1100)
})

test('collapses the document panel before the left rail on narrow windows', () => {
  const documentCollapsed = normalizeWorkspaceLayout({}, LEFT_RAIL_DEFAULT_WIDTH + CANVAS_MIN_WIDTH + DOCUMENT_PANEL_MIN_WIDTH - 1)
  assert.equal(documentCollapsed.documentPanelCollapsed, true)
  assert.equal(documentCollapsed.leftCollapsed, false)

  const bothCollapsed = normalizeWorkspaceLayout({}, LEFT_RAIL_COLLAPSED_WIDTH + CANVAS_MIN_WIDTH - 1)
  assert.equal(bothCollapsed.documentPanelCollapsed, true)
  assert.equal(bothCollapsed.leftCollapsed, true)
  assert.equal(bothCollapsed.leftWidth, LEFT_RAIL_COLLAPSED_WIDTH)
  assert.equal(bothCollapsed.canvasWidth, Math.max(0, bothCollapsed.windowWidth - LEFT_RAIL_COLLAPSED_WIDTH))
})

test('keeps saved widths, tab choice, collapse choices, and canvas identity independent from tabs', () => {
  const layout = normalizeWorkspaceLayout({
    leftCollapsed: false,
    leftWidth: 390,
    leftTab: 'canvases',
    documentPanelCollapsed: false,
    documentPanelWidth: 480,
  }, 1800)

  assert.equal(layout.leftWidth, 390)
  assert.equal(layout.documentPanelWidth, 480)
  assert.equal(layout.preferences.leftTab, 'canvases')
  assert.equal(layout.preferences.leftCollapsed, false)
  assert.equal(layout.preferences.documentPanelCollapsed, false)
})
