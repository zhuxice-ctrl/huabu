import { create } from 'zustand'

export type SettingSection =
  | 'about'
  | 'general'
  | 'chat'
  | 'editor'
  | 'record'
  | 'sync'
  | 'imageHosting'
  | 'ai'
  | 'rag'
  | 'mcp'
  | 'skills'
  | 'prompt'
  | 'memories'
  | 'template'
  | 'file'
  | 'shortcuts'
  | 'imageMethod'
  | 'audio'

export const settingSections: SettingSection[] = [
  'about',
  'general',
  'chat',
  'editor',
  'record',
  'sync',
  'imageHosting',
  'ai',
  'rag',
  'mcp',
  'skills',
  'prompt',
  'memories',
  'template',
  'file',
  'shortcuts',
  'imageMethod',
  'audio',
]

interface SettingsDialogState {
  open: boolean
  activeSection: SettingSection
  openSettings: (section?: SettingSection) => void
  closeSettings: () => void
  setActiveSection: (section: SettingSection) => void
}

export const useSettingsDialogStore = create<SettingsDialogState>((set) => ({
  open: false,
  activeSection: 'about',
  openSettings: (section) => set((state) => ({
    open: true,
    activeSection: section ?? state.activeSection,
  })),
  closeSettings: () => set({ open: false }),
  setActiveSection: (activeSection) => set({ activeSection }),
}))
