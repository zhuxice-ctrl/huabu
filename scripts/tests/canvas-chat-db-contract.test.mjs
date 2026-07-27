import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../../', import.meta.url)

async function source(path) {
  return readFile(new URL(path, root), 'utf8')
}

test('chat database migrates nullable local canvas context and syncable completion state', async () => {
  const db = await source('src/db/chats.ts')
  assert.match(db, /canvasContext text default null/)
  assert.match(db, /completionState text default null/)
  assert.match(db, /alter table chats add column canvasContext text default null/)
  assert.match(db, /alter table chats add column completionState text default null/)
})

test('every outbound chat payload strips local canvas metadata while retaining completion state', async () => {
  const db = await source('src/db/chats.ts')
  const store = await source('src/stores/chat.ts')
  assert.match(db, /export function serializeChatForSync/)
  assert.match(db, /delete syncChat\.canvasContext/)
  assert.match(db, /return result\.map\(serializeChatForSync\)/)
  assert.match(store, /JSON\.stringify\(chats, null, 2\)/)
  assert.doesNotMatch(store, /JSON\.stringify\(getAllChats\(\), null, 2\)/)
})

test('remote rows never provide local canvas metadata and restore keeps a matching local context', async () => {
  const db = await source('src/db/chats.ts')
  const store = await source('src/stores/chat.ts')
  assert.match(db, /localCanvasContexts\?\.get\(getChatRestoreKey\(chat\)\) \?\? null/)
  assert.doesNotMatch(db, /\[`id:\$\{chat\.id\}`, chat\.canvasContext\]/)
  assert.doesNotMatch(db, /localCanvasContexts\?\.get\(`id:\$\{chat\.id\}`\)/)
  assert.match(db, /insertChats\(chats: Chat\[\], localCanvasContexts\?: Map<string, string>\)/)
  assert.match(store, /getLocalCanvasContexts\(\)/)
  assert.match(store, /insertChats\(result, localCanvasContexts\)/)
})
