'use client'

import { useTranslations } from 'next-intl'
import { InterfaceSettings } from '@/app/core/setting/general/interface-settings'
import { AdvancedSettings } from '@/app/core/setting/general/advanced-settings'

export default function GeneralSettingsPage() {
  const t = useTranslations('settings.general')

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <header className="flex flex-col gap-1.5">
        <h1 className="text-xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('desc')}</p>
      </header>
      <InterfaceSettings mobile />
      <AdvancedSettings showConfigFileActions={false} />
    </div>
  )
}
