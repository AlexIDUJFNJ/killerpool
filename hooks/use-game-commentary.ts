/**
 * React hook for the game screen's sound and commentary
 */

import { useEffect, useRef, useState } from 'react'
import type { Game } from '@/lib/types'
import { analyzeTransition, createPhrasePicker, toSpeech } from '@/lib/commentary'
import { CommentaryQueue } from '@/lib/commentary-queue'
import { readAudioSettings } from '@/lib/audio-settings'
import { playSound, unlockSound, type SoundEffect } from '@/lib/sound'
import { speak, stopVoice, unlockVoice } from '@/lib/voice'

/**
 * How long the voice waits after the sound of the same shot starts, so the
 * two take turns instead of talking over each other. The fanfare and the
 * duel drums get their opening bars to themselves.
 */
export const VOICE_DELAY_MS: Record<SoundEffect, number> = {
  pot: 300,
  miss: 300,
  black: 700,
  eliminated: 900,
  duel: 800,
  victory: 1000,
}

const UNLOCK_GESTURES = ['pointerdown', 'touchend', 'click', 'keydown'] as const

interface UseGameCommentaryOptions {
  /**
   * Something else has the screen — the black-ball celebration. Lines wait
   * for it instead of showing on top of it.
   */
  held?: boolean
}

/**
 * Follows the game from each state to the next: a sound for every shot, a
 * commentator's line (on screen and, if enabled, aloud) for the shots worth
 * one, and the final-duel overlay. The same for the host and for a spectator,
 * whose states arrive over realtime.
 *
 * The first state seen is only remembered, so opening a game or a spectator
 * joining one sets nothing off. After that only a single new shot does (see
 * isSingleNewShot): an undo, or a reconnect catching up on several shots at
 * once, is silent — and an undo also withdraws a line still up or still
 * being said about the shot it took back.
 *
 * Returns the queue the commentary components render from. Call it where it
 * stays mounted for the whole game — the winner screen replaces the game
 * screen on the very shot that has to be announced.
 */
export function useGameCommentary(game: Game | null, { held = false }: UseGameCommentaryOptions = {}): CommentaryQueue {
  const [queue] = useState(() => new CommentaryQueue())
  const [picker] = useState(() => createPhrasePicker())
  const previousRef = useRef<Game | null>(null)

  // Browsers keep audio and speech locked until the page is touched, and iOS
  // until they are started from inside a gesture handler. Every gesture on the
  // page unlocks them, so that later, when a shot arrives from realtime with
  // no gesture around it, they can play. Cheap once unlocked.
  useEffect(() => {
    const unlock = () => {
      const settings = readAudioSettings()
      if (settings.sound) unlockSound()
      if (settings.voice) unlockVoice()
    }
    UNLOCK_GESTURES.forEach((type) => window.addEventListener(type, unlock, { capture: true, passive: true }))
    return () => {
      UNLOCK_GESTURES.forEach((type) => window.removeEventListener(type, unlock, { capture: true }))
    }
  }, [])

  // Before the effect below, so the line of a shot that also started the
  // celebration already finds the stage held
  useEffect(() => {
    queue.setHeld(held)
  }, [queue, held])

  useEffect(() => {
    const previous = previousRef.current
    previousRef.current = game

    // An undo: whatever is still on screen or being said about the shot
    // taken back is no longer true ("Dan is out!" with Dan back in)
    if (previous && game && previous.id === game.id && game.history.length < previous.history.length) {
      queue.dismiss()
      stopVoice()
      return
    }

    const transition = analyzeTransition(previous, game)
    if (!transition) return

    const settings = readAudioSettings()
    if (settings.sound) playSound(transition.sound)
    if (transition.duel) queue.showDuel(transition.duel)

    const event = transition.events[0]
    if (!event) return
    const line = picker.pick(event)
    queue.say(event.kind, line)
    if (settings.voice) speak(toSpeech(line), VOICE_DELAY_MS[transition.sound])
  }, [game, queue, picker])

  // Leaving the game: nothing left on stage, nothing more said
  useEffect(
    () => () => {
      queue.clear()
      stopVoice()
    },
    [queue]
  )

  return queue
}
