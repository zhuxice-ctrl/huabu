import assert from 'node:assert/strict'
import test from 'node:test'

const moduleUrl = new URL('../../src/lib/chat/voice-session.ts', import.meta.url)

test('keyboard prompts and streaming updates never schedule automatic speech', async () => {
  const {
    completeVoiceSession,
    createVoiceSession,
    updateVoiceSessionFromStream,
  } = await import(moduleUrl.href)
  const keyboard = createVoiceSession({
    id: 'keyboard-1',
    origin: 'keyboard',
    sourceKey: 'conversation-1:canvas-1',
  })

  assert.equal(updateVoiceSessionFromStream(keyboard, 'partial answer').playback, null)
  assert.equal(completeVoiceSession(keyboard, {
    completionState: 'complete',
    content: 'final answer',
  }).playback, null)
})

test('one microphone request can claim one saved final answer exactly once', async () => {
  const { completeVoiceSession, createVoiceSession } = await import(moduleUrl.href)
  const microphone = createVoiceSession({
    id: 'microphone-1',
    origin: 'microphone',
    sourceKey: 'conversation-1:canvas-1',
  })

  const first = completeVoiceSession(microphone, {
    completionState: 'complete',
    content: '  final answer  ',
  })
  assert.deepEqual(first.playback, {
    ownerId: 'voice:microphone-1',
    text: 'final answer',
  })

  const repeated = completeVoiceSession(first.session, {
    completionState: 'complete',
    content: 'final answer',
  })
  assert.equal(repeated.playback, null)
  assert.equal(repeated.visibleText, 'final answer')
})

test('failed and interrupted generations keep visible text without speaking', async () => {
  const { completeVoiceSession, createVoiceSession } = await import(moduleUrl.href)
  const session = createVoiceSession({
    id: 'microphone-2',
    origin: 'microphone',
    sourceKey: 'conversation-1:canvas-1',
  })

  for (const completionState of ['failed', 'interrupted']) {
    const result = completeVoiceSession(session, {
      completionState,
      content: 'visible fallback text',
    })
    assert.equal(result.playback, null)
    assert.equal(result.visibleText, 'visible fallback text')
  }
})

test('all required ownership changes stop active speech', async () => {
  const { shouldStopVoicePlayback } = await import(moduleUrl.href)
  for (const event of ['speech-start', 'context-change', 'hud-collapse', 'playback-start']) {
    assert.equal(shouldStopVoicePlayback(event), true, event)
  }
  assert.equal(shouldStopVoicePlayback('hud-expand'), false)
  assert.equal(shouldStopVoicePlayback('stream-update'), false)
})

test('steering closes as soon as final persistence begins', async () => {
  const { canAcceptVoiceSteering } = await import(moduleUrl.href)
  assert.equal(canAcceptVoiceSteering(true, false), true)
  assert.equal(canAcceptVoiceSteering(true, true), false)
  assert.equal(canAcceptVoiceSteering(false, false), false)
})

test('AI breath state is explicit and prioritizes listening and confirmation', async () => {
  const { resolveAiBreathState } = await import(moduleUrl.href)
  assert.equal(resolveAiBreathState({ isRecognizing: true }), 'listening')
  assert.equal(resolveAiBreathState({ loading: true, status: 'waiting_approval' }), 'awaiting-confirmation')
  assert.equal(resolveAiBreathState({ loading: true, status: 'preparing_context' }), 'retrieving')
  assert.equal(resolveAiBreathState({ loading: true, status: 'calling_tool', activity: 'locating' }), 'locating')
  assert.equal(resolveAiBreathState({ loading: true, status: 'applying_change', activity: 'editing' }), 'editing')
  assert.equal(resolveAiBreathState({ loading: false, status: 'completed' }), 'complete')
  assert.equal(resolveAiBreathState({ loading: false, status: 'failed' }), 'failed')
})
