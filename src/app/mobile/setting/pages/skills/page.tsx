'use client'

import { useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { useSkillsStore } from '@/stores/skills'
import { SkillsSettings } from '@/app/core/setting/skills/components/skills-settings'

export default function SkillsPage() {
  const t = useTranslations('settings.skills')
  const { initSkills } = useSkillsStore()

  useEffect(() => {
    void initSkills()
  }, [initSkills])

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <header className="flex flex-col gap-1.5">
        <h1 className="text-xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('desc')}</p>
      </header>
      <SkillsSettings showFileActions={false} />
    </div>
  )
}
