/**
 * What the commentator has on screen: one line at a time, and the final-duel
 * overlay.
 *
 * Lines queue up and show for LINE_MS each. Nothing shows over a full-screen
 * moment: while the duel overlay is up, or while the stage is held (the
 * black-ball celebration), lines wait, and a line already showing steps aside
 * and comes back afterwards. A queue that grows anyway keeps only its newest
 * lines, and a line left waiting too long is dropped — it is about a shot the
 * table has moved on from.
 *
 * An external store (subscribe / getSnapshot) for useSyncExternalStore, so
 * the timing lives here, where it can be tested without React.
 */

import type { CommentaryKind, DuelPlayer } from './commentary'

export const LINE_MS = 2500
export const DUEL_MS = 2200
/** Lines waiting behind the one on screen, at most */
export const MAX_WAITING = 3
/** A line that has waited this long is no longer worth showing */
export const STALE_MS = 8000

export interface CommentaryLine {
  id: number
  kind: CommentaryKind
  text: string
  createdAt: number
}

export interface DuelOverlay {
  id: number
  players: DuelPlayer[]
}

export interface CommentaryStage {
  line: CommentaryLine | null
  duel: DuelOverlay | null
}

const EMPTY_STAGE: CommentaryStage = { line: null, duel: null }

export class CommentaryQueue {
  private waiting: CommentaryLine[] = []
  private stage: CommentaryStage = EMPTY_STAGE
  private held = false
  private lineTimer: ReturnType<typeof setTimeout> | null = null
  private duelTimer: ReturnType<typeof setTimeout> | null = null
  private readonly listeners = new Set<() => void>()
  private nextId = 1

  constructor(private readonly now: () => number = Date.now) {}

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getSnapshot = (): CommentaryStage => this.stage

  /** Queue a line; it shows as soon as the stage is free */
  say(kind: CommentaryKind, text: string): void {
    this.waiting.push({ id: this.nextId++, kind, text, createdAt: this.now() })
    this.trim()
    this.advance()
  }

  /** Put the final-duel overlay up for DUEL_MS */
  showDuel(players: DuelPlayer[]): void {
    this.bench()
    if (this.duelTimer) clearTimeout(this.duelTimer)
    this.update({ duel: { id: this.nextId++, players } })
    this.duelTimer = setTimeout(() => {
      this.duelTimer = null
      this.update({ duel: null })
      this.advance()
    }, DUEL_MS)
  }

  /** Hold lines back while something else has the screen */
  setHeld(held: boolean): void {
    if (held === this.held) return
    this.held = held
    if (held) this.bench()
    else this.advance()
  }

  /** Take everything down and forget what was waiting */
  clear(): void {
    if (this.lineTimer) clearTimeout(this.lineTimer)
    if (this.duelTimer) clearTimeout(this.duelTimer)
    this.lineTimer = null
    this.duelTimer = null
    this.waiting = []
    this.held = false
    if (this.stage !== EMPTY_STAGE) {
      this.stage = EMPTY_STAGE
      this.emit()
    }
  }

  /** The line on screen goes back to the front of the queue */
  private bench(): void {
    const line = this.stage.line
    if (!line) return
    if (this.lineTimer) clearTimeout(this.lineTimer)
    this.lineTimer = null
    this.waiting.unshift(line)
    this.trim()
    this.update({ line: null })
  }

  private trim(): void {
    while (this.waiting.length > MAX_WAITING) this.waiting.shift()
  }

  private advance(): void {
    if (this.stage.line || this.stage.duel || this.held) return

    const now = this.now()
    let next = this.waiting.shift()
    while (next && now - next.createdAt > STALE_MS) next = this.waiting.shift()
    if (!next) return

    this.update({ line: next })
    this.lineTimer = setTimeout(() => {
      this.lineTimer = null
      this.update({ line: null })
      this.advance()
    }, LINE_MS)
  }

  private update(patch: Partial<CommentaryStage>): void {
    this.stage = { ...this.stage, ...patch }
    this.emit()
  }

  private emit(): void {
    this.listeners.forEach((listener) => listener())
  }
}
