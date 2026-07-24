import type { CanvasRelationRouteType, CanvasRelationWaypoint } from '../../types/canvas'

export interface RoutePoint { x: number; y: number }
export interface RouteObstacle extends RoutePoint { width: number; height: number }

export interface RelationPathInput {
  source: RoutePoint
  target: RoutePoint
  routeType: CanvasRelationRouteType
  waypoints: CanvasRelationWaypoint[]
  obstacles: RouteObstacle[]
}

export interface RelationPathResult {
  path: string
  label: RoutePoint
  editablePoints: RoutePoint[]
  avoidedObstacle: boolean
}

const AVOIDANCE_PADDING = 24
const CORNER_RADIUS = 14

function round(value: number) {
  const next = Math.round(value * 100) / 100
  return Object.is(next, -0) ? 0 : next
}

function point(value: RoutePoint) {
  return `${round(value.x)} ${round(value.y)}`
}

function distance(a: RoutePoint, b: RoutePoint) {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

function midpoint(a: RoutePoint, b: RoutePoint): RoutePoint {
  return { x: round((a.x + b.x) / 2), y: round((a.y + b.y) / 2) }
}

function bezierPath(source: RoutePoint, target: RoutePoint): RelationPathResult {
  const horizontal = target.x - source.x
  const direction = horizontal >= 0 ? 1 : -1
  const controlDistance = Math.max(48, Math.abs(horizontal) * 0.45)
  const control1 = { x: source.x + controlDistance * direction, y: source.y }
  const control2 = { x: target.x - controlDistance * direction, y: target.y }
  const label = {
    x: round((source.x + 3 * control1.x + 3 * control2.x + target.x) / 8),
    y: round((source.y + 3 * control1.y + 3 * control2.y + target.y) / 8),
  }
  return {
    path: `M ${point(source)} C ${point(control1)} ${point(control2)} ${point(target)}`,
    label,
    editablePoints: [],
    avoidedObstacle: false,
  }
}

function segmentIntersectsRect(a: RoutePoint, b: RoutePoint, rect: RouteObstacle) {
  const left = rect.x
  const right = rect.x + rect.width
  const top = rect.y
  const bottom = rect.y + rect.height
  let t0 = 0
  let t1 = 1
  const dx = b.x - a.x
  const dy = b.y - a.y
  const checks: Array<[number, number]> = [
    [-dx, a.x - left],
    [dx, right - a.x],
    [-dy, a.y - top],
    [dy, bottom - a.y],
  ]
  for (const [p, q] of checks) {
    if (p === 0) {
      if (q < 0) return false
      continue
    }
    const ratio = q / p
    if (p < 0) t0 = Math.max(t0, ratio)
    else t1 = Math.min(t1, ratio)
    if (t0 > t1) return false
  }
  return true
}

function pathLength(points: RoutePoint[]) {
  return points.slice(1).reduce((total, current, index) => total + distance(points[index], current), 0)
}

function expandObstacle(obstacle: RouteObstacle): RouteObstacle {
  return {
    x: obstacle.x - AVOIDANCE_PADDING,
    y: obstacle.y - AVOIDANCE_PADDING,
    width: obstacle.width + AVOIDANCE_PADDING * 2,
    height: obstacle.height + AVOIDANCE_PADDING * 2,
  }
}

function avoidancePoints(source: RoutePoint, target: RoutePoint, expanded: RouteObstacle) {
  if (Math.abs(target.x - source.x) >= Math.abs(target.y - source.y)) {
    const top = [
      { x: expanded.x, y: expanded.y },
      { x: expanded.x + expanded.width, y: expanded.y },
    ]
    const bottom = [
      { x: expanded.x, y: expanded.y + expanded.height },
      { x: expanded.x + expanded.width, y: expanded.y + expanded.height },
    ]
    return pathLength([source, ...top, target]) <= pathLength([source, ...bottom, target]) ? top : bottom
  }
  const left = [
    { x: expanded.x, y: expanded.y },
    { x: expanded.x, y: expanded.y + expanded.height },
  ]
  const right = [
    { x: expanded.x + expanded.width, y: expanded.y },
    { x: expanded.x + expanded.width, y: expanded.y + expanded.height },
  ]
  return pathLength([source, ...left, target]) <= pathLength([source, ...right, target]) ? left : right
}

function moveToward(from: RoutePoint, to: RoutePoint, amount: number): RoutePoint {
  const length = distance(from, to)
  if (!length) return { ...from }
  const ratio = amount / length
  return {
    x: round(from.x + (to.x - from.x) * ratio),
    y: round(from.y + (to.y - from.y) * ratio),
  }
}

function roundedPolyline(points: RoutePoint[]) {
  if (points.length < 2) return points.length ? `M ${point(points[0])}` : ''
  let path = `M ${point(points[0])}`
  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = points[index - 1]
    const current = points[index]
    const next = points[index + 1]
    const radius = Math.min(CORNER_RADIUS, distance(previous, current) / 2, distance(current, next) / 2)
    const before = moveToward(current, previous, radius)
    const after = moveToward(current, next, radius)
    path += ` L ${point(before)} Q ${point(current)} ${point(after)}`
  }
  return `${path} L ${point(points.at(-1)! )}`
}

export function buildRelationPath(input: RelationPathInput): RelationPathResult {
  const source = { x: round(input.source.x), y: round(input.source.y) }
  const target = { x: round(input.target.x), y: round(input.target.y) }
  const saved = input.waypoints.map(item => ({ x: round(item.x), y: round(item.y) }))

  if (input.routeType === 'straight') {
    return {
      path: `M ${point(source)} L ${point(target)}`,
      label: midpoint(source, target),
      editablePoints: [],
      avoidedObstacle: false,
    }
  }
  if (input.routeType === 'bezier') return bezierPath(source, target)

  let editablePoints = saved
  let avoidedObstacle = false
  if (input.routeType === 'orthogonal' && editablePoints.length === 0) {
    const middleX = round((source.x + target.x) / 2)
    editablePoints = [{ x: middleX, y: source.y }, { x: middleX, y: target.y }]
  } else if (input.routeType === 'auto') {
    const obstacle = input.obstacles
      .map(expandObstacle)
      .find(item => segmentIntersectsRect(source, target, item))
    if (!obstacle) return bezierPath(source, target)
    editablePoints = avoidancePoints(source, target, obstacle)
    avoidedObstacle = true
  }

  const all = [source, ...editablePoints, target]
  const middle = all[Math.floor(all.length / 2)]
  return {
    path: roundedPolyline(all),
    label: all.length % 2 === 0 ? midpoint(all[all.length / 2 - 1], middle) : middle,
    editablePoints: saved,
    avoidedObstacle,
  }
}
