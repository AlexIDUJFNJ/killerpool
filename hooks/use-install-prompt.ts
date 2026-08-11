/**
 * React binding for the install-prompt store
 */

import { useSyncExternalStore } from 'react'
import {
  subscribe,
  getSnapshot,
  getServerSnapshot,
  type InstallState,
} from '@/lib/pwa-install'

export function useInstallPrompt(): InstallState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
