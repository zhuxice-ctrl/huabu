'use client'
import { useState, useEffect, useRef } from "react";
import { useTranslations } from 'next-intl';
import { useLocalStorage } from 'react-use';
import { Store } from "@tauri-apps/plugin-store";
import { v4 } from 'uuid';
import { confirm } from '@tauri-apps/plugin-dialog';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { SettingType } from "../components/setting-base";
import { AiConfig, ModelConfig, ProxyMode, builtinProviderTemplates } from "../config";
import useSettingStore from "@/stores/setting";
import { BotMessageSquare, Copy, KeyRound, LoaderCircle, Network, Plus, Server, Settings2, Trash2, X } from "lucide-react";
import { OpenBroswer } from "@/components/open-broswer";
import DefaultModelsSection from "./default-models";
import ModelCard from "./model-card";
import CreateConfig from "./create";
import { getCachedProviderTemplates, getProviderTemplateMatch, loadProviderTemplates } from "@/lib/ai/provider-templates-runtime";
import { isValidProxyURL } from "@/lib/ai/tauri-client";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Item, ItemActions, ItemContent, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Switch } from "@/components/ui/switch";
import {
  applyCustomHeaderPairs,
  clearProviderCredential,
  isSecretHeaderName,
  reconcileSavedHeaderPairs,
  setProviderCredential,
} from "@/lib/security/credentials";

type HeaderPair = {
  key: string
  value: string
  id: string
  secret: boolean
  hasCredential?: boolean
  credentialRef?: string
}

function getPlatformAvatarFallback(config: AiConfig) {
  const characterCount = config.templateSource === 'custom' ? 1 : 2
  const fallback = Array.from(config.title.trim()).slice(0, characterCount).join('').toUpperCase()
  return fallback || (config.templateSource === 'custom' ? '自' : 'AI')
}

function getCustomPlatformAvatarStyle(config: AiConfig) {
  if (config.templateSource !== 'custom') return undefined

  const platformName = config.title.trim() || '自定义平台'
  const hash = Array.from(platformName).reduce((value, character) => (
    Math.imul(value, 31) + (character.codePointAt(0) || 0)
  ), 17)
  const hue = Math.abs(hash) % 360

  return {
    backgroundColor: `hsl(${hue} 62% 42%)`,
    color: 'white',
  }
}

export default function AiPage({ mobile = false }: { mobile?: boolean }) {
  const t = useTranslations('settings.ai');
  const {
    aiModelList,
    setAiModelList
  } = useSettingStore()

  const userCustomModels = aiModelList
  const [apiKeyDraft, setApiKeyDraft] = useState('')
  const [apiKeySaving, setApiKeySaving] = useState(false)
  const [headerPairs, setHeaderPairs] = useState<HeaderPair[]>([])
  const [expandedModels, setExpandedModels] = useState<string[]>([])
  const [providerTemplates, setProviderTemplates] = useState<AiConfig[]>([])
  const [loadingTemplates, setLoadingTemplates] = useState(true)
  const [addingTemplateKey, setAddingTemplateKey] = useState('')
  const [activeTab, setActiveTab] = useState('connection')
  const aiModelListRef = useRef(aiModelList)
  const storeWriteQueueRef = useRef<Promise<void>>(Promise.resolve())
  const isTitleComposingRef = useRef(false)
  const loadedHeaderProviderRef = useRef<string | null | undefined>(undefined)

  useEffect(() => {
    aiModelListRef.current = aiModelList
  }, [aiModelList])
  
  // 使用 useLocalStorage 记录当前选择的AI配置
  const [selectedAiConfig, setSelectedAiConfig] = useLocalStorage<string>('ai-config-selected', '')
  
  // 当前选中的AI配置
  const currentConfig = userCustomModels.find(model => model.key === selectedAiConfig)
  const currentProviderTemplate = currentConfig?.templateSource === 'custom'
    ? null
    : getProviderTemplateMatch(currentConfig, providerTemplates)
  const currentPlatformNameEditable = currentConfig?.templateSource === 'custom' || !currentProviderTemplate
  const proxyURLInvalid = currentConfig?.proxyMode === 'custom' && !isValidProxyURL(currentConfig.proxyURL)
  const getConfiguredModelCount = (config: AiConfig) => config.models?.filter(model => model.model.trim()).length || 0
  const sortedUserCustomModels = [...userCustomModels].sort((left, right) => (
    getConfiguredModelCount(right) - getConfiguredModelCount(left)
  ))
  const configuredModelCount = currentConfig ? getConfiguredModelCount(currentConfig) : 0
  const providerConfigured = Boolean(currentConfig?.baseURL && configuredModelCount > 0)
  const configuredTemplateKeys = new Set(userCustomModels.flatMap(config => {
    if (config.templateSource === 'custom') return []
    const template = getProviderTemplateMatch(config, providerTemplates)
    return template ? [template.templateKey || template.key] : []
  }))
  const availableProviderTemplates = providerTemplates.filter(template => (
    !configuredTemplateKeys.has(template.templateKey || template.key)
  ))
  
  const parseHeadersToKeyValue = (config: AiConfig): HeaderPair[] => {
    const headerNames = new Set([
      ...Object.keys(config.customHeaders || {}),
      ...Object.keys(config.customHeaderSecrets || {}),
      ...Object.keys(config.customHeaderRefs || {}),
    ])
    return Array.from(headerNames).map(key => {
      const explicitlySecret = config.customHeaderSecrets?.[key] === true
        || Boolean(config.customHeaderRefs?.[key])
      const secret = isSecretHeaderName(key, explicitlySecret)

      return {
      key,
      value: secret ? '' : String(config.customHeaders?.[key] ?? ''),
      id: Math.random().toString(36).substr(2, 9),
      secret,
      hasCredential: Boolean(config.customHeaderRefs?.[key]),
      credentialRef: config.customHeaderRefs?.[key],
      }
    })
  }

  const saveHeaderPairs = async (pairs: HeaderPair[]) => {
    if (!currentConfig) return
    const submittedPairs = pairs.map(pair => ({ ...pair }))
    const updatedConfig = await applyCustomHeaderPairs(currentConfig, submittedPairs)
    await updateAiConfig(updatedConfig)
    const savedPairs = parseHeadersToKeyValue(updatedConfig)
    setHeaderPairs(current => reconcileSavedHeaderPairs(current, submittedPairs, savedPairs))
  }

  const replaceProviderCredential = async () => {
    if (!currentConfig || !apiKeyDraft) return
    setApiKeySaving(true)
    try {
      const updatedConfig = await setProviderCredential(currentConfig, apiKeyDraft)
      setApiKeyDraft('')
      await updateAiConfig(updatedConfig)
    } finally {
      setApiKeySaving(false)
    }
  }

  const removeProviderCredential = async () => {
    if (!currentConfig) return
    setApiKeySaving(true)
    try {
      const updatedConfig = await clearProviderCredential(currentConfig)
      setApiKeyDraft('')
      await updateAiConfig(updatedConfig)
    } finally {
      setApiKeySaving(false)
    }
  }

  // 添加新模型
  const addNewModel = async () => {
    if (!currentConfig) return
    
    const newModelId = v4()
    const newModel: ModelConfig = {
      id: newModelId,
      model: '',
      modelType: 'chat',
      temperature: 0.7,
      topP: 1.0,
      enableStream: true
    }
    
    const updatedConfig = {
      ...currentConfig,
      models: [...(currentConfig.models || []), newModel]
    }
    
    await updateAiConfig(updatedConfig)
    
    // 自动展开新创建的模型
    setExpandedModels(prev => [...prev, newModelId])
  }

  // 删除模型
  const deleteModel = async (modelId: string) => {
    if (!currentConfig) return
    
    const confirmed = await confirm('确定要删除这个模型吗？')
    if (!confirmed) return
    
    const updatedConfig = {
      ...currentConfig,
      models: (currentConfig.models || []).filter(m => m.id !== modelId)
    }
    
    await updateAiConfig(updatedConfig)
    
    // 从展开列表中移除被删除的模型
    setExpandedModels(prev => prev.filter(id => id !== modelId))
  }

  // 更新模型配置
  const updateModelConfig = async <K extends keyof ModelConfig>(modelId: string, field: K, value: ModelConfig[K]) => {
    if (!currentConfig) return
    
    const updatedModels = (currentConfig.models || []).map(model => 
      model.id === modelId ? { ...model, [field]: value } : model
    )
    
    const updatedConfig = {
      ...currentConfig,
      models: updatedModels
    }
    
    await updateAiConfig(updatedConfig)
  }

  // 更新AI配置到store
  const updateAiConfig = async (config: AiConfig) => {
    const updatedList = aiModelListRef.current.map(item =>
      item.key === config.key ? config : item
    )

    if (!updatedList.some(item => item.key === config.key)) return

    // Keep input state in sync with native IME composition. Waiting for the
    // async store round trip before updating React state resets the input to an
    // older composition value and duplicates partial Pinyin syllables.
    aiModelListRef.current = updatedList
    setAiModelList(updatedList)

    storeWriteQueueRef.current = storeWriteQueueRef.current.then(async () => {
      const store = await Store.load('store.json')
      await store.set('aiModelList', updatedList)
    })

    await storeWriteQueueRef.current
  }

  const addProviderFromTemplate = async (template: AiConfig) => {
    const templateKey = template.templateKey || template.key
    if (addingTemplateKey || configuredTemplateKeys.has(templateKey)) return

    setAddingTemplateKey(templateKey)
    try {
      const id = v4()
      const newProvider: AiConfig = {
        ...template,
        key: id,
        templateKey,
        templateSource: template.templateSource || 'builtin',
        modelType: 'chat',
      }
      const updatedList = [newProvider, ...aiModelListRef.current]
      const store = await Store.load('store.json')

      await store.set('aiModelList', updatedList)
      await store.save()
      aiModelListRef.current = updatedList
      setAiModelList(updatedList)
      setSelectedAiConfig(id)
      setActiveTab('connection')
    } finally {
      setAddingTemplateKey('')
    }
  }

  // 复制当前配置
  const copyConfig = async () => {
    if (!currentConfig) return

    const id = v4()
    const newConfig: AiConfig = {
      ...currentConfig,
      key: id,
      title: `${currentConfig.title || 'Copy'} (Copy)`,
      hasCredential: false,
      credentialRef: undefined,
      customHeaderRefs: undefined,
      customHeaderSecrets: undefined,
      // 复制models数组
      models: currentConfig.models?.map(model => ({
        ...model,
        id: v4() // 给每个模型生成新的ID
      })) || []
    }

    const store = await Store.load('store.json')
    const aiModelList = await store.get<AiConfig[]>('aiModelList') || []
    const updatedList = [...aiModelList, newConfig]
    
    await store.set('aiModelList', updatedList)
    setAiModelList(updatedList)
    setSelectedAiConfig(newConfig.key)
  }

  // 删除当前配置
  const deleteCurrentConfig = async () => {
    if (!currentConfig) return
    
    const confirmed = await confirm(t('deleteCustomModelConfirm'))
    if (!confirmed) return

    const store = await Store.load('store.json')
    await clearProviderCredential(currentConfig)
    await applyCustomHeaderPairs(currentConfig, [])
    const aiModelList = await store.get<AiConfig[]>('aiModelList') || []
    const updatedList = aiModelList.filter(item => item.key !== currentConfig.key)
    
    await store.set('aiModelList', updatedList)
    setAiModelList(updatedList)

    // 删除后选择下一个用户自定义模型
    const remainingUserModels = updatedList
    if (remainingUserModels.length > 0) {
      setSelectedAiConfig(remainingUserModels[0].key)
    } else {
      setSelectedAiConfig('')
    }
  }


  // 迁移旧配置到新格式
  const migrateOldConfig = (config: AiConfig): AiConfig => {
    // 如果已经有models数组，直接返回
    if (config.models && config.models.length > 0) {
      return config
    }
    
    // 如果有旧的model配置，迁移到models数组
    if (config.model) {
      const migratedModel: ModelConfig = {
        id: v4(),
        model: config.model,
        modelType: config.modelType || 'chat',
        temperature: config.temperature,
        topP: config.topP,
        voice: config.voice,
        enableStream: config.enableStream,
        maxTokens: config.maxTokens,
        tokenLimitParam: config.tokenLimitParam
      }
      
      return {
        ...config,
        models: [migratedModel]
      }
    }
    
    return config
  }

  // 当选中的配置改变时，更新headers
  useEffect(() => {
    const providerKey = currentConfig?.key ?? null
    if (loadedHeaderProviderRef.current === providerKey) return
    loadedHeaderProviderRef.current = providerKey

    if (currentConfig) {
      setHeaderPairs(parseHeadersToKeyValue(currentConfig))
      setApiKeyDraft('')
    } else {
      setHeaderPairs([])
      setApiKeyDraft('')
    }
  }, [currentConfig])

  useEffect(() => {
    async function init() {
      const store = await Store.load('store.json')
      let templates: AiConfig[] = []
      try {
        const cachedTemplates = await getCachedProviderTemplates()
        if (cachedTemplates.length > 0) {
          setProviderTemplates(cachedTemplates)
          setLoadingTemplates(false)
        }

        templates = await loadProviderTemplates(builtinProviderTemplates)
        setProviderTemplates(templates)
      } finally {
        setLoadingTemplates(false)
      }

      // 模板平台是默认平台：只补齐缺失项，不修改任何已有用户配置。
      // 再次读取 Store，避免模板加载期间用户新建的平台被旧快照覆盖。
      const storedAiModelList = await store.get<AiConfig[]>('aiModelList') || []
      const migratedList = storedAiModelList.map(migrateOldConfig)
      const existingPlatforms = migratedList
      const missingTemplates = templates.filter(template => {
        const templateKey = template.templateKey || template.key
        return !existingPlatforms.some(config => {
          if (config.templateSource === 'custom') return false
          if (config.templateKey === templateKey) return true
          return Boolean(config.baseURL && template.baseURL && config.baseURL === template.baseURL)
        })
      })
      const defaultPlatforms = missingTemplates.map(template => ({
        ...template,
        key: v4(),
        templateKey: template.templateKey || template.key,
        templateSource: template.templateSource || 'builtin' as const,
        modelType: 'chat' as const,
      }))
      const nextAiModelList = [...migratedList, ...defaultPlatforms]
      const hasChanges = defaultPlatforms.length > 0 || migratedList.some((config, index) => (
        JSON.stringify(config) !== JSON.stringify(storedAiModelList[index])
      ))

      if (hasChanges) {
        await store.set('aiModelList', nextAiModelList)
        await store.save()
      }
      aiModelListRef.current = nextAiModelList
      setAiModelList(nextAiModelList)

      const userModels = nextAiModelList
      
      // 如果已经有保存的选择，且该配置仍然存在，则使用它
      if (selectedAiConfig && userModels.find(model => model.key === selectedAiConfig)) {
        // 已经有保存的选择，不需要做任何事情
        return
      } else if (userModels.length > 0) {
        // 如果没有保存的选择或选择的配置不存在，选择第一个
        const firstUserModel = userModels[0]
        setSelectedAiConfig(firstUserModel.key)
      } else {
        // 如果没有用户自定义模型，清空选择
        setSelectedAiConfig('')
      }
    }
    init()
  }, [])

  return (
    <SettingType id="ai" icon={<BotMessageSquare />} title={t('title')} desc={t('desc')}>
      {userCustomModels.length === 0 && <DefaultModelsSection />}
      <div className="grid items-start gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
            <Card size="sm" className="lg:sticky lg:top-2">
              <CardHeader>
                <CardTitle>{t('providerListTitle')}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <div className="lg:hidden">
                  <Select value={selectedAiConfig} onValueChange={value => {
                    if (value.startsWith('template:')) {
                      const templateKey = value.slice('template:'.length)
                      const template = availableProviderTemplates.find(item => (item.templateKey || item.key) === templateKey)
                      if (template) void addProviderFromTemplate(template)
                    } else {
                      setSelectedAiConfig(value)
                      setActiveTab('connection')
                    }
                  }}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={t('selectConfig')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {sortedUserCustomModels.map(provider => (
                          <SelectItem value={provider.key} key={provider.key}>{provider.title}</SelectItem>
                        ))}
                        {availableProviderTemplates.map(template => (
                          <SelectItem value={`template:${template.templateKey || template.key}`} key={template.templateKey || template.key}>
                            {template.title}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>

                <div className="hidden max-h-[52vh] flex-col gap-3 overflow-y-auto pr-1 lg:flex">
                  <ItemGroup className="gap-2">
                    {sortedUserCustomModels.map(provider => {
                      const selected = provider.key === selectedAiConfig
                      const count = getConfiguredModelCount(provider)
                      const providerTemplate = provider.templateSource === 'custom'
                        ? null
                        : getProviderTemplateMatch(provider, providerTemplates)
                      return (
                        <Item key={provider.key} asChild variant={selected ? 'muted' : 'outline'} size="sm">
                          <button type="button" onClick={() => {
                            setSelectedAiConfig(provider.key)
                            setActiveTab('connection')
                          }}>
                            <ItemMedia variant="default">
                              <Avatar size="sm">
                                <AvatarImage src={providerTemplate?.icon || provider.icon} alt={provider.title} />
                                <AvatarFallback
                                  className={provider.templateSource === 'custom' ? 'text-base font-semibold' : undefined}
                                  style={getCustomPlatformAvatarStyle(provider)}
                                >
                                  {getPlatformAvatarFallback(provider)}
                                </AvatarFallback>
                              </Avatar>
                            </ItemMedia>
                            <ItemContent>
                              <ItemTitle>{provider.title}</ItemTitle>
                            </ItemContent>
                            {count > 0 ? <ItemActions><Badge variant="outline">{count}</Badge></ItemActions> : null}
                          </button>
                        </Item>
                      )
                    })}
                  </ItemGroup>

                  {loadingTemplates ? (
                    <div className="flex items-center gap-2 px-2 py-1 text-xs text-muted-foreground">
                      <LoaderCircle className="animate-spin" />{t('loadingProviderTemplates')}
                    </div>
                  ) : null}

                  {availableProviderTemplates.map(template => {
                    const templateKey = template.templateKey || template.key
                    return (
                      <Item key={templateKey} asChild variant="outline" size="sm">
                        <button
                          type="button"
                          disabled={Boolean(addingTemplateKey)}
                          onClick={() => void addProviderFromTemplate(template)}
                        >
                          <ItemMedia variant="default">
                            <Avatar size="sm">
                              <AvatarImage src={template.icon} alt={template.title} />
                              <AvatarFallback>{getPlatformAvatarFallback(template)}</AvatarFallback>
                            </Avatar>
                          </ItemMedia>
                          <ItemContent>
                            <ItemTitle>{template.title}</ItemTitle>
                          </ItemContent>
                          {addingTemplateKey === templateKey ? (
                            <ItemActions><LoaderCircle className="animate-spin" /></ItemActions>
                          ) : null}
                        </button>
                      </Item>
                    )
                  })}
                </div>

                <div className="border-t pt-3 [&>button]:w-full">
                  <CreateConfig
                    onConfigCreated={(configId) => setSelectedAiConfig(configId)}
                  />
                </div>
              </CardContent>
            </Card>

            {currentConfig ? (
              <div className="flex min-w-0 flex-col gap-4">
                <Card>
                  <CardHeader>
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar>
                        <AvatarImage src={currentProviderTemplate?.icon || currentConfig.icon} alt={currentConfig.title} />
                        <AvatarFallback
                          className={currentConfig.templateSource === 'custom' ? 'text-base font-semibold' : undefined}
                          style={getCustomPlatformAvatarStyle(currentConfig)}
                        >
                          {getPlatformAvatarFallback(currentConfig)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <CardTitle className="flex flex-wrap items-center gap-2">
                          {currentPlatformNameEditable ? (
                            <Input
                              aria-label={t('modelTitle')}
                              className="h-8 w-52 max-w-full font-semibold"
                              key={currentConfig.key}
                              defaultValue={currentConfig.title}
                              onChange={(event) => {
                                if (isTitleComposingRef.current) return
                                void updateAiConfig({ ...currentConfig, title: event.target.value })
                              }}
                              onCompositionStart={() => { isTitleComposingRef.current = true }}
                              onCompositionEnd={(event) => {
                                const input = event.currentTarget
                                window.setTimeout(() => {
                                  isTitleComposingRef.current = false
                                  void updateAiConfig({ ...currentConfig, title: input.value })
                                }, 0)
                              }}
                            />
                          ) : (
                            <span className="truncate">{currentConfig.title}</span>
                          )}
                          <Badge variant={providerConfigured ? 'secondary' : 'outline'}>
                            {providerConfigured ? t('providerReady') : t('providerIncomplete')}
                          </Badge>
                        </CardTitle>
                        <CardDescription className="truncate">{currentConfig.baseURL || t('endpointMissing')}</CardDescription>
                      </div>
                    </div>
                    <CardAction className="flex gap-2">
                      <Button variant="outline" size={mobile ? 'icon-sm' : 'sm'} aria-label={t('copyConfig')} onClick={copyConfig}>
                        <Copy data-icon={mobile ? undefined : 'inline-start'} />{mobile ? null : t('copyConfig')}
                      </Button>
                      <Button variant="outline" size="icon-sm" aria-label={t('deleteCustomModel')} onClick={deleteCurrentConfig}>
                        <Trash2 />
                      </Button>
                    </CardAction>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline"><Server />{t('modelCount', { count: configuredModelCount })}</Badge>
                      <Badge variant="outline"><Network />{currentConfig.proxyMode === 'direct' ? t('proxyModeDirect') : currentConfig.proxyMode === 'custom' ? t('proxyModeCustom') : t('proxyModeInherit')}</Badge>
                      {currentProviderTemplate ? <Badge variant="outline">{t('templateProvider')}</Badge> : <Badge variant="outline">{t('customProvider')}</Badge>}
                    </div>
                  </CardContent>
                </Card>

                <Tabs orientation="horizontal" value={activeTab} onValueChange={setActiveTab}>
                  <TabsList className="grid h-9 w-full grid-cols-2">
                    <TabsTrigger className="!justify-center" value="connection"><Settings2 data-icon="inline-start" />{t('connectionTab')}</TabsTrigger>
                    <TabsTrigger className="!justify-center" value="models"><BotMessageSquare data-icon="inline-start" />{t('modelsTab')}</TabsTrigger>
                  </TabsList>

                  <TabsContent value="connection">
                    <Card>
                      <CardHeader>
                        <CardTitle>{t('connectionTitle')}</CardTitle>
                        <CardDescription>{t('connectionDesc')}</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <FieldGroup>
                          <Field>
                            <FieldLabel htmlFor={`provider-url-${currentConfig.key}`}>{t('apiEndpoint')}</FieldLabel>
                            <Input
                              id={`provider-url-${currentConfig.key}`}
                              value={currentConfig.baseURL || ''}
                              placeholder="https://api.example.com/v1"
                              onChange={event => void updateAiConfig({ ...currentConfig, baseURL: event.target.value })}
                            />
                            <FieldDescription>{t('modelBaseUrlDesc')}</FieldDescription>
                          </Field>

                          <Field>
                            <FieldLabel htmlFor={`provider-key-${currentConfig.key}`}>API Key</FieldLabel>
                            <InputGroup>
                              <InputGroupAddon><KeyRound /></InputGroupAddon>
                              <InputGroupInput
                                id={`provider-key-${currentConfig.key}`}
                                value={apiKeyDraft}
                                type="password"
                                placeholder={t('apiKeyPlaceholder')}
                                autoComplete="new-password"
                                onChange={event => setApiKeyDraft(event.target.value)}
                                onBlur={() => void replaceProviderCredential()}
                              />
                              <InputGroupAddon align="inline-end">
                                <InputGroupButton
                                  size="xs"
                                  disabled={apiKeySaving || !apiKeyDraft}
                                  onClick={() => void replaceProviderCredential()}
                                >
                                  {currentConfig.hasCredential ? '替换' : '保存'}
                                </InputGroupButton>
                                {currentConfig.hasCredential ? (
                                  <InputGroupButton
                                    size="xs"
                                    disabled={apiKeySaving}
                                    onClick={() => void removeProviderCredential()}
                                  >
                                    {t('clear')}
                                  </InputGroupButton>
                                ) : null}
                              </InputGroupAddon>
                            </InputGroup>
                            {currentConfig.hasCredential ? (
                              <FieldDescription>{t('providerReady')}</FieldDescription>
                            ) : null}
                            {currentProviderTemplate?.apiKeyUrl ? (
                              <FieldDescription><OpenBroswer url={currentProviderTemplate.apiKeyUrl} title={t('apiKeyUrl')} /></FieldDescription>
                            ) : null}
                          </Field>

                          <Field data-invalid={proxyURLInvalid || undefined}>
                            <FieldLabel>{t('proxyModeTitle')}</FieldLabel>
                            <Select
                              value={currentConfig.proxyMode || 'inherit'}
                              onValueChange={(value: ProxyMode) => void updateAiConfig({ ...currentConfig, proxyMode: value })}
                            >
                              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectGroup>
                                  <SelectItem value="inherit">{t('proxyModeInherit')}</SelectItem>
                                  <SelectItem value="direct">{t('proxyModeDirect')}</SelectItem>
                                  <SelectItem value="custom">{t('proxyModeCustom')}</SelectItem>
                                </SelectGroup>
                              </SelectContent>
                            </Select>
                            {currentConfig.proxyMode === 'custom' ? (
                              <Input
                                id="ai-provider-proxy-url"
                                value={currentConfig.proxyURL || ''}
                                placeholder={t('proxyURLPlaceholder')}
                                aria-invalid={proxyURLInvalid}
                                aria-describedby={proxyURLInvalid ? 'ai-provider-proxy-url-error' : undefined}
                                onChange={event => void updateAiConfig({ ...currentConfig, proxyURL: event.target.value })}
                              />
                            ) : null}
                            {proxyURLInvalid ? <FieldError id="ai-provider-proxy-url-error">{t('proxyURLInvalid')}</FieldError> : null}
                            <FieldDescription>{t('proxyModeDesc')}</FieldDescription>
                          </Field>

                          {!currentProviderTemplate ? (
                            <Collapsible>
                              <Card size="sm">
                                <CardHeader>
                                  <CardTitle>{t('customHeaders')}</CardTitle>
                                  <CardDescription>{t('customHeadersDesc')}</CardDescription>
                                  <CardAction>
                                    <CollapsibleTrigger asChild>
                                      <Button variant="ghost" size="sm">{t('manageHeaders')}</Button>
                                    </CollapsibleTrigger>
                                  </CardAction>
                                </CardHeader>
                                <CollapsibleContent>
                                  <CardContent>
                                    <FieldGroup>
                                      {headerPairs.map((pair, index) => (
                                        <Field key={pair.id} orientation="horizontal">
                                          <Input
                                            aria-label={t('headerKey')}
                                            placeholder={t('headerKey')}
                                            value={pair.key}
                                            onChange={event => {
                                              const pairs = [...headerPairs]
                                              const key = event.target.value
                                              pairs[index] = { ...pairs[index], key, secret: isSecretHeaderName(key, pairs[index].secret) }
                                              setHeaderPairs(pairs)
                                            }}
                                            onBlur={() => void saveHeaderPairs(headerPairs)}
                                          />
                                          <Input
                                            aria-label={t('headerValue')}
                                            placeholder={t('headerValue')}
                                            value={pair.value}
                                            type={pair.secret ? 'password' : 'text'}
                                            autoComplete={pair.secret ? 'new-password' : undefined}
                                            onChange={event => {
                                              const pairs = [...headerPairs]
                                              pairs[index] = { ...pairs[index], value: event.target.value }
                                              setHeaderPairs(pairs)
                                            }}
                                            onBlur={() => void saveHeaderPairs(headerPairs)}
                                          />
                                          <Switch
                                            checked={pair.secret}
                                            aria-label="Secret"
                                            onCheckedChange={checked => {
                                              const pairs = [...headerPairs]
                                              pairs[index] = { ...pairs[index], secret: checked || isSecretHeaderName(pairs[index].key) }
                                              setHeaderPairs(pairs)
                                              void saveHeaderPairs(pairs)
                                            }}
                                          />
                                          <Button
                                            variant="outline"
                                            size="icon-sm"
                                            aria-label={t('removeHeader')}
                                            onClick={() => {
                                              const pairs = headerPairs.filter((_, pairIndex) => pairIndex !== index)
                                              setHeaderPairs(pairs)
                                              void saveHeaderPairs(pairs)
                                            }}
                                          ><X /></Button>
                                        </Field>
                                      ))}
                                      <Button
                                        variant="outline"
                                        onClick={() => setHeaderPairs(current => [...current, { key: '', value: '', id: v4(), secret: false }])}
                                      ><Plus data-icon="inline-start" />{t('addHeader')}</Button>
                                    </FieldGroup>
                                  </CardContent>
                                </CollapsibleContent>
                              </Card>
                            </Collapsible>
                          ) : null}
                        </FieldGroup>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="models">
                    <Card>
                      <CardHeader>
                        <CardTitle>{t('models')}</CardTitle>
                        <CardDescription>{t('modelsDesc')}</CardDescription>
                        <CardAction>
                          <Button size="sm" onClick={addNewModel}><Plus data-icon="inline-start" />{t('addModel')}</Button>
                        </CardAction>
                      </CardHeader>
                      <CardContent>
                        {(currentConfig.models || []).length > 0 ? (
                          <div className="flex flex-col gap-3">
                            {(currentConfig.models || []).map(modelConfig => (
                              <ModelCard
                                key={modelConfig.id}
                                modelConfig={modelConfig}
                                aiConfig={currentConfig}
                                mobile={mobile}
                                open={expandedModels.includes(modelConfig.id)}
                                onOpenChange={open => setExpandedModels(current => open
                                  ? current.includes(modelConfig.id) ? current : [...current, modelConfig.id]
                                  : current.filter(id => id !== modelConfig.id)
                                )}
                                onUpdate={updateModelConfig}
                                onDelete={deleteModel}
                              />
                            ))}
                          </div>
                        ) : (
                          <Empty className="border">
                            <EmptyHeader>
                              <EmptyMedia variant="icon"><BotMessageSquare /></EmptyMedia>
                              <EmptyTitle>{t('noModelsTitle')}</EmptyTitle>
                              <EmptyDescription>{t('noModelsDesc')}</EmptyDescription>
                            </EmptyHeader>
                            <EmptyContent>
                              <Button size="sm" onClick={addNewModel}><Plus data-icon="inline-start" />{t('addModel')}</Button>
                            </EmptyContent>
                          </Empty>
                        )}
                      </CardContent>
                    </Card>
                  </TabsContent>
                </Tabs>
              </div>
            ) : (
              <Empty className="border">
                <EmptyHeader>
                  <EmptyMedia variant="icon"><Server /></EmptyMedia>
                  <EmptyTitle>{t('selectProviderTitle')}</EmptyTitle>
                  <EmptyDescription>{t('selectProviderDesc')}</EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
      </div>
    </SettingType>
  )
}
