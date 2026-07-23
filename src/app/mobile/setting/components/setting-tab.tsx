"use client";

import { useRouter } from "next/navigation";
import baseConfig from '@/app/core/setting/config'
import { useTranslations } from 'next-intl'
import { ChevronRight } from "lucide-react";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemGroup,
  ItemMedia,
  ItemSeparator,
  ItemTitle,
} from '@/components/ui/item'

const MOBILE_ME_SCROLL_KEY = 'mobile-me-scroll-top'

export function SettingTab() {
  const router = useRouter()
  const t = useTranslations('settings')
  const notMobilePages = ['about', 'file', 'shortcuts']
  
  // Add translations to the config, keep separators
  const visibleConfig = baseConfig.map(item => {
    if (typeof item === 'string') return item
    return {
      ...item,
      title: t(item.anchor === 'ai' ? 'ai.menuTitle' : `${item.anchor}.title`)
    }
  }).filter(item => {
    // 过滤掉不支持的移动端页面，但保留分隔符
    if (typeof item === 'string') return true
    return !notMobilePages.includes(item.anchor)
  })
  const config = visibleConfig.filter((item, index, items) => {
    if (typeof item !== 'string') return true
    return index > 0
      && index < items.length - 1
      && typeof items[index - 1] !== 'string'
  })

  function handleNavigation(anchor: string) {
    const mePage = document.getElementById('mobile-me')
    if (mePage) {
      window.sessionStorage.setItem(MOBILE_ME_SCROLL_KEY, String(mePage.scrollTop))
    }
    router.push(`/mobile/setting/pages/${anchor}`)
  }

  return (
    <ItemGroup className="gap-0 p-1">
      {
        config.map((item, index) => {
          // 如果是分隔符字符串，渲染分隔线
          if (typeof item === 'string') {
            return (
              <ItemSeparator key={`separator-${index}`} className="mx-3 my-1 w-auto" />
            )
          }
          
          return (
            <Item key={item.anchor} asChild className="mobile-setting-inline-item rounded-2xl active:bg-muted">
              <button type="button" onClick={() => handleNavigation(item.anchor)}>
                <ItemMedia variant="icon">{item.icon}</ItemMedia>
                <ItemContent>
                  <ItemTitle>{item.title}</ItemTitle>
                </ItemContent>
                <ItemActions className="mobile-setting-inline-action">
                  <ChevronRight className="size-4 text-muted-foreground" />
                </ItemActions>
              </button>
            </Item>
          )
        })
      }
    </ItemGroup>
  )
}
