import type { CanvasRect } from './gesture-policy.ts'

export interface CanvasSpatialRecord {
  id: string
  rect: CanvasRect
  geometryVersion: number
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function normalizeRect(rect: CanvasRect): CanvasRect | null {
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

function normalizeRecord(record: CanvasSpatialRecord): CanvasSpatialRecord | null {
  const rect = normalizeRect(record.rect)
  if (typeof record.id !== 'string' || !rect || !isFiniteNumber(record.geometryVersion)) return null
  return { id: record.id, rect, geometryVersion: record.geometryVersion }
}

function recordsEqual(left: CanvasSpatialRecord, right: CanvasSpatialRecord): boolean {
  return left.id === right.id
    && left.geometryVersion === right.geometryVersion
    && left.rect.x === right.rect.x
    && left.rect.y === right.rect.y
    && left.rect.width === right.rect.width
    && left.rect.height === right.rect.height
}

function intersects(left: CanvasRect, right: CanvasRect): boolean {
  return left.x <= right.x + right.width
    && left.x + left.width >= right.x
    && left.y <= right.y + right.height
    && left.y + left.height >= right.y
}

function cloneRecord(record: CanvasSpatialRecord): CanvasSpatialRecord {
  return { id: record.id, rect: { ...record.rect }, geometryVersion: record.geometryVersion }
}

function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

export class CanvasSpatialIndex {
  readonly #records = new Map<string, CanvasSpatialRecord>()
  #version = 0

  constructor(records?: Iterable<CanvasSpatialRecord>) {
    if (records) this.rebuild(records)
  }

  get version(): number {
    return this.#version
  }

  rebuild(records: Iterable<CanvasSpatialRecord>): number {
    const next = new Map<string, CanvasSpatialRecord>()
    for (const record of records) {
      const normalized = normalizeRecord(record)
      if (normalized) next.set(normalized.id, normalized)
    }
    this.#records.clear()
    for (const [id, record] of next) this.#records.set(id, record)
    this.#version += 1
    return this.#records.size
  }

  upsert(record: CanvasSpatialRecord): boolean {
    const normalized = normalizeRecord(record)
    if (!normalized) return false
    const current = this.#records.get(normalized.id)
    if (current && recordsEqual(current, normalized)) return false
    this.#records.set(normalized.id, normalized)
    this.#version += 1
    return true
  }

  remove(id: string): boolean {
    if (!this.#records.delete(id)) return false
    this.#version += 1
    return true
  }

  query(rect: CanvasRect): CanvasSpatialRecord[] {
    const normalized = normalizeRect(rect)
    if (!normalized) return []
    return [...this.#records.values()]
      .filter(record => intersects(normalized, record.rect))
      .sort((left, right) => compareIds(left.id, right.id))
      .map(cloneRecord)
  }
}
