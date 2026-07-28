'use client'
import { useState } from 'react'
import { SettingWorkspace } from "./setting-workspace"
import { SettingAssets } from "./setting-assets"
import { SettingType } from "../components/setting-base"
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldTitle } from '@/components/ui/field'
import { FolderOpen, History, SearchCheck, Trash2 } from "lucide-react"
import { useTranslations } from 'next-intl'
import {
  checkWorkspaceHealth,
  cleanupOldWorkspaceBackups,
  requestRestoreLatestWorkspaceSnapshot,
} from '@/lib/recovery/startup-recovery'

export default function SettingFilePage() {
  const t = useTranslations('settings.file')
  const [recoveryStatus, setRecoveryStatus] = useState('')
  const [recoveryBusy, setRecoveryBusy] = useState(false)

  async function runRecoveryAction(action: () => Promise<string>) {
    setRecoveryBusy(true)
    try {
      setRecoveryStatus(await action())
    } catch (error) {
      setRecoveryStatus(error instanceof Error ? error.message : '工作区操作失败')
    } finally {
      setRecoveryBusy(false)
    }
  }

  async function restoreHistory() {
    await requestRestoreLatestWorkspaceSnapshot()
    window.location.reload()
    return '正在恢复历史状态'
  }

  return (
    <SettingType
      id="file"
      title={t('title')}
      desc={t('desc')}
      icon={<FolderOpen className="w-5 h-5" />}
    >
      <div className="space-y-8">
        <SettingWorkspace />
        <SettingAssets />
        <Field>
          <FieldTitle>工作区恢复</FieldTitle>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={recoveryBusy}
              onClick={() => void runRecoveryAction(checkWorkspaceHealth)}
            >
              <SearchCheck className="mr-2 size-4" />
              检查工作区
            </Button>
            <Button
              variant="outline"
              disabled={recoveryBusy}
              onClick={() => void runRecoveryAction(restoreHistory)}
            >
              <History className="mr-2 size-4" />
              恢复历史状态
            </Button>
            <Button
              variant="outline"
              disabled={recoveryBusy}
              onClick={() => void runRecoveryAction(async () => {
                const removed = await cleanupOldWorkspaceBackups()
                return `已清理 ${removed} 个旧备份`
              })}
            >
              <Trash2 className="mr-2 size-4" />
              清理旧备份
            </Button>
          </div>
          <FieldDescription aria-live="polite">
            {recoveryStatus || '备份仅用于本机恢复。'}
          </FieldDescription>
        </Field>
      </div>
    </SettingType>
  )
}
