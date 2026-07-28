import { invoke } from '@tauri-apps/api/core'
import type { Store } from '@tauri-apps/plugin-store'
import type { AiConfig } from '@/app/core/setting/config'
import { toast } from '@/hooks/use-toast'

const REF_PREFIX = 'zeroxb:model-credential:v1'

export interface CredentialStatus {
  reference: string
  configured: boolean
}

export type HeaderPairsInput = Array<{
  key: string
  value: string
  secret?: boolean
  credentialRef?: string
}>

type LegacyAiConfig = AiConfig & {
  apiKey?: string
}

export function providerCredentialRef(providerKey: string): string {
  return `${REF_PREFIX}:provider:${encodeRefPart(providerKey)}`
}

export function customHeaderCredentialRef(providerKey: string, headerName: string): string {
  return `${REF_PREFIX}:provider:${encodeRefPart(providerKey)}:header:${encodeRefPart(headerName)}`
}

export function isSecretHeaderName(headerName: string, explicitlySecret = false): boolean {
  if (explicitlySecret) return true

  const normalized = headerName.trim().toLowerCase()
  return normalized === 'authorization'
    || normalized === 'proxy-authorization'
    || normalized === 'x-api-key'
    || normalized === 'api-key'
    || normalized.includes('token')
    || normalized.includes('secret')
    || normalized.includes('credential')
    || normalized.includes('password')
}

export async function setCredential(reference: string, secret: string, baseUrl: string): Promise<CredentialStatus> {
  return invoke<CredentialStatus>('credential_set', {
    request: { reference, secret, baseUrl },
  })
}

export async function getCredentialStatus(reference: string): Promise<CredentialStatus> {
  return invoke<CredentialStatus>('credential_get', {
    request: { reference },
  })
}

export async function deleteCredential(reference: string): Promise<CredentialStatus> {
  return invoke<CredentialStatus>('credential_delete', {
    request: { reference },
  })
}

export async function setProviderCredential(config: AiConfig, secret: string): Promise<AiConfig> {
  const credentialRef = config.credentialRef || providerCredentialRef(config.key)
  await setCredential(credentialRef, secret, config.baseURL || '')
  return {
    ...withoutLegacyApiKey(config),
    credentialRef,
    hasCredential: true,
  }
}

export async function clearProviderCredential(config: AiConfig): Promise<AiConfig> {
  if (config.credentialRef) {
    await deleteCredential(config.credentialRef)
  }

  const next = { ...withoutLegacyApiKey(config) }
  delete next.credentialRef
  next.hasCredential = false
  return next
}

export async function applyCustomHeaderPairs(
  config: AiConfig,
  pairs: HeaderPairsInput,
): Promise<AiConfig> {
  const customHeaders: Record<string, string> = {}
  const customHeaderRefs: Record<string, string> = {}
  const customHeaderSecrets: Record<string, boolean> = {}
  const staleRefs = new Set(Object.values(config.customHeaderRefs || {}))

  for (const pair of pairs) {
    const key = pair.key.trim()
    if (!key) continue

    const secret = isSecretHeaderName(key, pair.secret)
    if (!secret) {
      customHeaders[key] = pair.value
      continue
    }

    const reference = pair.credentialRef || config.customHeaderRefs?.[key] || customHeaderCredentialRef(config.key, key)
    if (pair.value) {
      await setCredential(reference, pair.value, config.baseURL || '')
      customHeaderRefs[key] = reference
      staleRefs.delete(reference)
    } else if (pair.credentialRef || config.customHeaderRefs?.[key]) {
      customHeaderRefs[key] = reference
      staleRefs.delete(reference)
    }
    customHeaderSecrets[key] = true
  }

  for (const reference of staleRefs) {
    await deleteCredential(reference)
  }

  return normalizeCredentialMetadata({
    ...withoutLegacyApiKey(config),
    customHeaders,
    customHeaderRefs,
    customHeaderSecrets,
  })
}

export async function migrateLegacyGlobalCredential(store: Store): Promise<boolean> {
  const legacyApiKey = await store.get<string>('apiKey')
  if (!legacyApiKey) return false

  const reference = providerCredentialRef('global')
  const baseURL = await store.get<string>('baseURL')
  await setCredential(reference, legacyApiKey, baseURL || '')
  await store.set('credentialRef', reference)
  await store.set('hasCredential', true)
  await store.delete('apiKey')
  return true
}

export async function migrateLegacyModelCredentials(aiModelList: AiConfig[]): Promise<AiConfig[]> {
  const migrated: AiConfig[] = []

  for (const provider of aiModelList) {
    try {
      migrated.push(await migrateProviderCredentials(provider))
    } catch (error) {
      console.error('[credential-migration] provider left unchanged', {
        providerKey: provider.key,
        providerTitle: provider.title,
        error: error instanceof Error ? error.message : String(error),
      })
      toast({
        title: '凭据迁移失败',
        description: `${provider.title || provider.key} 的旧密钥保持不变，请重新保存该平台凭据。`,
        variant: 'destructive',
      })
      migrated.push(provider)
    }
  }

  return migrated
}

export function normalizeCredentialMetadata(config: AiConfig): AiConfig {
  const next = withoutLegacyApiKey(config)

  if (next.credentialRef) {
    next.hasCredential = next.hasCredential !== false
  }

  if (next.customHeaders && Object.keys(next.customHeaders).length === 0) {
    delete next.customHeaders
  }
  if (next.customHeaderRefs && Object.keys(next.customHeaderRefs).length === 0) {
    delete next.customHeaderRefs
  }
  if (next.customHeaderSecrets && Object.keys(next.customHeaderSecrets).length === 0) {
    delete next.customHeaderSecrets
  }

  return next
}

async function migrateProviderCredentials(provider: AiConfig): Promise<AiConfig> {
  const legacy = provider as LegacyAiConfig
  const writes: Array<() => Promise<void>> = []
  const credentialRef = provider.credentialRef || providerCredentialRef(provider.key)
  const nextHeaders: Record<string, string> = {}
  const nextHeaderRefs: Record<string, string> = { ...(provider.customHeaderRefs || {}) }
  const nextHeaderSecrets: Record<string, boolean> = { ...(provider.customHeaderSecrets || {}) }

  if (legacy.apiKey) {
    writes.push(() => setCredential(credentialRef, legacy.apiKey as string, provider.baseURL || '').then(() => undefined))
  }

  for (const [headerName, headerValue] of Object.entries(provider.customHeaders || {})) {
    const markedSecret = provider.customHeaderSecrets?.[headerName] === true
    if (isSecretHeaderName(headerName, markedSecret)) {
      const reference = nextHeaderRefs[headerName] || customHeaderCredentialRef(provider.key, headerName)
      writes.push(() => setCredential(reference, headerValue, provider.baseURL || '').then(() => undefined))
      nextHeaderRefs[headerName] = reference
      nextHeaderSecrets[headerName] = true
    } else {
      nextHeaders[headerName] = headerValue
    }
  }

  for (const write of writes) {
    await write()
  }

  if (writes.length === 0 && !legacy.apiKey) {
    return normalizeCredentialMetadata(provider)
  }

  return normalizeCredentialMetadata({
    ...withoutLegacyApiKey(provider),
    credentialRef: legacy.apiKey ? credentialRef : provider.credentialRef,
    hasCredential: legacy.apiKey ? true : provider.hasCredential,
    customHeaders: nextHeaders,
    customHeaderRefs: nextHeaderRefs,
    customHeaderSecrets: nextHeaderSecrets,
  })
}

function withoutLegacyApiKey<T extends AiConfig>(config: T): T {
  const next = { ...config } as T & { apiKey?: string }
  delete next.apiKey
  return next as T
}

function encodeRefPart(value: string): string {
  return encodeURIComponent(value).replace(/:/g, '%3A')
}
