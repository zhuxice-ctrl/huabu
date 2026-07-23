import type { AiConfig } from '@/app/core/setting/config'

export async function loadNoteGenDefaultConfig(builtinConfig: AiConfig): Promise<AiConfig> {
  return builtinConfig
}

export function applyNoteGenDefaultConfig(aiModelList: AiConfig[], noteGenConfig: AiConfig): AiConfig[] {
  const hasNoteGenConfig = aiModelList.some((config) => config.key === noteGenConfig.key)

  if (!hasNoteGenConfig) {
    return [...aiModelList, noteGenConfig]
  }

  return aiModelList.map((config) => {
    if (config.key !== noteGenConfig.key) {
      return config
    }

    return {
      ...config,
      ...noteGenConfig,
      models: noteGenConfig.models,
    }
  })
}
