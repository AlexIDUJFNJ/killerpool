/**
 * Type definitions for Background Sync API
 * https://developer.mozilla.org/en-US/docs/Web/API/Background_Synchronization_API
 */

interface SyncManager {
  getTags(): Promise<string[]>
  register(tag: string): Promise<void>
}

interface ServiceWorkerRegistration {
  readonly sync: SyncManager
}

interface SyncEvent extends ExtendableEvent {
  readonly tag: string
  readonly lastChance: boolean
}

interface ServiceWorkerGlobalScopeEventMap {
  sync: SyncEvent
}
