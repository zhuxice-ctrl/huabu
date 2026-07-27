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
  drainCanvasIndexJobQueue,
  notifyCanvasIndexJobProcessed,
  registerCanvasIndexCandidateQueryProvider,
} from '@/lib/canvas/canvas-index-jobs'

const WORKER_IDLE_DELAY_MS = 1_000
let workerStop: (() => Promise<void>) | null = null
let drainPromise: Promise<number> | null = null
let activeWorkerShouldStop: (() => boolean) | null = null

export async function drainReadyCanvasIndexJobs(): Promise<number> {
  if (drainPromise) return drainPromise
  drainPromise = drainCanvasIndexJobQueue({
    claim: claimReadyCanvasIndexJob,
    process: processCanvasIndexJob,
    retry: retryCanvasIndexJob,
    shouldStop: () => activeWorkerShouldStop?.() ?? false,
    onProcessed: async job => {
      try {
        await notifyCanvasIndexJobProcessed(job)
      } catch (error) {
        console.error('Canvas overlay classification failed:', error)
      }
    },
  }).finally(() => {
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

export async function startCanvasIndexWorker(): Promise<() => Promise<void>> {
  if (workerStop) return workerStop
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | null = null
  activeWorkerShouldStop = () => stopped
  const stop = async () => {
    stopped = true
    if (timer) clearTimeout(timer)
    timer = null
    registerCanvasIndexCandidateQueryProvider(null)
    await drainPromise?.catch(() => undefined)
    if (activeWorkerShouldStop?.()) activeWorkerShouldStop = null
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

export async function stopCanvasIndexWorker() {
  await workerStop?.()
}
