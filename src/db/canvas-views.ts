import { getDb } from './client'
import type { LinearSortMode, LinearViewFilters } from '@/lib/canvas/linear-view'

export interface SavedCanvasView {
  id: string
  name: string
  canvasId: string
  filters: LinearViewFilters
  relationDepth: 0 | 1 | 2
  includeManualRelations: boolean
  includeAiRelations: boolean
  sortMode: LinearSortMode
  createdAt: number
  updatedAt: number
}

interface SavedCanvasViewRow {
  id: string
  name: string
  canvasId: string
  filters: string
  relationDepth: number
  includeManualRelations: number
  includeAiRelations: number
  sortMode: string
  createdAt: number
  updatedAt: number
}

function parseFilters(value: string): LinearViewFilters {
  try {
    const parsed = JSON.parse(value) as LinearViewFilters
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function relationDepth(value: number): 0 | 1 | 2 {
  return value === 2 ? 2 : value === 1 ? 1 : 0
}

function sortMode(value: string): LinearSortMode {
  return value === 'time' || value === 'relevance' || value === 'distance' || value === 'manual'
    ? value
    : 'manual'
}

function rowToSavedCanvasView(row: SavedCanvasViewRow): SavedCanvasView {
  return {
    id: row.id,
    name: row.name,
    canvasId: row.canvasId,
    filters: parseFilters(row.filters),
    relationDepth: relationDepth(row.relationDepth),
    includeManualRelations: Boolean(row.includeManualRelations),
    includeAiRelations: Boolean(row.includeAiRelations),
    sortMode: sortMode(row.sortMode),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export async function initCanvasViewsDb() {
  const db = await getDb()
  await db.execute(`
    create table if not exists canvas_saved_views (
      id text primary key,
      name text not null,
      canvasId text not null,
      filters text not null,
      relationDepth integer not null check (relationDepth between 0 and 2),
      includeManualRelations integer not null,
      includeAiRelations integer not null,
      sortMode text not null check (sortMode in ('time', 'relevance', 'distance', 'manual')),
      createdAt integer not null,
      updatedAt integer not null
    )
  `)
  await db.execute(`
    create index if not exists canvas_saved_views_canvas_updated
    on canvas_saved_views(canvasId, updatedAt desc)
  `)
}

export async function getSavedCanvasViews(canvasId: string): Promise<SavedCanvasView[]> {
  const db = await getDb()
  const rows = await db.select<SavedCanvasViewRow[]>(
    'select * from canvas_saved_views where canvasId = $1 order by updatedAt desc, id asc',
    [canvasId],
  )
  return rows.map(rowToSavedCanvasView)
}

export async function getSavedCanvasView(id: string): Promise<SavedCanvasView | null> {
  const db = await getDb()
  const rows = await db.select<SavedCanvasViewRow[]>(
    'select * from canvas_saved_views where id = $1 limit 1',
    [id],
  )
  return rows[0] ? rowToSavedCanvasView(rows[0]) : null
}

/** Persists a filter definition only; projection rows and node bodies are never stored. */
export async function saveCanvasView(input: Omit<SavedCanvasView, 'createdAt' | 'updatedAt'> & {
  createdAt?: number
  updatedAt?: number
}): Promise<SavedCanvasView> {
  const db = await getDb()
  const now = input.updatedAt ?? Date.now()
  const createdAt = input.createdAt ?? now
  const definition: SavedCanvasView = {
    ...input,
    name: input.name.trim(),
    relationDepth: relationDepth(input.relationDepth),
    sortMode: sortMode(input.sortMode),
    createdAt,
    updatedAt: now,
  }
  if (!definition.name) throw new Error('Saved canvas view name is required')
  await db.execute(
    `insert into canvas_saved_views (
      id, name, canvasId, filters, relationDepth, includeManualRelations,
      includeAiRelations, sortMode, createdAt, updatedAt
    ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    on conflict(id) do update set
      name = excluded.name, canvasId = excluded.canvasId, filters = excluded.filters,
      relationDepth = excluded.relationDepth,
      includeManualRelations = excluded.includeManualRelations,
      includeAiRelations = excluded.includeAiRelations, sortMode = excluded.sortMode,
      updatedAt = excluded.updatedAt`,
    [
      definition.id, definition.name, definition.canvasId, JSON.stringify(definition.filters),
      definition.relationDepth, definition.includeManualRelations ? 1 : 0,
      definition.includeAiRelations ? 1 : 0, definition.sortMode,
      definition.createdAt, definition.updatedAt,
    ],
  )
  return definition
}

export async function deleteSavedCanvasView(id: string) {
  const db = await getDb()
  await db.execute('delete from canvas_saved_views where id = $1', [id])
}
