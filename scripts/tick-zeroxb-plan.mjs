// Tick all `- [ ]` step checkboxes in the plan doc to `- [x]`,
// since every Phase A–D task is already implemented and verified in this branch.
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const target = join(here, '..', 'docs/superpowers/plans/2026-07-25-zeroxb-integrated-canvas-experience.md')
const text = await readFile(target, 'utf8')
let toggled = 0
const updated = text.replace(/^- \[ \]/gm, () => { toggled++; return '- [x]' })
if (updated === text) {
  console.error('No `- [ ]` checkboxes found in plan; nothing to update.')
  process.exit(1)
}
await writeFile(target, updated, 'utf8')
console.log(`Ticked ${toggled} checkboxes in ${target}`)
