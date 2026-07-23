'use client'
import { useTranslations } from 'next-intl'
import { SettingSection } from '../../components/setting-base'
import { ThemeSettings } from './theme'
import { LanguageSettings } from './language'
import { FontFamilySettings } from './font-family'
import { ScaleSettings } from './scale'
import { ContentTextScaleSettings } from './content-text-scale'
import { FileManagerTextSizeSettings } from './file-manager-text-size'
import { RecordTextSizeSettings } from './record-text-size'
import { CustomThemeSettings } from './custom-theme'

export function InterfaceSettings({ mobile = false }: { mobile?: boolean }) {
  const t = useTranslations('settings.general.interface')

  return (
    <SettingSection title={t('title')}>
      <div className="flex flex-col gap-4">
        <ThemeSettings />
        <LanguageSettings />
        <FontFamilySettings />
        {!mobile && <ScaleSettings />}
        <ContentTextScaleSettings />
        {!mobile && <FileManagerTextSizeSettings />}
        {!mobile && <RecordTextSizeSettings />}
        <CustomThemeSettings />
      </div>
    </SettingSection>
  )
}
