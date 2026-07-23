'use client'

import baseConfig from '../config'
import { useTranslations } from 'next-intl'
import useUpdateStore from '@/stores/update'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { TabsList, TabsTrigger } from '@/components/ui/tabs'

export function SettingTab() {
  const t = useTranslations('settings')
  const { hasUpdate } = useUpdateStore()
  
  // Add translations to the config
  const config = baseConfig.map(item => {
    if (typeof item === 'string') return item
    return {
      ...item,
      title: t(item.anchor === 'ai' ? 'ai.menuTitle' : `${item.anchor}.title`)
    }
  })

  return (
    <TabsList
      variant="line"
      className="min-h-0 w-56 shrink-0 items-stretch justify-start overflow-y-scroll rounded-none border-r bg-sidebar p-3 group-data-vertical/tabs:h-full [scrollbar-gutter:stable]"
      aria-label={t('title')}
    >
      {config.map((item, index) => {
        if (typeof item === 'string') {
          return <Separator key={index} className="my-2" />
        }

        return (
          <TabsTrigger
            key={item.anchor}
            value={item.anchor}
            className="h-9 flex-none px-3"
          >
            <span data-icon="inline-start">{item.icon}</span>
            <span className="truncate">{item.title}</span>
            {item.anchor === 'about' && hasUpdate ? (
              <Badge
                variant="destructive"
                className="ml-auto size-2 shrink-0 p-0"
                aria-hidden
              />
            ) : null}
          </TabsTrigger>
        )
      })}
    </TabsList>
  )
}
