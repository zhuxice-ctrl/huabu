'use client'

import { useTranslations } from 'next-intl'
import { UserRoundCog } from 'lucide-react'
import { DefaultModelsSettings } from '@/app/core/setting/components/default-models-settings'

export default function EditorPage() {
  const t = useTranslations('settings.editor')

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <header className="flex flex-col gap-1.5">
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
          <UserRoundCog className="size-6" />
          {t('title')}
        </h1>
        <p className="text-sm text-muted-foreground">{t('desc')}</p>
      </header>
      <DefaultModelsSettings type="editor" />
    </div>
  )
}
