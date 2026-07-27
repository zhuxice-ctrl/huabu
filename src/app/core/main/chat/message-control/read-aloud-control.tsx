import { TooltipButton } from "@/components/tooltip-button"
import { Chat } from "@/db/chats"
import { Volume2, VolumeX, Loader2 } from "lucide-react"
import { useTranslations } from "next-intl"
import { useSyncExternalStore } from "react"
import {
  getAudioPlaybackServerSnapshot,
  getAudioPlaybackSnapshot,
  subscribeAudioPlayback,
  textToSpeechAndPlay,
  stopCurrentAudio,
} from "@/lib/audio"
import useSettingStore from "@/stores/setting"

interface ReadAloudControlProps {
  chat: Chat
  translatedContent?: string
}

export function ReadAloudControl({ chat, translatedContent }: ReadAloudControlProps) {
  const t = useTranslations()
  const ownerId = `manual:${chat.id}`
  const playback = useSyncExternalStore(
    subscribeAudioPlayback,
    getAudioPlaybackSnapshot,
    getAudioPlaybackServerSnapshot,
  )
  const ownsPlayback = playback.ownerId === ownerId
  const isPlaying = ownsPlayback && playback.phase === 'playing'
  const isLoading = ownsPlayback && playback.phase === 'loading'
  
  // 处理朗读/停止
  async function handleTextToSpeech() {
    // 如果正在播放，则停止播放
    if (isPlaying || isLoading) {
      stopCurrentAudio()
      return
    }
    
    // 如果正在加载或没有内容，则返回
    if (!chat.content || isLoading) return
    
    try {
      // 使用翻译后的内容或原始内容
      let textToRead = translatedContent || chat.content
      
      // 清理多余的空白字符
      textToRead = textToRead.trim()
      
      if (!textToRead) {
        console.warn('朗读内容为空')
        return
      }
      
      // 获取当前音频模型的speed配置
      const { aiModelList, audioModel } = useSettingStore.getState()
      const audioConfig = aiModelList.find(config => config.key === audioModel)
      const speed = audioConfig?.speed
      
      await textToSpeechAndPlay(textToRead, undefined, speed, ownerId)
    } catch (error) {
      console.error('朗读失败:', error)
    }
  }

  if (chat.type !== 'chat') {
    return null
  }

  return (
    <>
      <TooltipButton
        icon={
          isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : isPlaying ? (
            <VolumeX className="h-4 w-4" />
          ) : (
            <Volume2 className="h-4 w-4" />
          )
        }
        tooltipText={
          isLoading ? t('record.chat.messageControl.loading') : 
          isPlaying ? t('record.chat.messageControl.stop') : 
          t('record.chat.messageControl.readAloud')
        }
        onClick={handleTextToSpeech}
        variant="ghost"
        size="sm"
      />
    </>
  )
}
