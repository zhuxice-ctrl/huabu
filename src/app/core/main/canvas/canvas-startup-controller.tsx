'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { Store } from '@tauri-apps/plugin-store'
import { chooseStartupCanvasId } from '@/lib/canvas/startup-policy'
import useArticleStore from '@/stores/article'
import useCanvasStore from '@/stores/canvas'
import type { CanvasProject } from '@/types/canvas'
import { initAllDatabases } from '@/db'
import { startCanvasIndexWorker, stopCanvasIndexWorker } from '@/stores/canvas-index'

async function initializeCanvasStartup(projects: CanvasProject[]) {
  const store = await Store.load('store.json')
  const lastCanvasId = await store.get<string>('lastCanvasId') || null
  const startupCanvasId = chooseStartupCanvasId(projects, lastCanvasId)
  return { store, startupCanvasId }
}

export function CanvasStartupController({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false

    void initAllDatabases()
      .then(() => Promise.all([
        useArticleStore.getState().initOpenTabs(),
        useCanvasStore.getState().loadProjects(),
        startCanvasIndexWorker(),
      ]))
      .then(async () => {
        if (cancelled) return
        const projects = useCanvasStore.getState().projects
        const { store, startupCanvasId } = await initializeCanvasStartup(projects)
        let project = projects.find(item => item.id === startupCanvasId) || null

        if (project) {
          await useCanvasStore.getState().openProject(project.id)
        } else {
          project = await useCanvasStore.getState().createProject('blank', '未命名画布')
        }

        if (project) {
          await store.set('lastCanvasId', project.id)
          await store.save()
        }
      })
      .catch((error) => {
        console.error('Failed to initialize canvas startup:', error)
      })
      .finally(() => {
        if (!cancelled) setReady(true)
      })

    return () => {
      cancelled = true
      void stopCanvasIndexWorker()
    }
  }, [])

  return ready
    ? children
    : <div className="size-full bg-background" aria-label="正在打开画布" />
}
