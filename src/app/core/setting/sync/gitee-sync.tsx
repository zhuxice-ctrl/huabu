'use client'
import { useEffect } from "react";
import { useTranslations } from 'next-intl';
import useSettingStore from "@/stores/setting";
import useSyncStore from "@/stores/sync";
import { OpenBroswer } from "@/components/open-broswer";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { checkSyncRepoState, createSyncRepo, getUserInfo } from "@/lib/sync/gitee";
import { RepoNames, SyncStateEnum } from "@/lib/sync/github.types";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { SyncPlatformCard } from "./components/sync-platform-card";
import { Item, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "@/components/ui/item";

dayjs.extend(relativeTime)

const GITEE_CONFIG = {
  platform: 'gitee' as const,
  tokenKey: 'giteeAccessToken',
  tokenLabel: 'Gitee 私人令牌',
  tokenDesc: '',
  tokenUrl: 'https://gitee.com/profile/personal_access_tokens/new',
  tokenUrlText: '',
}

export function GiteeSync() {
  const t = useTranslations();
  const {
    giteeAccessToken,
    setGiteeAccessToken,
    giteeCustomSyncRepo,
    setGiteeCustomSyncRepo
  } = useSettingStore()
  
  const {
    giteeSyncRepoState,
    setGiteeSyncRepoState,
    giteeSyncRepoInfo,
    setGiteeSyncRepoInfo
  } = useSyncStore()

  // 获取实际使用的仓库名称
  const getRepoName = () => {
    return giteeCustomSyncRepo.trim() || RepoNames.sync
  }


  // 检查 Gitee 仓库状态（仅检查，不创建）
  async function checkRepoState() {
    try {
      setGiteeSyncRepoState(SyncStateEnum.checking)
      // 先清空之前的仓库信息
      setGiteeSyncRepoInfo(undefined)
      
      // 添加超时保护，避免无限等待
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('检测超时')), 15000) // 15秒超时
      })
      
      // 使用 Promise.race 来处理超时
      await Promise.race([
        (async () => {
          // 先检查网络连接
          if (!navigator.onLine) {
            throw new Error('网络连接不可用')
          }
          
          await getUserInfo();
          const repoName = getRepoName()
          const syncRepo = await checkSyncRepoState(repoName)
          
          if (syncRepo) {
            setGiteeSyncRepoInfo(syncRepo)
            setGiteeSyncRepoState(SyncStateEnum.success)
          } else {
            setGiteeSyncRepoInfo(undefined)
            setGiteeSyncRepoState(SyncStateEnum.fail)
          }
        })(),
        timeoutPromise
      ])
      
    } catch (err) {
      console.error('Failed to check Gitee repos:', err)
      setGiteeSyncRepoInfo(undefined)
      setGiteeSyncRepoState(SyncStateEnum.fail)
      
      // 如果是超时错误，显示特定提示
      if (err instanceof Error) {
        if (err.message === '检测超时') {
          console.warn('Gitee 仓库检测超时，可能是网络问题')
        } else if (err.message === '网络连接不可用') {
          console.warn('网络连接不可用，请检查网络设置')
        }
      }
    }
  }

  // 手动创建仓库
  async function createGiteeRepo() {
    try {
      setGiteeSyncRepoState(SyncStateEnum.creating)
      const repoName = getRepoName()
      
      // 添加超时保护
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('创建超时')), 20000) // 20秒超时
      })
      
      await Promise.race([
        (async () => {
          const info = await createSyncRepo(repoName, true)
          if (info) {
            setGiteeSyncRepoInfo(info)
            setGiteeSyncRepoState(SyncStateEnum.success)
          } else {
            setGiteeSyncRepoState(SyncStateEnum.fail)
          }
        })(),
        timeoutPromise
      ])
      
    } catch (err) {
      console.error('Failed to create Gitee repo:', err)
      setGiteeSyncRepoState(SyncStateEnum.fail)
      
      if (err instanceof Error && err.message === '创建超时') {
        console.warn('Gitee 仓库创建超时，可能是网络问题')
      }
    }
  }

  useEffect(() => {
    // 添加网络状态监听
    const handleOnline = () => {
      // Network connected
    }

    const handleOffline = () => {
      // Network disconnected
      setGiteeSyncRepoState(SyncStateEnum.fail)
      setGiteeSyncRepoInfo(undefined)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])


  return (
    <SyncPlatformCard
      config={GITEE_CONFIG}
      accessToken={giteeAccessToken}
      setAccessToken={(token) => {
        setGiteeAccessToken(token)
        if (!token) {
          setGiteeSyncRepoState(SyncStateEnum.fail)
          setGiteeSyncRepoInfo(undefined)
        }
      }}
      syncRepoState={giteeSyncRepoState}
      syncRepoInfo={giteeSyncRepoInfo}
      customRepo={giteeCustomSyncRepo}
      setCustomRepo={setGiteeCustomSyncRepo}
      defaultRepoName={RepoNames.sync}
      onCheckRepo={checkRepoState}
      onCreateRepo={createGiteeRepo}
    >
      {giteeSyncRepoInfo && (
          <Item>
            <ItemMedia>
            <Avatar className="size-10">
              <AvatarImage src={giteeSyncRepoInfo?.owner?.avatar_url || ''} alt={giteeSyncRepoInfo?.owner?.login || 'Gitee'} />
              <AvatarFallback>GT</AvatarFallback>
            </Avatar>
            </ItemMedia>
            <ItemContent>
              <ItemTitle>
                <OpenBroswer title={giteeSyncRepoInfo?.full_name || ''} url={giteeSyncRepoInfo?.html_url || ''} />
              </ItemTitle>
              <ItemDescription>
                {giteeSyncRepoInfo?.private ? t('settings.sync.private') : t('settings.sync.public')} · {t('settings.sync.createdAt', { time: dayjs(giteeSyncRepoInfo?.created_at).fromNow() })} · {t('settings.sync.updatedAt', { time: dayjs(giteeSyncRepoInfo?.updated_at).fromNow() })}
              </ItemDescription>
            </ItemContent>
          </Item>
      )}
    </SyncPlatformCard>
  )
}
