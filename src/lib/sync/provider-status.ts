import { Store } from '@tauri-apps/plugin-store'

import { SyncStateEnum } from '@/lib/sync/github.types'
import { getSyncRepoName } from '@/lib/sync/repo-utils'
import { testS3Connection } from '@/lib/sync/s3'
import { testWebDAVConnection } from '@/lib/sync/webdav'
import useSyncStore from '@/stores/sync'
import type { S3Config, SyncPlatform, WebDAVConfig } from '@/types/sync'

async function checkGithubStatus(store: Store) {
  const syncStore = useSyncStore.getState()
  const accessToken = await store.get<string>('accessToken')

  syncStore.setSyncRepoInfo(undefined)
  if (!accessToken) {
    syncStore.setSyncRepoState(SyncStateEnum.fail)
    return
  }

  syncStore.setSyncRepoState(SyncStateEnum.checking)
  try {
    const { checkSyncRepoState, getUserInfo } = await import('@/lib/sync/github')
    const userResponse = await getUserInfo()
    if (userResponse) syncStore.setUserInfo(userResponse.data)

    const repo = await checkSyncRepoState(await getSyncRepoName('github'))
    syncStore.setSyncRepoInfo(repo)
    syncStore.setSyncRepoState(repo ? SyncStateEnum.success : SyncStateEnum.fail)
  } catch (error) {
    console.error('Failed to check GitHub status:', error)
    syncStore.setSyncRepoState(SyncStateEnum.fail)
  }
}

async function checkGiteeStatus(store: Store) {
  const syncStore = useSyncStore.getState()
  const accessToken = await store.get<string>('giteeAccessToken')

  syncStore.setGiteeSyncRepoInfo(undefined)
  if (!accessToken) {
    syncStore.setGiteeSyncRepoState(SyncStateEnum.fail)
    return
  }

  syncStore.setGiteeSyncRepoState(SyncStateEnum.checking)
  try {
    const { checkSyncRepoState, getUserInfo } = await import('@/lib/sync/gitee')
    const userInfo = await getUserInfo()
    syncStore.setGiteeUserInfo(userInfo)

    const repo = await checkSyncRepoState(await getSyncRepoName('gitee'))
    syncStore.setGiteeSyncRepoInfo(repo)
    syncStore.setGiteeSyncRepoState(repo ? SyncStateEnum.success : SyncStateEnum.fail)
  } catch (error) {
    console.error('Failed to check Gitee status:', error)
    syncStore.setGiteeSyncRepoState(SyncStateEnum.fail)
  }
}

async function checkGitlabStatus(store: Store) {
  const syncStore = useSyncStore.getState()
  const accessToken = await store.get<string>('gitlabAccessToken')

  syncStore.setGitlabSyncProjectInfo(undefined)
  if (!accessToken) {
    syncStore.setGitlabSyncProjectState(SyncStateEnum.fail)
    return
  }

  syncStore.setGitlabSyncProjectState(SyncStateEnum.checking)
  try {
    const { checkSyncProjectState, getUserInfo } = await import('@/lib/sync/gitlab')
    const userInfo = await getUserInfo()
    syncStore.setGitlabUserInfo(userInfo)

    const project = await checkSyncProjectState(await getSyncRepoName('gitlab'))
    syncStore.setGitlabSyncProjectInfo(project ?? undefined)
    syncStore.setGitlabSyncProjectState(project ? SyncStateEnum.success : SyncStateEnum.fail)
  } catch (error) {
    console.error('Failed to check GitLab status:', error)
    syncStore.setGitlabSyncProjectState(SyncStateEnum.fail)
  }
}

async function checkGiteaStatus(store: Store) {
  const syncStore = useSyncStore.getState()
  const accessToken = await store.get<string>('giteaAccessToken')

  syncStore.setGiteaSyncRepoInfo(undefined)
  if (!accessToken) {
    syncStore.setGiteaSyncRepoState(SyncStateEnum.fail)
    return
  }

  syncStore.setGiteaSyncRepoState(SyncStateEnum.checking)
  try {
    const { checkSyncRepoState, getUserInfo } = await import('@/lib/sync/gitea')
    const userInfo = await getUserInfo()
    syncStore.setGiteaUserInfo(userInfo)

    const repo = await checkSyncRepoState(await getSyncRepoName('gitea'))
    syncStore.setGiteaSyncRepoInfo(repo ?? undefined)
    syncStore.setGiteaSyncRepoState(repo ? SyncStateEnum.success : SyncStateEnum.fail)
  } catch (error) {
    console.error('Failed to check Gitea status:', error)
    syncStore.setGiteaSyncRepoState(SyncStateEnum.fail)
  }
}

async function checkS3Status(store: Store) {
  const syncStore = useSyncStore.getState()
  const config = await store.get<S3Config>('s3SyncConfig')
  const configured = config?.accessKeyId && config.secretAccessKey && config.region && config.bucket
  const connected = configured ? await testS3Connection(config).catch(() => false) : false
  syncStore.setS3Connected(connected)
}

async function checkWebDAVStatus(store: Store) {
  const syncStore = useSyncStore.getState()
  const config = await store.get<WebDAVConfig>('webdavSyncConfig')
  const configured = config?.url && config.username && config.password
  const connected = configured ? await testWebDAVConnection(config).catch(() => false) : false
  syncStore.setWebDAVConnected(connected)
}

export async function checkSyncProviderStatus(platform: SyncPlatform) {
  const store = await Store.load('store.json')

  switch (platform) {
    case 'github':
      return checkGithubStatus(store)
    case 'gitee':
      return checkGiteeStatus(store)
    case 'gitlab':
      return checkGitlabStatus(store)
    case 'gitea':
      return checkGiteaStatus(store)
    case 's3':
      return checkS3Status(store)
    case 'webdav':
      return checkWebDAVStatus(store)
  }
}
