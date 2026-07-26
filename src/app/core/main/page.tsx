'use client'

import dynamic from 'next/dynamic'
import { useEffect } from 'react'
import { Store } from '@tauri-apps/plugin-store'
import { CanvasStartupController } from './canvas/canvas-startup-controller'
import { CanvasWorkspace } from './canvas/canvas-workspace'

function Page() {
  useEffect(() => {
    void (async () => {
      const store = await Store.load('store.json')
      await store.set('currentPage', '/core/main')
      await store.save()
    })()
  }, [])

  return (
    <CanvasStartupController>
      <CanvasWorkspace />
    </CanvasStartupController>
  )
}

export default dynamic(() => Promise.resolve(Page), { ssr: false })
