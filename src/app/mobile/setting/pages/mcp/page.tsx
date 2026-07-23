'use client'

import { useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { ServerList } from '@/app/core/setting/mcp/server-list'
import { useMcpStore } from '@/stores/mcp'

export default function McpSettingPage() {
  const t = useTranslations('settings.mcp')
  const { initMcpData } = useMcpStore()

  useEffect(() => {
    void initMcpData()
  }, [initMcpData])

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <header className="flex flex-col gap-1.5">
        <h1 className="text-xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('desc')}</p>
      </header>
      <div className="flex min-w-0 flex-col gap-6">
        <ServerList mobile />
      </div>
    </div>
  )
}
