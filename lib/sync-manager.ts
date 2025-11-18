/**
 * Background Sync Manager for offline game synchronization
 * Handles syncing game data to Supabase when connection is restored
 */

export interface PendingSyncItem {
  id: string
  type: 'game_create' | 'game_update' | 'game_complete'
  data: any
  timestamp: number
  retryCount: number
}

const SYNC_QUEUE_KEY = 'killerpool_sync_queue'
const MAX_RETRY_COUNT = 3

/**
 * Add an item to the sync queue
 */
export function addToSyncQueue(
  type: PendingSyncItem['type'],
  data: any
): void {
  if (typeof window === 'undefined') return

  const queue = getSyncQueue()
  const item: PendingSyncItem = {
    id: crypto.randomUUID(),
    type,
    data,
    timestamp: Date.now(),
    retryCount: 0,
  }

  queue.push(item)
  localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(queue))

  // Try to sync immediately if online
  if (navigator.onLine) {
    requestBackgroundSync()
  }
}

/**
 * Get the current sync queue
 */
export function getSyncQueue(): PendingSyncItem[] {
  if (typeof window === 'undefined') return []

  try {
    const queueStr = localStorage.getItem(SYNC_QUEUE_KEY)
    return queueStr ? JSON.parse(queueStr) : []
  } catch (error) {
    console.error('Error reading sync queue:', error)
    return []
  }
}

/**
 * Remove an item from the sync queue
 */
export function removeFromSyncQueue(itemId: string): void {
  if (typeof window === 'undefined') return

  const queue = getSyncQueue()
  const filteredQueue = queue.filter((item) => item.id !== itemId)
  localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(filteredQueue))
}

/**
 * Clear all items from the sync queue
 */
export function clearSyncQueue(): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(SYNC_QUEUE_KEY)
}

/**
 * Request background sync using Service Worker
 */
export async function requestBackgroundSync(): Promise<void> {
  if (typeof window === 'undefined') return

  try {
    // Check if Background Sync API is supported
    if ('serviceWorker' in navigator && 'sync' in ServiceWorkerRegistration.prototype) {
      const registration = await navigator.serviceWorker.ready
      await registration.sync.register('sync-games')
      console.log('Background sync registered')
    } else {
      // Fallback to immediate sync if Background Sync API is not supported
      console.log('Background Sync API not supported, using fallback')
      await syncNow()
    }
  } catch (error) {
    console.error('Error registering background sync:', error)
    // Try immediate sync as fallback
    await syncNow()
  }
}

/**
 * Perform synchronization immediately
 */
export async function syncNow(): Promise<void> {
  if (typeof window === 'undefined') return

  const queue = getSyncQueue()
  if (queue.length === 0) return

  console.log(`Syncing ${queue.length} items...`)

  for (const item of queue) {
    try {
      await syncItem(item)
      removeFromSyncQueue(item.id)
      console.log(`Successfully synced item ${item.id}`)
    } catch (error) {
      console.error(`Error syncing item ${item.id}:`, error)

      // Increment retry count
      item.retryCount++

      if (item.retryCount >= MAX_RETRY_COUNT) {
        console.error(`Max retry count reached for item ${item.id}, removing from queue`)
        removeFromSyncQueue(item.id)
      } else {
        // Update retry count in queue
        const updatedQueue = getSyncQueue().map((queueItem) =>
          queueItem.id === item.id ? item : queueItem
        )
        localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(updatedQueue))
      }
    }
  }
}

/**
 * Sync a single item to the server
 */
async function syncItem(item: PendingSyncItem): Promise<void> {
  const endpoint = getEndpointForType(item.type)
  const method = item.type === 'game_create' ? 'POST' : 'PUT'

  const response = await fetch(endpoint, {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(item.data),
  })

  if (!response.ok) {
    throw new Error(`Sync failed with status ${response.status}`)
  }
}

/**
 * Get API endpoint for sync type
 */
function getEndpointForType(type: PendingSyncItem['type']): string {
  switch (type) {
    case 'game_create':
      return '/api/games'
    case 'game_update':
      return '/api/games/update'
    case 'game_complete':
      return '/api/games/complete'
    default:
      throw new Error(`Unknown sync type: ${type}`)
  }
}

/**
 * Get the number of pending sync items
 */
export function getPendingSyncCount(): number {
  return getSyncQueue().length
}

/**
 * Check if there are pending syncs
 */
export function hasPendingSyncs(): boolean {
  return getSyncQueue().length > 0
}

/**
 * Setup sync listeners
 */
export function setupSyncListeners(): void {
  if (typeof window === 'undefined') return

  // Sync when coming back online
  window.addEventListener('online', () => {
    console.log('Device is online, triggering sync...')
    requestBackgroundSync()
  })

  // Also try to sync on page visibility change
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && navigator.onLine) {
      const pendingCount = getPendingSyncCount()
      if (pendingCount > 0) {
        console.log(`Page visible with ${pendingCount} pending syncs, triggering sync...`)
        requestBackgroundSync()
      }
    }
  })
}
