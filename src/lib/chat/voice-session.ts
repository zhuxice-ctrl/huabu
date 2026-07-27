export type PromptOrigin = 'keyboard' | 'microphone'

export type AiBreathState =
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'retrieving'
  | 'locating'
  | 'managing'
  | 'editing'
  | 'awaiting-confirmation'
  | 'complete'
  | 'failed'

export type VoicePlaybackStopEvent =
  | 'speech-start'
  | 'context-change'
  | 'hud-collapse'
  | 'playback-start'
  | 'hud-expand'
  | 'stream-update'

export interface VoiceSession {
  id: string
  origin: PromptOrigin
  sourceKey: string
  finalAnswerClaimed: boolean
}

export interface VoicePlaybackPlan {
  ownerId: string
  text: string
}

export interface VoiceSessionResult {
  session: VoiceSession
  playback: VoicePlaybackPlan | null
  visibleText: string
}

export function createVoiceSession(input: {
  id: string
  origin: PromptOrigin
  sourceKey: string
}): VoiceSession {
  return Object.freeze({
    id: input.id,
    origin: input.origin,
    sourceKey: input.sourceKey,
    finalAnswerClaimed: false,
  })
}

export function updateVoiceSessionFromStream(
  session: VoiceSession,
  content: string,
): VoiceSessionResult {
  return {
    session,
    playback: null,
    visibleText: content,
  }
}

export function completeVoiceSession(
  session: VoiceSession,
  input: {
    completionState: 'complete' | 'failed' | 'interrupted'
    content: string
  },
): VoiceSessionResult {
  const visibleText = input.content.trim()
  const canClaim = input.completionState === 'complete'
    && session.origin === 'microphone'
    && !session.finalAnswerClaimed
    && visibleText.length > 0

  if (!canClaim) {
    return { session, playback: null, visibleText }
  }

  const completedSession = Object.freeze({
    ...session,
    finalAnswerClaimed: true,
  })

  return {
    session: completedSession,
    playback: {
      ownerId: `voice:${session.id}`,
      text: visibleText,
    },
    visibleText,
  }
}

export function shouldStopVoicePlayback(event: VoicePlaybackStopEvent) {
  return event === 'speech-start'
    || event === 'context-change'
    || event === 'hud-collapse'
    || event === 'playback-start'
}

export function canAcceptVoiceSteering(activeRun: boolean, finalizingRun: boolean) {
  return activeRun && !finalizingRun
}

type AgentBreathStatus =
  | 'idle'
  | 'preparing_context'
  | 'thinking'
  | 'calling_tool'
  | 'waiting_approval'
  | 'applying_change'
  | 'recovering'
  | 'steering'
  | 'completed'
  | 'stopped'
  | 'failed'

export function resolveAiBreathState(input: {
  isRecognizing?: boolean
  loading?: boolean
  status?: AgentBreathStatus
  hasPendingConfirmation?: boolean
  activity?: 'retrieving' | 'locating' | 'managing' | 'editing'
}): AiBreathState {
  if (input.isRecognizing) return 'listening'
  if (input.hasPendingConfirmation || input.status === 'waiting_approval') {
    return 'awaiting-confirmation'
  }
  if (input.status === 'failed') return 'failed'
  if (!input.loading && input.status === 'completed') return 'complete'
  if (!input.loading) return 'idle'
  if (input.activity) return input.activity
  if (input.status === 'preparing_context') return 'retrieving'
  if (input.status === 'applying_change') return 'editing'
  return 'thinking'
}
