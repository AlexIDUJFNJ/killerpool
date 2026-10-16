/**
 * The commentator: what a shot just did to the game, and a line about it.
 *
 * Everything is worked out from two states of the same game, the one before
 * and the one after. The host's screen and a spectator's go through exactly
 * the same comparison — a spectator only ever sees states arriving over
 * realtime — so both hear the same commentary.
 *
 * Only a single new shot is commented on. Opening a game, an undo, and a
 * spectator catching up on several shots at once after a reconnect all
 * change the game without being "a shot that just happened", and stay quiet.
 */

import type { Game, GameHistoryEntry, Player } from './types'
import type { SoundEffect } from './sound'

export type CommentaryKind =
  | 'victory'
  | 'final_duel'
  | 'eliminated'
  | 'black_on_last_life'
  | 'comeback'
  | 'streak_broken'
  | 'last_life'
  | 'streak_7'
  | 'streak_5'
  | 'streak_3'

/**
 * Most important first. One shot can set off several events — a miss that
 * ends a streak and leaves the last life — and the commentator speaks once,
 * about the first of them.
 */
export const COMMENTARY_PRIORITY: readonly CommentaryKind[] = [
  'victory',
  'final_duel',
  'eliminated',
  'black_on_last_life',
  'comeback',
  'streak_broken',
  'last_life',
  'streak_7',
  'streak_5',
  'streak_3',
]

export interface CommentaryEvent {
  kind: CommentaryKind
  /** Who the line is about: the shooter; the winner for 'victory'; a duellist for 'final_duel' */
  name: string
  /** The other duellist, for 'final_duel' */
  rival?: string
  /** The streak reached, or the one a miss ended */
  count?: number
}

/** A player as the final-duel overlay shows them */
export interface DuelPlayer {
  id: string
  name: string
  avatar: string
  lives: number
}

/** What one new shot did */
export interface ShotTransition {
  shot: GameHistoryEntry
  /** The one effect for this shot: the most dramatic thing it did */
  sound: SoundEffect
  /** In COMMENTARY_PRIORITY order; empty for an ordinary shot */
  events: CommentaryEvent[]
  /** The two players left, when this shot started the final duel */
  duel: DuelPlayer[] | null
}

function activePlayers(game: Game): Player[] {
  return game.players.filter((p) => !p.eliminated)
}

/**
 * Two players left in a game that had more. A game that started with two is
 * a duel from the first shot, and nothing to announce.
 */
export function isFinalDuel(game: Game): boolean {
  return game.status === 'active' && game.players.length > 2 && activePlayers(game).length === 2
}

/**
 * Whether `next` is `prev` plus exactly one shot: the same game, one more
 * entry in its history, and every earlier entry the same. An undo shortens
 * the history; an undo and a new shot reaching a spectator in one update
 * keep its length but change its last entry; a reconnect can add several.
 */
export function isSingleNewShot(prev: Game | null, next: Game | null): boolean {
  if (!prev || !next || prev.id !== next.id) return false
  if (prev.status !== 'active') return false
  const before = prev.history
  const after = next.history
  if (after.length !== before.length + 1) return false
  const lastBefore = before.length - 1
  return lastBefore < 0 || after[lastBefore]?.id === before[lastBefore].id
}

/**
 * How many shots in a row the player has potted (pot or black), counting back
 * from their latest. Every player's turns are counted on their own: other
 * players shooting in between do not break a streak.
 *
 * Private on purpose, and meant to be replaced by the shared streak helper
 * the player card uses once both are in.
 */
function currentStreak(history: readonly GameHistoryEntry[], playerId: string): number {
  let streak = 0
  for (let i = history.length - 1; i >= 0; i--) {
    const entry = history[i]
    if (entry.playerId !== playerId) continue
    if (entry.action === 'miss') break
    streak++
  }
  return streak
}

/** Turns in a row, up to the latest, that the player began and ended on one life */
function turnsSurvivedOnLastLife(history: readonly GameHistoryEntry[], playerId: string): number {
  let turns = 0
  for (let i = history.length - 1; i >= 0; i--) {
    const entry = history[i]
    if (entry.playerId !== playerId) continue
    if (entry.livesBefore !== 1 || entry.livesAfter !== 1) break
    turns++
  }
  return turns
}

function toDuelPlayer(player: Player): DuelPlayer {
  return { id: player.id, name: player.name, avatar: player.avatar, lives: player.lives }
}

/**
 * What the shot between `prev` and `next` did, or null when the change is
 * not a single new shot (see isSingleNewShot).
 */
export function analyzeTransition(prev: Game | null, next: Game | null): ShotTransition | null {
  if (!prev || !next || !isSingleNewShot(prev, next)) return null

  const shot = next.history[next.history.length - 1]
  const shooter = next.players.find((p) => p.id === shot.playerId)
  const name = shooter?.name ?? shot.playerName
  const events: CommentaryEvent[] = []

  const won = next.status === 'completed' && !!next.winnerId
  if (won) {
    const winner = next.players.find((p) => p.id === next.winnerId)
    if (winner) events.push({ kind: 'victory', name: winner.name })
  }

  let duel: DuelPlayer[] | null = null
  const left = activePlayers(next)
  if (next.status === 'active' && activePlayers(prev).length > 2 && left.length === 2) {
    duel = left.map(toDuelPlayer)
    events.push({ kind: 'final_duel', name: left[0].name, rival: left[1].name })
  }

  const knockedOut = shot.livesAfter <= 0
  if (knockedOut) events.push({ kind: 'eliminated', name })

  // Off the last life. Under the classic rules only a black does that, so the
  // two lines split by how long the player had been hanging on: potting the
  // black on the very next turn is the clutch shot, climbing out after
  // surviving turns on one life is the comeback. With rules where something
  // else gives a life back, that is a comeback too.
  if (shot.livesBefore === 1 && shot.livesAfter >= 2) {
    const clutch =
      shot.action === 'pot_black' && turnsSurvivedOnLastLife(prev.history, shot.playerId) === 0
    events.push({ kind: clutch ? 'black_on_last_life' : 'comeback', name })
  }

  if (shot.action === 'miss') {
    const broken = currentStreak(prev.history, shot.playerId)
    if (broken >= 3) events.push({ kind: 'streak_broken', name, count: broken })
  } else {
    const streak = currentStreak(next.history, shot.playerId)
    if (streak >= 7) events.push({ kind: 'streak_7', name, count: streak })
    else if (streak === 5) events.push({ kind: 'streak_5', name, count: streak })
    else if (streak === 3) events.push({ kind: 'streak_3', name, count: streak })
  }

  if (!knockedOut && shot.livesBefore > 1 && shot.livesAfter === 1) {
    events.push({ kind: 'last_life', name })
  }

  events.sort((a, b) => COMMENTARY_PRIORITY.indexOf(a.kind) - COMMENTARY_PRIORITY.indexOf(b.kind))

  let sound: SoundEffect
  if (won) sound = 'victory'
  else if (duel) sound = 'duel'
  else if (knockedOut) sound = 'eliminated'
  else if (shot.action === 'pot_black') sound = 'black'
  else if (shot.action === 'pot') sound = 'pot'
  else sound = 'miss'

  return { shot, sound, events, duel }
}

/** The events of one new shot; none for anything else */
export function detectCommentaryEvents(prev: Game | null, next: Game | null): CommentaryEvent[] {
  return analyzeTransition(prev, next)?.events ?? []
}

// ---------------------------------------------------------------------------
// Lines

/**
 * What the commentator says. {name}, {rival} and {count} are filled in from
 * the event. Short enough to read in the 2.5 s a line is on screen.
 */
export const PHRASES: Readonly<Record<CommentaryKind, readonly string[]>> = {
  streak_3: [
    '{name} has three in a row. Somebody check that cue for batteries.',
    'Three straight for {name}. Getting warm!',
    "Hat-trick, {name}! Don't let it go to your head.",
    'Three on the bounce from {name}. The table is listening.',
    '{name} is heating up. Three in a row!',
  ],
  streak_5: [
    'Five in a row! {name} is on fire.',
    '{name}, five straight. Is this a hustle?',
    'Five! Get {name} a drink. Or a fire extinguisher.',
    'Five in a row for {name}. The rest of you, take notes.',
    '{name} has gone five for five. This is getting rude.',
  ],
  streak_7: [
    '{count} in a row! {name} has left the building.',
    '{name} makes it {count}. Call the fire brigade.',
    '{count} straight. {name} is playing a different game.',
    'Unconscious! {name}, {count} in a row.',
    '{name} on {count}. Legends are written like this.',
  ],
  last_life: [
    '{name} is down to the last life. Hands steady.',
    'One life left for {name}. No pressure. Well, some pressure.',
    '{name} is hanging by a thread.',
    'Last life, {name}. Make it count.',
    '{name} is on the brink. The vultures are circling.',
  ],
  comeback: [
    '{name} climbs off the last life! Not dead yet.',
    'Back from the dead! {name} lives again.',
    'Write {name} off at your peril. Back on two.',
    '{name} was on life support. Now look.',
    'Comeback alert! {name} refuses to go quietly.',
  ],
  black_on_last_life: [
    'CHYORNY! {name} pots the black on the last life!',
    'Nerves of steel! {name}, black ball, last life.',
    '{name} on one life sinks the black. Ice cold.',
    'Last life, black ball, no fear. {name}, take a bow.',
    'CHYORNY! {name} just bought another life.',
  ],
  eliminated: [
    '{name} is out! Thanks for coming.',
    "That's the end of {name}. Grab a drink and heckle.",
    '{name} has left the table. Pour one out.',
    "Goodbye, {name}. You'll be missed. Probably.",
    '{name} is eliminated. The table shows no mercy.',
  ],
  final_duel: [
    'Final duel: {name} against {rival}. Nobody breathe.',
    'Two left. {name} versus {rival}. Pistols at dawn.',
    "It's {name} and {rival}. This town ain't big enough.",
    'Down to the last two. {name}, {rival}, may the best cue win.',
    'Final duel! {name} and {rival}. Phones down, eyes up.',
  ],
  streak_broken: [
    "The streak is over! {name}'s run stops at {count}.",
    'Oof. {name} misses, and {count} in a row goes up in smoke.',
    'Gravity returns for {name}. Streak broken at {count}.',
    "{name}'s hot streak meets a cold pocket. Ended at {count}.",
    "All good things end. {name}'s run of {count} is done.",
  ],
  victory: [
    '{name} wins! Last one standing.',
    'Game over! {name} takes it. Loser racks.',
    '{name} is the last killer standing. Bow down.',
    "That's the game! {name}, drinks are on everybody else.",
    '{name} takes the crown! Loser buys the next round.',
  ],
}

function fill(template: string, event: CommentaryEvent): string {
  return template
    .replace(/\{name\}/g, event.name)
    .replace(/\{rival\}/g, event.rival ?? '')
    .replace(/\{count\}/g, String(event.count ?? ''))
}

export interface PhrasePicker {
  /** A line for the event, never the one picked for the same kind just before */
  pick(event: CommentaryEvent): string
}

export function createPhrasePicker(random: () => number = Math.random): PhrasePicker {
  const lastPicked = new Map<CommentaryKind, number>()
  const roll = (count: number) => Math.min(count - 1, Math.floor(random() * count))

  return {
    pick(event) {
      const pool = PHRASES[event.kind]
      let index = roll(pool.length)
      const previous = lastPicked.get(event.kind)
      if (pool.length > 1 && index === previous) {
        // Step to one of the others, each as likely as the rest
        index = (index + 1 + roll(pool.length - 1)) % pool.length
      }
      lastPicked.set(event.kind, index)
      return fill(pool[index], event)
    },
  }
}

/**
 * A line as the voice should say it. An English voice spells "CHYORNY" out
 * letter by letter, and reads an emoji's name aloud.
 */
export function toSpeech(line: string): string {
  return line
    .replace(/chyorny/gi, 'Chorny')
    .replace(/\p{Extended_Pictographic}️?/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}
