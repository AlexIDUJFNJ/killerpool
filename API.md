# 📡 API Documentation - Killerpool

Документация внутренних API Killerpool: клиентские модули (`lib/*`, `contexts/*`, `hooks/*`), схема БД Supabase и RPC-функции.

> В приложении **нет REST-эндпоинтов** (`app/api` не существует). Вся работа с данными идёт через Supabase JS-клиент напрямую из браузера, а состояние игры живёт на клиенте (React Context + localStorage).

## 📋 Содержание

- [Обзор](#обзор)
- [Supabase Clients](#supabase-clients)
- [Authentication](#authentication)
- [Game Logic API](#game-logic-api)
- [TypeScript Types](#typescript-types)
- [Storage API (localStorage)](#storage-api-localstorage)
- [Sync API](#sync-api)
- [Realtime API](#realtime-api)
- [Realtime Hooks](#realtime-hooks)
- [GameContext API](#gamecontext-api)
- [Achievements API](#achievements-api)
- [Game Mapper](#game-mapper)
- [Invite API](#invite-api)
- [Export API](#export-api)
- [Haptic API](#haptic-api)
- [Database Schema](#database-schema)
- [RPC Functions](#rpc-functions)
- [Row Level Security](#row-level-security)
- [Error Handling](#error-handling)

---

## Обзор

Архитектурные принципы:

- **Client-first** — игра работает целиком на клиенте: чистые функции `lib/game-logic.ts` + `GameProvider` (`contexts/game-context.tsx`); персист в localStorage (`lib/storage.ts`).
- **Supabase как бэкенд** — Postgres + Auth + Realtime, доступ только через `@supabase/ssr`-клиенты. Никаких собственных API-роутов.
- **Offline-tolerant** — завершённая игра синкается в Supabase через `autoSyncGame()`; при неудаче игра помечается в localStorage-ключе `killerpool_pending_sync` и досинкается через `retryPendingSyncs()` (вызывается из `components/pwa-init.tsx` при монтировании, на событиях `online` и `visibilitychange`).
- **Live sharing без broadcast** — хост через `enableSharing()` upsert'ит полную строку игры в таблицу `games` на каждое действие (`syncActiveGameToSupabase`), зрители подписаны на `postgres_changes` UPDATE по `id` игры. Broadcast-каналов и presence нет.

Переменные окружения: `NEXT_PUBLIC_SUPABASE_URL` и `NEXT_PUBLIC_SUPABASE_ANON_KEY` (обязательные), `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SENTRY_DSN` (необязательные) и сборочный `SENTRY_AUTH_TOKEN`. Service-role ключ не используется.

---

## Supabase Clients

### Browser Client (Client Components)

**Файл:** `lib/supabase/client.ts`

Используется в Client Components (`'use client'`). Бросает ошибку при вызове вне браузера или без env-переменных.

```typescript
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  // Ensure we're in a browser environment
  if (typeof window === 'undefined') {
    throw new Error('createClient can only be used in browser environment')
  }
  // ...проверка NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY...
  return createBrowserClient(supabaseUrl, supabaseAnonKey)
}
```

**Использование:**

```typescript
import { createClient } from '@/lib/supabase/client'

const supabase = createClient()
```

---

### Server Client (Server Components & Route Handlers)

**Файл:** `lib/supabase/server.ts`

Асинхронная функция (в Next.js 16 `cookies()` — async). Экспортирует единственную функцию `createClient` (никакого `getGameById` в этом файле нет).

```typescript
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) { /* set cookies, ignore in Server Components */ },
      },
    }
  )
}
```

---

### Session Refresh (proxy.ts)

**Файлы:** `proxy.ts` (корень проекта), `lib/supabase/middleware.ts`

Вместо `middleware.ts` используется `proxy.ts` (конвенция Next.js 16). Его единственная задача — вызвать `updateSession()`:

```typescript
// proxy.ts
import { updateSession } from '@/lib/supabase/middleware'
import { type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  return await updateSession(request)
}
```

`updateSession(request: NextRequest)` (`lib/supabase/middleware.ts`):

- Рефрешит Supabase-сессию (`supabase.auth.getUser()`).
- Route protection: **только** `/profile` — неавторизованных редиректит на `/auth`.
- Авторизованного пользователя с `/auth` редиректит на `/`.
- Если env-переменные Supabase не заданы — пропускает запрос без auth-проверки.

---

## Authentication

Методы входа (реальный код в `app/auth/page.tsx`): **Google OAuth (PKCE)** и **Magic Link**. Email/password-входа в приложении нет.

### Google OAuth

```typescript
const { error } = await supabase.auth.signInWithOAuth({
  provider: 'google',
  options: {
    redirectTo: `${window.location.origin}/auth/callback`,
  },
})
```

### Magic Link

```typescript
const { error } = await supabase.auth.signInWithOtp({
  email,
  options: {
    emailRedirectTo: `${window.location.origin}/auth/callback`,
  },
})
```

### OAuth Callback

**Файл:** `app/auth/callback/route.ts` — единственный route handler в приложении:

```typescript
export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const origin = requestUrl.origin

  if (code) {
    const supabase = await createClient()
    await supabase.auth.exchangeCodeForSession(code)
  }

  // URL to redirect to after sign in process completes
  return NextResponse.redirect(`${origin}/`)
}
```

### Guest Mode

Гость — это роль `anon` без auth-записи. Стабильный UUID хранится в localStorage (`killerpool_guest_id`), см. `getGuestId()` в [Storage API](#storage-api-localstorage). Гости могут играть, шарить игры и попадать в лидерборд, но не получают ачивки.

### Sign Out

```typescript
await supabase.auth.signOut()  // app/profile/page.tsx
```

---

## Game Logic API

**Файл:** `lib/game-logic.ts`

Чистые функции для игровой логики (без side effects). Все сигнатуры — из кода.

### createPlayer

```typescript
export function createPlayer(
  name: string,
  avatar: string,
  startingLives: number,
  userId?: string | null,
  id?: string          // id из ростера; без него — новый crypto.randomUUID()
): Player
```

### createGame

```typescript
export interface NewGamePlayerInput {
  name: string
  avatar: string
  isOwner?: boolean   // «это я» — создатель игры
  id?: string         // постоянный id из ростера устройства
}

export function createGame(
  players: NewGamePlayerInput[],
  ruleset: Ruleset = DEFAULT_RULESET,
  userId?: string | null
): Game
```

**Важно:** `userId` получает **только помеченный игрок** (`isOwner`), а не первый по счёту. Позиция ничего не значит: форма умеет перемешивать строки и отбрасывает безымянные, поэтому раньше личность создателя доставалась случайному игроку — вместе с его ачивками и местом в лидерборде. Без метки происходит откат на индекс 0, чтобы старые вызовы и тесты продолжали работать.

Остальные игроки создаются с `userId = null` и агрегируются в лидерборде по `participants[].id` — постоянному id из ростера устройства.

### applyAction

Применяет действие к **текущему** игроку (игрок берётся из `game.currentPlayerIndex`, отдельного параметра `playerId` нет):

```typescript
export function applyAction(game: Game, action: GameAction): Game
```

Бросает `'Game is not active'` на завершённой или брошенной игре и `'Invalid player state'`, если текущий игрок уже выбыл. Первая проверка нужна не для красоты: без неё промах последнего выжившего обнулял список активных, сбрасывал победителя и возвращал игру в `active` без единого игрока.

Внутри: считает изменение жизней по `game.ruleset.params[action]`, ограничивает сверху `max_lives` (fallback 6), элиминирует игрока при `lives <= 0`, добавляет запись в `history`, передаёт ход следующему активному игроку, при одном оставшемся игроке ставит `status: 'completed'` и `winnerId`. Смена хода и изменение жизней — приватные детали реализации (`findNextActivePlayer` не экспортируется; функций `updatePlayerLives` / `nextTurn` в коде нет).

### Селекторы и утилиты

```typescript
export function getCurrentPlayer(game: Game): Player | undefined
export function getActivePlayers(game: Game): Player[]
export function getEliminatedPlayers(game: Game): Player[]
export function getNextPlayers(game: Game, count: number = 2): Player[]
export function getWinner(game: Game): Player | undefined
export function getSortedPlayers(game: Game): Player[]
```

`getWinner` возвращает игрока только если `game.status === 'completed'` и задан `winnerId`.

### undoLastAction

```typescript
export function undoLastAction(game: Game): Game
```

Откатывает последнюю запись `history`: восстанавливает жизни и `eliminated`-статус игрока, возвращает ему ход, пересчитывает `winnerId`/`status`.

### addPlayerToGame

```typescript
export function addPlayerToGame(
  game: Game,
  playerName: string,
  playerAvatar: string,
  playerId?: string     // id из ростера
): Game
```

Добавляет игрока в активную игру с минимальным количеством жизней среди активных игроков. Бросает ошибку, если игра не `active` или такой id уже есть среди участников.

### calculateStats

```typescript
export function calculateStats(game: Game)
```

Возвращает `{ totalActions, totalMisses, totalPots, totalBlackPots, duration, winner }` (`duration` только для completed-игр).

---

## TypeScript Types

**Файл:** `lib/types.ts`

### GameAction / GameStatus

```typescript
export type GameAction = 'miss' | 'pot' | 'pot_black'
export type GameStatus = 'setup' | 'active' | 'completed' | 'abandoned'
```

Действия — **lowercase-строки**, они же ключи `ruleset.params`. В UI: свайп влево = `miss`, вправо = `pot`, вверх = `pot_black` (`components/game/swipeable-player-card.tsx`).

### Player

```typescript
export interface Player {
  id: string
  name: string
  avatar: string
  lives: number
  eliminated: boolean
  userId?: string | null
}
```

### Ruleset

```typescript
export interface Ruleset {
  id: string
  name: string
  description?: string
  params: {
    starting_lives: number
    miss: number           // -1
    pot: number            // 0
    pot_black: number      // +1
    max_lives?: number     // 6
  }
  is_default: boolean
}
```

### GameHistoryEntry

```typescript
export interface GameHistoryEntry {
  id: string
  action: GameAction
  playerId: string
  playerName: string
  timestamp: string
  livesBefore: number
  livesAfter: number
}
```

### Game

```typescript
export interface Game {
  id: string
  createdAt: string
  updatedAt: string
  status: GameStatus
  players: Player[]
  currentPlayerIndex: number
  winnerId?: string | null
  rulesetId?: string
  ruleset: Ruleset
  history: GameHistoryEntry[]
  createdBy?: string | null
}
```

### DEFAULT_RULESET

```typescript
export const DEFAULT_RULESET: Ruleset = {
  id: 'classic',
  name: 'Classic Killer Pool',
  description: 'Traditional killer pool rules: 3 starting lives, -1 for MISS, 0 for POT, +1 for POT BLACK',
  params: {
    starting_lives: 3,
    miss: -1,
    pot: 0,
    pot_black: 1,
    max_lives: 6,
  },
  is_default: true,
}
```

После миграции 00011 БД-сид дефолтного ruleset тоже использует `max_lives: 6`.

### Achievements

```typescript
export type AchievementType =
  | 'first_win'        // First victory
  | 'wins_10'          // 10 total wins
  | 'wins_25'          // 25 total wins
  | 'wins_50'          // 50 total wins
  | 'win_streak_3'     // 3 wins in a row
  | 'win_streak_5'     // 5 wins in a row
  | 'survivor'         // Win with 1 life remaining
  | 'perfect_game'     // Win without losing any lives
  | 'pot_black_master' // 5+ pot blacks in one game
  | 'social_player'    // 10 games with 4+ players

export interface AchievementDefinition {
  id: AchievementType
  name: string
  description: string
  icon: string
  rarity: 'common' | 'rare' | 'epic' | 'legendary'
}
```

Также экспортируются: `NewGameFormData`, `GameStats`, `UserAchievement`, `DEFAULT_AVATARS` (16 emoji), `ACHIEVEMENTS` (10 определений).

---

## Storage API (localStorage)

**Файл:** `lib/storage.ts`

Работает **только с localStorage / sessionStorage** — никакого Supabase-fallback внутри нет (синк с Supabase — отдельный слой, см. [Sync API](#sync-api)). Все функции глотают ошибки (`try/catch` + `console.error`) и возвращают безопасные значения.

**Ключи:**

| Ключ | Назначение |
|------|-----------|
| `killerpool_current_game` | текущая игра |
| `killerpool_game_history` | история завершённых игр (до 50) |
| `killerpool_guest_id` | стабильный UUID гостя |
| `killerpool_rematch_players` | игроки для реванша (**sessionStorage**) |
| `killerpool_pending_sync` | ID игр, ожидающих ретрая синка (простой массив строк) |
| `killerpool_pending_sync_meta` | попытки и время по каждому ID из очереди — отдельным ключом, чтобы старый бандл из кеша SW мог дренировать очередь |
| `killerpool_deleted_games` | надгробия удалённых игр, чтобы merge не вернул их из Supabase |
| `killerpool_roster` | игроки этого устройства: постоянный id за именем |
| `killerpool-theme` | выбранная тема; читается инлайн-скриптом в `<head>` до гидрации |

### Текущая игра

```typescript
export function saveCurrentGame(game: Game): void
export function loadCurrentGame(): Game | null
export function clearCurrentGame(): void
export function hasCurrentGame(): boolean
```

### История игр

```typescript
export function saveToHistory(game: Game): void      // только status === 'completed', остальные игнорируются
export function loadGameHistory(): Game[]
export function clearGameHistory(): void
export function getGameFromHistory(gameId: string): Game | null
export function deleteGameFromHistory(gameId: string): void
```

`saveToHistory` пишет игру в начало списка и обрезает историю до последних 50 игр; игры со статусом, отличным от `completed`, игнорируются. Запись с тем же `id` **заменяется**, а не дублируется: одна и та же игра может завершиться дважды, если отменить победу и доиграть. Она же снимает надгробие — явное добавление важнее прежнего удаления.

`deleteGameFromHistory` ставит надгробие и убирает игру из очереди синка: без надгробия следующий `mergeGamesWithSupabase` вернул бы её из облака, потому что там `updated_at` всегда свежее.

```typescript
export const MAX_HISTORY_GAMES = 50
export function saveGameHistory(games: Game[]): void   // единственный писатель ключа истории
```

### Гость

```typescript
export function getGuestId(): string
```

Возвращает стабильный UUID гостя; создаёт новый `crypto.randomUUID()`, если сохранённого нет или он невалиден (старый формат `guest_xxx`).

### Ростер игроков

```typescript
export interface RosterPlayer { id: string; name: string; avatar: string; lastPlayedAt: number }

export function loadRoster(): RosterPlayer[]
export function findRosterPlayer(name: string): RosterPlayer | null
export function resolveRosterPlayerId(name: string): string
export function rememberRosterPlayers(players: Array<{ id: string; name: string; avatar: string }>): void
```

Люди, играющие на этом устройстве. `resolveRosterPlayerId` возвращает id знакомого имени (сравнение без учёта регистра и пробелов) или выдаёт новый UUID. Этот id уходит в `participants[].id`, и на нём стоит агрегация лидерборда — поэтому он обязан оставаться UUID в нижнем регистре, иначе `get_leaderboard` отбросит игрока по regex-гарду.

`rememberRosterPlayers` при повторной встрече имени **сохраняет прежний id** и обновляет только имя с аватаром: переименование человека не должно расщеплять его статистику. Список ограничен 100 записями, вытесняются давно не игравшие.

### Автодополнение имён

```typescript
export function getPlayerNamesSuggestions(): string[]
```

Имена из ростера плюс имена из истории (для тех, кто играл до появления ростера), уникальные, по алфавиту.

### Очередь офлайн-синка

```typescript
export function getPendingSyncIds(): string[]
export function markPendingSync(gameId: string): void
export function unmarkPendingSync(gameId: string): void   // снимает и метаданные попыток

export const MAX_SYNC_ATTEMPTS = 5
export interface PendingSyncMeta { attempts: number; firstFailedAt: number; lastAttemptAt: number; permanent?: boolean }

export function recordSyncFailure(gameId: string, options?: { permanent?: boolean }): void
export function isSyncExhausted(gameId: string, now?: number): boolean
export function isSyncBackedOff(gameId: string, now?: number): boolean
export function clearSyncMeta(gameId: string): void
```

`isSyncExhausted` — отказ, который сервер повторит (например, по правам), 5 попыток или 14 дней. `isSyncBackedOff` — экспоненциальная отсрочка от минуты до шести часов; без неё `retryPendingSyncs` ходил в сеть за каждой игрой очереди при каждом переключении вкладки. ID без записи метаданных (его положил старый бандл) не считается ни исчерпанным, ни отложенным.

### Реванш

```typescript
export function saveRematchPlayers(players: NewGamePlayerInput[]): void
export function loadRematchPlayers(): NewGamePlayerInput[] | null
```

`loadRematchPlayers` читает и сразу очищает sessionStorage. Через `isOwner` переносится отметка «это я», чтобы реванш не угадывал создателя заново.

---

## Sync API

**Файл:** `lib/sync.ts`

Синхронизация игр между localStorage и Supabase.

Все записи в `games` идут через одну внутреннюю функцию, которая собирает строку
через `mapGameToDbRow` (`lib/game-mapper.ts`), при необходимости заводит
`player_profiles` и классифицирует ошибку. Раньше таких мест было три, с разными
наборами колонок — а поскольку PostgREST строит `ON CONFLICT DO UPDATE` по ключам
переданного объекта, различающийся набор менял и поведение upsert.

Ошибка помечается **неустранимой** по коду Postgres (`42501` отказ прав, `22P02`,
`23502`, `23503`, `23514`, `42703`, `22007`). Сетевые сбои, истёкший токен и 5xx в
этот список намеренно не входят — их надо повторять.

### syncGameToSupabase

```typescript
export async function syncGameToSupabase(game: Game): Promise<boolean>
```

Работает **только** для `status === 'completed'` (иначе `false`).

### syncActiveGameToSupabase

```typescript
export async function syncActiveGameToSupabase(game: Game): Promise<{ success: boolean; error?: string }>
```

То же самое для игры **любого статуса** (live sharing / spectator mode). Возвращает текст ошибки вместо голого boolean. Вызывается из `GameProvider` на каждое действие при включённом sharing и из `useSyncGameForRealtime`.

### autoSyncGame

```typescript
export async function autoSyncGame(game: Game): Promise<boolean>
```

Автосинк завершённой игры (авторизованные и гости). При успехе снимает игру с pending-очереди, при неудаче — ставит в очередь и записывает попытку через `recordSyncFailure`, помечая неустранимые отказы.

### retryPendingSyncs

```typescript
export async function retryPendingSyncs(): Promise<void>
```

Ретраит синк игр из `killerpool_pending_sync` (например, завершённых офлайн). No-op на сервере и при `navigator.onLine === false`. Вызывается из `components/pwa-init.tsx`: при монтировании, на `online` и на `visibilitychange` (когда вкладка становится видимой и есть сеть). Background Sync API **не используется**.

Пропускает игры, которые ещё в отсрочке, и выбрасывает из очереди исчерпанные — иначе игра, которую сервер отвергает навсегда, уходила бы в сеть при каждом переключении вкладки. Ачивки за успешно досинхронизированную игру отправляет событием `emitUnlockedAchievements`, потому что вызывается из `PWAInit`, а он вне `GameProvider`.

### Прочее

```typescript
export async function syncAllGamesToSupabase(): Promise<{ success: number; skipped: number; refused: number; failed: number; total: number }>
export async function loadGamesFromSupabase(): Promise<Game[]>       // только для авторизованных, фильтр по created_by
export async function mergeGamesWithSupabase(): Promise<void>        // merge по updatedAt, максимум 50 игр
export async function isSupabaseAvailable(): Promise<boolean>        // фактически "авторизован ли пользователь"
```

`syncAllGamesToSupabase` (страница `/sync`) различает четыре исхода: загружено, **пропущено** (незавершённые игры — их нельзя расшарить, и это не ошибка), **отвергнуто** (игра сыграна до входа в аккаунт: её строка в облаке без владельца, и присвоить её аккаунт уже не может — повтор не поможет) и собственно ошибки.

### mergeGamesWithSupabase

Скачивает игры пользователя и сливает с локальной историей по `updatedAt`, пропуская те, у которых стоит надгробие. Игры, удалённые из истории, иначе возвращались бы при каждом слиянии: триггер `update_games_updated_at` делает облачную копию заведомо свежее локальной.

---

## Realtime API

**Файл:** `lib/realtime.ts`

Realtime построен на **postgres_changes**: хост пишет полную строку игры (см. `syncActiveGameToSupabase`), зрители получают UPDATE-события. Отдельного per-action канала нет — функция `broadcastGameAction` **удалена**.

### subscribeToGame

```typescript
export function subscribeToGame(
  gameId: string,
  onUpdate: (game: Partial<Game>) => void,
  onAction: (action: GameHistoryEntry) => void,
  onStatus?: (connected: boolean) => void
): RealtimeChannel | null
```

Создаёт канал `game:{gameId}` с подпиской на `postgres_changes` (`event: 'UPDATE'`, `table: 'games'`, `filter: id=eq.{gameId}`). На каждый UPDATE маппит snake_case-строку БД в `Partial<Game>` и вызывает `onUpdate`; `onAction` получает последний элемент `history`. `onStatus` отражает реальный статус подписки — наличие объекта канала ещё не значит `SUBSCRIBED`.

### unsubscribeFromGame

```typescript
export async function unsubscribeFromGame(channel: RealtimeChannel | null): Promise<void>
```

### updateGameStatus

```typescript
export async function updateGameStatus(
  gameId: string,
  status: 'active' | 'completed' | 'abandoned',
  winnerId?: string | null
): Promise<boolean>
```

Точечный UPDATE строки игры (`status`, `winner_id`, `updated_at`). Используется `GameProvider` при завершении расшаренной игры.

> Осторожно при отладке: обычный `UPDATE`, не прошедший `USING` RLS-политики, **не поднимает ошибку** — он меняет ноль строк, и эта функция вернёт `true`. В отличие от upsert, который в той же ситуации падает.

---

## Realtime Hooks

**Файл:** `hooks/use-realtime-game.ts`

### useRealtimeGame

```typescript
interface UseRealtimeGameOptions {
  enabled?: boolean
  onGameUpdate?: (game: Partial<Game>) => void
  onNewAction?: (action: GameHistoryEntry) => void
}

export function useRealtimeGame(
  gameId: string | null,
  options: UseRealtimeGameOptions = {}
)
// Returns: { isConnected: boolean }
```

Подписывается на игру через `subscribeToGame`, хранит колбэки в ref'ах (не ре-подписывается на каждый рендер), отписывается при размонтировании. `isConnected` приходит из статуса канала, а не выставляется по факту его создания.

### useSyncGameForRealtime

```typescript
export function useSyncGameForRealtime(game: Game | null)
// Returns: { isSynced: boolean }
```

Синкает активную игру в Supabase один раз, когда она появляется (через `syncActiveGameToSupabase`). Готовность запоминается по id игры, а не флагом: иначе вторая расшаренная игра за сессию осталась бы несинхронизированной.

---

## GameContext API

**Файл:** `contexts/game-context.tsx`

Глобальное состояние игры. `GameProvider` оборачивает приложение; доступ — через хук `useGame()` (бросает ошибку вне провайдера).

```typescript
interface GameContextValue {
  game: Game | null
  isLoading: boolean
  isRealtimeConnected: boolean
  isSpectatorMode: boolean
  isSharingEnabled: boolean
  currentUserId: string | null
  newAchievements: AchievementType[]
  dismissAchievement: () => void
  startGame: (game: Game, enableRealtime?: boolean) => void
  performAction: (action: GameAction) => void
  undoAction: () => void
  endGame: () => void
  resumeGame: () => void
  loadGameFromSupabase: (gameId: string) => Promise<Game | null>
  setSpectatorGame: (game: Game) => void
  clearSpectatorGame: () => void
  enableSharing: () => Promise<boolean>
  addPlayer: (name: string, avatar: string) => void
}

export function GameProvider({ children }: { children: React.ReactNode })
export function useGame(): GameContextValue
```

Ключевое поведение:

- **Персист:** игра сохраняется в localStorage на каждое изменение (кроме spectator mode); при монтировании восстанавливается активная игра.
- **Завершение игры:** когда `status` становится `'completed'` (один раз на игру): `saveToHistory(game)` → `autoSyncGame(game)` → для авторизованного победителя `checkAchievements(user.id, game.id)`; новые ачивки попадают в `newAchievements` и показываются тостами (`dismissAchievement` убирает первый из очереди).
- **performAction / undoAction / addPlayer:** применяют чистую функцию из `lib/game-logic.ts`; при `isSharingEnabled` дополнительно синкают полное состояние через `syncActiveGameToSupabase`.
- **enableSharing():** синкает игру в Supabase и включает realtime; возвращает `false`, если игры нет или синк упал; идемпотентна.
- **setSpectatorGame(game):** включает spectator mode (без записи в localStorage) и подписывается на realtime-обновления через `subscribeToGame`.
- **loadGameFromSupabase(gameId):** SELECT игры по id + `mapDbGameToGame` (для зрителей, открывших ссылку-приглашение).
- **endGame():** помечает текущую игру `'abandoned'`, вызывает `saveToHistory` (для abandoned-игр это no-op — история хранит только completed) и очищает `killerpool_current_game`.

### Пример: enableSharing

```typescript
import { useGame } from '@/contexts/game-context'

function ShareButton() {
  const { enableSharing, isSharingEnabled } = useGame()

  const handleShare = async () => {
    const success = await enableSharing()
    if (success) {
      // игра доступна зрителям по ссылке /game/{id}?invite=true
    }
  }

  return (
    <button onClick={handleShare} disabled={isSharingEnabled}>
      {isSharingEnabled ? 'Sharing Active' : 'Enable Sharing'}
    </button>
  )
}
```

---

## Achievements API

**Файл:** `lib/achievements.ts`

```typescript
export interface UnlockedAchievement {
  id: string
  definition: AchievementDefinition
  unlockedAt: Date
  gameId?: string
}

export async function getUserAchievements(userId: string): Promise<UnlockedAchievement[]>
export async function checkAchievements(userId: string, gameId: string): Promise<AchievementType[]>
export function getAchievementDefinition(type: AchievementType): AchievementDefinition | undefined
export function getRarityColor(rarity: AchievementDefinition['rarity']): string
export function getRarityBgColor(rarity: AchievementDefinition['rarity']): string
export function formatUnlockDate(date: Date): string
export function getTotalAchievementCount(): number
export function getAchievementProgress(unlockedCount: number): number

// Ачивки, начисленные вне экрана игры (поздний синк из PWAInit)
export function emitUnlockedAchievements(types: AchievementType[]): void
export function onUnlockedAchievements(cb: (types: AchievementType[]) => void): () => void
```

- `checkAchievements` вызывает RPC `check_achievements(p_user_id, p_game_id)` и возвращает **только новые** ачивки (`is_new === true`).
- `checkAchievementsForGame(game)` — обёртка с гейтингом: проверяет, что игра завершена, у победителя есть `userId` и он совпадает с текущим авторизованным пользователем, затем зовёт `checkAchievements`. Используется в `GameProvider` после успешного `autoSyncGame` (RPC читает строку игры из БД, поэтому порядок важен) и в `retryPendingSyncs` для игр, досинхронизированных позже.
- Ачивки получают **только авторизованные победители**: миграция 00011 отзывает дефолтный `EXECUTE` у `PUBLIC`/`anon`, а сама функция требует `p_user_id = auth.uid()`.
- `emitUnlockedAchievements` / `onUnlockedAchievements` — мост для ачивок за игру, синхронизированную позже: `retryPendingSyncs` работает из `PWAInit`, который в дереве компонентов лежит рядом с `GameProvider`, а не внутри, и до его состояния не дотягивается. Событие буферизуется, чтобы ачивка, выданная до подписки провайдера, не потерялась.

---

## Game Mapper

**Файл:** `lib/game-mapper.ts`

Единственное место, где строка таблицы `games` превращается в `Game` и обратно:

```typescript
export function mapDbGameToGame(row: DbGameRow): Game
export function mapGameToDbRow(game: Game, createdBy: string | null): DbGameUpsertRow
```

**Чтение (`mapDbGameToGame`):**

- `participants` / `history` хранятся в JSONB уже в клиентском формате — конвертируются только top-level поля.
- Полный ruleset per game не хранится (только nullable `ruleset_id`), поэтому восстановленные игры получают `ruleset: DEFAULT_RULESET`.
- Для старых строк без `current_player_index` индекс вычисляется как первый неэлиминированный игрок.

**Запись (`mapGameToDbRow`):**

- В строке **всегда присутствуют все колонки**. Это не косметика: PostgREST собирает `ON CONFLICT DO UPDATE` из ключей переданного объекта, поэтому разный набор ключей означает разное поведение upsert — именно так три прежние копии этой функции незаметно разошлись.
- `ruleset_id` — только валидный UUID, иначе `null` (клиентский `'classic'` в колонку типа uuid не лезет).
- `status: 'setup'` из клиентского типа отображается в `'active'`: в enum `game_status` такого значения нет.

Используется во всех путях чтения (`loadGamesFromSupabase`, `loadGameFromSupabase`, `app/history/[id]`) и в единственном пути записи в `lib/sync.ts`.

---

## Invite API

**Файл:** `lib/invite.ts`

```typescript
export function generateInviteLink(gameId: string): string
// → `${origin}/game/${gameId}?invite=true` (fallback: NEXT_PUBLIC_APP_URL)
// Параметр invite=true нигде не читается — зритель узнаётся по тому, что игры
// нет в его localStorage

export async function generateInviteQRCode(gameId: string): Promise<string>
// → data URL QR-кода (библиотека `qrcode`, 400px, error correction 'H')

export async function downloadQRCode(gameId: string, filename?: string): Promise<void>
export async function shareInviteLink(gameId: string, gameName?: string): Promise<boolean>
// Web Share API с fallback на clipboard

export async function copyInviteLink(gameId: string): Promise<boolean>
```

---

## Export API

**Файл:** `lib/export.ts`

```typescript
export function exportGameToCSV(game: Game): void
// CSV с секциями GAME SUMMARY / PLAYER STATISTICS / ACTION TIMELINE

export function exportGameToJSON(game: Game): void

export async function exportScreenshot(elementId: string, filename?: string): Promise<void>
// динамический импорт html2canvas

export async function shareGame(game: Game): Promise<boolean>
// Web Share API; false, если не поддерживается

export async function copyGameSummary(game: Game): Promise<boolean>
// текстовая сводка в буфер обмена
```

---

## Haptic API

**Файл:** `lib/haptic.ts`

```typescript
type HapticIntensity = 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error'

export function triggerHaptic(intensity: HapticIntensity = 'medium'): void
```

Обёртка над Vibration API (no-op, если не поддерживается). Плюс готовые пресеты:

```typescript
export const haptics = {
  swipeStart, swipeMove,          // light
  miss,                            // error
  pot,                             // medium
  potBlack,                        // success
  tap, success, warning, error,
  eliminated,                      // heavy
  victory,                         // спец-паттерн [50, 100, 50, 100, 100]
}
```

---

## Database Schema

**Миграции:** `supabase/migrations/00001–00014`. **Типы:** `lib/types/database.types.ts` (поддерживаются вручную, можно перегенерировать: `npx supabase gen types typescript --project-id YOUR_PROJECT_ID > lib/types/database.types.ts`).

### games

```sql
CREATE TABLE games (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status game_status NOT NULL DEFAULT 'active',      -- ENUM ('active','completed','abandoned')
    participants JSONB NOT NULL,                        -- Player[] в клиентском формате
    winner_id UUID,
    ruleset_id UUID REFERENCES rulesets(id) ON DELETE SET NULL,
    history JSONB DEFAULT '[]'::jsonb,                  -- GameHistoryEntry[]
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,

    CONSTRAINT valid_participants CHECK (jsonb_array_length(participants) >= 2),
    CONSTRAINT valid_history CHECK (jsonb_typeof(history) = 'array')
);
-- 00010:
ALTER TABLE games ADD COLUMN IF NOT EXISTS current_player_index INTEGER DEFAULT 0;
```

Индексы: `created_by`, `status`, `created_at DESC`. Таблица добавлена в publication `supabase_realtime` (00009). Триггер `update_games_updated_at` обновляет `updated_at`.

### player_profiles

```sql
CREATE TABLE player_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name TEXT NOT NULL,          -- 1..50 символов
    avatar_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### rulesets

```sql
CREATE TABLE rulesets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    description TEXT,
    params JSONB NOT NULL,               -- {starting_lives, miss, pot, pot_black, max_lives}
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_default BOOLEAN NOT NULL DEFAULT FALSE
);
```

Сид: «Classic Killer Pool» `{starting_lives: 3, miss: -1, pot: 0, pot_black: 1, max_lives: 6}` (`max_lives` обновлён с 10 до 6 миграцией 00011, в соответствии с клиентским `DEFAULT_RULESET`).

### user_achievements

```sql
CREATE TABLE user_achievements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  achievement_type TEXT NOT NULL,
  unlocked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  game_id UUID REFERENCES games(id) ON DELETE SET NULL,

  UNIQUE(user_id, achievement_type)
);
```

---

## RPC Functions

### get_leaderboard

**Миграция:** `00013_leaderboard_qualifying_minimum.sql` (v5, актуальная). `SECURITY DEFINER SET search_path = public, pg_temp`, `GRANT EXECUTE ... TO authenticated, anon`.

```sql
CREATE OR REPLACE FUNCTION get_leaderboard(
    limit_count INTEGER DEFAULT 15,
    min_games   INTEGER DEFAULT 3
)
RETURNS TABLE (
    player_id UUID,
    display_name TEXT,
    avatar_url TEXT,
    total_games BIGINT,
    games_won BIGINT,
    games_lost BIGINT,
    win_rate NUMERIC,
    total_actions BIGINT,
    total_black_pots BIGINT,
    rank INTEGER
)
```

Логика:

- Учитываются только игры со `status = 'completed'`.
- Игроки извлекаются из JSONB `participants`; группировка по стабильному идентификатору `COALESCE(userId участника, id участника)`. Создатель агрегируется по `userId`, остальные — по постоянному id из ростера устройства.
- **Клиентский JSON нигде не приводится к `uuid`.** Таблица `games` записывается анонимами, и до 00012 одна игра с некорректным id роняла RPC для всех пользователей. Сравнения идут текстом с `lower()`, единственный оставшийся `::uuid` защищён regex'ом, а участник без пригодного идентификатора просто выпадает из выдачи.
- Победы считаются по **уникальным играм**: игра, где один и тот же победивший участник перечислен пятьдесят раз, даёт одну победу, а не пятьдесят.
- `display_name`: имя из `player_profiles`, иначе имя участника из его самой свежей игры.
- В рейтинг попадают только сыгравшие не меньше `min_games` партий. Без порога разовый победитель со своими 100% стоит выше того, кто выиграл сорок из шестидесяти.
- Ранжирование: `win_rate DESC, games_won DESC, total_games DESC`, тай-брейк по идентификатору.
- `limit_count` и `min_games` клэмпятся: RPC доступен анонимам, а `NULL` в `LIMIT` означал бы «без ограничения».

Вызов с клиента (`components/leaderboard/leaderboard-list.tsx`):

```typescript
const { data, error } = await supabase.rpc('get_leaderboard', { limit_count: 15 })
```

> Сигнатура сменилась через `DROP FUNCTION` + создание заново: Postgres различает функции по имени и типам аргументов, поэтому добавление параметра создало бы вторую перегрузку, и вызов с одним аргументом продолжил бы попадать в старое тело.

### check_achievements

**Миграция:** `00011_fix_achievements_and_defaults.sql` (v2 — переписана целиком). `SECURITY DEFINER SET search_path = public`, `GRANT EXECUTE ... TO authenticated` (гостям недоступна).

```sql
CREATE OR REPLACE FUNCTION check_achievements(p_user_id UUID, p_game_id UUID)
RETURNS TABLE(achievement_type TEXT, is_new BOOLEAN)
```

Логика:

- Требует `p_user_id = auth.uid()` (иначе молча возвращает пусто) — начислить ачивки чужому пользователю нельзя; `EXECUTE` отозван у `PUBLIC`/`anon`.
- Читает игру `WHERE id = p_game_id AND status = 'completed'`; выходит, если игры/победителя нет.
- Ачивки получает **только победитель**, и только если победивший участник принадлежит вызывающему пользователю (`participants[].userId = p_user_id`). Все сравнения id — текстовые, а `::INTEGER`-касты защищены числовым regex (JSON пишется клиентами и может быть порченым).
- Считает статистику победителя: жизни, потерянные жизни, pot_black; суммарные победы, текущую серию побед и «социальные» игры (4+ игрока). Пер-пользовательские выборки префильтруются jsonb-containment (`participants @> ...`) под GIN-индекс `idx_games_participants_gin`.
- Проверяет все 10 типов: `first_win`, `wins_10`, `wins_25`, `wins_50`, `win_streak_3`, `win_streak_5`, `survivor` (победа с 1 жизнью), `perfect_game` (без потерь жизней; не выдаётся, если у записей истории победителя нет числовых `livesBefore`/`livesAfter`), `pot_black_master` (5+ pot black за игру), `social_player` (10 игр с 4+ игроками). Пороговые проверки через `>=` — milestone'ы выдаются ретроактивно при следующей победе.
- Вставляет анти-джойном (`INSERT ... SELECT ... WHERE NOT EXISTS`, гонка добита обработкой `unique_violation`) и возвращает только реально новые строки (`is_new = TRUE`).

Вызов с клиента (см. `lib/achievements.ts`):

```typescript
const { data, error } = await supabase.rpc('check_achievements', {
  p_user_id: userId,
  p_game_id: gameId,
})
```

---

## Row Level Security

### games (финальное состояние — 00009, ужесточено в 00014)

| Политика | Команда | Роли | Условие |
|----------|---------|------|---------|
| `games_select_all` | SELECT | anon, authenticated | `USING (true)` — публичное чтение для зрителей |
| `games_insert_authenticated` | INSERT | authenticated | `WITH CHECK (created_by = auth.uid())` |
| `games_insert_anon` | INSERT | anon | `WITH CHECK (created_by IS NULL)` |
| `games_update_authenticated` | UPDATE | authenticated | `USING` и `WITH CHECK`: `created_by = auth.uid()` |
| `games_update_anon` | UPDATE | anon | `USING (created_by IS NULL AND (status <> 'completed' OR updated_at > now() - interval '1 hour'))`, `WITH CHECK (created_by IS NULL)` |
| `games_delete_authenticated` | DELETE | authenticated | `USING (created_by = auth.uid())` |

Две вещи, о которые легко споткнуться при отладке политик (обе зафиксированы тестами в `supabase/test/rls-policies.sql`):

- обычный `UPDATE`, не прошедший `USING`, **не поднимает ошибку** — он меняет ноль строк; upsert в той же ситуации падает с `42501`;
- `WITH CHECK` INSERT-политики применяется к предлагаемой строке и в ветке `DO UPDATE` любого upsert, поэтому условие по статусу в `games_insert_anon` заблокировало бы и обычный ход хоста.

### user_achievements (после миграции 00011)

- Осталась одна политика: `"Users can view all achievements"` (SELECT `USING (true)`).
- INSERT-политик **нет** — запись возможна только через RPC `check_achievements` (`SECURITY DEFINER` обходит RLS). Политики `"Service role can insert achievements"` и `"Users can view own achievements"` удалены (первая была чит-вектором: позволяла любому authenticated-пользователю вставлять себе произвольные ачивки).

### player_profiles / rulesets (миграция 00001)

- `player_profiles`: SELECT для всех; INSERT/UPDATE/DELETE — только своя запись (`auth.uid() = user_id`; INSERT также допускает `user_id IS NULL`).
- `rulesets`: SELECT для всех; INSERT — authenticated.

---

## Error Handling

Соглашение в кодовой базе: функции `lib/*` **не бросают** ошибки наружу при сбоях сети/БД — логируют в консоль и возвращают безопасное значение (`false`, `[]`, `null` или `{ success: false, error }`). Исключения бросают: `applyAction`/`addPlayerToGame` (невалидное состояние игры), `useGame` вне провайдера, фабрики Supabase-клиентов без env-переменных, а также `generateInviteQRCode`/`downloadQRCode` (`lib/invite.ts`) и `exportScreenshot` (`lib/export.ts`) — их вызывающие обязаны ловить ошибки сами.

### Частые коды ошибок Supabase/PostgREST

| Code | Описание |
|------|----------|
| `PGRST116` | Row not found (`.single()` без результата) |
| `23505` | Unique constraint violation |
| `42501` | Permission denied (RLS) |
| `23503` | Foreign key violation |

---

## Полезные ссылки

- [Supabase JavaScript Client](https://supabase.com/docs/reference/javascript/introduction)
- [Supabase Auth](https://supabase.com/docs/guides/auth)
- [Supabase Realtime — postgres_changes](https://supabase.com/docs/guides/realtime/postgres-changes)
- [Row Level Security](https://supabase.com/docs/guides/auth/row-level-security)

---

**Документ обновлен:** 2026-08-11
