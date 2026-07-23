'use client'

import { useEffect, useState } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { confirm, message } from '@tauri-apps/plugin-dialog'
import { BaseDirectory, exists, remove } from '@tauri-apps/plugin-fs'
import { Store } from '@tauri-apps/plugin-store'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from '@/components/ui/item'
import { Input } from '@/components/ui/input'
import { useToast } from '@/hooks/use-toast'
import { ConfigFileActions } from './config-file-actions'
import { Database, FolderX, Network } from 'lucide-react'
import { SettingSection } from '../components/setting-base'

export function AdvancedSettings({ showConfigFileActions = true }: { showConfigFileActions?: boolean }) {
  const t = useTranslations('settings.dev')
  const [proxy, setProxy] = useState('')
  const { toast } = useToast()

  async function handleClearData() {
    const confirmed = await confirm(t('clearDataConfirm'), {
      title: t('clearData'),
      kind: 'warning',
    })

    if (!confirmed) return

    const store = await Store.load('store.json')
    await store.clear()
    await remove('store.json', { baseDir: BaseDirectory.AppData })
    await remove('note.db', { baseDir: BaseDirectory.AppData })
    await message('数据已清理，请重启应用', {
      title: '重启应用',
      kind: 'info',
    })
    await getCurrentWindow().close()
  }

  async function handleClearFile() {
    const confirmed = await confirm('确定清理文件吗？清理后将无法恢复！', {
      title: '清理文件',
      kind: 'warning',
    })

    if (!confirmed) return

    const folders = ['screenshot', 'article', 'clipboard', 'image']
    for (const folder of folders) {
      if (await exists(folder, { baseDir: BaseDirectory.AppData })) {
        await remove(folder, { baseDir: BaseDirectory.AppData, recursive: true })
      }
    }
    toast({ title: '文件已清理' })
  }

  async function handleProxyChange(event: React.ChangeEvent<HTMLInputElement>) {
    const nextProxy = event.target.value
    setProxy(nextProxy)
    const store = await Store.load('store.json')
    await store.set('proxy', nextProxy)
  }

  useEffect(() => {
    async function loadProxy() {
      const store = await Store.load('store.json')
      const storedProxy = await store.get<string>('proxy')
      if (storedProxy) setProxy(storedProxy)
    }

    void loadProxy()
  }, [])

  return (
    <SettingSection title={t('title')} desc={t('desc')}>
      <ItemGroup>
        <Item variant="outline">
          <ItemMedia variant="icon"><Network /></ItemMedia>
          <ItemContent>
            <ItemTitle>{t('proxyTitle')}</ItemTitle>
            <ItemDescription>{t('proxy')}</ItemDescription>
          </ItemContent>
          <ItemActions>
            <Input
              placeholder={t('proxyPlaceholder')}
              value={proxy}
              onChange={handleProxyChange}
            />
          </ItemActions>
        </Item>
        <Item variant="outline">
          <ItemMedia variant="icon"><Database /></ItemMedia>
          <ItemContent>
            <ItemTitle>{t('clearDataTitle')}</ItemTitle>
            <ItemDescription>{t('clearDataDesc')}</ItemDescription>
          </ItemContent>
          <ItemActions>
            <Button variant="destructive" onClick={handleClearData}>
              {t('clearButton')}
            </Button>
          </ItemActions>
        </Item>
        <Item variant="outline">
          <ItemMedia variant="icon"><FolderX /></ItemMedia>
          <ItemContent>
            <ItemTitle>{t('clearFileTitle')}</ItemTitle>
            <ItemDescription>{t('clearFileDesc')}</ItemDescription>
          </ItemContent>
          <ItemActions>
            <Button variant="destructive" onClick={handleClearFile}>
              {t('clearButton')}
            </Button>
          </ItemActions>
        </Item>
        {showConfigFileActions ? <ConfigFileActions /> : null}
      </ItemGroup>
    </SettingSection>
  )
}
