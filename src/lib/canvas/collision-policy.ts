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
  if (!isFiniteNumber(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER / 10_000) {
    return Object.is(value, -0) ? 0 : value
  }
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

function isPerpendicularlyEligible(
  axis: 'x' | 'y',
  candidate: CanvasRect,
  obstacle: CanvasRect,
  thresholds: CollisionThresholds,
): boolean {
  const perpendicularAxis = axis === 'x' ? 'y' : 'x'
  const candidateMin = perpendicularAxis === 'x' ? candidate.x : candidate.y
  const candidateMax = candidateMin
    + (perpendicularAxis === 'x' ? candidate.width : candidate.height)
  const obstacleMin = perpendicularAxis === 'x' ? obstacle.x : obstacle.y
  const obstacleMax = obstacleMin
    + (perpendicularAxis === 'x' ? obstacle.width : obstacle.height)
  return intervalDistance(candidateMin, candidateMax, obstacleMin, obstacleMax)
    <= thresholds.safetyGap + thresholds.snapEntry
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
    const owner = inputObstacleById(obstacles, previous.obstacleId)
    if (owner && isPerpendicularlyEligible(axis, candidate, owner.rect, thresholds)) {
      const obstacleMin = axis === 'x' ? owner.rect.x : owner.rect.y
      const obstacleMax = obstacleMin + (axis === 'x' ? owner.rect.width : owner.rect.height)
      const direction: -1 | 1 = activeEdge === 'max' ? 1 : -1
      const boundary = activeEdge === 'max'
        ? obstacleMin - thresholds.safetyGap
        : obstacleMax + thresholds.safetyGap
      const penetration = direction * (rawEdge - boundary)
      if (previous.direction === direction
        && previous.boundary === boundary
        && penetration <= thresholds.snapBreak
        && penetration >= -thresholds.snapEntry) {
        return previous
      }
    }
  }

  const choices: Array<EdgeSnap & { adjustment: number }> = []
  for (const obstacle of obstacles) {
    const rect = normalizeAabb(obstacle.rect)
    if (!rect) continue
    if (!isPerpendicularlyEligible(axis, candidate, rect, thresholds)) continue

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

function inputObstacleById(
  obstacles: CollisionEntity[],
  obstacleId: string,
): CollisionEntity | undefined {
  const owner = obstacles.find(obstacle => obstacle.id === obstacleId)
  if (!owner) return undefined
  const rect = normalizeAabb(owner.rect)
  return rect ? { id: owner.id, rect } : undefined
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
  const normalizedObstacles = input.obstacles.map(obstacle => {
    const rect = normalizeAabb(obstacle.rect)
    return rect ? { id: obstacle.id, rect } : null
  })
  if (normalizedObstacles.some(obstacle => obstacle === null)) {
    return { members: [], delta: { x: 0, y: 0 }, contacts: [], passes: 0, valid: false }
  }
  const obstacles = (normalizedObstacles as CollisionEntity[])
    .filter(obstacle => !memberIds.has(obstacle.id))
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

function pairMtd(left: CanvasRect, right: CanvasRect, safetyGap: number): number | null {
  const leftHalfWidth = left.width / 2
  const leftHalfHeight = left.height / 2
  const rightHalfWidth = right.width / 2
  const rightHalfHeight = right.height / 2
  const leftCenterX = left.x + leftHalfWidth
  const leftCenterY = left.y + leftHalfHeight
  const rightCenterX = right.x + rightHalfWidth
  const rightCenterY = right.y + rightHalfHeight
  const combinedHalfWidth = leftHalfWidth + rightHalfWidth
  const combinedHalfHeight = leftHalfHeight + rightHalfHeight
  const centerDeltaX = leftCenterX - rightCenterX
  const centerDeltaY = leftCenterY - rightCenterY
  if (![leftHalfWidth, leftHalfHeight, rightHalfWidth, rightHalfHeight,
    leftCenterX, leftCenterY, rightCenterX, rightCenterY,
    combinedHalfWidth, combinedHalfHeight, centerDeltaX, centerDeltaY].every(isFiniteNumber)) {
    return null
  }

  const expandedHalfWidth = combinedHalfWidth + safetyGap
  const expandedHalfHeight = combinedHalfHeight + safetyGap
  const x = expandedHalfWidth - Math.abs(centerDeltaX)
  const y = expandedHalfHeight - Math.abs(centerDeltaY)
  const result = Math.min(x, y)
  return [expandedHalfWidth, expandedHalfHeight, x, y, result].every(isFiniteNumber)
    ? result
    : null
}

function invalidLegacyConflictScore(): LegacyConflictScore {
  return { valid: false, pairCount: 0, totalMtd: 0, pairs: [] }
}

export function scoreLegacyConflicts(input: LegacyConflictInput): LegacyConflictScore {
  if (!validThresholds(input.thresholds)) {
    return invalidLegacyConflictScore()
  }
  const entities = input.entities.map(entity => {
    const rect = normalizeAabb(entity.rect)
    return rect ? { id: entity.id, rect } : null
  })
  if (entities.some(entity => entity === null)) {
    return invalidLegacyConflictScore()
  }

  const normalizedEntities = (entities as CollisionEntity[])
    .sort((left, right) => compareIds(left.id, right.id))
  const movingIds = input.movingIds ? new Set(input.movingIds) : null
  const pairs: LegacyConflictPair[] = []
  let totalMtd = 0
  for (let leftIndex = 0; leftIndex < normalizedEntities.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < normalizedEntities.length; rightIndex += 1) {
      const left = normalizedEntities[leftIndex]
      const right = normalizedEntities[rightIndex]
      if (movingIds && !movingIds.has(left.id) && !movingIds.has(right.id)) continue
      if (!conflicts(left.rect, right.rect, input.thresholds)) continue
      const pairValue = pairMtd(left.rect, right.rect, input.thresholds.safetyGap)
      if (pairValue === null) return invalidLegacyConflictScore()
      const mtd = round4(pairValue)
      const nextTotalMtd = totalMtd + mtd
      if (!isFiniteNumber(mtd) || !isFiniteNumber(nextTotalMtd)) {
        return invalidLegacyConflictScore()
      }
      pairs.push({
        ids: [left.id, right.id],
        mtd,
      })
      totalMtd = nextTotalMtd
    }
  }
  const roundedTotalMtd = round4(totalMtd)
  if (!isFiniteNumber(roundedTotalMtd)) return invalidLegacyConflictScore()
  return {
    valid: true,
    pairCount: pairs.length,
    totalMtd: roundedTotalMtd,
    pairs,
  }
}
