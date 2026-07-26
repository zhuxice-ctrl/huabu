import { Store } from '@tauri-apps/plugin-store'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { create } from 'zustand'
import { normalizeDocumentPanelWidth, normalizeLeftRailWidth } from '@/lib/canvas/workspace-layout-policy'


export interface SidebarState {
  fileSidebarVisible: boolean
  toggleFileSidebar: () => Promise<void>
  showFileSidebar: () => Promise<void>
  noteSidebarVisible: boolean
  toggleNoteSidebar: () => Promise<void>
  showNoteSidebar: () => Promise<void>
  leftSidebarVisible: boolean
  toggleLeftSidebar: () => Promise<void>
  centerPanelVisible: boolean
  toggleCenterPanel: () => Promise<void>
  showCenterPanel: () => Promise<void>
  rightSidebarVisible: boolean
  toggleRightSidebar: () => Promise<void>
  leftWidth: number
  setLeftWidth: (width: number) => Promise<void>
  documentPanelWidth: number
  setDocumentPanelWidth: (width: number, windowWidth?: number) => Promise<void>
  leftResizeStartX: number | null
  startLeftResize: (event: ReactPointerEvent<HTMLDivElement>) => void
  resizeLeftSidebar: (event: PointerEvent) => void
  finishLeftResize: (event: PointerEvent) => void
  documentPanelResizeStartX: number | null
  startDocumentPanelResize: (event: ReactPointerEvent<HTMLDivElement>) => void
  resizeDocumentPanel: (event: PointerEvent) => void
  finishDocumentPanelResize: (event: PointerEvent) => void
  leftSidebarTab: 'files' | 'notes' | 'canvases'
  setLeftSidebarTab: (tab: 'files' | 'notes' | 'canvases') => Promise<void>
  initSidebarState: () => void
}

// 从 localStorage 获取初始状态
const getInitialState = () => {
  if (typeof window === 'undefined') return { left: true, center: true, right: true }
  
  const leftState = localStorage.getItem('leftSidebarVisible')
  const centerState = localStorage.getItem('centerPanelVisible')
  const rightState = localStorage.getItem('rightSidebarVisible')
  
  return {
    left: leftState !== null ? leftState === 'true' : true,
    center: centerState !== null ? centerState === 'true' : true,
    right: rightState !== null ? rightState === 'true' : true,
  }
}

const initialState = getInitialState()

async function persistLeftWidth(normalizedWidth: number) {
  const store = await Store.load('store.json')
  await store.set('canvasWorkspaceLeftWidth', normalizedWidth)
  await store.save()
}

async function persistDocumentPanelWidth(
  normalizedWidth: number,
) {
  const store = await Store.load('store.json')
  await store.set('canvasWorkspaceDocumentPanelWidth', normalizedWidth)
  await store.save()
}

async function loadSidebarState(): Promise<Partial<SidebarState>> {
  const store = await Store.load('store.json')
  const leftState = await store.get<boolean>('leftSidebarVisible')
  const centerState = await store.get<boolean>('centerPanelVisible')
  const rightState = await store.get<boolean>('rightSidebarVisible')
  const leftTab = await store.get<'files' | 'notes' | 'canvases'>('leftSidebarTab')
  const leftWidth = await store.get<number>('canvasWorkspaceLeftWidth')
  const documentPanelWidth = await store.get<number>('canvasWorkspaceDocumentPanelWidth')
  const state: Partial<SidebarState> = {}

  if (leftState !== null && leftState !== undefined) {
    state.leftSidebarVisible = leftState
    localStorage.setItem('leftSidebarVisible', String(leftState))
  }
  if (centerState !== null && centerState !== undefined) {
    state.centerPanelVisible = centerState
    localStorage.setItem('centerPanelVisible', String(centerState))
  }
  if (rightState !== null && rightState !== undefined) {
    state.rightSidebarVisible = rightState
    localStorage.setItem('rightSidebarVisible', String(rightState))
  }
  if (leftTab) {
    state.leftSidebarTab = leftTab
    localStorage.setItem('leftSidebarTab', leftTab)
  }
  if (leftWidth) state.leftWidth = normalizeLeftRailWidth(leftWidth)
  if (documentPanelWidth) {
    state.documentPanelWidth = normalizeDocumentPanelWidth(documentPanelWidth, window.innerWidth)
  }
  return state
}

export const useSidebarStore = create<SidebarState>((set, get) => ({
  fileSidebarVisible: true,
  toggleFileSidebar: async () => {
    set((state) => ({
      fileSidebarVisible: !state.fileSidebarVisible
    }))
    const store = await Store.load('store.json')
    store.set('fileSidebarVisible', !store.get('fileSidebarVisible'))
  },
  showFileSidebar: async () => {
    set({ fileSidebarVisible: true })
    const store = await Store.load('store.json')
    store.set('fileSidebarVisible', true)
  },
  noteSidebarVisible: true,
  toggleNoteSidebar: async () => {
    set((state) => ({
      noteSidebarVisible: !state.noteSidebarVisible
    }))
    const store = await Store.load('store.json')
    store.set('noteSidebarVisible', !store.get('noteSidebarVisible'))
  },
  showNoteSidebar: async () => {
    set({ noteSidebarVisible: true })
    const store = await Store.load('store.json')
    store.set('noteSidebarVisible', true)
  },
  leftSidebarVisible: initialState.left,
  toggleLeftSidebar: async () => {
    const { leftSidebarVisible } = get()
    const newState = !leftSidebarVisible
    set({ leftSidebarVisible: newState })
    localStorage.setItem('leftSidebarVisible', String(newState))
    const store = await Store.load('store.json')
    await store.set('leftSidebarVisible', newState)
    await store.save()
  },
  centerPanelVisible: initialState.center,
  showCenterPanel: async () => {
    if (get().centerPanelVisible) {
      return
    }

    set({ centerPanelVisible: true })
    localStorage.setItem('centerPanelVisible', 'true')
    const store = await Store.load('store.json')
    await store.set('centerPanelVisible', true)
    await store.save()
  },
  toggleCenterPanel: async () => {
    const { centerPanelVisible } = get()
    const newState = !centerPanelVisible
    set({ centerPanelVisible: newState })
    localStorage.setItem('centerPanelVisible', String(newState))
    const store = await Store.load('store.json')
    await store.set('centerPanelVisible', newState)
    await store.save()
  },
  rightSidebarVisible: initialState.right,
  toggleRightSidebar: async () => {
    const { rightSidebarVisible } = get()
    const newState = !rightSidebarVisible
    set({ rightSidebarVisible: newState })
    localStorage.setItem('rightSidebarVisible', String(newState))
    const store = await Store.load('store.json')
    await store.set('rightSidebarVisible', newState)
    await store.save()
  },
  leftWidth: 320,
  setLeftWidth: async (width) => {
    const normalizedWidth = normalizeLeftRailWidth(width)
    set({ leftWidth: normalizedWidth })
    await persistLeftWidth(normalizedWidth)
  },
  documentPanelWidth: 420,
  setDocumentPanelWidth: async (width, windowWidth = typeof window === 'undefined' ? 0 : window.innerWidth) => {
    const normalizedWidth = normalizeDocumentPanelWidth(width, windowWidth)
    set({ documentPanelWidth: normalizedWidth })
    await persistDocumentPanelWidth(normalizedWidth)
  },
  startLeftResize: (event) => {
    const target = event.currentTarget
    const { resizeLeftSidebar, finishLeftResize } = get()
    target.setPointerCapture(event.pointerId)
    set({ leftResizeStartX: event.clientX })
    target.addEventListener('pointermove', resizeLeftSidebar)
    target.addEventListener('pointerup', finishLeftResize, { once: true })
  },
  resizeLeftSidebar: (event) => {
    const { leftResizeStartX, leftWidth } = get()
    if (leftResizeStartX === null) return
    const normalizedWidth = normalizeLeftRailWidth(leftWidth + event.clientX - leftResizeStartX)
    set({ leftResizeStartX: event.clientX })
    set({ leftWidth: normalizedWidth })
    void persistLeftWidth(normalizedWidth)
  },
  finishLeftResize: (event) => {
    const target = event.currentTarget as HTMLDivElement
    target.removeEventListener('pointermove', get().resizeLeftSidebar)
    set({ leftResizeStartX: null })
  },
  startDocumentPanelResize: (event) => {
    const target = event.currentTarget
    const { resizeDocumentPanel, finishDocumentPanelResize } = get()
    target.setPointerCapture(event.pointerId)
    set({ documentPanelResizeStartX: event.clientX })
    target.addEventListener('pointermove', resizeDocumentPanel)
    target.addEventListener('pointerup', finishDocumentPanelResize, { once: true })
  },
  resizeDocumentPanel: (event) => {
    const { documentPanelResizeStartX, documentPanelWidth } = get()
    if (documentPanelResizeStartX === null) return
    const normalizedWidth = normalizeDocumentPanelWidth(
      documentPanelWidth - event.clientX + documentPanelResizeStartX,
      window.innerWidth,
    )
    set({ documentPanelResizeStartX: event.clientX })
    set({ documentPanelWidth: normalizedWidth })
    void persistDocumentPanelWidth(normalizedWidth)
  },
  finishDocumentPanelResize: (event) => {
    const target = event.currentTarget as HTMLDivElement
    target.removeEventListener('pointermove', get().resizeDocumentPanel)
    set({ documentPanelResizeStartX: null })
  },
  leftResizeStartX: null,
  documentPanelResizeStartX: null,
  leftSidebarTab: 'files',
  setLeftSidebarTab: async (tab: 'files' | 'notes' | 'canvases') => {
    set({ leftSidebarTab: tab })
    localStorage.setItem('leftSidebarTab', tab)
    const store = await Store.load('store.json')
    await store.set('leftSidebarTab', tab)
    await store.save()
  },
  initSidebarState: () => {
    void loadSidebarState().then(state => set(state))
  },
}))
