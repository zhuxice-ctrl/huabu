import { conflicts, normalizeAabb, thresholdsForSnapshot } from './collision-policy.ts'
import type { CanvasRect } from './gesture-policy.ts'
import { screenDistanceToCanvas, type ViewportSnapshot } from './viewport-sizing.ts'
import type { MaterializedCanvasDraft } from './content-ingest.ts'

export interface PlacementResult {
  status: 'placed' | 'no-space' | 'invalid-source'
  translation?: { x: number; y: number }
  checkedCandidates: number
}

export interface PositionedCanvasDraft {
  draft: MaterializedCanvasDraft
  position: { x: number; y: number }
}

const REPEAT_OFFSET_SCREEN = 32
const DEFAULT_MAX_SCREEN_RADIUS = 2400
const DEFAULT_MAX_CANDIDATES = 4096

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function translated(rect: CanvasRect, translation: { x: number; y: number }): CanvasRect {
  return { x: rect.x + translation.x, y: rect.y + translation.y, width: rect.width, height: rect.height }
}

function validTranslation(value: { x: number; y: number }): boolean {
  return finite(value?.x) && finite(value?.y)
}

function directionRank(x: number, y: number): number {
  if (x === 0 && y < 0) return 0 // up
  if (x > 0 && y === 0) return 1 // right
  if (x === 0 && y > 0) return 2 // down
  if (x < 0 && y === 0) return 3 // left
  return 4
}

interface CandidateOffset {
  xIndex: number
  yIndex: number
  distanceSquared: number
  rank: number
}

function compareCandidates(left: CandidateOffset, right: CandidateOffset): number {
  return left.distanceSquared - right.distanceSquared
    || left.rank - right.rank
    || left.yIndex - right.yIndex
    || left.xIndex - right.xIndex
}

function pushCandidate(heap: CandidateOffset[], candidate: CandidateOffset) {
  heap.push(candidate)
  let index = heap.length - 1
  while (index > 0) {
    const parent = Math.floor((index - 1) / 2)
    if (compareCandidates(heap[parent], candidate) <= 0) break
    heap[index] = heap[parent]
    index = parent
  }
  heap[index] = candidate
}

function popCandidate(heap: CandidateOffset[]): CandidateOffset | undefined {
  const first = heap[0]
  const last = heap.pop()
  if (!first || heap.length === 0 || !last) return first
  let index = 0
  while (true) {
    const left = index * 2 + 1
    const right = left + 1
    if (left >= heap.length) break
    const child = right < heap.length && compareCandidates(heap[right], heap[left]) < 0 ? right : left
    if (compareCandidates(last, heap[child]) <= 0) break
    heap[index] = heap[child]
    index = child
  }
  heap[index] = last
  return first
}

function* candidateOffsets(step: number, radius: number): Generator<{ x: number; y: number }> {
  if (!finite(step) || step <= 0 || !finite(radius) || radius < 0) return
  const maxDistanceSquared = (radius / step) ** 2
  const heap: CandidateOffset[] = []
  const seen = new Set<string>()
  const add = (xIndex: number, yIndex: number) => {
    const key = `${xIndex}:${yIndex}`
    if (seen.has(key)) return
    seen.add(key)
    const distanceSquared = xIndex ** 2 + yIndex ** 2
    if (distanceSquared > maxDistanceSquared) return
    pushCandidate(heap, { xIndex, yIndex, distanceSquared, rank: directionRank(xIndex, yIndex) })
  }

  add(0, 0)
  while (heap.length > 0) {
    const candidate = popCandidate(heap)
    if (!candidate) return
    yield { x: candidate.xIndex * step, y: candidate.yIndex * step }
    add(candidate.xIndex, candidate.yIndex - 1)
    add(candidate.xIndex + 1, candidate.yIndex)
    add(candidate.xIndex, candidate.yIndex + 1)
    add(candidate.xIndex - 1, candidate.yIndex)
  }
}

function sourceMembersValid(members: Array<{ id: string; rect: CanvasRect }>, thresholds: ReturnType<typeof thresholdsForSnapshot>) {
  const normalized = members.map(member => {
    if (typeof member?.id !== 'string') return null
    const rect = normalizeAabb(member.rect)
    return rect && rect.width > 0 && rect.height > 0 ? { id: member.id, rect } : null
  })
  if (normalized.some(member => member === null)) return null
  const sorted = normalized as Array<{ id: string; rect: CanvasRect }>
  sorted.sort((left, right) => compareIds(left.id, right.id))
  for (let index = 1; index < sorted.length; index += 1) {
    if (sorted[index - 1].id === sorted[index].id) return null
  }
  for (let left = 0; left < sorted.length; left += 1) {
    for (let right = left + 1; right < sorted.length; right += 1) {
      if (conflicts(sorted[left].rect, sorted[right].rect, thresholds)) return null
    }
  }
  return sorted
}

export function findNearestFreePlacement(input: {
  members: Array<{ id: string; rect: CanvasRect }>
  obstacles: Array<{ id: string; rect: CanvasRect }>
  targetTranslation: { x: number; y: number }
  snapshot: ViewportSnapshot
  maxScreenRadius?: number
  maxCandidates?: number
}): PlacementResult {
  if (!validTranslation(input.targetTranslation)) return { status: 'invalid-source', checkedCandidates: 0 }
  const thresholds = thresholdsForSnapshot(input.snapshot)
  const members = sourceMembersValid(input.members, thresholds)
  if (!members || members.length === 0) return { status: 'invalid-source', checkedCandidates: 0 }

  const obstacles = input.obstacles.map(obstacle => {
    if (typeof obstacle?.id !== 'string') return null
    const rect = normalizeAabb(obstacle.rect)
    return rect && rect.width > 0 && rect.height > 0 ? { id: obstacle.id, rect } : null
  })
  if (obstacles.some(obstacle => obstacle === null)) return { status: 'no-space', checkedCandidates: 0 }
  const sortedObstacles = (obstacles as Array<{ id: string; rect: CanvasRect }>)
    .sort((left, right) => compareIds(left.id, right.id))

  const maxScreenRadius = finite(input.maxScreenRadius) && input.maxScreenRadius >= 0
    ? input.maxScreenRadius : DEFAULT_MAX_SCREEN_RADIUS
  const maxCandidates = finite(input.maxCandidates) && input.maxCandidates >= 1
    ? Math.trunc(input.maxCandidates) : DEFAULT_MAX_CANDIDATES
  const step = screenDistanceToCanvas(REPEAT_OFFSET_SCREEN, input.snapshot)
  const radius = screenDistanceToCanvas(maxScreenRadius, input.snapshot)
  const offsets = candidateOffsets(step, radius)
  let checkedCandidates = 0
  while (checkedCandidates < maxCandidates) {
    const next = offsets.next()
    if (next.done) break
    const offset = next.value
    checkedCandidates += 1
    const translation = {
      x: input.targetTranslation.x + offset.x,
      y: input.targetTranslation.y + offset.y,
    }
    const free = members.every(member => sortedObstacles.every(obstacle => (
      !conflicts(translated(member.rect, translation), obstacle.rect, thresholds)
    )))
    if (free) return { status: 'placed', translation, checkedCandidates }
  }
  return { status: 'no-space', checkedCandidates }
}

function validDraft(draft: MaterializedCanvasDraft): boolean {
  return Boolean(draft)
    && finite(draft.canvasSize?.width)
    && finite(draft.canvasSize?.height)
    && draft.canvasSize.width > 0
    && draft.canvasSize.height > 0
}

export function stackIngestDrafts(
  drafts: MaterializedCanvasDraft[],
  snapshot: ViewportSnapshot,
): PositionedCanvasDraft[] {
  const gap = screenDistanceToCanvas(6, snapshot)
  let y = 0
  const result: PositionedCanvasDraft[] = []
  for (const draft of drafts) {
    if (!validDraft(draft)) continue
    result.push({ draft, position: { x: 0, y } })
    y += draft.canvasSize.height + gap
  }
  return result
}

export { REPEAT_OFFSET_SCREEN }
