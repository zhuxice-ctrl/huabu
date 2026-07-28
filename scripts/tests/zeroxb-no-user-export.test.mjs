import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = path => readFileSync(join(root, path), 'utf8')

const sources = {
  fileItem: read('src/app/core/main/file/file-item.tsx'),
  footerExportButton: read('src/app/core/main/editor/markdown/footer-bar/export-button.tsx'),
  configFileActions: read('src/app/core/setting/general/config-file-actions.tsx'),
  customTheme: read('src/app/core/setting/general/interface-settings/custom-theme.tsx'),
  syncToggle: read('src/components/title-bar-toolbars/sync-toggle.tsx'),
}

function assertAbsent(sourceName, patterns) {
  for (const [label, pattern] of patterns) {
    assert.doesNotMatch(
      sources[sourceName],
      pattern,
      `${sourceName} still exposes ${label}`,
    )
  }
}

test('Windows UI components expose no local user-facing export actions', () => {
  assertAbsent('fileItem', [
    ['markdown export import', /\bexportMarkdownFile\b/],
    ['markdown export format state', /\bMarkdownExportFormat\b/],
    ['markdown export handler', /\bhandleExportFile\b/],
    ['generic export menu label', /tCommon\('export'\)/],
    ['Markdown menu action', /handleExportFile\('markdown'\)/],
    ['HTML menu action', /handleExportFile\('html'\)/],
    ['JSON menu action', /handleExportFile\('json'\)/],
    ['PDF menu action', /handleExportFile\('pdf'\)/],
    ['file export submenu', /<ContextMenuSub>[\s\S]*?\b(?:Markdown|HTML|JSON|PDF)\b[\s\S]*?<\/ContextMenuSub>/],
  ])

  assertAbsent('footerExportButton', [
    ['markdown export import', /\bexportMarkdownSource\b/],
    ['markdown export base-name import', /\bgetMarkdownExportBaseName\b/],
    ['markdown export format state', /\bMarkdownExportFormat\b/],
    ['export dropdown', /\bDropdownMenu(?:Trigger|Content|Item)?\b/],
    ['visible export trigger', /title="导出"/],
    ['Markdown footer action', /handleExport\('markdown'\)/],
    ['HTML footer action', /handleExport\('html'\)/],
    ['JSON footer action', /handleExport\('json'\)/],
    ['PDF footer action', /handleExport\('pdf'\)/],
  ])

  assertAbsent('configFileActions', [
    ['configuration save dialog', /import \{[^}]*\bsave\b[^}]*\} from '@tauri-apps\/plugin-dialog'/],
    ['configuration copy to selected file', /\bcopyFile\b/],
    ['configuration export handler', /\bhandleExport\b/],
    ['configuration export translation', /exportConfig(?:Title|Success)/],
    ['configuration export button', /exportButton/],
  ])

  assertAbsent('customTheme', [
    ['theme export tab', /import-export/],
    ['theme export code state', /\bexportCode\b/],
    ['theme export handler', /\bhandleExport\b/],
    ['theme export conversion', /\bhslToHex\b/],
    ['theme export icon', /\bDownload\b/],
    ['theme export translations', /t\('export\.(?:title|button|placeholder)'\)/],
  ])

  assertAbsent('syncToggle', [
    ['local backup save dialog', /import \{[^}]*\bsave\b[^}]*\} from "@tauri-apps\/plugin-dialog"/],
    ['local backup exporting state', /\bexporting\b/],
    ['local backup export handler', /\bhandleExport\b/],
    ['local backup export command', /export_app_data/],
    ['local backup export button', /localBackup\.export\.button/],
    ['local backup export dialog', /localBackup\.exportDialog/],
    ['local backup export toast', /localBackup\.export(?:Success|Error)/],
  ])
})

test('internal thumbnail, print and recovery primitives remain reachable without UI export controls', () => {
  const staticExport = read('src/lib/canvas/static-export.ts')
  const thumbnail = read('src/lib/canvas/thumbnail.ts')
  const canvasSidebar = read('src/app/core/main/canvas/canvas-sidebar.tsx')
  const markdownExport = read('src/app/core/main/editor/markdown/markdown-export.ts')
  const printPage = read('src/app/print/page.tsx')
  const autoDataSync = read('src/lib/sync/auto-data-sync-queue.ts')

  assert.match(staticExport, /export function canvasDocumentToSvg\(document: CanvasDocument\)/)
  assert.match(staticExport, /export async function canvasDocumentToPngFile\(/)
  assert.match(thumbnail, /import \{ canvasDocumentToPngFile \} from '\.\/static-export'/)
  assert.match(canvasSidebar, /canvasDocumentToSvg\(project\.document\)/)

  assert.match(markdownExport, /export async function buildMarkdownExportDocument\(/)
  assert.match(markdownExport, /url: `\/print\?key=\$\{encodeURIComponent\(documentKey\)\}`/)
  assert.match(printPage, /const PRINT_EXPORT_STORE = 'print-export\.json'/)
  assert.match(printPage, /invoke\('print_webview'/)

  assert.match(autoDataSync, /local record snapshot stored/)
  assert.match(autoDataSync, /local record snapshot restored/)
})
