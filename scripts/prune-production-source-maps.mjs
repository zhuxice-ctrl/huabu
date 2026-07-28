import {
  existsSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'

const roots = process.argv.slice(2)
if (roots.length === 0) roots.push('out', '.next')

function prune(directory) {
  if (!existsSync(directory)) return
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = join(directory, entry.name)
    if (entry.isDirectory()) {
      prune(file)
      continue
    }
    if (!entry.isFile()) continue
    if (entry.name.endsWith('.map')) {
      rmSync(file, { force: true })
      continue
    }
    if (!entry.name.endsWith('.js') && !entry.name.endsWith('.css')) continue
    const source = readFileSync(file, 'utf8')
    const pruned = source
      .replace(/\n?\/\/# sourceMappingURL=[^\n\r]*/g, '')
      .replace(/\/\*# sourceMappingURL=[^*]*\*\//g, '')
    if (pruned !== source) writeFileSync(file, pruned)
  }
}

for (const root of roots) prune(root)
