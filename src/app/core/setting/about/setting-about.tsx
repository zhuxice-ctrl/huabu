'use client';
import { SettingSection, SettingType } from "../components/setting-base";
import { useTranslations } from 'next-intl';
import Updater from "./updater";

export function SettingAbout({id, icon}: {id: string, icon?: React.ReactNode}) {
  const t = useTranslations('settings.about');

  return (
    <SettingType id={id} icon={icon} title={t('title')}>
      <div className="flex w-full flex-col gap-6">
        <SettingSection title={t('sections.appInfo.title')} desc={t('sections.appInfo.desc')}>
          <Updater />
        </SettingSection>

        <p className="text-xs text-muted-foreground">{t('licenseText')}</p>
      </div>
    </SettingType>
  )
}
