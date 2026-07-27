export interface ActiveGeneration {
  conversationId: number | null
  assistantChatId: number
  abort: () => Promise<void>
  closed: Promise<void>
}

export type GenerationProtectedAction = 'switch' | 'delete' | 'create' | 'temporary'

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

interface GenerationTransactionDependencies {
  getActive: () => ActiveGeneration | null
  persistInterrupted: (generation: ActiveGeneration) => Promise<void>
  clearActive: (generation: ActiveGeneration) => void
  switchConversation: (id: number) => Promise<void>
  createConversation: (options: { temporary: boolean }) => Promise<void>
  deleteConversation: (id: number) => Promise<void>
}

export function createGenerationTransactionCoordinator(
  dependencies: GenerationTransactionDependencies,
) {
  let chain: Promise<void> = Promise.resolve()
  const inFlight = new Map<string, Promise<void>>()

  const enqueueUnique = (key: string, operation: () => Promise<void>) => {
    const existing = inFlight.get(key)
    if (existing) return existing

    const scheduled = chain.then(operation)
    chain = scheduled.catch(() => undefined)
    inFlight.set(key, scheduled)

    const clear = () => {
      if (inFlight.get(key) === scheduled) inFlight.delete(key)
    }
    void scheduled.then(clear, clear)
    return scheduled
  }

  const stopGeneration = async (generation: ActiveGeneration) => {
    await generation.abort()
    await generation.closed
    await dependencies.persistInterrupted(generation)
    dependencies.clearActive(generation)
  }

  return {
    stopActive() {
      return enqueueUnique('stop-active', async () => {
        const active = dependencies.getActive()
        if (active) await stopGeneration(active)
      })
    },

    stopAndSwitch(id: number) {
      return enqueueUnique(`switch:${id}`, async () => {
        const active = dependencies.getActive()
        if (active) await stopGeneration(active)
        await dependencies.switchConversation(id)
      })
    },

    stopAndCreate(options: { temporary: boolean }) {
      return enqueueUnique(`create:${options.temporary}`, async () => {
        const active = dependencies.getActive()
        if (active) await stopGeneration(active)
        await dependencies.createConversation(options)
      })
    },

    stopAndDelete(id: number) {
      return enqueueUnique(`delete:${id}`, async () => {
        const active = dependencies.getActive()
        if (active?.conversationId === id) await stopGeneration(active)
        await dependencies.deleteConversation(id)
      })
    },
  }
}
