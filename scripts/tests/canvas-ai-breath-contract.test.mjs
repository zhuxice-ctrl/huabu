import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../../', import.meta.url)

test('speech recognition fills the composer and freezes microphone origin only on send', async () => {
  const input = await readFile(new URL('src/app/core/main/chat/chat-input.tsx', root), 'utf8')
  assert.match(input, /useSpeechRecognitionStore/)
  assert.match(input, /PromptOrigin/)
  assert.match(input, /startRecognition/)
  assert.match(input, /stopRecognition/)
  assert.match(input, /applyTypedText\(recognizedText\)/)
  assert.match(input, /promptOrigin=\{promptOriginRef\.current\}/)
  assert.doesNotMatch(input, /setPromptOrigin/)
  assert.doesNotMatch(input, /stopRecognition[\s\S]{0,400}sendChat\(\)/)
})

test('automatic speech is claimed only after the final answer has been persisted', async () => {
  const [send, handler] = await Promise.all([
    readFile(new URL('src/app/core/main/chat/chat-send.tsx', root), 'utf8'),
    readFile(new URL('src/lib/agent/agent-handler.ts', root), 'utf8'),
  ])
  assert.match(send, /promptOrigin: PromptOrigin/)
  assert.match(send, /createVoiceSession/)
  assert.match(send, /completeVoiceSession/)
  assert.match(send, /textToSpeechAndPlay/)
  const finalRenderStart = send.indexOf('onFinalAnswerRender:')
  const completionStart = send.indexOf('onComplete:')
  const finalRenderBlock = send.slice(finalRenderStart, completionStart)
  assert.doesNotMatch(finalRenderBlock, /textToSpeechAndPlay|completeVoiceSession/)
  const saveIndex = send.indexOf('await saveChat({', completionStart)
  const claimIndex = send.indexOf('completeVoiceSession(', saveIndex)
  assert.ok(saveIndex >= 0 && claimIndex > saveIndex)
  assert.match(send, /const completionVoiceSession = activeVoiceSessionRef\.current/)
  assert.ok(send.indexOf('completionVoiceSession', completionStart) < saveIndex)
  assert.match(handler, /await this\.notifyComplete\(result\.content/)
  assert.match(handler, /private async notifyComplete/)
  assert.match(handler, /Agent completion callback failed/)
  assert.match(handler, /await this\.notifyError\(errorMessage\)/)
  assert.match(send, /finalizingRunRef\.current = true/)
  assert.match(send, /canAcceptVoiceSteering\(activeRunRef\.current, finalizingRunRef\.current\)/)
  assert.match(send, /let finalAnswerPersisted = false/)
  assert.match(send, /if \(finalAnswerPersisted && completionVoiceSession\)/)
  assert.match(send, /keeping visible text/)
})

test('manual and automatic speech share one observable playback owner', async () => {
  const [audio, readAloud] = await Promise.all([
    readFile(new URL('src/lib/audio.ts', root), 'utf8'),
    readFile(new URL('src/app/core/main/chat/message-control/read-aloud-control.tsx', root), 'utf8'),
  ])
  assert.match(audio, /AudioPlaybackSnapshot/)
  assert.match(audio, /subscribeAudioPlayback/)
  assert.match(audio, /ownerId/)
  assert.match(audio, /systemSpeechOwnership = new WeakMap/)
  assert.match(audio, /getSystemSpeechOwnership\(event\)/)
  assert.doesNotMatch(audio, /currentSystemPlaybackEpoch|currentSystemPlaybackOwner/)
  assert.match(audio, /stopCurrentAudio\(\)/)
  assert.match(readAloud, /useSyncExternalStore/)
  assert.match(readAloud, /stopCurrentAudio/)
  assert.doesNotMatch(readAloud, /useState/)
})

test('HUD context changes and collapse use the shared stop path', async () => {
  const [hud, input, chatStore] = await Promise.all([
    readFile(new URL('src/app/core/main/chat/canvas-chat-hud.tsx', root), 'utf8'),
    readFile(new URL('src/app/core/main/chat/chat-input.tsx', root), 'utf8'),
    readFile(new URL('src/stores/chat.ts', root), 'utf8'),
  ])
  assert.match(hud, /stopCurrentAudio/)
  assert.match(hud, /conversationKey/)
  assert.match(hud, /previousConversationKeyRef/)
  assert.match(hud, /previousExpandedRef/)
  assert.match(input, /saveChatHudDraft[\s\S]{0,160}resetSpeechRecognition\(\)/)
  assert.match(chatStore, /async function switchConversationNow[\s\S]{0,120}stopCurrentAudio\(\)/)
  assert.match(chatStore, /function resetConversationRuntime[\s\S]{0,120}stopCurrentAudio\(\)/)
})

test('programmatic composer replacements reset microphone origin to keyboard', async () => {
  const input = await readFile(new URL('src/app/core/main/chat/chat-input.tsx', root), 'utf8')
  for (const anchor of [
    "setText(tempInput)",
    "setText(inputHistory[newIndex])",
    "setText(placeholder.replace('[Tab]', ''))",
    "setText(event as string)",
    "setText(prompt)",
  ]) {
    const index = input.indexOf(anchor)
    assert.ok(index > 0, anchor)
    assert.match(input.slice(Math.max(0, index - 100), index), /promptOriginRef\.current = 'keyboard'/)
  }
  const onboardingIndex = input.indexOf('onboardingAgentPromptArmedRef.current = true')
  assert.ok(onboardingIndex > 0)
  assert.match(input.slice(onboardingIndex, onboardingIndex + 160), /promptOriginRef\.current = 'keyboard'/)
  assert.match(input, /tooltipText=\{isRecognizing \? t\('recording\.cancel'\) : t\('recording\.title'\)\}/)
})

test('the dock breath indicator animates only transform, opacity and blur', async () => {
  const breath = await readFile(new URL('src/app/core/main/chat/canvas-ai-breath.tsx', root), 'utf8')
  assert.match(breath, /AiBreathState/)
  assert.match(breath, /data-ai-breath-state/)
  assert.match(breath, /transform/)
  assert.match(breath, /opacity/)
  assert.match(breath, /blur/)
  assert.match(breath, /motion-reduce:/)
  assert.doesNotMatch(breath, /transition-\[(?:width|height|top|left)/)
})
