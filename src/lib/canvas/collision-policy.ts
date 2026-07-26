import type { CanvasNode } from '@/types/canvas'
import type { CanvasRect } from './gesture-policy.ts'
import { screenDistanceToCanvas, type ViewportSnapshot } from './viewport-sizing.ts'

export const SAFETY_GAP_SCREEN = 6
export const SNAP_ENTRY_SCREEN = 8
export const SNAP_BREAK_SCREEN = 14
export const COLLISION_EPSILON_SCREEN = 0.25

export interface CollisionThresholds {
  safetyGap: number
  snapEntry: number
  snapBreak: number
  epsilon: number
}

export interface CollisionEntity {
  id: string
  rect: CanvasRect
}

export type ActiveRectEdge = 'min' | 'max'

export interface EdgeSnap {
  obstacleId: string
  edge: ActiveRectEdge
  boundary: number
  direction: -1 | 1
}

export interface ActiveEdgeSnapState {
  x?: EdgeSnap
  y?: EdgeSnap
}

export interface ActiveEdgeSnapInput {
  candidate: CanvasRect
  activeEdges: {
    x?: ActiveRectEdge
    y?: ActiveRectEdge
  }
  obstacles: CollisionEntity[]
  thresholds: CollisionThresholds
  snap?: ActiveEdgeSnapState
}

export interface ActiveEdgeSnapResult {
  rect: CanvasRect
  snap: ActiveEdgeSnapState
  valid: boolean
}

export interface SweepRigidSetInput {
  members: CollisionEntity[]
  obstacles: CollisionEntity[]
  delta: { x: number; y: number }
  thresholds: CollisionThresholds
  maxPasses?: number
}

export interface SweepContact {
  memberId: string
  obstacleId: string
  axis: 'x' | 'y'
  normal: -1 | 1
  time: number
}

export interface SweepRigidSetResult {
  members: CollisionEntity[]
  delta: { x: number; y: number }
  contacts: SweepContact[]
  passes: number
  valid: boolean
}

export interface LegacyConflictInput {
  entities: CollisionEntity[]
  thresholds: CollisionThresholds
  movingIds?: string[]
}

export interface LegacyConflictPair {
  ids: [string, string]
  mtd: number
}

export interface LegacyConflictScore {
  valid: boolean
  pairCount: number
  totalMtd: number
  pairs: LegacyConflictPair[]
}

const DECORATIVE_NODE_TYPES = new Set(['freehand', 'group'])

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function validThresholds(thresholds: CollisionThresholds): boolean {
  return isFiniteNumber(thresholds.safetyGap)
    && isFiniteNumber(thresholds.snapEntry)
    && isFiniteNumber(thresholds.snapBreak)
    && isFiniteNumber(thresholds.epsilon)
    && thresholds.safetyGap >= 0
    && thresholds.snapEntry >= 0
    && thresholds.snapBreak >= thresholds.snapEntry
    && thresholds.epsilon >= 0
}

function round4(value: number): number {
  const rounded = Math.round((value + Number.EPSILON) * 10_000) / 10_000
  return Object.is(rounded, -0) ? 0 : rounded
}

function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function translateRect(rect: CanvasRect, delta: { x: number; y: number }): CanvasRect {
  return {
    x: rect.x + delta.x,
    y: rect.y + delta.y,
    width: rect.width,
    height: rect.height,
  }
}

function rectEdge(rect: CanvasRect, edge: ActiveRectEdge, axis: 'x' | 'y'): number {
  const start = axis === 'x' ? rect.x : rect.y
  const size = axis === 'x' ? rect.width : rect.height
  return edge === 'min' ? start : start + size
}

function applyEdge(rect: CanvasRect, edge: ActiveRectEdge, axis: 'x' | 'y', boundary: number): CanvasRect {
  const result = { ...rect }
  const current = rectEdge(rect, edge, axis)
  const adjustment = boundary - current

  if (axis === 'x') {
    if (edge === 'min') result.x += adjustment
    result.width += edge === 'min' ? -adjustment : adjustment
  } else {
    if (edge === 'min') result.y += adjustment
    result.height += edge === 'min' ? -adjustment : adjustment
  }

  return result
}

function intervalDistance(aMin: number, aMax: number, bMin: number, bMax: number): number {
  if (aMax < bMin) return bMin - aMax
  if (bMax < aMin) return aMin - bMax
  return 0
}

export function thresholdsForSnapshot(snapshot: ViewportSnapshot): CollisionThresholds {
  return {
    safetyGap: screenDistanceToCanvas(SAFETY_GAP_SCREEN, snapshot),
    snapEntry: screenDistanceToCanvas(SNAP_ENTRY_SCREEN, snapshot),
    snapBreak: screenDistanceToCanvas(SNAP_BREAK_SCREEN, snapshot),
    epsilon: screenDistanceToCanvas(COLLISION_EPSILON_SCREEN, snapshot),
  }
}

export function isSolidCanvasNode(node: CanvasNode): boolean {
  return !DECORATIVE_NODE_TYPES.has(node.type)
}

export function normalizeAabb(rect: CanvasRect): CanvasRect | null {
  if (![rect.x, rect.y, rect.width, rect.height].every(isFiniteNumber)) return null

  const x2 = rect.x + rect.width
  const y2 = rect.y + rect.height
  if (!isFiniteNumber(x2) || !isFiniteNumber(y2)) return null

  return {
    x: Math.min(rect.x, x2),
    y: Math.min(rect.y, y2),
    width: Math.abs(rect.width),
    height: Math.abs(rect.height),
  }
}

export function conflicts(
  candidate: CanvasRect,
  obstacle: CanvasRect,
  thresholds: CollisionThresholds,
): boolean {
  const normalizedCandidate = normalizeAabb(candidate)
  const normalizedObstacle = normalizeAabb(obstacle)
  if (!normalizedCandidate || !normalizedObstacle || !validThresholds(thresholds)) return false

  const overlapX = Math.min(
    normalizedCandidate.x + normalizedCandidate.width,
    normalizedObstacle.x + normalizedObstacle.width + thresholds.safetyGap,
  ) - Math.max(normalizedCandidate.x, normalizedObstacle.x - thresholds.safetyGap)
  const overlapY = Math.min(
    normalizedCandidate.y + normalizedCandidate.height,
    normalizedObstacle.y + normalizedObstacle.height + thresholds.safetyGap,
  ) - Math.max(normalizedCandidate.y, normalizedObstacle.y - thresholds.safetyGap)

  return overlapX > thresholds.epsilon && overlapY > thresholds.epsilon
}

function snapForAxis(
  axis: 'x' | 'y',
  candidate: CanvasRect,
  activeEdge: ActiveRectEdge | undefined,
  previous: EdgeSnap | undefined,
  obstacles: CollisionEntity[],
  thresholds: CollisionThresholds,
): EdgeSnap | undefined {
  if (!activeEdge) return undefined
  const rawEdge = rectEdge(candidate, activeEdge, axis)

  if (previous?.edge === activeEdge) {
    const penetration = previous.direction * (rawEdge - previous.boundary)
    if (penetration <= thresholds.snapBreak && penetration >= -thresholds.snapEntry) {
      return previous
    }
  }

  const perpendicularAxis = axis === 'x' ? 'y' : 'x'
  const candidatePerpendicularMin = perpendicularAxis === 'x' ? candidate.x : candidate.y
  const candidatePerpendicularMax = candidatePerpendicularMin
    + (perpendicularAxis === 'x' ? candidate.width : candidate.height)

  const choices: Array<EdgeSnap & { adjustment: number }> = []
  for (const obstacle of obstacles) {
    const rect = normalizeAabb(obstacle.rect)
    if (!rect) continue
    const obstaclePerpendicularMin = perpendicularAxis === 'x' ? rect.x : rect.y
    const obstaclePerpendicularMax = obstaclePerpendicularMin
      + (perpendicularAxis === 'x' ? rect.width : rect.height)
    if (intervalDistance(
      candidatePerpendicularMin,
      candidatePerpendicularMax,
      obstaclePerpendicularMin,
      obstaclePerpendicularMax,
    ) > thresholds.safetyGap + thresholds.snapEntry) continue

    const obstacleMin = axis === 'x' ? rect.x : rect.y
    const obstacleMax = obstacleMin + (axis === 'x' ? rect.width : rect.height)
    const direction: -1 | 1 = activeEdge === 'max' ? 1 : -1
    const boundary = activeEdge === 'max'
      ? obstacleMin - thresholds.safetyGap
      : obstacleMax + thresholds.safetyGap
    const adjustment = boundary - rawEdge
    if (Math.abs(adjustment) <= thresholds.snapEntry) {
      choices.push({ obstacleId: obstacle.id, edge: activeEdge, boundary, direction, adjustment })
    }
  }

  choices.sort((left, right) => Math.abs(left.adjustment) - Math.abs(right.adjustment)
    || compareIds(left.obstacleId, right.obstacleId))
  const choice = choices[0]
  if (!choice) return undefined
  return {
    obstacleId: choice.obstacleId,
    edge: choice.edge,
    boundary: choice.boundary,
    direction: choice.direction,
  }
}

export function resolveActiveEdgeSnap(input: ActiveEdgeSnapInput): ActiveEdgeSnapResult {
  const candidate = normalizeAabb(input.candidate)
  if (!candidate || !validThresholds(input.thresholds)) {
    return { rect: input.candidate, snap: {}, valid: false }
  }

  const x = snapForAxis(
    'x', candidate, input.activeEdges.x, input.snap?.x, input.obstacles, input.thresholds,
  )
  const y = snapForAxis(
    'y', candidate, input.activeEdges.y, input.snap?.y, input.obstacles, input.thresholds,
  )
  let rect = candidate
  if (x) rect = applyEdge(rect, x.edge, 'x', x.boundary)
  if (y) rect = applyEdge(rect, y.edge, 'y', y.boundary)
  const normalized = normalizeAabb(rect)
  if (!normalized) return { rect: candidate, snap: {}, valid: false }

  return { rect: normalized, snap: { x, y }, valid: true }
}

interface AxisTimes {
  entry: number
  exit: number
  normal: -1 | 1
}

function axisTimes(
  movingMin: number,
  movingMax: number,
  obstacleMin: number,
  obstacleMax: number,
  delta: number,
): AxisTimes | null {
  if (delta > 0) {
    return {
      entry: (obstacleMin - movingMax) / delta,
      exit: (obstacleMax - movingMin) / delta,
      normal: -1,
    }
  }
  if (delta < 0) {
    return {
      entry: (obstacleMax - movingMin) / delta,
      exit: (obstacleMin - movingMax) / delta,
      normal: 1,
    }
  }
  if (movingMax <= obstacleMin || movingMin >= obstacleMax) return null
  return { entry: Number.NEGATIVE_INFINITY, exit: Number.POSITIVE_INFINITY, normal: -1 }
}

function sweepPair(
  member: CollisionEntity,
  obstacle: CollisionEntity,
  delta: { x: number; y: number },
  thresholds: CollisionThresholds,
): SweepContact[] {
  const allowedPenetration = Math.min(thresholds.epsilon, thresholds.safetyGap)
  const margin = thresholds.safetyGap - allowedPenetration
  const moving = member.rect
  const target = obstacle.rect
  const x = axisTimes(
    moving.x,
    moving.x + moving.width,
    target.x - margin,
    target.x + target.width + margin,
    delta.x,
  )
  const y = axisTimes(
    moving.y,
    moving.y + moving.height,
    target.y - margin,
    target.y + target.height + margin,
    delta.y,
  )
  if (!x || !y) return []

  const entry = Math.max(x.entry, y.entry)
  const exit = Math.min(x.exit, y.exit)
  if (entry > exit || exit < 0 || entry < 0 || entry > 1) return []
  if (Math.abs(x.entry - y.entry) <= 1e-12) {
    return [
      { memberId: member.id, obstacleId: obstacle.id, axis: 'x', normal: x.normal, time: entry },
      { memberId: member.id, obstacleId: obstacle.id, axis: 'y', normal: y.normal, time: entry },
    ]
  }
  const axis: 'x' | 'y' = x.entry >= y.entry ? 'x' : 'y'
  const normal = axis === 'x' ? x.normal : y.normal
  return [{ memberId: member.id, obstacleId: obstacle.id, axis, normal, time: entry }]
}

export function sweepRigidSet(input: SweepRigidSetInput): SweepRigidSetResult {
  const deltaIsValid = isFiniteNumber(input.delta.x) && isFiniteNumber(input.delta.y)
  if (!deltaIsValid || !validThresholds(input.thresholds)) {
    return { members: [], delta: { x: 0, y: 0 }, contacts: [], passes: 0, valid: false }
  }

  const members = input.members.map(member => {
    const rect = normalizeAabb(member.rect)
    return rect ? { id: member.id, rect } : null
  })
  if (members.some(member => member === null)) {
    return { members: [], delta: { x: 0, y: 0 }, contacts: [], passes: 0, valid: false }
  }
  const normalizedMembers = members as CollisionEntity[]
  const memberIds = new Set(normalizedMembers.map(member => member.id))
  const obstacles = input.obstacles.flatMap(obstacle => {
    const rect = normalizeAabb(obstacle.rect)
    return rect && !memberIds.has(obstacle.id) ? [{ id: obstacle.id, rect }] : []
  })
  const maxPasses = Math.min(4, Math.max(0, Math.trunc(input.maxPasses ?? 4)))
  let remaining = { ...input.delta }
  const accepted = { x: 0, y: 0 }
  const contacts: SweepContact[] = []
  let passes = 0

  while ((remaining.x !== 0 || remaining.y !== 0) && passes < maxPasses) {
    const currentMembers = normalizedMembers.map(member => ({
      id: member.id,
      rect: translateRect(member.rect, accepted),
    }))
    const hits: SweepContact[] = []
    for (const member of currentMembers) {
      for (const obstacle of obstacles) {
        hits.push(...sweepPair(member, obstacle, remaining, input.thresholds))
      }
    }

    if (hits.length === 0) {
      accepted.x += remaining.x
      accepted.y += remaining.y
      remaining = { x: 0, y: 0 }
      break
    }

    hits.sort((left, right) => left.time - right.time
      || left.axis.localeCompare(right.axis)
      || compareIds(left.obstacleId, right.obstacleId)
      || compareIds(left.memberId, right.memberId))
    const earliest = hits[0].time
    const simultaneous = hits.filter(hit => Math.abs(hit.time - earliest) <= 1e-12)
    accepted.x += remaining.x * earliest
    accepted.y += remaining.y * earliest
    const scale = 1 - earliest
    remaining = { x: remaining.x * scale, y: remaining.y * scale }
    if (simultaneous.some(hit => hit.axis === 'x')) remaining.x = 0
    if (simultaneous.some(hit => hit.axis === 'y')) remaining.y = 0
    contacts.push(...simultaneous)
    passes += 1
  }

  const resultMembers = normalizedMembers.map(member => ({
    id: member.id,
    rect: translateRect(member.rect, accepted),
  }))
  if (![accepted.x, accepted.y, ...resultMembers.flatMap(member => Object.values(member.rect))].every(isFiniteNumber)) {
    return { members: [], delta: { x: 0, y: 0 }, contacts: [], passes, valid: false }
  }
  return {
    members: resultMembers,
    delta: { x: round4(accepted.x), y: round4(accepted.y) },
    contacts,
    passes,
    valid: true,
  }
}

function pairMtd(left: CanvasRect, right: CanvasRect, safetyGap: number): number {
  const leftCenterX = left.x + left.width / 2
  const leftCenterY = left.y + left.height / 2
  const rightCenterX = right.x + right.width / 2
  const rightCenterY = right.y + right.height / 2
  const x = (left.width + right.width) / 2 + safetyGap - Math.abs(leftCenterX - rightCenterX)
  const y = (left.height + right.height) / 2 + safetyGap - Math.abs(leftCenterY - rightCenterY)
  return Math.min(x, y)
}

export function scoreLegacyConflicts(input: LegacyConflictInput): LegacyConflictScore {
  if (!validThresholds(input.thresholds)) {
    return { valid: false, pairCount: 0, totalMtd: 0, pairs: [] }
  }
  const entities = input.entities.map(entity => {
    const rect = normalizeAabb(entity.rect)
    return rect ? { id: entity.id, rect } : null
  })
  if (entities.some(entity => entity === null)) {
    return { valid: false, pairCount: 0, totalMtd: 0, pairs: [] }
  }

  const normalizedEntities = (entities as CollisionEntity[])
    .sort((left, right) => compareIds(left.id, right.id))
  const movingIds = input.movingIds ? new Set(input.movingIds) : null
  const pairs: LegacyConflictPair[] = []
  for (let leftIndex = 0; leftIndex < normalizedEntities.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < normalizedEntities.length; rightIndex += 1) {
      const left = normalizedEntities[leftIndex]
      const right = normalizedEntities[rightIndex]
      if (movingIds && !movingIds.has(left.id) && !movingIds.has(right.id)) continue
      if (!conflicts(left.rect, right.rect, input.thresholds)) continue
      pairs.push({
        ids: [left.id, right.id],
        mtd: round4(pairMtd(left.rect, right.rect, input.thresholds.safetyGap)),
      })
    }
  }
  return {
    valid: true,
    pairCount: pairs.length,
    totalMtd: round4(pairs.reduce((sum, pair) => sum + pair.mtd, 0)),
    pairs,
  }
}
