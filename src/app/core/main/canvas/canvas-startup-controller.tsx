'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { Store } from '@tauri-apps/plugin-store'
import { chooseStartupCanvasId } from '@/lib/canvas/startup-policy'
import useArticleStore from '@/stores/article'
import useCanvasStore from '@/stores/canvas'
import { createCanvasTab } from './canvas-tab'

export function CanvasStartupController({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false

    void (async () => {
      await Promise.all([
        useArticleStore.getState().initOpenTabs(),
        useCanvasStore.getState().loadProjects(),
      ])

      const store = await Store.load('store.json')
      const lastCanvasId = await store.get<string>('lastCanvasId') || null
      const projects = useCanvasStore.getState().projects
      const startupCanvasId = chooseStartupCanvasId(projects, lastCanvasId)
      let project = projects.find(item => item.id === startupCanvasId) || null

      if (!project) {
        project = await useCanvasStore.getState().createProject('blank', '未命名画布')
      }

      if (project) {
        await useCanvasStore.getState().openProject(project.id)
        await useArticleStore.getState().addTab(createCanvasTab(project))
        await store.set('lastCanvasId', project.id)
        await store.save()
      }

      if (!cancelled) setReady(true)
    })()

    return () => {
      cancelled = true
    }
  }, [])

  return ready
    ? children
    : <div className="size-full bg-background" aria-label="正在打开画布" />
}
