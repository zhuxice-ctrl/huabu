'use client'

import dynamic from 'next/dynamic'
import { useEffect } from 'react'
import { Store } from '@tauri-apps/plugin-store'
import { CanvasStartupController } from './canvas/canvas-startup-controller'
import { CanvasWorkspace } from './canvas/canvas-workspace'

async function persistCurrentPage() {
  const store = await Store.load('store.json')
  await store.set('currentPage', '/core/main')
  await store.save()
}

function persistCurrentPageOnMount() {
  void persistCurrentPage()
}

function Page() {
  useEffect(persistCurrentPageOnMount, [])

  return (
    <CanvasStartupController>
      <CanvasWorkspace />
    </CanvasStartupController>
  )
}

export default dynamic(() => Promise.resolve(Page), { ssr: false })
