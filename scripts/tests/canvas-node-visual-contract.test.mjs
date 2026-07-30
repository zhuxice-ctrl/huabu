import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = path => readFileSync(join(root, path), 'utf8')
const editorSource = read('src/app/core/main/canvas/canvas-editor.tsx')
const nodesSource = read('src/app/core/main/canvas/nodes/canvas-nodes.tsx')
const menuSource = read('src/app/core/main/canvas/canvas-node-style-menu.tsx')
const overlaysSource = read('src/app/core/main/canvas/canvas-geometry-overlays.tsx')

test('selection treatment uses exact screen-compensated approved colors', () => {
  for (const color of ['#F7FBFF', '#66D9FF', '#FF5D5D', '#F2B84B']) {
    assert.match(nodesSource, new RegExp(color))
  }
  assert.match(nodesSource, /inset_0_0_0_calc\(1px\*var\(--canvas-visual-scale,1\)\)_#F7FBFF/)
  assert.match(nodesSource, /0_0_0_calc\(2px\*var\(--canvas-visual-scale,1\)\)_#66D9FF/)
  assert.match(nodesSource, /0_0_calc\(12px\*var\(--canvas-visual-scale,1\)\)_rgba\(102,217,255,0\.32\)/)
  assert.match(nodesSource, /canvas-geometry-invalid[^]*!shadow-\[0_0_calc\(12px\*var\(--canvas-visual-scale,1\)\)_rgba\(255,93,93,0\.32\)\]/)
  assert.match(nodesSource, /canvas-legacy-conflict[^]*!border-dashed[^]*#F2B84B/)
  for (const zoom of [0.1, 0.65, 1, 6]) {
    assert.equal(1 / Math.max(0.1, zoom) * zoom, 1)
  }
  assert.match(editorSource, /'--canvas-visual-scale': 1 \/ Math\.max\(0\.1, viewport\.zoom\)/)
})

test('snap guides are viewport-portal-only transient overlays', () => {
  assert.match(overlaysSource, /ViewportPortal/)
  assert.match(overlaysSource, /#66D9FF/)
  assert.match(overlaysSource, /0\.7/)
  assert.match(overlaysSource, /--canvas-visual-scale/)
  assert.match(editorSource, /<CanvasGeometryOverlays guides=\{snapGuides\} \/>/)
  assert.doesNotMatch(editorSource.slice(editorSource.indexOf('</ReactFlow>')), /snapGuides\.map/)
  assert.doesNotMatch(nodesSource, /snapGuides|legacyConflictIds|nodeVisualStates/)
})

test('all selection origins retain the React Flow selected visual, including context menus and focus', () => {
  assert.match(editorSource, /onNodeContextMenu=\{\(_event, targetNode\) => \{[^]*targetNode\.selected/)
  assert.match(editorSource, /marqueeSessionRef/)
  assert.match(editorSource, /selected: true,[^]*requestAnimationFrame\(\(\) => emitter\.emit\('canvas-focus-node', id\)\)/)
  assert.match(nodesSource, /transientNodeClassName\(selected\)/)
})

test('text defaults persist for new nodes and render compatibly for legacy nodes', () => {
  for (const source of [editorSource, nodesSource]) {
    assert.match(source, /#F2F1ED/)
    assert.match(source, /#202321/)
    assert.match(source, /#D8D6CF/)
  }
  assert.match(nodesSource, /data\.backgroundColor \?\? data\.fillColor \?\? TEXT_BACKGROUND_DEFAULT/)
  assert.match(nodesSource, /0 6px 18px rgba\(0, 0, 0, 0\.14\)/)
  assert.match(menuSource, /NODE_BACKGROUND_PRESETS = \['#F2F1ED'/)
  assert.match(menuSource, /NODE_TEXT_PRESETS = \['#202321'/)
  assert.match(menuSource, /NODE_BORDER_PRESETS = \['#D8D6CF'/)
})

test('selected text nodes yield their inline warm shadow to visual-state priority', () => {
  assert.match(
    nodesSource,
    /boxShadow: selected\s*\?\s*undefined\s*:\s*`\$\{savedStyle\?\.boxShadow \? `\$\{savedStyle\.boxShadow\}, ` : ''\}\$\{TEXT_SHADOW_DEFAULT\}`/,
  )
})

test('image nodes keep recognition feedback while filling the node with media', () => {
  const imageSection = nodesSource.slice(nodesSource.indexOf('export const ImageCanvasNode'), nodesSource.indexOf('export const GroupCanvasNode'))
  assert.match(imageSection, /recognitionStatus/)
  assert.match(imageSection, /className="size-full object-cover"/)
})
