import type { SessionCommand } from './types'

export type SessionCommandHandler = (command: SessionCommand) => void

const handlers = new Set<SessionCommandHandler>()

export function subscribeCommands(handler: SessionCommandHandler): () => void {
  handlers.add(handler)
  return () => {
    handlers.delete(handler)
  }
}

/** Isolated per handler: one throw does not skip the rest. */
export function publishCommand(command: SessionCommand): void {
  for (const handler of [...handlers]) {
    try {
      handler(command)
    } catch {
      // isolate subscriber failures
    }
  }
}

export function resetCommandBus(): void {
  handlers.clear()
}
