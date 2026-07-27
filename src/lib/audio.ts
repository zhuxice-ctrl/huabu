import useSettingStore from '@/stores/setting'
import { resolvePreferredSpeechEngine } from '@/lib/speech/runtime.ts'
import type { SpeechTask } from '@/lib/speech/types.ts'
import { NO_TRANSCRIPTION_MESSAGE } from '@/lib/speech/transcription-fallback.ts'
import { blobToBytes, invokeAiBinary, invokeAiMultipart, resolveAiRequestConfig } from '@/lib/ai/tauri-client'

/**
 * 使用浏览器原生语音合成API进行朗读
 */
export function speakWithSystemVoice(
  text: string, 
  speed: number = 1,
): void {
  if (!text.trim()) {
    throw new Error('文本内容为空')
  }

  // 检查浏览器是否支持语音合成
  if (!('speechSynthesis' in window)) {
    throw new Error('当前浏览器不支持语音合成功能')
  }

  // 停止当前的语音合成
  window.speechSynthesis.cancel()

  const utterance = new SpeechSynthesisUtterance(text)
  
  // 设置语音参数
  utterance.rate = Math.max(0.1, Math.min(10, speed)) // 限制速度范围
  utterance.volume = 1
  utterance.pitch = 1

  // 所有系统朗读都通过共享播放所有者更新状态。
  utterance.onstart = handleSystemSpeechStart
  utterance.onend = handleSystemSpeechEnd
  utterance.onerror = handleSystemSpeechError

  // 开始朗读
  window.speechSynthesis.speak(utterance)
}

/**
 * 停止系统语音合成
 */
export function stopSystemVoice(): void {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel()
  }
}

export interface AudioSpeechRequest {
  model: string
  input: string
  voice?: string
  speed?: number
}

export interface AudioSpeechResponse {
  audio: ArrayBuffer
}

export function resolveCurrentSpeechEngine(task: SpeechTask) {
  const { audioModel, sttModel, textToSpeechMode, speechToTextMode } = useSettingStore.getState()

  return resolvePreferredSpeechEngine(task, {
    audioModel,
    sttModel,
    textToSpeechMode,
    speechToTextMode,
  })
}

/**
 * 调用音频AI模型接口生成语音
 */
export async function fetchAudioSpeech(text: string, customVoice?: string, customSpeed?: number): Promise<ArrayBuffer> {
  const { aiModelList, audioModel } = useSettingStore.getState()
  
  if (!audioModel) {
    throw new Error('未配置音频模型')
  }

  // 查找音频模型配置
  let audioConfig = null
  
  // 在新的数据结构中，需要找到包含指定模型ID的配置
  for (const config of aiModelList) {
    // 检查新的 models 数组结构
    if (config.models && config.models.length > 0) {
      const targetModel = config.models.find(model => 
        model.id === audioModel && model.modelType === 'tts'
      )
      if (targetModel) {
        // 返回合并了模型配置的 AiConfig
        audioConfig = {
          ...config,
          model: targetModel.model,
          modelType: targetModel.modelType,
          temperature: targetModel.temperature,
          topP: targetModel.topP,
          voice: targetModel.voice,
          enableStream: targetModel.enableStream
        }
        break
      }
    } else {
      // 向后兼容：处理旧的单模型结构
      if (config.key === audioModel && config.modelType === 'tts') {
        audioConfig = config
        break
      }
    }
  }
  
  if (!audioConfig) {
    throw new Error('未找到音频模型配置')
  }

  if (!audioConfig.baseURL || !audioConfig.apiKey) {
    throw new Error('音频模型配置不完整')
  }

  // 使用自定义voice或配置的voice，默认为alloy
  const voice = customVoice || audioConfig.voice || 'alloy'
  // 使用自定义speed或配置的speed，默认为1
  const speed = customSpeed !== undefined ? customSpeed : (audioConfig.speed !== undefined ? audioConfig.speed : 1)

  const requestBody: AudioSpeechRequest = {
    model: audioConfig.model || 'tts-1',
    input: text,
    voice: voice,
    speed: speed
  }

  try {
    return await invokeAiBinary({
      config: await resolveAiRequestConfig(audioConfig),
      path: '/audio/speech',
      method: 'POST',
      body: requestBody,
    })
  } catch (error) {
    console.error('音频生成错误:', error)
    throw error
  }
}

// 手动朗读和麦克风请求的自动朗读共享一个播放所有者。
let currentAudioController: AudioController | null = null
let audioPlaybackEpoch = 0
let currentSystemPlaybackEpoch: number | null = null
let currentSystemPlaybackOwner: string | null = null

export type AudioPlaybackPhase = 'idle' | 'loading' | 'playing' | 'failed'

export interface AudioPlaybackSnapshot {
  ownerId: string | null
  phase: AudioPlaybackPhase
  error: string | null
}

const IDLE_AUDIO_PLAYBACK: AudioPlaybackSnapshot = Object.freeze({
  ownerId: null,
  phase: 'idle',
  error: null,
})
let audioPlaybackSnapshot: AudioPlaybackSnapshot = IDLE_AUDIO_PLAYBACK
const audioPlaybackListeners = new Set<() => void>()

function publishAudioPlayback(snapshot: AudioPlaybackSnapshot) {
  audioPlaybackSnapshot = Object.freeze(snapshot)
  for (const listener of audioPlaybackListeners) listener()
}

function updateOwnedAudioPlayback(
  epoch: number,
  ownerId: string,
  phase: AudioPlaybackPhase,
  error: string | null = null,
) {
  if (epoch !== audioPlaybackEpoch || audioPlaybackSnapshot.ownerId !== ownerId) return
  publishAudioPlayback({ ownerId, phase, error })
}

function beginAudioPlayback(ownerId: string) {
  stopCurrentAudio()
  const epoch = audioPlaybackEpoch
  publishAudioPlayback({ ownerId, phase: 'loading', error: null })
  return epoch
}

function handleSystemSpeechStart() {
  if (currentSystemPlaybackEpoch === null || !currentSystemPlaybackOwner) return
  updateOwnedAudioPlayback(currentSystemPlaybackEpoch, currentSystemPlaybackOwner, 'playing')
}

function handleSystemSpeechEnd() {
  if (currentSystemPlaybackEpoch === null || !currentSystemPlaybackOwner) return
  updateOwnedAudioPlayback(currentSystemPlaybackEpoch, currentSystemPlaybackOwner, 'idle')
  currentSystemPlaybackEpoch = null
  currentSystemPlaybackOwner = null
}

function handleSystemSpeechError(event: SpeechSynthesisErrorEvent) {
  if (currentSystemPlaybackEpoch === null || !currentSystemPlaybackOwner) return
  updateOwnedAudioPlayback(
    currentSystemPlaybackEpoch,
    currentSystemPlaybackOwner,
    'failed',
    event.error || 'system-speech-error',
  )
  currentSystemPlaybackEpoch = null
  currentSystemPlaybackOwner = null
}

export function subscribeAudioPlayback(listener: () => void) {
  audioPlaybackListeners.add(listener)
  return () => {
    audioPlaybackListeners.delete(listener)
  }
}

export function getAudioPlaybackSnapshot() {
  return audioPlaybackSnapshot
}

export function getAudioPlaybackServerSnapshot() {
  return IDLE_AUDIO_PLAYBACK
}

class AudioController {
  private audioContext: AudioContext | null = null
  private source: AudioBufferSourceNode | null = null
  private isPlaying = false

  constructor(
    private readonly playbackEpoch: number,
    private readonly ownerId: string,
  ) {}

  async playAudioBuffer(audioBuffer: ArrayBuffer): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.stop()
        this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()

        this.audioContext.decodeAudioData(
          audioBuffer.slice(0),
          (decodedData) => {
            if (!this.audioContext) {
              reject(new Error('音频上下文已被销毁'))
              return
            }

            this.source = this.audioContext.createBufferSource()
            this.source.buffer = decodedData
            this.source.connect(this.audioContext.destination)
            this.source.onended = () => {
              this.cleanup()
              updateOwnedAudioPlayback(this.playbackEpoch, this.ownerId, 'idle')
              resolve()
            }

            this.isPlaying = true
            updateOwnedAudioPlayback(this.playbackEpoch, this.ownerId, 'playing')
            this.source.start(0)
          },
          (error) => {
            this.cleanup()
            reject(new Error(`音频解码失败: ${error}`))
          },
        )
      } catch (error) {
        this.cleanup()
        reject(new Error(`音频播放失败: ${error}`))
      }
    })
  }

  stop(): void {
    if (this.source && this.isPlaying) {
      try {
        this.source.stop()
      } catch {
        // 已经停止的音源无需再次处理。
      }
    }
    this.cleanup()
  }

  private cleanup(): void {
    this.isPlaying = false
    this.source = null
    if (this.audioContext) {
      void this.audioContext.close()
      this.audioContext = null
    }
  }
}

export function playAudioBuffer(audioBuffer: ArrayBuffer): Promise<void> {
  const ownerId = 'audio-buffer'
  const epoch = beginAudioPlayback(ownerId)
  const controller = new AudioController(epoch, ownerId)
  currentAudioController = controller
  return controller.playAudioBuffer(audioBuffer)
}

export async function textToSpeechAndPlay(
  text: string,
  customVoice?: string,
  customSpeed?: number,
  ownerId = 'manual-read-aloud',
): Promise<void> {
  if (!text.trim()) throw new Error('文本内容为空')

  const playbackEpoch = beginAudioPlayback(ownerId)

  try {
    const resolution = resolveCurrentSpeechEngine('tts')
    if (!resolution.available) {
      throw new Error('当前朗读模式不可用，请检查本地语音支持或模型配置')
    }

    if (resolution.engine === 'local') {
      currentSystemPlaybackEpoch = playbackEpoch
      currentSystemPlaybackOwner = ownerId
      speakWithSystemVoice(text, customSpeed ?? 1)
      return
    }

    const audioBuffer = await fetchAudioSpeech(text, customVoice, customSpeed)
    if (playbackEpoch !== audioPlaybackEpoch || audioPlaybackSnapshot.ownerId !== ownerId) return

    currentAudioController = new AudioController(playbackEpoch, ownerId)
    await currentAudioController.playAudioBuffer(audioBuffer)
  } catch (error) {
    console.error('朗读失败:', error)
    updateOwnedAudioPlayback(
      playbackEpoch,
      ownerId,
      'failed',
      error instanceof Error ? error.message : String(error),
    )
    throw error
  }
}

export function stopCurrentAudio(): void {
  audioPlaybackEpoch += 1
  if (currentAudioController) {
    currentAudioController.stop()
    currentAudioController = null
  }
  currentSystemPlaybackEpoch = null
  currentSystemPlaybackOwner = null
  stopSystemVoice()
  publishAudioPlayback(IDLE_AUDIO_PLAYBACK)
}

export function getCurrentAudioPlayingState(): boolean {
  return audioPlaybackSnapshot.phase === 'playing'
}

/**
 * 语音转文本请求接口
 */
export interface AudioTranscriptionRequest {
  file: Blob
  model: string
}

/**
 * 语音转文本响应接口
 */
export interface AudioTranscriptionResponse {
  text: string
}

export { NO_TRANSCRIPTION_MESSAGE }

export async function transcribeRecording(audioBlob: Blob): Promise<string> {
  const { sttModel } = useSettingStore.getState()

  if (!sttModel) {
    return ''
  }

  return fetchAudioTranscription(audioBlob)
}

function getAudioFileName(audioBlob: Blob): string {
  const mimeType = audioBlob.type.toLowerCase()

  if (mimeType.includes('wav')) return 'audio.wav'
  if (mimeType.includes('mpeg') || mimeType.includes('mp3')) return 'audio.mp3'
  if (mimeType.includes('mp4') || mimeType.includes('m4a')) return 'audio.mp4'
  if (mimeType.includes('ogg')) return 'audio.ogg'
  if (mimeType.includes('flac')) return 'audio.flac'
  if (mimeType.includes('aac')) return 'audio.aac'

  return 'audio.webm'
}

/**
 * 调用STT模型将音频转换为文本
 */
export async function fetchAudioTranscription(audioBlob: Blob): Promise<string> {
  const { aiModelList, sttModel } = useSettingStore.getState()
  
  if (!sttModel) {
    throw new Error('未配置语音识别模型')
  }

  // 查找STT模型配置
  let sttConfig = null
  
  // 在新的数据结构中，需要找到包含指定模型ID的配置
  for (const config of aiModelList) {
    // 检查新的 models 数组结构
    if (config.models && config.models.length > 0) {
      const targetModel = config.models.find(model => 
        model.modelType === 'stt' && (model.id === sttModel || `${config.key}-${model.id}` === sttModel)
      )
      if (targetModel) {
        // 返回合并了模型配置的 AiConfig
        sttConfig = {
          ...config,
          model: targetModel.model,
          modelType: targetModel.modelType
        }
        break
      }
    } else {
      // 向后兼容：处理旧的单模型结构
      if (config.key === sttModel && config.modelType === 'stt') {
        sttConfig = config
        break
      }
    }
  }
  
  if (!sttConfig) {
    throw new Error('未找到语音识别模型配置')
  }

  if (!sttConfig.baseURL || !sttConfig.apiKey) {
    throw new Error('语音识别模型配置不完整')
  }

  try {
    const result = await invokeAiMultipart<AudioTranscriptionResponse>({
      config: await resolveAiRequestConfig(sttConfig),
      path: '/audio/transcriptions',
      fileFieldName: 'file',
      fields: {
        model: sttConfig.model || 'FunAudioLLM/SenseVoiceSmall'
      },
      file: {
        bytes: await blobToBytes(audioBlob),
        fileName: getAudioFileName(audioBlob),
        contentType: audioBlob.type || 'audio/webm',
      }
    })
    return result.text
  } catch (error) {
    console.error('语音识别错误:', error)
    throw error
  }
}
