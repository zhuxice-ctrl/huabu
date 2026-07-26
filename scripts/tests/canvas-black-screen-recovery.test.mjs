import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = path => readFileSync(join(root, path), 'utf8')

const dbSource = read('src/db/index.ts')
const startupSource = read('src/app/core/main/canvas/canvas-startup-controller.tsx')
const editorSource = read('src/app/core/main/canvas/canvas-editor.tsx')

test('database initialization shares one promise and clears failed work for a retry', () => {
  assert.match(dbSource, /let initAllDatabasesPromise: Promise<void> \| null = null/)
  assert.match(dbSource, /export function initAllDatabases\(\): Promise<void> \{[\s\S]*?if \(!initAllDatabasesPromise\) \{[\s\S]*?initAllDatabasesPromise = runDatabaseInitialization\(\)\.catch\(error => \{[\s\S]*?initAllDatabasesPromise = null[\s\S]*?throw error[\s\S]*?\}\)[\s\S]*?\}[\s\S]*?return initAllDatabasesPromise[\s\S]*?\}/)
})

test('canvas startup waits for the database and always leaves the loading state', () => {
  const databaseReady = startupSource.indexOf('void initAllDatabases()')
  const tabsReady = startupSource.indexOf('useArticleStore.getState().initOpenTabs()')
  const projectsReady = startupSource.indexOf('useCanvasStore.getState().loadProjects()')

  assert.ok(databaseReady >= 0)
  assert.ok(tabsReady > databaseReady)
  assert.ok(projectsReady > databaseReady)
  assert.match(startupSource, /void initAllDatabases\(\)[\s\S]*?\.then\(\(\) => Promise\.all\([\s\S]*?initOpenTabs\(\)[\s\S]*?loadProjects\(\)/)
  assert.match(startupSource, /\.catch\(\(error\) => \{[\s\S]*?console\.error\([\s\S]*?\.finally\(\(\) => \{[\s\S]*?if \(!cancelled\) setReady\(true\)/)
})

test('canvas dot grid retains React Flow pan and zoom behavior with the required contrast', () => {
  assert.match(editorSource, /<Background\s+variant=\{BackgroundVariant\.Dots\}\s+gap=\{22\}\s+size=\{1\.35\}\s+color="hsl\(var\(--muted-foreground\)\)"\s*\/>/)
})
