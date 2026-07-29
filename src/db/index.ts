
import { initCanvasAiTransactionsDb } from './canvas-ai-transactions'
import { initCanvasIndexDb } from './canvas-index'
import { initCanvasImageRecognitionDb } from './canvas-image-recognition'
import { initCanvasAiOverlayDb } from './canvas-ai-overlay'
import { initCanvasViewsDb } from './canvas-views'
import { initWorkspaceRecoveryDb } from './workspace-recovery'
import { getDb } from './client'
import {
  activateReadOnlyFallback,
  completeStartupRecovery,
  createMigrationSnapshotIfNeeded,
  prepareStartupRecovery,
  type StartupRecoveryContext,
} from '@/lib/recovery/startup-recovery'

export { db, getDb } from './client'
export { queryPersistedCanvasKnowledgeAnchors } from './canvas-index'

let initAllDatabasesPromise: Promise<void> | null = null

async function runDatabaseInitialization() {
  let recovery: StartupRecoveryContext | null = null
  try {
    recovery = await prepareStartupRecovery()
    await createMigrationSnapshotIfNeeded(recovery)
    if (recovery.accessMode === 'read-only') return
    await runSchemaInitialization()
    await completeStartupRecovery(recovery)
  } catch (error) {
    if (recovery && await activateReadOnlyFallback(recovery, error)) return
    throw error
  }
}

async function runSchemaInitialization() {
  // 引入各数据库初始化函数
  const { initChatsDb } = await import('./chats');
  const { initMarksDb } = await import('./marks');
  const { initNotesDb } = await import('./notes');
  const { initTagsDb } = await import('./tags');
  const { initVectorDb } = await import('./vector');
  const { initConversationsDb } = await import('./conversations');
  const { initMemoriesDb } = await import('./memories');
  const { initActivityDb } = await import('./activity');
  const { initCanvasesDb } = await import('./canvases');

  // 执行初始化：先确保基础表存在，再做 conversations 对 chats 的迁移/补列。
  await initWorkspaceRecoveryDb(await getDb());
  await initChatsDb();
  await initConversationsDb();
  await initMarksDb();
  await initNotesDb();
  await initTagsDb();
  await initVectorDb();
  await initMemoriesDb();
  await initActivityDb();
  await initCanvasesDb();
  await initCanvasAiTransactionsDb();
  await initCanvasImageRecognitionDb();
  await initCanvasIndexDb();
  await initCanvasAiOverlayDb();
  await initCanvasViewsDb();
}

// 初始化所有数据库。父布局与画布首屏可能同时触发初始化，必须复用同一个 Promise，
// 避免画布在 canvases 表创建前抢先查询并永久停留在加载背景。
export function initAllDatabases(): Promise<void> {
  if (!initAllDatabasesPromise) {
    initAllDatabasesPromise = runDatabaseInitialization().catch(error => {
      initAllDatabasesPromise = null
      throw error
    })
  }
  return initAllDatabasesPromise
}
