import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const moduleUrl = new URL('../../src/lib/chat/generation-transaction.ts', import.meta.url)

function deferred() {
  let resolve
  let reject
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function activeGeneration(overrides = {}) {
  const closed = deferred()
  return {
    generation: {
      conversationId: 1,
      assistantChatId: 10,
      abort: async () => {},
      closed: closed.promise,
      ...overrides,
    },
    closed,
  }
}

test('switch waits for abort, close, interrupted persistence, and clear in order', async () => {
  const { createGenerationTransactionCoordinator } = await import(moduleUrl.href)
  const events = []
  const { generation, closed } = activeGeneration({
    abort: async () => events.push('abort'),
  })
  let current = generation
  const coordinator = createGenerationTransactionCoordinator({
    getActive: () => current,
    persistInterrupted: async active => events.push(`persist:${active.assistantChatId}`),
    clearActive: active => {
      events.push(`clear:${active.assistantChatId}`)
      if (current === active) current = null
    },
    switchConversation: async id => events.push(`switch:${id}`),
    createConversation: async options => events.push(`create:${options.temporary}`),
    deleteConversation: async id => events.push(`delete:${id}`),
  })

  const switching = coordinator.stopAndSwitch(2)
  await Promise.resolve()
  assert.deepEqual(events, ['abort'])
  closed.resolve()
  await switching
  assert.deepEqual(events, ['abort', 'persist:10', 'clear:10', 'switch:2'])
})

test('abort failure preserves the active generation and skips the target action', async () => {
  const { createGenerationTransactionCoordinator } = await import(moduleUrl.href)
  const events = []
  const failure = new Error('abort failed')
  const { generation } = activeGeneration({ abort: async () => { throw failure } })
  let current = generation
  const coordinator = createGenerationTransactionCoordinator({
    getActive: () => current,
    persistInterrupted: async () => events.push('persist'),
    clearActive: () => { current = null },
    switchConversation: async () => events.push('switch'),
    createConversation: async () => events.push('create'),
    deleteConversation: async () => events.push('delete'),
  })

  await assert.rejects(coordinator.stopAndSwitch(2), failure)
  assert.equal(current, generation)
  assert.deepEqual(events, [])
})

test('deleting a non-active conversation never stops the active stream', async () => {
  const { createGenerationTransactionCoordinator } = await import(moduleUrl.href)
  const events = []
  const { generation } = activeGeneration({ abort: async () => events.push('abort') })
  const coordinator = createGenerationTransactionCoordinator({
    getActive: () => generation,
    persistInterrupted: async () => events.push('persist'),
    clearActive: () => events.push('clear'),
    switchConversation: async () => events.push('switch'),
    createConversation: async () => events.push('create'),
    deleteConversation: async id => events.push(`delete:${id}`),
  })

  await coordinator.stopAndDelete(2)
  assert.deepEqual(events, ['delete:2'])
})

test('repeated create requests share one serialized transaction', async () => {
  const { createGenerationTransactionCoordinator } = await import(moduleUrl.href)
  const events = []
  const { generation, closed } = activeGeneration({ abort: async () => events.push('abort') })
  let current = generation
  const coordinator = createGenerationTransactionCoordinator({
    getActive: () => current,
    persistInterrupted: async () => events.push('persist'),
    clearActive: () => { current = null; events.push('clear') },
    switchConversation: async () => events.push('switch'),
    createConversation: async options => events.push(`create:${options.temporary}`),
    deleteConversation: async () => events.push('delete'),
  })

  const first = coordinator.stopAndCreate({ temporary: true })
  const second = coordinator.stopAndCreate({ temporary: true })
  closed.resolve()
  await Promise.all([first, second])
  assert.deepEqual(events, ['abort', 'persist', 'clear', 'create:true'])
})

test('delete-current and explicit stop persist partial output exactly once', async () => {
  const { createGenerationTransactionCoordinator } = await import(moduleUrl.href)
  const events = []
  const { generation, closed } = activeGeneration({ abort: async () => events.push('abort') })
  let current = generation
  const coordinator = createGenerationTransactionCoordinator({
    getActive: () => current,
    persistInterrupted: async active => events.push(`persist:${active.assistantChatId}`),
    clearActive: () => { current = null; events.push('clear') },
    switchConversation: async () => events.push('switch'),
    createConversation: async () => events.push('create'),
    deleteConversation: async id => events.push(`delete:${id}`),
  })

  const deletion = coordinator.stopAndDelete(1)
  closed.resolve()
  await deletion
  await coordinator.stopActive()
  assert.deepEqual(events, ['abort', 'persist:10', 'clear', 'delete:1'])
})

test('protected history actions expose explicit stop-and-target confirmation copy', async () => {
  const { getGenerationConfirmationMessage } = await import(moduleUrl.href)
  assert.match(getGenerationConfirmationMessage('switch'), /停止生成并切换对话/)
  assert.match(getGenerationConfirmationMessage('delete'), /停止生成并删除当前对话/)
  assert.match(getGenerationConfirmationMessage('create'), /停止生成并新建对话/)
  assert.match(getGenerationConfirmationMessage('temporary'), /停止生成并进入临时对话/)
})

test('chat store owns generation lifetime and every conversation action uses the coordinator', async () => {
  const root = new URL('../../', import.meta.url)
  const [store, send, history] = await Promise.all([
    readFile(new URL('src/stores/chat.ts', root), 'utf8'),
    readFile(new URL('src/app/core/main/chat/chat-send.tsx', root), 'utf8'),
    readFile(new URL('src/app/core/main/chat/history-dropdown.tsx', root), 'utf8'),
  ])
  assert.match(store, /activeGeneration: ActiveGeneration \| null/)
  assert.match(store, /stopAndSwitch\(id\)/)
  assert.match(store, /stopAndCreate\(\{ temporary: false \}\)/)
  assert.match(store, /stopAndCreate\(\{ temporary: true \}\)/)
  assert.match(store, /stopAndDelete\(id\)/)
  assert.match(send, /registerActiveGeneration\(\{/)
  assert.match(send, /closed,/)
  assert.match(send, /await stopActiveGeneration\(\)/)
  assert.equal(send.match(/\}, !transactionStopRequested\)/g)?.length, 2)
  assert.doesNotMatch(send, /abortControllerRef/)
  assert.match(history, /getGenerationConfirmationMessage/)
})
