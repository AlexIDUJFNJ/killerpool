'use client'

import * as React from 'react'
import { MicVocal, Volume1, Volume2, VolumeX, type LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { setAudioSetting, type AudioSettingKey } from '@/lib/audio-settings'
import { useAudioSettings } from '@/hooks/use-audio-settings'
import { isSoundSupported, playSound, unlockSound } from '@/lib/sound'
import { isVoiceSupported, speak, stopVoice, unlockVoice } from '@/lib/voice'

const onOff = (on: boolean) => (on ? 'on' : 'off')

/**
 * The game screen's sound switch: one header button opening a small menu
 * with the effects and the commentator's voice. The button's icon and name
 * say what is on, without opening it.
 *
 * The menu opens leftwards from the button's right edge, so the button goes
 * at the right end of a header.
 */
export function AudioSettingsMenu() {
  const settings = useAudioSettings()
  const [open, setOpen] = React.useState(false)
  const rootRef = React.useRef<HTMLDivElement>(null)
  const buttonRef = React.useRef<HTMLButtonElement>(null)
  const firstSwitchRef = React.useRef<HTMLButtonElement>(null)
  const menuId = React.useId()

  // Closes on a tap anywhere else and on Escape
  React.useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setOpen(false)
      buttonRef.current?.focus()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  // A keyboard user lands on the first switch
  React.useEffect(() => {
    if (open) firstSwitchRef.current?.focus()
  }, [open])

  const toggle = (key: AudioSettingKey) => {
    const on = !settings[key]
    setAudioSetting(key, on)
    // A sample of what was just switched on. This click is a gesture, so it
    // also unlocks audio on iOS for whatever comes next.
    if (key === 'sound' && on) {
      unlockSound()
      playSound('pot')
    }
    if (key === 'voice') {
      if (on) {
        unlockVoice()
        speak('Commentator on.')
      } else {
        stopVoice()
      }
    }
  }

  const Icon = settings.sound && settings.voice ? Volume2 : settings.sound || settings.voice ? Volume1 : VolumeX
  const label = `Sound settings: effects ${onOff(settings.sound)}, commentator ${onOff(settings.voice)}`

  return (
    <div ref={rootRef} className="relative">
      <Button
        ref={buttonRef}
        variant="ghost"
        size="icon"
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((value) => !value)}
        className={cn(!settings.sound && !settings.voice && 'text-muted-foreground')}
      >
        <Icon className="h-5 w-5" />
      </Button>

      {open && (
        <div
          id={menuId}
          role="group"
          aria-label="Sound settings"
          className="absolute right-0 top-full z-30 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-xl border bg-popover p-1.5 text-popover-foreground shadow-xl"
        >
          <SettingSwitch
            ref={firstSwitchRef}
            icon={Volume2}
            label="Sound effects"
            hint={isSoundSupported() ? 'Shots, knockouts and the fanfare' : 'Not supported in this browser'}
            checked={settings.sound}
            onToggle={() => toggle('sound')}
          />
          <SettingSwitch
            icon={MicVocal}
            label="Commentator voice"
            hint={isVoiceSupported() ? 'Reads the commentary aloud' : 'Not supported in this browser'}
            checked={settings.voice}
            onToggle={() => toggle('voice')}
          />
        </div>
      )}
    </div>
  )
}

interface SettingSwitchProps {
  icon: LucideIcon
  label: string
  hint: string
  checked: boolean
  onToggle: () => void
}

const SettingSwitch = React.forwardRef<HTMLButtonElement, SettingSwitchProps>(
  ({ icon: Icon, label, hint, checked, onToggle }, ref) => {
    const labelId = React.useId()
    const hintId = React.useId()

    return (
      <button
        ref={ref}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={labelId}
        aria-describedby={hintId}
        onClick={onToggle}
        className={cn(
          'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors',
          'hover:bg-accent focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring'
        )}
      >
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span id={labelId} className="block text-sm font-medium">
            {label}
          </span>
          <span id={hintId} className="block text-xs text-muted-foreground">
            {hint}
          </span>
        </span>
        <span aria-hidden="true" className="flex shrink-0 items-center gap-1.5">
          <span className={cn('w-6 text-right text-[10px] font-semibold uppercase', checked ? 'text-primary' : 'text-muted-foreground')}>
            {checked ? 'On' : 'Off'}
          </span>
          <span
            className={cn(
              'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
              checked ? 'bg-primary' : 'bg-muted-foreground/30'
            )}
          >
            <span
              className={cn(
                'inline-block h-4 w-4 rounded-full bg-background shadow-sm transition-transform',
                checked ? 'translate-x-4.5' : 'translate-x-0.5'
              )}
            />
          </span>
        </span>
      </button>
    )
  }
)
SettingSwitch.displayName = 'SettingSwitch'
