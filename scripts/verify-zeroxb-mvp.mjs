import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const node = process.execPath
const cargo = process.platform === 'win32' ? 'cargo.exe' : 'cargo'

const checks = [
  {
    name: 'foundation contract',
    command: node,
    args: ['scripts/verify-zeroxb-foundation.mjs'],
  },
  {
    name: 'canvas, chat and security tests',
    command: node,
    args: ['--experimental-strip-types', '--test', 'scripts/tests/canvas-*.test.mjs'],
  },
  {
    name: 'TypeScript',
    command: node,
    args: ['node_modules/typescript/bin/tsc', '--noEmit', '--pretty', 'false'],
  },
  {
    name: 'production build',
    command: node,
    args: ['node_modules/next/dist/bin/next', 'build', '--turbopack'],
  },
  {
    name: 'production source-map pruning',
    command: node,
    args: ['scripts/prune-production-source-maps.mjs'],
  },
  {
    name: 'locked Cargo tests',
    command: cargo,
    args: ['test', '--locked', '--manifest-path', 'src-tauri/Cargo.toml'],
  },
  {
    name: 'locked Cargo check',
    command: cargo,
    args: ['check', '--locked', '--manifest-path', 'src-tauri/Cargo.toml'],
  },
]

if (!existsSync(join(root, 'package.json'))) {
  console.error('MVP verification must run from the repository checkout.')
  process.exit(1)
}

for (const check of checks) {
  console.log(`\n==> ${check.name}`)
  const result = spawnSync(check.command, check.args, {
    cwd: root,
    stdio: 'inherit',
    shell: false,
    env: process.env,
  })
  if (result.error) {
    console.error(`${check.name} could not start: ${result.error.message}`)
    process.exit(1)
  }
  if (result.status !== 0) {
    console.error(`${check.name} failed with exit code ${result.status ?? 'unknown'}.`)
    process.exit(result.status || 1)
  }
}

console.log('\nzeroxB MVP automated verification passed')
