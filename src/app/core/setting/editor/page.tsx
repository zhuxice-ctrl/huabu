'use client';
import { UserRoundCog } from "lucide-react"
import { SettingSection, SettingType } from "../components/setting-base";
import { useTranslations } from 'next-intl';
import ShowUndoRedo from './show-undo-redo';
import CenteredContent from './centered-content';
import Outline from './outline';
import { DefaultModelsSettings } from '../components/default-models-settings';

export default function EditorSettingPage() {
  const t = useTranslations('settings.editor');
  return <SettingType id="editorSetting" icon={<UserRoundCog />} title={t('title')} desc={t('desc')}>
    <div className="flex flex-col gap-4">
      <DefaultModelsSettings type="editor" />
      <SettingSection title={t('interfaceSettings')}>
        <CenteredContent />
        <Outline />
        <ShowUndoRedo />
      </SettingSection>
    </div>
  </SettingType>
}
