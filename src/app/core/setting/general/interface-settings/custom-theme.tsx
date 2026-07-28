'use client'

import { useState } from 'react'
import { Store } from '@tauri-apps/plugin-store'
import { useTranslations } from 'next-intl'
import { useTheme } from 'next-themes'
import { Item, ItemMedia, ItemContent, ItemTitle, ItemDescription, ItemActions } from '@/components/ui/item'
import { Palette, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import useSettingStore from '@/stores/setting'
import { HSLValue } from '@/types/theme'
import { applyThemeColors } from '@/lib/theme-utils'
import { ThemeColorPicker } from './theme-color-picker'
import { ThemePresets } from './theme-presets'

interface ColorScheme {
  name: string
  mode?: 'light' | 'dark'
  colors: {
    background: string
    foreground: string
    card: string
    cardForeground: string
    primary: string
    primaryForeground: string
    secondary: string
    secondaryForeground: string
    third: string
    thirdForeground: string
    muted: string
    mutedForeground: string
    accent: string
    accentForeground: string
    border: string
    shadow: string
  }
}

export function CustomThemeSettings() {
  const t = useTranslations('settings.general.interface.customTheme')
  const { customThemeColors } = useSettingStore()
  const { setTheme } = useTheme()
  const [open, setOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<'custom' | 'presets' | 'import'>('custom')
  const [importCode, setImportCode] = useState('')

  // 实时保存颜色变化
  const handleColorChange = async (colorKey: string, value: HSLValue | null) => {
    // 同时更新亮色和暗色主题的颜色
    const updatedColors = {
      light: {
        ...customThemeColors.light,
        [colorKey]: value,
      },
      dark: {
        ...customThemeColors.dark,
        [colorKey]: value,
      },
    }

    // 立即保存到 store
    const store = await Store.load('store.json')
    await store.set('customThemeColors', updatedColors)
    await store.save()

    // 更新 store 状态（触发 re-render）
    useSettingStore.setState({ customThemeColors: updatedColors })

    // 立即应用颜色
    applyThemeColors(updatedColors)
  }

  // 应用预设方案
  const applyPreset = async (preset: ColorScheme) => {
    const hexToHsl = (hex: string): HSLValue | null => {
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
      if (!result) return null
      const r = parseInt(result[1], 16)
      const g = parseInt(result[2], 16)
      const b = parseInt(result[3], 16)
      const rNorm = r / 255
      const gNorm = g / 255
      const bNorm = b / 255
      const max = Math.max(rNorm, gNorm, bNorm)
      const min = Math.min(rNorm, gNorm, bNorm)
      let h = 0, s = 0
      const l = (max + min) / 2
      if (max !== min) {
        const d = max - min
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
        switch (max) {
          case rNorm: h = ((gNorm - bNorm) / d + (gNorm < bNorm ? 6 : 0)) / 6; break
          case gNorm: h = ((bNorm - rNorm) / d + 2) / 6; break
          case bNorm: h = ((rNorm - gNorm) / d + 4) / 6; break
        }
      }
      return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)]
    }

    const updatedColors = {
      light: {
        background: hexToHsl(preset.colors.background),
        foreground: hexToHsl(preset.colors.foreground),
        card: hexToHsl(preset.colors.card),
        cardForeground: hexToHsl(preset.colors.cardForeground),
        primary: hexToHsl(preset.colors.primary),
        primaryForeground: hexToHsl(preset.colors.primaryForeground),
        secondary: hexToHsl(preset.colors.secondary),
        secondaryForeground: hexToHsl(preset.colors.secondaryForeground),
        third: hexToHsl(preset.colors.third),
        thirdForeground: hexToHsl(preset.colors.thirdForeground),
        muted: hexToHsl(preset.colors.muted),
        mutedForeground: hexToHsl(preset.colors.mutedForeground),
        accent: hexToHsl(preset.colors.accent),
        accentForeground: hexToHsl(preset.colors.accentForeground),
        border: hexToHsl(preset.colors.border),
        shadow: hexToHsl(preset.colors.shadow),
      },
      dark: {
        background: hexToHsl(preset.colors.background),
        foreground: hexToHsl(preset.colors.foreground),
        card: hexToHsl(preset.colors.card),
        cardForeground: hexToHsl(preset.colors.cardForeground),
        primary: hexToHsl(preset.colors.primary),
        primaryForeground: hexToHsl(preset.colors.primaryForeground),
        secondary: hexToHsl(preset.colors.secondary),
        secondaryForeground: hexToHsl(preset.colors.secondaryForeground),
        third: hexToHsl(preset.colors.third),
        thirdForeground: hexToHsl(preset.colors.thirdForeground),
        muted: hexToHsl(preset.colors.muted),
        mutedForeground: hexToHsl(preset.colors.mutedForeground),
        accent: hexToHsl(preset.colors.accent),
        accentForeground: hexToHsl(preset.colors.accentForeground),
        border: hexToHsl(preset.colors.border),
        shadow: hexToHsl(preset.colors.shadow),
      },
    }

    const store = await Store.load('store.json')
    await store.set('customThemeColors', updatedColors)
    await store.save()
    useSettingStore.setState({ customThemeColors: updatedColors })
    applyThemeColors(updatedColors)

    // 同时设置系统主题模式
    if (preset.mode) {
      setTheme(preset.mode)
    }
  }

  // 重置为默认主题
  const handleResetDefault = async () => {
    await useSettingStore.getState().resetCustomThemeColors()
  }

  // 导入配色方案
  const handleImport = async () => {
    try {
      const importData = JSON.parse(importCode) as ColorScheme
      if (importData.colors) {
        await applyPreset(importData)
        setImportCode('')
        setActiveTab('custom')
      }
    } catch (error) {
      console.error('Import failed:', error)
    }
  }

  return (
    <>
      <Item variant="outline">
        <ItemMedia variant="icon"><Palette className="size-4" /></ItemMedia>
        <ItemContent>
          <ItemTitle>{t('title')}</ItemTitle>
          <ItemDescription>{t('desc')}</ItemDescription>
        </ItemContent>
        <ItemActions>
          <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
            {t('button')}
          </Button>
        </ItemActions>
      </Item>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('dialogTitle')}</DialogTitle>
            <DialogDescription>{t('dialogDesc')}</DialogDescription>
          </DialogHeader>

          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'custom' | 'presets' | 'import')} className="mt-4">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="custom">{t('tabs.custom')}</TabsTrigger>
              <TabsTrigger value="presets">{t('tabs.presets')}</TabsTrigger>
              <TabsTrigger value="import">{t('import.title')}</TabsTrigger>
            </TabsList>

            <TabsContent value="custom" className="mt-4">
              <ThemeColorPicker
                colors={customThemeColors.light}
                onColorChange={handleColorChange}
                t={t}
              />
            </TabsContent>

            <TabsContent value="presets" className="mt-4">
              <ThemePresets onApplyPreset={applyPreset} onResetDefault={handleResetDefault} t={t} />
            </TabsContent>

            <TabsContent value="import" className="mt-4 space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold">{t('import.title')}</h3>
                  <Button variant="outline" size="sm" onClick={handleImport} disabled={!importCode.trim()}>
                    <Upload className="h-4 w-4 mr-1" />
                    {t('import.button')}
                  </Button>
                </div>
                <Textarea
                  value={importCode}
                  onChange={(e) => setImportCode(e.target.value)}
                  placeholder={t('import.placeholder')}
                  className="font-mono text-xs"
                  rows={8}
                  maxRows={16}
                />
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </>
  )
}
