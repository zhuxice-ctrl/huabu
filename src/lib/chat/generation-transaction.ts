export interface ActiveGeneration {
  conversationId: number | null
  assistantChatId: number
  abortController: AbortController
  closed: Promise<void>
}

export type GenerationProtectedAction = 'switch' | 'delete' | 'create' | 'temporary'

export type GenerationTransactionAction =
  | { type: 'stop' }
  | { type: 'switch'; conversationId: number }
  | { type: 'create'; temporary: boolean }
  | { type: 'delete'; conversationId: number }

export type GenerationTransactionCommand =
  | { type: 'abort'; generation: ActiveGeneration }
  | { type: 'await-closed'; generation: ActiveGeneration }
  | { type: 'persist-interrupted'; generation: ActiveGeneration }
  | { type: 'clear-active'; generation: ActiveGeneration }
  | { type: 'switch'; conversationId: number }
  | { type: 'create'; temporary: boolean }
  | { type: 'delete'; conversationId: number }

export interface GenerationTransactionCoordinator {
  chain: Promise<void>
  inFlight: Map<string, Promise<void>>
}

export function getGenerationConfirmationMessage(action: GenerationProtectedAction) {
  switch (action) {
    case 'switch':
      return '正在生成回复。停止生成并切换对话？'
    case 'delete':
      return '正在生成回复。停止生成并删除当前对话？'
    case 'temporary':
      return '正在生成回复。停止生成并进入临时对话？'
    default:
      return '正在生成回复。停止生成并新建对话？'
  }
}

export function getGenerationTransactionKey(action: GenerationTransactionAction) {
  switch (action.type) {
    case 'switch':
      return `switch:${action.conversationId}`
    case 'create':
      return `create:${action.temporary}`
    case 'delete':
      return `delete:${action.conversationId}`
    default:
      return 'stop-active'
  }
}

export function planGenerationTransaction(
  action: GenerationTransactionAction,
  active: ActiveGeneration | null,
): GenerationTransactionCommand[] {
  const commands: GenerationTransactionCommand[] = []
  const stopsActive = Boolean(active) && (
    action.type !== 'delete' || active?.conversationId === action.conversationId
  )

  if (active && stopsActive) {
    commands.push(
      { type: 'abort', generation: active },
      { type: 'await-closed', generation: active },
      { type: 'persist-interrupted', generation: active },
      { type: 'clear-active', generation: active },
    )
  }

  switch (action.type) {
    case 'switch':
      commands.push({ type: 'switch', conversationId: action.conversationId })
      break
    case 'create':
      commands.push({ type: 'create', temporary: action.temporary })
      break
    case 'delete':
      commands.push({ type: 'delete', conversationId: action.conversationId })
      break
  }

  return commands
}

export function createGenerationTransactionCoordinator(): GenerationTransactionCoordinator {
  return {
    chain: Promise.resolve(),
    inFlight: new Map<string, Promise<void>>(),
  }
}

export function enqueueGenerationTransaction(
  coordinator: GenerationTransactionCoordinator,
  key: string,
  operation: () => Promise<void>,
) {
  const existing = coordinator.inFlight.get(key)
  if (existing) return existing

  const scheduled = coordinator.chain.then(operation)
  coordinator.chain = scheduled.catch(() => undefined)
  coordinator.inFlight.set(key, scheduled)

  const clear = () => {
    if (coordinator.inFlight.get(key) === scheduled) coordinator.inFlight.delete(key)
  }
  void scheduled.then(clear, clear)
  return scheduled
}
