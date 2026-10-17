'use client'

import * as React from 'react'
import { Monitor, Moon, Sun, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  THEME_CHANGE_EVENT,
  THEME_STORAGE_KEY,
  readThemePreference,
  setThemePreference,
  type ThemePreference,
} from './theme'

const OPTIONS: Array<{ value: ThemePreference; label: string; icon: LucideIcon }> = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
]

function subscribe(onChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === THEME_STORAGE_KEY) onChange()
  }
  window.addEventListener(THEME_CHANGE_EVENT, onChange)
  window.addEventListener('storage', onStorage)
  return () => {
    window.removeEventListener(THEME_CHANGE_EVENT, onChange)
    window.removeEventListener('storage', onStorage)
  }
}

// The server cannot know the stored choice, so nothing is pressed until the
// client takes over — better than briefly pressing the wrong one
const getServerSnapshot = () => null

/**
 * Light / Dark / System switch. "System" follows the device setting, live —
 * the inline script in app/layout.tsx listens for changes to it.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const preference = React.useSyncExternalStore(subscribe, readThemePreference, getServerSnapshot)

  return (
    <div
      role="group"
      aria-label="Theme"
      className={cn('inline-flex items-center gap-1 rounded-lg border border-border bg-background p-1', className)}
    >
      {OPTIONS.map(({ value, label, icon: Icon }) => {
        const pressed = preference === value
        return (
          <button
            key={value}
            type="button"
            aria-pressed={pressed}
            onClick={() => setThemePreference(value)}
            className={cn(
              'inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors',
              'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring',
              pressed
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        )
      })}
    </div>
  )
}
