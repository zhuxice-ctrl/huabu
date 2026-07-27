import { create } from 'zustand'

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList
  resultIndex: number
}

interface SpeechRecognitionResultList {
  length: number
  item(index: number): SpeechRecognitionResult
  [index: number]: SpeechRecognitionResult
}

interface SpeechRecognitionResult {
  isFinal: boolean
  length: number
  item(index: number): SpeechRecognitionAlternative
  [index: number]: SpeechRecognitionAlternative
}

interface SpeechRecognitionAlternative {
  transcript: string
  confidence: number
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean
  interimResults: boolean
  lang: string
  maxAlternatives: number
  start(): void
  stop(): void
  abort(): void
  onerror: ((event: { error?: string }) => void) | null
  onresult: ((event: SpeechRecognitionEvent) => void) | null
  onend: (() => void) | null
  onstart: (() => void) | null
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition
    webkitSpeechRecognition: new () => SpeechRecognition
  }
}

interface SpeechRecognitionState {
  isRecognizing: boolean
  transcript: string
  interimTranscript: string
  lastError: string | null
  recognition: SpeechRecognition | null
}

export function composeSpeechRecognitionText(transcript: string, interimTranscript: string) {
  return `${transcript}${interimTranscript}`.trim()
}

const useSpeechRecognitionStore = create<SpeechRecognitionState>(() => ({
  isRecognizing: false,
  transcript: '',
  interimTranscript: '',
  lastError: null,
  recognition: null,
}))

export function isSpeechRecognitionSupported() {
  return typeof window !== 'undefined'
    && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)
}

export async function startRecognition(language = 'zh-CN') {
  if (!isSpeechRecognitionSupported()) {
    throw new Error('当前浏览器不支持语音识别功能，请使用 Chrome、Edge 或 Safari')
  }

  const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition
  const recognition = new SpeechRecognitionAPI()
  recognition.continuous = true
  recognition.interimResults = true
  recognition.lang = language
  recognition.maxAlternatives = 1
  let startupPending = true

  recognition.onresult = (event: SpeechRecognitionEvent) => {
    if (useSpeechRecognitionStore.getState().recognition !== recognition) return
    let interimTranscript = ''
    let finalTranscript = ''

    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index]
      const recognizedText = result[0].transcript
      if (result.isFinal) finalTranscript += recognizedText
      else interimTranscript += recognizedText
    }

    const previousTranscript = useSpeechRecognitionStore.getState().transcript
    useSpeechRecognitionStore.setState({
      transcript: previousTranscript + finalTranscript,
      interimTranscript,
    })
  }

  recognition.onend = () => {
    if (useSpeechRecognitionStore.getState().recognition === recognition) {
      useSpeechRecognitionStore.setState({ recognition: null, isRecognizing: false })
    }
  }
  recognition.onstart = () => {
    startupPending = false
  }
  recognition.onerror = (event) => {
    console.error('语音识别错误:', event.error)
    if (useSpeechRecognitionStore.getState().recognition === recognition) {
      useSpeechRecognitionStore.setState({
        recognition: null,
        isRecognizing: false,
        lastError: event.error || (startupPending
          ? 'speech-recognition-start-error'
          : 'speech-recognition-error'),
      })
    }
  }

  useSpeechRecognitionStore.setState({
    recognition,
    isRecognizing: true,
    transcript: '',
    interimTranscript: '',
    lastError: null,
  })

  try {
    recognition.start()
  } catch (error) {
    useSpeechRecognitionStore.setState({ recognition: null, isRecognizing: false })
    throw error
  }
}

export async function stopRecognition() {
  const state = useSpeechRecognitionStore.getState()
  const recognition = state.recognition
  if (!recognition) {
    return composeSpeechRecognitionText(state.transcript, state.interimTranscript)
  }

  const recognizedText = composeSpeechRecognitionText(
    state.transcript,
    state.interimTranscript,
  )
  try {
    recognition.stop()
  } catch {
    useSpeechRecognitionStore.setState({ recognition: null, isRecognizing: false })
  }
  return recognizedText
}

export function resetSpeechRecognition() {
  const recognition = useSpeechRecognitionStore.getState().recognition
  useSpeechRecognitionStore.setState({
    isRecognizing: false,
    transcript: '',
    interimTranscript: '',
    recognition: null,
  })
  recognition?.abort()
}

export default useSpeechRecognitionStore
