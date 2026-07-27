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
      abortController: new AbortController(),
      closed: closed.promise,
      ...overrides,
    },
    closed,
  }
}

test('switch plans abort, close, interrupted persistence, clear, and target in order', async () => {
  const { planGenerationTransaction } = await import(moduleUrl.href)
  const { generation } = activeGeneration()
  assert.deepEqual(
    planGenerationTransaction({ type: 'switch', conversationId: 2 }, generation)
      .map(command => command.type),
    ['abort', 'await-closed', 'persist-interrupted', 'clear-active', 'switch'],
  )
})

test('an abort failure stops command execution before persistence and target action', async () => {
  const { planGenerationTransaction } = await import(moduleUrl.href)
  const { generation } = activeGeneration()
  const events = []
  const failure = new Error('abort failed')

  await assert.rejects(async () => {
    for (const command of planGenerationTransaction({ type: 'switch', conversationId: 2 }, generation)) {
      if (command.type === 'abort') throw failure
      events.push(command.type)
    }
  }, failure)
  assert.deepEqual(events, [])
})

test('deleting a non-active conversation never plans stream cancellation', async () => {
  const { planGenerationTransaction } = await import(moduleUrl.href)
  const { generation } = activeGeneration()
  assert.deepEqual(
    planGenerationTransaction({ type: 'delete', conversationId: 2 }, generation),
    [{ type: 'delete', conversationId: 2 }],
  )
})

test('repeated identical requests share one serialized transaction', async () => {
  const {
    createGenerationTransactionCoordinator,
    enqueueGenerationTransaction,
  } = await import(moduleUrl.href)
  const coordinator = createGenerationTransactionCoordinator()
  const gate = deferred()
  const events = []
  const operation = async () => {
    events.push('started')
    await gate.promise
    events.push('completed')
  }

  const first = enqueueGenerationTransaction(coordinator, 'create:true', operation)
  const second = enqueueGenerationTransaction(coordinator, 'create:true', operation)
  assert.equal(first, second)
  gate.resolve()
  await Promise.all([first, second])
  assert.deepEqual(events, ['started', 'completed'])
})

test('delete-current and explicit stop each plan partial persistence at most once', async () => {
  const { planGenerationTransaction } = await import(moduleUrl.href)
  const { generation } = activeGeneration()
  const deletion = planGenerationTransaction({ type: 'delete', conversationId: 1 }, generation)
  const stoppedAfterClear = planGenerationTransaction({ type: 'stop' }, null)
  assert.equal(deletion.filter(command => command.type === 'persist-interrupted').length, 1)
  assert.equal(stoppedAfterClear.filter(command => command.type === 'persist-interrupted').length, 0)
})

test('protected history actions expose explicit stop-and-target confirmation copy', async () => {
  const { getGenerationConfirmationMessage } = await import(moduleUrl.href)
  assert.match(getGenerationConfirmationMessage('switch'), /停止生成并切换对话/)
  assert.match(getGenerationConfirmationMessage('delete'), /停止生成并删除当前对话/)
  assert.match(getGenerationConfirmationMessage('create'), /停止生成并新建对话/)
  assert.match(getGenerationConfirmationMessage('temporary'), /停止生成并进入临时对话/)
})

test('chat store owns generation lifetime and routes protected actions through static boundaries', async () => {
  const root = new URL('../../', import.meta.url)
  const [store, send, history] = await Promise.all([
    readFile(new URL('src/stores/chat.ts', root), 'utf8'),
    readFile(new URL('src/app/core/main/chat/chat-send.tsx', root), 'utf8'),
    readFile(new URL('src/app/core/main/chat/history-dropdown.tsx', root), 'utf8'),
  ])
  assert.match(store, /activeGeneration: ActiveGeneration \| null/)
  assert.match(store, /enqueueProtectedGenerationAction\(\{ type: 'switch'/)
  assert.match(store, /enqueueProtectedGenerationAction\(\{ type: 'create', temporary: false \}\)/)
  assert.match(store, /enqueueProtectedGenerationAction\(\{ type: 'create', temporary: true \}\)/)
  assert.match(store, /enqueueProtectedGenerationAction\(\{ type: 'delete'/)
  assert.match(store, /window\.confirm\(getGenerationConfirmationMessage\(action\)\)/)
  assert.match(store, /confirmGenerationAction\('switch'\)/)
  assert.match(send, /registerActiveChatGeneration\(\{/)
  assert.match(send, /abortController: generationAbortController/)
  assert.match(send, /closed,/)
  assert.match(send, /await stopActiveChatGeneration\(\)/)
  assert.equal(send.match(/\}, !transactionStopRequested\)/g)?.length, 2)
  assert.doesNotMatch(send, /abortControllerRef/)
  assert.match(store, /getGenerationConfirmationMessage/)
  assert.match(history, /onSwitch/)
})
