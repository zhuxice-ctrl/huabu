import {
  claimReadyCanvasIndexJob,
  processCanvasIndexJob,
  queryPersistedCanvasIndexCandidates,
  queueCanvasIndexRebuild as persistCanvasIndexRebuild,
  queueCanvasIndexRetry as persistCanvasIndexRetry,
  resetAbandonedCanvasIndexJobs,
  retryCanvasIndexJob,
} from '@/db/canvas-index'
import { registerCanvasIndexCandidateQueryProvider } from '@/lib/canvas/canvas-index-jobs'

const WORKER_IDLE_DELAY_MS = 1_000
let workerStop: (() => void) | null = null
let drainPromise: Promise<number> | null = null

export async function drainReadyCanvasIndexJobs(): Promise<number> {
  if (drainPromise) return drainPromise
  drainPromise = (async () => {
    let processed = 0
    for (;;) {
      const job = await claimReadyCanvasIndexJob()
      if (!job) return processed
      try {
        await processCanvasIndexJob(job)
      } catch (error) {
        await retryCanvasIndexJob(job, error)
      }
      processed += 1
    }
  })().finally(() => {
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

export async function startCanvasIndexWorker(): Promise<() => void> {
  if (workerStop) return workerStop
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | null = null
  const stop = () => {
    stopped = true
    if (timer) clearTimeout(timer)
    timer = null
    registerCanvasIndexCandidateQueryProvider(null)
    if (workerStop === stop) workerStop = null
  }
  workerStop = stop
  registerCanvasIndexCandidateQueryProvider(queryPersistedCanvasIndexCandidates)
  await resetAbandonedCanvasIndexJobs()

  const tick = async () => {
    if (stopped) return
    try {
      await drainReadyCanvasIndexJobs()
    } catch (error) {
      console.error('Canvas index worker failed:', error)
    }
    if (!stopped) timer = setTimeout(() => void tick(), WORKER_IDLE_DELAY_MS)
  }
  void tick()
  return stop
}

export function stopCanvasIndexWorker() {
  workerStop?.()
}
