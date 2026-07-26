import { Store } from '@tauri-apps/plugin-store'
import { create } from 'zustand'


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
  setDocumentPanelWidth: (width: number) => Promise<void>
  leftSidebarTab: 'files' | 'notes' | 'canvases'
  setLeftSidebarTab: (tab: 'files' | 'notes' | 'canvases') => Promise<void>
  initSidebarState: () => Promise<void>
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
    set({ leftWidth: width })
    const store = await Store.load('store.json')
    await store.set('canvasWorkspaceLeftWidth', width)
    await store.save()
  },
  documentPanelWidth: 420,
  setDocumentPanelWidth: async (width) => {
    set({ documentPanelWidth: width })
    const store = await Store.load('store.json')
    await store.set('canvasWorkspaceDocumentPanelWidth', width)
    await store.save()
  },
  leftSidebarTab: 'files',
  setLeftSidebarTab: async (tab: 'files' | 'notes' | 'canvases') => {
    set({ leftSidebarTab: tab })
    localStorage.setItem('leftSidebarTab', tab)
    const store = await Store.load('store.json')
    await store.set('leftSidebarTab', tab)
    await store.save()
  },
  initSidebarState: async () => {
    const store = await Store.load('store.json')
    const leftState = await store.get<boolean>('leftSidebarVisible')
    const centerState = await store.get<boolean>('centerPanelVisible')
    const rightState = await store.get<boolean>('rightSidebarVisible')
    const leftTab = await store.get<'files' | 'notes' | 'canvases'>('leftSidebarTab')
    const leftWidth = await store.get<number>('canvasWorkspaceLeftWidth')
    const documentPanelWidth = await store.get<number>('canvasWorkspaceDocumentPanelWidth')
    
    if (leftState !== null && leftState !== undefined) {
      set({ leftSidebarVisible: leftState })
      localStorage.setItem('leftSidebarVisible', String(leftState))
    }
    if (centerState !== null && centerState !== undefined) {
      set({ centerPanelVisible: centerState })
      localStorage.setItem('centerPanelVisible', String(centerState))
    }
    if (rightState !== null && rightState !== undefined) {
      set({ rightSidebarVisible: rightState })
      localStorage.setItem('rightSidebarVisible', String(rightState))
    }
    if (leftTab) {
      set({ leftSidebarTab: leftTab })
      localStorage.setItem('leftSidebarTab', leftTab)
    }
    if (leftWidth) set({ leftWidth })
    if (documentPanelWidth) set({ documentPanelWidth })
  },
}))
