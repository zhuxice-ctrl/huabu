import { create } from 'zustand'
import { Store } from '@tauri-apps/plugin-store'
import type { CanvasNode } from '@/types/canvas'
import { mergeImageTagCatalog, normalizeImageTags } from '@/lib/canvas/image-tags'

const CATALOG_KEY = 'canvasImageTagCatalog'
const RECENT_KEY = 'canvasImageTagRecent'

interface CanvasImageTagState {
  catalog: string[]
  recent: string[]
  selectedByCanvas: Record<string, string[]>
  activeIndexByCanvas: Record<string, number>
}

const useCanvasImageTagsStore = create<CanvasImageTagState>(() => ({
  catalog: [],
  recent: [],
  selectedByCanvas: {},
  activeIndexByCanvas: {},
}))

let initialized = false
let catalogMutation = 0

async function persistCatalog(catalog: string[], recent: string[]) {
  const store = await Store.load('store.json')
  await store.set(CATALOG_KEY, catalog)
  await store.set(RECENT_KEY, recent)
  await store.save()
}

export function initCanvasImageTags() {
  if (initialized || typeof window === 'undefined') return
  initialized = true
  const mutationAtLoad = catalogMutation
  void Store.load('store.json').then(async store => {
    const [catalog, recent] = await Promise.all([
      store.get<string[]>(CATALOG_KEY),
      store.get<string[]>(RECENT_KEY),
    ])
    if (catalogMutation !== mutationAtLoad) return
    useCanvasImageTagsStore.setState({
      catalog: normalizeImageTags(catalog),
      recent: normalizeImageTags(recent).slice(0, 12),
    })
  })
}

export function registerCanvasImageTags(tags: string[]) {
  const normalized = normalizeImageTags(tags)
  if (!normalized.length) return
  catalogMutation += 1
  useCanvasImageTagsStore.setState(state => {
    const catalog = mergeImageTagCatalog(state.catalog, [normalized])
    const recent = normalizeImageTags([...normalized, ...state.recent]).slice(0, 12)
    void persistCatalog(catalog, recent)
    return { catalog, recent }
  })
}

export function mergeCanvasImageTagsFromNodes(nodes: CanvasNode[]) {
  const merged = mergeImageTagCatalog(
    useCanvasImageTagsStore.getState().catalog,
    nodes.filter(node => node.type === 'image').map(node => node.data.imageTags),
  )
  if (merged.length !== useCanvasImageTagsStore.getState().catalog.length) {
    registerCanvasImageTags(merged)
  }
}

export function setCanvasImageTagFilter(canvasId: string, tags: string[]) {
  useCanvasImageTagsStore.setState(state => ({
    selectedByCanvas: { ...state.selectedByCanvas, [canvasId]: normalizeImageTags(tags) },
    activeIndexByCanvas: { ...state.activeIndexByCanvas, [canvasId]: 0 },
  }))
}

export function stepCanvasImageTagMatch(canvasId: string, matchCount: number, delta: -1 | 1) {
  useCanvasImageTagsStore.setState(state => {
    const current = state.activeIndexByCanvas[canvasId] ?? 0
    const next = matchCount > 0 ? (current + delta + matchCount) % matchCount : 0
    return { activeIndexByCanvas: { ...state.activeIndexByCanvas, [canvasId]: next } }
  })
}

export function clearCanvasImageTagFilter(canvasId: string) {
  setCanvasImageTagFilter(canvasId, [])
}

export default useCanvasImageTagsStore
