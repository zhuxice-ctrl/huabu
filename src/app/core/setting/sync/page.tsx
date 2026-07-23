'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { confirm } from '@tauri-apps/plugin-dialog'
import { Store } from '@tauri-apps/plugin-store'
import {
  Cloud,
  Database,
  FileDown,
  FileUp,
  GitBranch,
  GitFork,
  Loader2,
  Network,
  RefreshCcw,
  Server,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  UploadCloud,
  type LucideIcon,
} from 'lucide-react'
import Image from 'next/image'
import { useTranslations } from 'next-intl'

import { GiteeSync } from './gitee-sync'
import { GiteaSync } from './gitea-sync'
import { GithubSync } from './github-sync'
import { GitlabSync } from './gitlab-sync'
import { S3Sync } from './s3-sync'
import { WebDAVSync } from './webdav-sync'
import { UsePlatformButton } from './components/use-platform-button'
import { SettingType } from '../components/setting-base'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from '@/components/ui/item'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import {
  downloadAutoDataSyncNow,
  uploadAutoDataSyncNow,
} from '@/lib/sync/auto-data-sync-queue'
import { SyncStateEnum } from '@/lib/sync/github.types'
import { checkSyncProviderStatus } from '@/lib/sync/provider-status'
import useChatStore from '@/stores/chat'
import useMarkStore from '@/stores/mark'
import useSettingStore from '@/stores/setting'
import useSyncStore from '@/stores/sync'
import useTagStore from '@/stores/tag'
import { SYNC_PLATFORMS, SYNC_PLATFORM_INFO, type SyncPlatform } from '@/types/sync'

const PLATFORM_ICONS: Record<SyncPlatform, LucideIcon> = {
  github: GitBranch,
  gitee: GitFork,
  gitlab: Network,
  gitea: Server,
  s3: Database,
  webdav: Cloud,
}

const PLATFORM_LOGOS: Partial<Record<SyncPlatform, string>> = {
  github: '/sync-platforms/github.svg',
  gitee: '/sync-platforms/gitee.svg',
  gitlab: '/sync-platforms/gitlab.svg',
  gitea: '/sync-platforms/gitea.svg',
}

export default function SyncPage() {
  const t = useTranslations()
  const {
    primaryBackupMethod,
    setPrimaryBackupMethod,
    autoSync,
    setAutoSync,
    autoDataSyncEnabled,
    setAutoDataSyncEnabled,
    excludeSensitiveConfig,
    setExcludeSensitiveConfig,
    autoPullOnOpen,
    setAutoPullOnOpen,
  } = useSettingStore()
  const {
    syncRepoState,
    giteeSyncRepoState,
    gitlabSyncProjectState,
    giteaSyncRepoState,
    s3Connected,
    webdavConnected,
  } = useSyncStore()
  const { fetchMarks } = useMarkStore()
  const { fetchTags, currentTagId } = useTagStore()
  const { init } = useChatStore()

  const [platform, setPlatform] = useState<SyncPlatform>(primaryBackupMethod)
  const [activeTab, setActiveTab] = useState('connection')
  const [isLoading, setIsLoading] = useState(true)
  const [checkingPlatforms, setCheckingPlatforms] = useState<Set<SyncPlatform>>(new Set())
  const checkingPlatformsRef = useRef<Set<SyncPlatform>>(new Set())
  const [initialSyncChoiceVisible, setInitialSyncChoiceVisible] = useState(false)
  const [initialSyncBusy, setInitialSyncBusy] = useState<'upload' | 'download' | 'later' | null>(null)

  useEffect(() => {
    async function loadPrimaryBackupMethod() {
      try {
        const store = await Store.load('store.json')
        const savedMethod = await store.get<SyncPlatform>('primaryBackupMethod')
        if (savedMethod) {
          await setPrimaryBackupMethod(savedMethod)
          setPlatform(savedMethod)
        }
      } catch (error) {
        console.error('Failed to load primary backup method:', error)
      } finally {
        setIsLoading(false)
      }
    }

    void loadPrimaryBackupMethod()
  }, [setPrimaryBackupMethod])

  const checkPlatformStatus = useCallback(async (targetPlatform: SyncPlatform) => {
    if (checkingPlatformsRef.current.has(targetPlatform)) return

    checkingPlatformsRef.current.add(targetPlatform)
    setCheckingPlatforms(new Set(checkingPlatformsRef.current))
    try {
      await checkSyncProviderStatus(targetPlatform)
    } finally {
      checkingPlatformsRef.current.delete(targetPlatform)
      setCheckingPlatforms(new Set(checkingPlatformsRef.current))
    }
  }, [])

  useEffect(() => {
    if (isLoading) return
    void checkPlatformStatus(platform)
  }, [checkPlatformStatus, isLoading, platform])

  function getSyncState(targetPlatform: SyncPlatform) {
    if (checkingPlatforms.has(targetPlatform)) return SyncStateEnum.checking

    switch (targetPlatform) {
      case 'github':
        return syncRepoState
      case 'gitee':
        return giteeSyncRepoState
      case 'gitlab':
        return gitlabSyncProjectState
      case 'gitea':
        return giteaSyncRepoState
      case 's3':
        return s3Connected ? SyncStateEnum.success : SyncStateEnum.fail
      case 'webdav':
        return webdavConnected ? SyncStateEnum.success : SyncStateEnum.fail
    }
  }

  const currentSyncState = getSyncState(platform)
  const isAutoSyncDisabled = currentSyncState !== SyncStateEnum.success
  const shouldShowInitialSyncChoice = autoDataSyncEnabled
    && currentSyncState === SyncStateEnum.success
    && initialSyncChoiceVisible
  const currentPlatformInfo = SYNC_PLATFORM_INFO[platform]

  useEffect(() => {
    async function loadInitialChoiceState() {
      if (!autoDataSyncEnabled || currentSyncState !== SyncStateEnum.success) {
        setInitialSyncChoiceVisible(false)
        return
      }

      const store = await Store.load('store.json')
      const confirmed = await store.get<boolean>(getInitialSyncChoiceKey(platform))
      setInitialSyncChoiceVisible(confirmed !== true)
    }

    void loadInitialChoiceState()
  }, [autoDataSyncEnabled, currentSyncState, platform])

  function handlePlatformChange(nextPlatform: SyncPlatform) {
    setPlatform(nextPlatform)
    setActiveTab('connection')
  }

  function getInitialSyncChoiceKey(targetPlatform: SyncPlatform) {
    return `autoDataSyncInitialChoice:${targetPlatform}`
  }

  async function finishInitialSyncChoice() {
    const store = await Store.load('store.json')
    await store.set(getInitialSyncChoiceKey(platform), true)
    await store.save()
    setInitialSyncChoiceVisible(false)
  }

  async function handleInitialUpload() {
    setInitialSyncBusy('upload')
    try {
      await uploadAutoDataSyncNow()
      await finishInitialSyncChoice()
      toast({ description: t('settings.sync.autoDataSyncInitialSuccess') })
    } catch (error) {
      console.error('Initial upload failed:', error)
      toast({ description: t('settings.sync.autoDataSyncInitialFailed'), variant: 'destructive' })
    } finally {
      setInitialSyncBusy(null)
    }
  }

  async function handleInitialDownload() {
    setInitialSyncBusy('download')
    try {
      const ok = await downloadAutoDataSyncNow()
      if (!ok) throw new Error('Failed to download remote data')

      await Promise.all([fetchTags(), fetchMarks()])
      init(currentTagId)
      await finishInitialSyncChoice()
      toast({ description: t('settings.sync.autoDataSyncInitialSuccess') })
    } catch (error) {
      console.error('Initial download failed:', error)
      toast({ description: t('settings.sync.autoDataSyncInitialFailed'), variant: 'destructive' })
    } finally {
      setInitialSyncBusy(null)
    }
  }

  async function handleInitialLater() {
    setInitialSyncBusy('later')
    try {
      await finishInitialSyncChoice()
    } finally {
      setInitialSyncBusy(null)
    }
  }

  async function handleExcludeSensitiveConfigChange(checked: boolean) {
    if (!checked) {
      const accepted = await confirm(t('settings.sync.autoDataSyncPrivacyDisableConfirm'), {
        title: t('settings.sync.autoDataSyncPrivacyTitle'),
        kind: 'warning',
      })
      if (!accepted) return
    }

    await setExcludeSensitiveConfig(checked)
  }

  function renderSyncContent() {
    switch (platform) {
      case 'github':
        return <GithubSync />
      case 'gitee':
        return <GiteeSync />
      case 'gitlab':
        return <GitlabSync />
      case 'gitea':
        return <GiteaSync />
      case 's3':
        return <S3Sync />
      case 'webdav':
        return <WebDAVSync />
    }
  }

  function renderStatusBadge(state: SyncStateEnum) {
    const isChecking = state === SyncStateEnum.checking || state === SyncStateEnum.creating

    if (state === SyncStateEnum.success) {
      return (
        <Badge className="bg-green-600 text-white">
          {t('settings.sync.status.connected')}
        </Badge>
      )
    }

    if (isChecking) {
      return (
        <Badge variant="secondary">
          <Loader2 data-icon="inline-start" className="animate-spin" />
          {state === SyncStateEnum.checking
            ? t('settings.sync.checking')
            : t('settings.sync.creating')}
        </Badge>
      )
    }

    return <Badge variant="destructive">{t('settings.sync.status.disconnected')}</Badge>
  }

  if (isLoading) {
    return (
      <SettingType id="sync" icon={<FileUp />} title={t('settings.sync.title')} desc={t('settings.sync.desc')}>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="animate-spin text-muted-foreground" />
        </div>
      </SettingType>
    )
  }

  return (
    <SettingType id="sync" icon={<FileUp />} title={t('settings.sync.title')} desc={t('settings.sync.desc')}>
      <div className="grid items-start gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        <Card size="sm" className="lg:sticky lg:top-2">
          <CardHeader>
            <CardTitle>{t('settings.sync.platformSettings')}</CardTitle>
            <CardDescription>{t('settings.sync.platformListDesc')}</CardDescription>
          </CardHeader>
          <CardContent>
            <ItemGroup className="gap-1">
              {SYNC_PLATFORMS.map((itemPlatform) => {
                const platformInfo = SYNC_PLATFORM_INFO[itemPlatform]
                const isCurrentPlatform = primaryBackupMethod === itemPlatform
                const isSelectedPlatform = platform === itemPlatform
                return (
                  <Item
                    key={itemPlatform}
                    asChild
                    size="sm"
                    variant={isSelectedPlatform ? 'outline' : 'default'}
                    className="data-[state=on]:border-primary data-[state=on]:bg-primary/5"
                  >
                    <button
                      type="button"
                      data-state={isSelectedPlatform ? 'on' : 'off'}
                      aria-pressed={isSelectedPlatform}
                      onClick={() => void handlePlatformChange(itemPlatform)}
                    >
                      <ItemMedia>
                        <SyncPlatformIcon platform={itemPlatform} small />
                      </ItemMedia>
                      <ItemContent>
                        <ItemTitle>{platformInfo.name}</ItemTitle>
                      </ItemContent>
                      {isCurrentPlatform ? (
                        <ItemActions>
                          <Badge>{t('settings.sync.currentPlatform')}</Badge>
                        </ItemActions>
                      ) : null}
                    </button>
                  </Item>
                )
              })}
            </ItemGroup>
          </CardContent>
        </Card>

        <div className="flex min-w-0 flex-col gap-4">
          <Card>
            <CardHeader>
              <div className="flex min-w-0 items-center gap-3">
                <SyncPlatformIcon platform={platform} />
                <div className="min-w-0 flex-1">
                  <CardTitle>{currentPlatformInfo.name}</CardTitle>
                  <CardDescription>{t('settings.sync.platformDesc')}</CardDescription>
                </div>
              </div>
              <CardAction>
                <div className="flex items-center gap-2">
                  {renderStatusBadge(currentSyncState)}
                  <UsePlatformButton
                    platform={platform}
                    disabled={currentSyncState !== SyncStateEnum.success}
                  />
                </div>
              </CardAction>
            </CardHeader>
          </Card>

          <Tabs orientation="horizontal" value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid h-9 w-full grid-cols-2">
              <TabsTrigger className="!justify-center" value="connection">
                <Settings2 data-icon="inline-start" />
                {t('settings.sync.connectionTab')}
              </TabsTrigger>
              <TabsTrigger className="!justify-center" value="options">
                <SlidersHorizontal data-icon="inline-start" />
                {t('settings.sync.syncOptionsTab')}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="connection">{renderSyncContent()}</TabsContent>

            <TabsContent value="options" className="flex flex-col gap-4">
              <Card>
                <CardHeader>
                  <CardTitle>{t('settings.sync.noteSettings')}</CardTitle>
                  <CardDescription>{t('settings.sync.noteSettingsDesc')}</CardDescription>
                </CardHeader>
                <CardContent>
                  <ItemGroup>
                    <Item variant="outline">
                      <ItemMedia variant="icon"><RefreshCcw /></ItemMedia>
                      <ItemContent>
                        <ItemTitle>{t('settings.sync.autoSync')}</ItemTitle>
                        <ItemDescription>{t('settings.sync.autoSyncDesc')}</ItemDescription>
                      </ItemContent>
                      <ItemActions>
                        <Select
                          value={autoSync}
                          onValueChange={setAutoSync}
                          disabled={isAutoSyncDisabled}
                        >
                          <SelectTrigger className="w-45">
                            <SelectValue placeholder={t('settings.sync.autoSyncOptions.placeholder')} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              <SelectItem value="disabled">{t('settings.sync.autoSyncOptions.disabled')}</SelectItem>
                              <SelectItem value="2">{t('settings.sync.autoSyncOptions.2s')}</SelectItem>
                              <SelectItem value="3">{t('settings.sync.autoSyncOptions.3s')}</SelectItem>
                              <SelectItem value="5">{t('settings.sync.autoSyncOptions.5s')}</SelectItem>
                              <SelectItem value="10">{t('settings.sync.autoSyncOptions.10s')}</SelectItem>
                              <SelectItem value="20">{t('settings.sync.autoSyncOptions.20s')}</SelectItem>
                              <SelectItem value="30">{t('settings.sync.autoSyncOptions.30s')}</SelectItem>
                              <SelectItem value="60">{t('settings.sync.autoSyncOptions.1m')}</SelectItem>
                              <SelectItem value="120">{t('settings.sync.autoSyncOptions.2m')}</SelectItem>
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      </ItemActions>
                    </Item>

                    <Item variant="outline">
                      <ItemMedia variant="icon"><FileDown /></ItemMedia>
                      <ItemContent>
                        <ItemTitle>{t('settings.sync.autoPullOnOpen')}</ItemTitle>
                        <ItemDescription>{t('settings.sync.autoPullOnOpenDesc')}</ItemDescription>
                      </ItemContent>
                      <ItemActions>
                        <Switch
                          checked={autoPullOnOpen}
                          onCheckedChange={setAutoPullOnOpen}
                          disabled={isAutoSyncDisabled}
                        />
                      </ItemActions>
                    </Item>

                  </ItemGroup>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>{t('settings.sync.recordConfigSettings')}</CardTitle>
                  <CardDescription>{t('settings.sync.recordConfigSettingsDesc')}</CardDescription>
                </CardHeader>
                <CardContent>
                  <ItemGroup>
                    <Item variant="outline">
                      <ItemMedia variant="icon"><UploadCloud /></ItemMedia>
                      <ItemContent>
                        <ItemTitle>{t('settings.sync.autoDataSync')}</ItemTitle>
                        <ItemDescription>{t('settings.sync.autoDataSyncDesc')}</ItemDescription>
                      </ItemContent>
                      <ItemActions>
                        <Switch
                          checked={autoDataSyncEnabled}
                          onCheckedChange={setAutoDataSyncEnabled}
                        />
                      </ItemActions>
                    </Item>

                    {shouldShowInitialSyncChoice ? (
                      <Alert>
                        <ShieldCheck />
                        <AlertTitle>{t('settings.sync.autoDataSyncInitialTitle')}</AlertTitle>
                        <AlertDescription>
                          <div className="flex flex-col gap-3">
                            <p>{t('settings.sync.autoDataSyncInitialDesc')}</p>
                            <div className="flex flex-wrap gap-2">
                              <Button size="sm" onClick={handleInitialUpload} disabled={initialSyncBusy !== null}>
                                {initialSyncBusy === 'upload' ? <Loader2 data-icon="inline-start" className="animate-spin" /> : null}
                                {t('settings.sync.autoDataSyncInitialUploadLocal')}
                              </Button>
                              <Button size="sm" variant="outline" onClick={handleInitialDownload} disabled={initialSyncBusy !== null}>
                                {initialSyncBusy === 'download' ? <Loader2 data-icon="inline-start" className="animate-spin" /> : null}
                                {t('settings.sync.autoDataSyncInitialPullRemote')}
                              </Button>
                              <Button size="sm" variant="ghost" onClick={handleInitialLater} disabled={initialSyncBusy !== null}>
                                {t('settings.sync.autoDataSyncInitialLater')}
                              </Button>
                            </div>
                          </div>
                        </AlertDescription>
                      </Alert>
                    ) : null}

                    <Item variant="outline">
                      <ItemMedia variant="icon"><ShieldCheck /></ItemMedia>
                      <ItemContent>
                        <ItemTitle>{t('settings.sync.autoDataSyncPrivacyTitle')}</ItemTitle>
                        <ItemDescription>{t('settings.sync.autoDataSyncPrivacyDesc')}</ItemDescription>
                      </ItemContent>
                      <ItemActions>
                        <Switch
                          checked={excludeSensitiveConfig}
                          onCheckedChange={handleExcludeSensitiveConfigChange}
                        />
                      </ItemActions>
                    </Item>
                  </ItemGroup>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </SettingType>
  )
}

function SyncPlatformIcon({
  platform,
  small = false,
}: {
  platform: SyncPlatform
  small?: boolean
}) {
  const platformInfo = SYNC_PLATFORM_INFO[platform]
  const PlatformIcon = PLATFORM_ICONS[platform]
  const logo = PLATFORM_LOGOS[platform]

  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center',
        small ? 'size-6' : 'size-8',
      )}
    >
      {logo ? (
        <Image
          className="size-full object-contain"
          src={logo}
          alt={`${platformInfo.name} logo`}
          width={small ? 24 : 32}
          height={small ? 24 : 32}
        />
      ) : (
        <PlatformIcon className="size-full" />
      )}
    </span>
  )
}
