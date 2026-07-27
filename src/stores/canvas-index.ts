import {
  claimReadyCanvasIndexJob,
  processCanvasIndexJob,
  queryPersistedCanvasIndexCandidates,
  queueCanvasIndexRebuild as persistCanvasIndexRebuild,
  queueCanvasIndexRetry as persistCanvasIndexRetry,
  resetAbandonedCanvasIndexJobs,
  retryCanvasIndexJob,
} from '@/db/canvas-index'
import {
  registerCanvasIndexCandidateQueryProvider,
  shouldClaimCanvasIndexJob,
} from '@/lib/canvas/canvas-index-jobs'
import { classifyIndexedCanvasOverlay } from '@/stores/canvas-ai'

const WORKER_IDLE_DELAY_MS = 1_000
let workerRunning = false
let workerStopped = true
let workerTimer: ReturnType<typeof setTimeout> | null = null
let drainPromise: Promise<number> | null = null

async function drainCanvasIndexJobsSerially(): Promise<number> {
  let processed = 0
  while (shouldClaimCanvasIndexJob(workerStopped)) {
    const job = await claimReadyCanvasIndexJob()
    if (!job) break
    try {
      const outcome = await processCanvasIndexJob(job)
      if (outcome === 'retry') {
        processed += 1
        continue
      }
    } catch (error) {
      await retryCanvasIndexJob(job, error)
      processed += 1
      continue
    }
    try {
      await classifyIndexedCanvasOverlay(job)
    } catch (error) {
      console.error('Canvas overlay classification failed:', error)
    }
    processed += 1
  }
  return processed
}

export async function drainReadyCanvasIndexJobs(): Promise<number> {
  if (drainPromise) return drainPromise
  drainPromise = drainCanvasIndexJobsSerially().finally(() => {
    drainPromise = null
  })
  return drainPromise
}

export async function queueCanvasIndexRebuild(canvasId: string) {
  await persistCanvasIndexRebuild(canvasId)
  void drainReadyCanvasIndexJobs()
}

export async function queueCanvasIndexRetry(canvasId: string, nodeId?: string) {
  await persistCanvasIndexRetry(canvasId, nodeId)
  await persistCanvasIndexRebuild(canvasId)
}

export async function startCanvasIndexWorker(): Promise<void> {
  if (workerRunning) return
  workerRunning = true
  workerStopped = false
  registerCanvasIndexCandidateQueryProvider(queryPersistedCanvasIndexCandidates)
  try {
    await resetAbandonedCanvasIndexJobs()
  } catch (error) {
    workerStopped = true
    workerRunning = false
    registerCanvasIndexCandidateQueryProvider(null)
    throw error
  }

  const tick = async () => {
    if (workerStopped) return
    try {
      await drainReadyCanvasIndexJobs()
    } catch (error) {
      console.error('Canvas index worker failed:', error)
    }
    if (!workerStopped) workerTimer = setTimeout(() => void tick(), WORKER_IDLE_DELAY_MS)
  }
  void tick()
}

export async function stopCanvasIndexWorker() {
  if (!workerRunning) return
  workerStopped = true
  if (workerTimer) clearTimeout(workerTimer)
  workerTimer = null
  registerCanvasIndexCandidateQueryProvider(null)
  await drainPromise?.catch(() => undefined)
  workerRunning = false
}
