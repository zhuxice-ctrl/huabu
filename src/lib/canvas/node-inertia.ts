export interface PointerSample { x: number; y: number; time: number }
export interface PointerVelocity { x: number; y: number }
export interface NodeInertiaPlan {
  delta: { x: number; y: number }
  screenDistance: number
  durationMs: 160
}

const SAMPLE_WINDOW_MS = 80
const MIN_SPEED = 0.35
const MIN_DISTANCE = 40
const MAX_DISTANCE = 56

export function appendPointerSample(samples: PointerSample[], sample: PointerSample) {
  if (![sample.x, sample.y, sample.time].every(Number.isFinite)) return samples
  return [...samples, sample].filter(item => sample.time - item.time <= SAMPLE_WINDOW_MS)
}

export function releaseVelocity(samples: PointerSample[]): PointerVelocity {
  if (samples.length < 2) return { x: 0, y: 0 }
  let weight = 0
  let x = 0
  let y = 0
  for (let index = 1; index < samples.length; index += 1) {
    const prior = samples[index - 1]
    const next = samples[index]
    const elapsed = next.time - prior.time
    if (!Number.isFinite(elapsed) || elapsed <= 0) continue
    const currentWeight = index
    x += ((next.x - prior.x) / elapsed) * currentWeight
    y += ((next.y - prior.y) / elapsed) * currentWeight
    weight += currentWeight
  }
  return weight ? { x: x / weight, y: y / weight } : { x: 0, y: 0 }
}

export function planNodeInertia(velocity: PointerVelocity): NodeInertiaPlan | null {
  const speed = Math.hypot(velocity.x, velocity.y)
  if (!Number.isFinite(speed) || speed < MIN_SPEED) return null
  const screenDistance = Math.min(MAX_DISTANCE, Math.max(MIN_DISTANCE, speed * 20))
  return {
    delta: { x: velocity.x / speed * screenDistance, y: velocity.y / speed * screenDistance },
    screenDistance,
    durationMs: 160,
  }
}

export function inertiaProgress(elapsedMs: number, durationMs: number) {
  if (!Number.isFinite(elapsedMs) || !Number.isFinite(durationMs) || durationMs <= 0) return 1
  const t = Math.min(1, Math.max(0, elapsedMs / durationMs))
  const normalized = 1 - Math.exp(-5 * t)
  return t === 1 ? 1 : normalized / (1 - Math.exp(-5))
}
