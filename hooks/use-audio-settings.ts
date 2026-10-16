/**
 * React hook for the sound settings (lib/audio-settings.ts)
 */

import { useSyncExternalStore } from 'react'
import {
  DEFAULT_AUDIO_SETTINGS,
  readAudioSettings,
  subscribeToAudioSettings,
  type AudioSettings,
} from '@/lib/audio-settings'

// The server cannot know what this device stored; it renders the defaults
const getServerSnapshot = () => DEFAULT_AUDIO_SETTINGS

export function useAudioSettings(): AudioSettings {
  return useSyncExternalStore(subscribeToAudioSettings, readAudioSettings, getServerSnapshot)
}
