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
- [Host Secret API](#host-secret-api)
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
- **Offline-tolerant** — завершённая или брошенная игра выгружается через `syncFinishedGame()`: она встаёт в localStorage-очередь `killerpool_pending_sync` **до** попытки и снимается только после подтверждённой записи. Остаток догоняет `retryPendingSyncs()` (вызывается из `components/pwa-init.tsx` при монтировании, на событиях `online` и `visibilitychange`, и кнопкой Sync на `/history`).
- **Live sharing без broadcast** — хост через `enableSharing()` upsert'ит полную строку игры в таблицу `games` на каждое новое состояние (`syncActiveGameToSupabase`), зрители подписаны на `postgres_changes` UPDATE по `id` игры. Хост на свою строку не подписан. Broadcast-каналов и presence нет.
- **Секрет хоста** — каждая запись игры, начатой на этом устройстве, уходит с заголовком `x-host-secret`, а строка хранит его SHA-256 (миграция 00016, [Host Secret API](#host-secret-api)): гостевую игру с хешем зритель переписать не может.

Переменные окружения: `NEXT_PUBLIC_SUPABASE_URL` и `NEXT_PUBLIC_SUPABASE_ANON_KEY` (обязательные), `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SENTRY_DSN` (необязательные) и сборочный `SENTRY_AUTH_TOKEN`. Системные переменные Vercel, которые читает код: `NEXT_PUBLIC_VERCEL_URL` (`lib/site.ts`), `NEXT_PUBLIC_VERCEL_ENV` и `VERCEL_ENV` (гейт Sentry). Service-role ключ не используется.

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

Методы входа (форма — `app/auth/auth-form.tsx`, серверная обёртка — `app/auth/page.tsx`): **Google OAuth (PKCE)** и **Magic Link**. Email/password-входа в приложении нет.

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

**Файл:** `app/auth/callback/route.ts` — единственный route handler в приложении.

```typescript
export async function GET(request: Request): Promise<NextResponse>
```

- Нет `code` или пришёл `?error=` от провайдера → редирект на `/auth?error=<код>`.
- `exchangeCodeForSession(code)` вернул ошибку или бросил → тоже `/auth?error=<код>`.
- Успех → редирект на `/`. Параметр `next`/`redirect_to` не читается, open redirect невозможен.

Коды (`app/auth/auth-errors.ts`):

```typescript
export type AuthErrorCode = 'cancelled' | 'link_expired' | 'other_browser' | 'callback_failed'
export const AUTH_ERROR_PARAM = 'error'

export function classifyAuthError(input: { errorCode?: string | null; error?: string | null }): AuthErrorCode
export function getAuthErrorMessage(code: string | null | undefined): string | null
```

`classifyAuthError` смотрит сначала на машинный `error_code` Supabase (`otp_expired`/`flow_state_expired` → `link_expired`, `flow_state_not_found`/`bad_code_verifier` → `other_browser`), потом на OAuth-параметр `error` (`access_denied` → `cancelled`); остальное — `callback_failed`. В URL уходит только код, а не текст провайдера: свободный `?error=` позволил бы любой ссылке написать на странице входа что угодно. `getAuthErrorMessage` возвращает `null` на неизвестный код.

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

### MAX_PLAYERS

```typescript
export const MAX_PLAYERS = 32
```

Предел игроков в одной игре, выбывшие тоже считаются. Совпадает с CHECK `games_participants_max` (миграция 00015): база отвергает строку с большим числом участников окончательно, такая игра никогда бы не выгрузилась, поэтому её не дают даже начать. Форма новой игры и экран игры отключают добавление сверх предела и показывают это.

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
  userId?: string | null,
  createdBy: string | null | undefined = userId
): Game
```

Бросает `'A game can have at most 32 players'`, если игроков больше `MAX_PLAYERS`.

**`userId`** получает **только помеченный игрок** (`isOwner`), а не первый по счёту. Позиция ничего не значит: форма умеет перемешивать строки и отбрасывает безымянные, поэтому раньше личность создателя доставалась случайному игроку — вместе с его ачивками и местом в лидерборде. Без метки происходит откат на индекс 0, чтобы старые вызовы и тесты продолжали работать. Остальные игроки создаются с `userId = null` и агрегируются в лидерборде по `participants[].id` — постоянному id из ростера устройства.

**`createdBy`** уходит в `Game.createdBy` и по умолчанию равен `userId`. Они расходятся, когда «это я» не отмечен никто: форма передаёт `userId = null`, но `createdBy` — всё равно uid аккаунта или guest-UUID, и по нему выгрузка решает, каким аккаунтом можно писать игру (`rowOwner` в [Sync API](#sync-api)).

```typescript
// app/game/new/page.tsx
const userId = currentUserId || getGuestId()   // currentUserId из useGame()
const game = createGame(entries, DEFAULT_RULESET, meRowId === null ? null : userId, userId)
```

### applyAction

Применяет действие к **текущему** игроку (игрок берётся из `game.currentPlayerIndex`, отдельного параметра `playerId` нет):

```typescript
export function applyAction(game: Game, action: GameAction): Game
```

Бросает `'Game is not active'` на завершённой или брошенной игре и `'Invalid player state'`, если текущий игрок уже выбыл. Первая проверка нужна не для красоты: без неё промах последнего выжившего обнулял список активных, сбрасывал победителя и возвращал игру в `active` без единого игрока.

Внутри: считает изменение жизней по `game.ruleset.params[action]`, ограничивает сверху `max_lives` (fallback 6), элиминирует игрока при `lives <= 0`, добавляет запись в `history`, передаёт ход следующему активному игроку, при одном оставшемся игроке ставит `status: 'completed'` и `winnerId`. Смена хода и изменение жизней — приватные детали реализации (`findNextActivePlayer` не экспортируется).

### Селекторы

```typescript
export function getCurrentPlayer(game: Game): Player | undefined
export function getActivePlayers(game: Game): Player[]
export function getNextPlayers(game: Game, count: number = 2): Player[]
export function getWinner(game: Game): Player | undefined
export function getSortedPlayers(game: Game): Player[]   // активные, затем выбывшие
```

`getWinner` возвращает игрока только если `game.status === 'completed'` и задан `winnerId`. Статистика по игре считается на страницах (`app/stats/compute-stats.ts`, детали игры в `app/history/[id]`), отдельной функции в `game-logic.ts` нет.

### undoLastAction

```typescript
export function undoLastAction(game: Game): Game
```

Откатывает последнюю запись `history`: восстанавливает жизни и `eliminated`-статус игрока, возвращает ему ход, пересчитывает `winnerId`/`status`. Работает и на завершённой игре — так отменяется победа с экрана победителя: игра возвращается в `active`.

### abandonGame

```typescript
export function abandonGame(game: Game): Game
```

Заканчивает игру без победителя: `status: 'abandoned'` и свежий `updatedAt`, игроки и история сохраняются. Бросает `'Only an active game can be abandoned'` для неактивной игры.

### addPlayerToGame

```typescript
export function addPlayerToGame(
  game: Game,
  playerName: string,
  playerAvatar: string,
  playerId?: string     // id из ростера
): Game
```

Добавляет игрока в активную игру с минимальным количеством жизней среди активных игроков; `userId` у него всегда `null`. Бросает ошибку, если игра не `active`, активных игроков нет, такой id уже есть среди участников или в игре уже `MAX_PLAYERS` игроков (выбывшие остаются в строке и считаются).

---

## TypeScript Types

**Файл:** `lib/types.ts`

### GameAction / GameStatus

```typescript
export type GameAction = 'miss' | 'pot' | 'pot_black'
export type GameStatus = 'setup' | 'active' | 'completed' | 'abandoned'
```

Действия — **lowercase-строки**, они же ключи `ruleset.params`. В UI: свайп влево = `miss`, вправо = `pot`, вверх = `pot_black`, либо кнопки Miss / Black / Pot и стрелки ← ↑ → (`components/game/swipeable-player-card.tsx`). Подписи, иконки и цвета ходов — `ACTION_STYLES` в `components/game/action-styles.ts`.

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
  /** Кто создал игру: uid аккаунта или guest-UUID устройства (getGuestId).
   *  Решает, каким аккаунтом её можно выгрузить (rowOwner в lib/sync.ts).
   *  У игры, загруженной из Supabase, — created_by строки. */
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

Также экспортируются: `NewGamePlayerInput` (см. [createGame](#creategame)), `DEFAULT_AVATARS` (16 emoji), `ACHIEVEMENTS` (10 определений).

---

## Storage API (localStorage)

**Файл:** `lib/storage.ts`

Работает **только с localStorage / sessionStorage** — никакого Supabase-fallback внутри нет (синк с Supabase — отдельный слой, см. [Sync API](#sync-api)). Все функции глотают ошибки (`try/catch` + `console.error`) и возвращают безопасные значения.

**Ключи:**

| Ключ | Назначение |
|------|-----------|
| `killerpool_current_game` | текущая игра |
| `killerpool_game_history` | история завершённых и брошенных игр (до 50) |
| `killerpool_guest_id` | стабильный UUID гостя |
| `killerpool_rematch_players` | игроки для реванша (**sessionStorage**) |
| `killerpool_pending_sync` | ID игр, чья выгрузка не подтверждена (простой массив строк) |
| `killerpool_pending_sync_meta` | попытки и время по каждому ID из очереди — отдельным ключом, чтобы старый бандл из кеша SW мог дренировать очередь |
| `killerpool_deleted_games` | надгробия удалённых игр (`{ id, deletedAt }`, год, до 200), чтобы merge не вернул их из Supabase |
| `killerpool_roster` | игроки этого устройства: постоянный id за именем |
| `killerpool_shared_game` | id текущей игры, если она транслируется зрителям |
| `killerpool_host_secrets` | секреты хоста `{ [gameId]: secret }`, последние 50 (пишет `lib/host-secret.ts`, а не `storage.ts`; см. [Host Secret API](#host-secret-api)) |
| `killerpool-theme` | выбранная тема (`light` / `dark` / `system`); читается инлайн-скриптом в `<head>` до гидрации (`components/theme.ts`) |

### Текущая игра

```typescript
export function saveCurrentGame(game: Game): void
export function loadCurrentGame(): Game | null
export function clearCurrentGame(): void              // снимает и отметку шаринга

export function markCurrentGameShared(gameId: string): void
export function isCurrentGameShared(gameId: string): boolean
```

Отметка шаринга хранится отдельным ключом с id игры. Без неё перезагрузка молча обрывала трансляцию: хост играл дальше, а у зрителей экран замирал на последнем ходе до перезагрузки. Ключ по id — чтобы отметка, оставшаяся от прошлой игры, не применилась к новой; отдельный ключ — чтобы сохранённая игра не меняла формы, которую читает старый бандл.

### История игр

```typescript
export const MAX_HISTORY_GAMES = 50
export function saveGameHistory(games: Game[]): void   // единственный писатель ключа истории, режет до 50
export function saveToHistory(game: Game): void        // completed или abandoned, остальные игнорируются
export function loadGameHistory(): Game[]              // свежая копия, её можно менять

// Стор для useSyncExternalStore (страница /history)
export const HISTORY_CHANGE_EVENT = 'killerpool-history-change'
export function subscribeToGameHistory(onChange: () => void): () => void
export function readGameHistorySnapshot(): readonly Game[]
export function getGameFromHistory(gameId: string): Game | null
export function deleteGameFromHistory(gameId: string): void
```

`saveToHistory` пишет игру в начало списка; статусы, кроме `completed` и `abandoned`, игнорируются. Брошенные игры раньше отбрасывались здесь же, и досрочное окончание стирало игру бесследно; победителя у них нет, ачивки и лидерборд по-прежнему считают только `completed`. Запись с тем же `id` **заменяется**, а не дублируется: одна и та же игра может завершиться дважды, если отменить победу и доиграть. Она же снимает надгробие — явное добавление важнее прежнего удаления.

`saveGameHistory` после записи шлёт в своё окно событие `HISTORY_CHANGE_EVENT` (браузерное `storage` доходит только до других вкладок); `subscribeToGameHistory` слушает оба. `readGameHistorySnapshot` возвращает один и тот же массив, пока сохранённая строка не изменилась — иначе `useSyncExternalStore` перерисовывал бы бесконечно, — поэтому снимок нельзя мутировать: для изменений есть `loadGameHistory`.

`deleteGameFromHistory` ставит надгробие и убирает игру из очереди синка: без надгробия следующий `mergeGamesWithSupabase` вернул бы её из облака, потому что там `updated_at` всегда свежее.

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

### Надгробия

```typescript
export function getDeletedGameIds(): Set<string>
export function markGameDeleted(gameId: string): void
export function clearGameDeleted(gameId: string): void
```

### Очередь выгрузки

```typescript
export function getPendingSyncIds(): string[]
export function markPendingSync(gameId: string): void     // до попытки, а не после неудачи
export function unmarkPendingSync(gameId: string): void   // снимает и метаданные попыток

export const MAX_SYNC_AGE_MS = 14 * 24 * 60 * 60 * 1000   // 14 дней с первой неудачи
export const BACKOFF_BASE_MS = 60_000                     // 1 минута
export const BACKOFF_MAX_MS = 6 * 60 * 60 * 1000          // 6 часов

export interface PendingSyncMeta {
  attempts: number
  firstFailedAt: number
  lastAttemptAt: number
  permanent?: boolean   // ставили старые бандлы при отказе; учитывается до сих пор
}

export function recordSyncFailure(gameId: string, now = Date.now()): void
export function isSyncExhausted(gameId: string, now = Date.now()): boolean
export function isSyncBackedOff(gameId: string, now = Date.now()): boolean
export function clearSyncMeta(gameId: string): void
```

`isSyncExhausted` — старая отметка `permanent` или больше 14 дней с первой неудачи. `isSyncBackedOff` — пауза `BACKOFF_BASE_MS × 2^(attempts−1)`, но не больше шести часов; без неё `retryPendingSyncs` ходил в сеть за каждой игрой очереди при каждом переключении вкладки. ID без записи метаданных (его положил старый бандл или попытка ещё не провалилась) не считается ни исчерпанным, ни отложенным.

Прежний предел в пять попыток при базе в минуту означал отказ примерно через четверть часа: телефон, проведший вечер офлайн, терял все игры вечера, а два длинных предела так и не достигались.

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

### Исход записи

```typescript
export type SyncFailure = 'retry' | 'refused' | 'other-account'

export type UpsertOutcome =
  | { ok: true }
  | { ok: false; failure: SyncFailure; message: string }
```

- `'retry'` — стоит повторить: офлайн, 5xx, истёкший токен, не удалось узнать, кто вошёл;
- `'refused'` — сервер откажет снова, повторять бессмысленно;
- `'other-account'` — игра принадлежит аккаунту, который сейчас не вошёл. Записать её анонимно значило бы отказаться от неё, а выбросить — потерять; поэтому она ждёт.

Окончательные коды — `PERMANENT_ERROR_CODES` в `lib/sync.ts`. Postgres: `42501` (RLS), `42703`, `22P02`, `22001`, `22003`, `22007`, `22008`, `23502`, `23503`, `23505`, `23514` (в том числе CHECK-ограничения 00015). PostgREST: `PGRST204` (колонки нет в схеме — клиент новее базы; раньше такой отказ повторялся как сетевой) и `PGRST102` (битое тело запроса). Всё остальное повторяется.

### Общий писатель

Все записи в `games` идут через две внутренние функции:

- **`upsertGameRow`** — узнаёт, кто вошёл (`getUser` один раз за сессию; кеш сбрасывается на смену аккаунта, неудачный ответ не кешируется), выбирает `created_by` через `rowOwner`, при необходимости заводит `player_profiles` (один раз на аккаунт, `ignoreDuplicates` — своё имя не перезаписывается), собирает строку `mapGameToDbRow` (`lib/game-mapper.ts`) и классифицирует ошибку. Ошибка `getUser`, кроме «сессии нет», — `'retry'`: принять её за гостя значило бы отправить игру без владельца и получить окончательный `42501`.

  Секрет хоста (00016): если у игры есть секрет (`getHostSecret(game.id)`), в строку идёт `host_secret_hash = hashHostSecret(secret)`, а сам секрет — заголовком `x-host-secret` через `.setHeader()` на этот запрос (браузерный клиент общий, а секрет принадлежит одной игре). Заголовок уходит, даже если хеш посчитать не удалось: на строку без хеша он не влияет. Ответ `PGRST204` с `host_secret_hash` в сообщении значит, что база старше 00016 или PostgREST ещё не перечитал схему: запись **один раз** повторяется без колонки (в консоли `[sync] games has no host_secret_hash column yet, writing without it`) — игра уходит без защиты, но не теряется. Любая другая неизвестная колонка — по-прежнему окончательный `PGRST204`.
- **`writeGameRow`** — на одну игру в полёте не больше одной записи; пришедшие за это время ждут, и уходит только последнее ожидающее состояние (каждая запись — полная строка). Ожидавшие получают исход той записи, которая их заменила. Раньше записи ходов расшаренной игры могли лечь в базу не по порядку.

**`rowOwner`** решает по `Game.createdBy`, а не по тому, кто вошёл в момент записи. Гостевая игра этого устройства (guest-UUID, старый `guest_…` или пусто) пишется с `created_by` текущего входа: анонимно — `NULL`, а первый INSERT после входа законно её усыновляет. Любой другой создатель — uid аккаунта, и писать игру может только он; иначе исход `'other-account'`.

Раньше таких мест записи было три, с разными наборами колонок — а поскольку PostgREST строит `ON CONFLICT DO UPDATE` по ключам переданного объекта, различающийся набор менял и поведение upsert.

### syncFinishedGame

```typescript
export async function syncFinishedGame(game: Game): Promise<UpsertOutcome>
```

Выгрузка завершённой (`completed`) или брошенной (`abandoned`) игры, для вошедших и гостей. Иной статус — сразу `{ ok: false, failure: 'refused' }`. Игра ставится в очередь **до** попытки, поэтому вкладка, закрытая посреди запроса, не теряет её. Дальше по исходу: успех или `'refused'` — снять с очереди; `'other-account'` — оставить в очереди и сбросить счётчик попыток (ничего не отправлялось, часы начнут идти, когда владелец вернётся); `'retry'` — `recordSyncFailure`. Вызывается конвейером завершения в `GameProvider` и при брошенной игре.

### syncActiveGameToSupabase

```typescript
export function syncActiveGameToSupabase(game: Game): Promise<UpsertOutcome>
```

Запись текущего состояния игры любого статуса — для live sharing, где зрители следят за строкой, и для отката выгруженной победы после Undo. В очередь **не** ставится: следующее состояние всё равно заменит это, а финальное уходит через `syncFinishedGame`.

### retryPendingSyncs

```typescript
export async function retryPendingSyncs(): Promise<void>
```

Дренирует `killerpool_pending_sync`. No-op на сервере, при `navigator.onLine === false` и если уже выполняется. Вызывается из `components/pwa-init.tsx` (при монтировании, на `online`, на `visibilitychange` при видимой вкладке и сети) и кнопкой Sync на `/history`. Background Sync API **не используется**.

Для каждого id: исчерпанный — выбросить; ещё в отсрочке — пропустить; первая попытка ещё в полёте — пропустить; игры нет в истории — выбросить; это текущая игра, и она снова `active` (победу отменили) — пропустить, её итог выгрузится, когда игра закончится; иначе записать и разобрать исход так же, как `syncFinishedGame`. Ачивки за успешно досинхронизированную игру отправляет событием `emitUnlockedAchievements`, потому что вызывается из `PWAInit`, а он вне `GameProvider`.

### Чтение и слияние

```typescript
export async function loadGamesFromSupabase(): Promise<Game[]>    // только для вошедших, фильтр created_by = user.id
export async function mergeGamesWithSupabase(): Promise<void>     // merge по updatedAt, максимум 50 игр
export async function isSupabaseAvailable(): Promise<boolean>     // фактически «вошёл ли пользователь»
```

`mergeGamesWithSupabase` скачивает игры пользователя и сливает с локальной историей по `updatedAt`, пропуская те, у которых стоит надгробие. Игры, удалённые из истории, иначе возвращались бы при каждом слиянии: сервер ставит `updated_at = now()` на каждую запись (триггер `games_server_timestamps`, 00015), поэтому облачная копия заведомо свежее локальной.

Массовой выгрузки всей истории нет: `syncAllGamesToSupabase` удалена вместе со страницей `/sync`. Всё, что не выгрузилось, лежит в очереди, и её дренирует `retryPendingSyncs` — в том числе с кнопки Sync на `/history`.

---

## Host Secret API

**Файл:** `lib/host-secret.ts` (миграция `00016_host_secret.sql`)

Что отличает устройство, на котором идёт гостевая игра, от всех остальных, кто знает её id: ссылка-приглашение — это только id, строку читает кто угодно, а у гостя нет аккаунта.

```typescript
export const HOST_SECRET_HEADER = 'x-host-secret'   // заголовок, который читает games_update_anon
export const MAX_HOST_SECRETS = 50                   // сколько секретов хранится, старые вытесняются

export function createHostSecret(gameId: string): string | null
export function getHostSecret(gameId: string): string | null
export async function hashHostSecret(secret: string): Promise<string | null>
```

- **`createHostSecret`** — 32 случайных байта (`crypto.getRandomValues`) в виде 64 hex-символов, в localStorage `killerpool_host_secrets` как `{ [gameId]: secret }`. Его вызывает `GameProvider.startGame` до первой записи игры. Существующий секрет возвращается как есть: строка хранит хеш, с которым её вставили, и новый секрет запер бы хоста. `null`, если секрет не сохранить (нет источника случайности, localStorage недоступен или переполнен) — тогда игра уходит без хеша, а не с хешем, секрет которого пропадёт после перезагрузки.
- **`getHostSecret`** — секрет игры, начатой на этом устройстве, иначе `null` (чужая игра, игра старого бандла, секрет вытеснен). Значения не из 64 hex-символов при чтении отбрасываются.
- **`hashHostSecret`** — `hex(sha256(secret))`, ровно то, что считает политика: `encode(sha256(convert_to(secret, 'UTF8')), 'hex')`. `null`, где нет `crypto.subtle` (его дают только secure context: https или localhost) или digest упал.

Секрет никогда не попадает в объект `Game`: тот пишется в базу, хранится в истории, экспортируется и показывается зрителям. Хранятся последние 50 секретов: гостевая игра записываема сутки (00015), дольше секрет не нужен.

---

## Realtime API

**Файл:** `lib/realtime.ts`

Realtime построен на **postgres_changes** и нужен только зрителям: хост — единственный писатель своей игры (каждое состояние уходит через `lib/sync.ts` полной строкой) и из своей строки узнать ему нечего. Функций `broadcastGameAction` и `updateGameStatus` в коде нет.

### subscribeToGame

```typescript
export function subscribeToGame(
  gameId: string,
  onUpdate: (game: Game) => void,
  onStatus?: (connected: boolean) => void
): RealtimeChannel | null
```

Создаёт канал с топиком `game:{gameId}:{n}` — свой номер на каждую подписку — и подписку на `postgres_changes` (`event: 'UPDATE'`, `table: 'games'`, `filter: id=eq.{gameId}`). Каждый UPDATE проходит через `mapDbGameToGame` — тот же маппер, что и обычный SELECT, поэтому realtime-обновление и свежая загрузка не могут понять строку по-разному. `onStatus` отражает реальный статус подписки (`true` только при `SUBSCRIBED`) — наличие объекта канала ещё не значит подписку.

Уникальный топик нужен потому, что realtime-js на повторный запрос того же топика отдаёт уже существующий канал, а `removeChannel` асинхронен: повторная подписка на ту же игру (StrictMode в dev, уход и возврат зрителя) получала старый канал — подписанный (`.on()` бросает «cannot add postgres_changes callbacks after subscribe()») или наполовину отписанный (`subscribe()` ничего не делает), и realtime молча останавливался. Имя топика для `postgres_changes` ничего не значит, строку выбирает фильтр.

### unsubscribeFromGame

```typescript
export async function unsubscribeFromGame(channel: RealtimeChannel | null): Promise<void>
```

---

## Realtime Hooks

**Файл:** `hooks/use-realtime-game.ts`

### useRealtimeGame

```typescript
interface UseRealtimeGameOptions {
  onGameUpdate: (game: Game) => void
  /** true, когда канал подписан, false — когда нет */
  onStatus?: (connected: boolean) => void
}

export function useRealtimeGame(gameId: string | null, options: UseRealtimeGameOptions): void
```

Следит за строкой игры, которую ведёт кто-то другой; `null` — не следить. Подписка принадлежит эффекту: открывается и закрывается вместе с ним, поэтому двойной прогон StrictMode и смена игры получают каждый свой канал. Колбэки хранятся в ref'ах, новая их идентичность подписку не пересоздаёт. Канал, который уже удаляется, ещё может что-то доставить — после очистки эффекта такие сообщения игнорируются. Используется `GameProvider` в режиме зрителя.

---

## GameContext API

**Файл:** `contexts/game-context.tsx`

Глобальное состояние игры. `GameProvider` оборачивает приложение; доступ — через хук `useGame()` (бросает ошибку вне провайдера).

```typescript
export type ResultSyncState = 'saving' | 'saved' | 'retrying' | 'refused' | 'other-account'

interface GameContextValue {
  game: Game | null
  isLoading: boolean
  isSpectatorMode: boolean
  isSharingEnabled: boolean
  /** Вошедший аккаунт: undefined, пока сессия не прочитана; null у гостя */
  currentUserId: string | null | undefined
  /** Исход выгрузки завершённой игры на экране; null — её нет, или это зритель */
  resultSync: ResultSyncState | null
  newAchievements: AchievementType[]
  dismissAchievement: () => void
  startGame: (game: Game) => void
  performAction: (action: GameAction) => void
  undoAction: () => void
  endGame: () => void
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

- **Персист:** игра сохраняется в localStorage на каждое изменение (кроме spectator mode); после гидрации восстанавливается активная игра, а вместе с ней — шаринг, если `isCurrentGameShared(id)`. Это чтение — единственное оставшееся предупреждение `react-hooks/set-state-in-effect` (обоснование — в `eslint.config.mjs`): игра — собственное состояние провайдера, а первый клиентский рендер обязан совпасть с серверным, где хранилища нет.
- **currentUserId:** следует за `onAuthStateChange` (первое значение приносит `INITIAL_SESSION`): вход, выход и смена аккаунта в другой вкладке видны сразу. До чтения сессии — `undefined`, у гостя — `null`. Его читают `/game/new` (под кем создаётся игра), `/game/[id]` («это я выиграл?», какие плашки показывать) и главная (Sign In или Profile); раньше эти страницы спрашивали `getUser()` сами, а главная ещё и держала свою подписку на auth. Под кем уходит запись, решает не он, а кеш личности в `lib/sync.ts`, сверенный с сервером.
- **Завершение игры:** когда `status` становится `'completed'` (один раз на завершение): `saveToHistory(game)` → `syncFinishedGame(game)` → исход в `resultSync` → при успехе `checkAchievementsForGame(game)`; новые ачивки попадают в `newAchievements` и показываются тостами (`dismissAchievement` убирает первую из очереди). Тосты рендерит сам провайдер, поэтому ачивка, пришедшая после ухода с экрана победителя, тоже видна. `resultSync` — `'saving'`, пока исход именно этого завершения неизвестен.
- **performAction / undoAction / addPlayer:** применяют чистую функцию из `lib/game-logic.ts`; в режиме зрителя ничего не делают. Синк при шаринге — не в них, а в эффекте, который отправляет каждое новое состояние (кроме `completed` — его пишет конвейер завершения).
- **undoAction на завершённой игре:** победа отменяется, игра снова `active`, конвейер завершения перевзводится. Если он уже отработал для этой игры (победа могла уйти в Supabase) и шаринга нет, откатившееся состояние уходит в строку через `syncActiveGameToSupabase` — при шаринге его и так отправляет эффект шаринга.
- **startGame(game):** делает игру текущей, сбрасывает шаринг и режим зрителя и создаёт её секрет хоста (`createHostSecret`, до первой записи). Идущая игра, если была, уходит в `abandoned` (см. **endGame()** ниже).
- **enableSharing():** записывает игру в Supabase, ставит `markCurrentGameShared` и включает шаринг; возвращает `false`, если игры нет, это зритель или запись не удалась; идемпотентна. Invite modal показывает ссылку и QR только при `isSharingEnabled`: первая строка с данным id задаёт хеш секрета (00016), и ссылка, отданная до первой записи, позволила бы кому-то вставить строку раньше хоста.
- **setSpectatorGame(game):** включает spectator mode без записи в localStorage. Подписка следует из режима: `useRealtimeGame(spectatedGameId)`; при каждом переходе канала в `SUBSCRIBED` строка догружается SELECT'ом, если за это время не пришло realtime-обновление.
- **clearSpectatorGame():** выходит из режима зрителя и возвращает в память собственную активную игру зрителя (и её шаринг), если она есть.
- **loadGameFromSupabase(gameId):** SELECT игры по id + `mapDbGameToGame` (для зрителей, открывших ссылку-приглашение).
- **endGame():** активную игру переводит в `'abandoned'` и сохраняет в историю (если в ней был хотя бы один ход или она может быть в Supabase), при необходимости выгружает через `syncFinishedGame`, затем очищает `killerpool_current_game` и отметку шаринга. В режиме зрителя ничего не делает. **startGame()** поверх идущей игры поступает с ней так же.

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
export async function checkAchievementsForGame(game: Game): Promise<AchievementType[]>
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
- `checkAchievementsForGame(game)` — обёртка с гейтингом: проверяет, что игра завершена, у победителя есть `userId` и он совпадает с текущим авторизованным пользователем, затем зовёт `checkAchievements`. Используется в `GameProvider` после успешного `syncFinishedGame` (RPC читает строку игры из БД, поэтому порядок важен) и в `retryPendingSyncs` для игр, досинхронизированных позже.
- Ачивки получают **только авторизованные победители**: миграция 00011 отзывает дефолтный `EXECUTE` у `PUBLIC`/`anon`, а сама функция требует `p_user_id = auth.uid()` и (с v3, 00015) `created_by = p_user_id` у игры — значит, гостевая игра, сыгранная до входа и усыновлённая потом, ачивок не даёт.
- `emitUnlockedAchievements` / `onUnlockedAchievements` — мост для ачивок за игру, синхронизированную позже: `retryPendingSyncs` работает из `PWAInit`, который в дереве компонентов лежит рядом с `GameProvider`, а не внутри, и до его состояния не дотягивается. Событие буферизуется, чтобы ачивка, выданная до подписки провайдера, не потерялась.

---

## Game Mapper

**Файл:** `lib/game-mapper.ts`

Единственное место, где строка таблицы `games` превращается в `Game` и обратно:

```typescript
export function mapDbGameToGame(row: DbGameRow): Game
export function mapGameToDbRow(
  game: Game,
  createdBy: string | null,
  hostSecretHash: string | null = null
): DbGameUpsertRow
```

**Чтение (`mapDbGameToGame`):**

- `participants` / `history` хранятся в JSONB уже в клиентском формате — конвертируются только top-level поля.
- Полный ruleset per game не хранится (только nullable `ruleset_id`), поэтому восстановленные игры получают `ruleset: DEFAULT_RULESET`.
- Для старых строк без `current_player_index` индекс вычисляется как первый неэлиминированный игрок.

**Запись (`mapGameToDbRow`):**

- В строке **всегда присутствуют все колонки**. Это не косметика: PostgREST собирает `ON CONFLICT DO UPDATE` из ключей переданного объекта, поэтому разный набор ключей означает разное поведение upsert — именно так три прежние копии этой функции незаметно разошлись.
- `ruleset_id` — только валидный UUID, иначе `null` (клиентский `'classic'` в колонку типа uuid не лезет).
- `status: 'setup'` из клиентского типа отображается в `'active'`: в enum `game_status` такого значения нет.
- Исключение из «всех колонок» — `host_secret_hash`: ключ есть, только если передан `hostSecretHash` (игра, для которой у устройства есть секрет хоста). Без него строка ровно та, что слали клиенты до 00016. В `SET` апсерта колонка ничего не меняет — триггер `games_keep_host_secret` возвращает хеш, с которым строку вставили.

Обратно (`mapDbGameToGame`) `host_secret_hash` не читается: в объекте `Game` его нет.

Используется во всех путях чтения (`loadGamesFromSupabase`, `loadGameFromSupabase`, `app/history/[id]`), в realtime-обработчике `subscribeToGame` и в единственном пути записи в `lib/sync.ts`. `created_at`/`updated_at` клиент по-прежнему отправляет, но с 00015 их выставляет сервер (триггер `games_server_timestamps`).

---

## Invite API

**Файл:** `lib/invite.ts`

```typescript
export function generateInviteLink(gameId: string): string
// → `${window.location.origin}/game/${gameId}?invite=true`
// (вне браузера: NEXT_PUBLIC_APP_URL || 'https://killerpool.app')
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

export async function exportScreenshot(elementId: string, filename?: string): Promise<void>
// PNG элемента (или body) в масштабе 2×; html2canvas-pro импортируется динамически

export async function shareGame(game: Game): Promise<boolean>
// Web Share API; false, если не поддерживается или пользователь отменил

export async function copyGameSummary(game: Game): Promise<boolean>
// текстовая сводка в буфер обмена
```

JSON-экспорта нет (`exportGameToJSON` удалён). Исход экспорта страница деталей показывает под кнопками в live-регионе, без `alert()`: ошибку CSV или скриншота (`role="alert"`) и сообщение, что сводка скопирована в буфер, когда Web Share недоступен (`role="status"`). Скриншот делает `html2canvas-pro`, а не `html2canvas`: Tailwind 4 отдаёт палитру как `oklch()`, а модификаторы прозрачности — как `color-mix()`, и браузер возвращает их в computed styles как `oklch()`/`oklab()`. `html2canvas` 1.4.1 понимает только `rgb()` и `hsl()` и падал на первом же цвете, так что экспорт не выдавал картинку ни разу. `html2canvas-pro` — форк с тем же API. Экспорт доступен на странице деталей игры (`app/history/[id]`).

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

**Миграции:** `supabase/migrations/00001–00016`. **Типы:** `lib/types/database.types.ts` генерируется из продовой схемы и руками не правится; после каждой миграции:

```bash
npx supabase gen types typescript --linked --schema public > lib/types/database.types.ts
```

(`--linked` требует слинкованного проекта, см. [DEPLOYMENT.md](./DEPLOYMENT.md#supabase-cli).)

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
-- 00016:
ALTER TABLE games ADD COLUMN IF NOT EXISTS host_secret_hash TEXT;   -- hex(sha256(секрет хоста))
```

Индексы: `created_by`, `status`, `created_at DESC`, GIN по `participants` (00011). Таблица добавлена в publication `supabase_realtime` (00009).

С миграции 00015:

- **Триггер `games_server_timestamps`** (BEFORE INSERT OR UPDATE, заменил `update_games_updated_at`): на INSERT `created_at := LEAST(COALESCE(created_at, now()), now())` и `updated_at := now()`, на UPDATE `created_at` сохраняется, `updated_at := now()`. Клиентский `updated_at` до базы фактически не доходит. Исключение — переход `created_by` из аккаунта в `NULL` (удаление аккаунта, `ON DELETE SET NULL`): даты сохраняются, `active` становится `abandoned`.
- **CHECK-ограничения:** `games_participants_max` (≤ 32), `games_history_max` (≤ 1000 записей), `games_payload_size` (`participants` + `history` ≤ 512 КиБ как JSON-текст), `games_winner_is_participant` (`winner_id` — NULL или id одного из участников, сравнение в нижнем регистре). Нарушение — `23514`. Если старые строки какому-то ограничению не соответствуют, оно остаётся `NOT VALID`, но новые записи проверяет.

С миграции 00016:

- **`host_secret_hash`** — CHECK `games_host_secret_hash_format`: NULL или 64 символа `[0-9a-f]`. Пишет его только первый INSERT; триггер `games_keep_host_secret` (BEFORE UPDATE) на каждом UPDATE возвращает старое значение — для всех ролей, владельца тоже.

### player_profiles

```sql
CREATE TABLE player_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,   -- UNIQUE (00003/00004)
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

Сид: «Classic Killer Pool» `{starting_lives: 3, miss: -1, pot: 0, pot_black: 1, max_lives: 6}` (`max_lives` обновлён с 10 до 6 миграцией 00011, в соответствии с клиентским `DEFAULT_RULESET`). С 00015 дефолтный ruleset ровно один: уникальный частичный индекс `idx_rulesets_one_default`. Клиент таблицу не читает и не пишет — играет `DEFAULT_RULESET`.

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

**Миграция:** `00015_game_integrity_and_spam_limits.sql` (v6, актуальная; сигнатура из v5, `00013`). `SECURITY DEFINER SET search_path = public, pg_temp`, `GRANT EXECUTE ... TO authenticated, anon`.

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
- Игроки извлекаются из JSONB `participants`. Ключ группировки (v6):
  - нет `userId` или он не UUID → `participants[].id`;
  - `userId` не принадлежит аккаунту (guest-UUID устройства) → `userId`: игры гостя-хоста складываются, в том числе сыгранные до ростера;
  - `userId` — аккаунт и равен `created_by` строки → `userId`;
  - `userId` — аккаунт, а строку писал другой → `participants[].id`;
  - участник, сгруппированный по `id`, который является uid аккаунта, отбрасывается — иначе подделка просто переносила бы uid жертвы из `userId` в `id`.

  «Аккаунт» — uid из `player_profiles.user_id` или `games.created_by`: оба — внешние ключи на `auth.users`, и функции не нужен доступ к схеме `auth`. Аккаунт, ещё ничего не записавший (ни профиля, ни игры), неотличим от guest-UUID — это остаточная дыра.
- **Клиентский JSON нигде не приводится к `uuid`.** Таблица `games` записывается анонимами, и до 00012 одна игра с некорректным id роняла RPC для всех пользователей. Сравнения идут текстом с `lower()`, единственный оставшийся `::uuid` защищён regex'ом, а участник без пригодного идентификатора просто выпадает из выдачи.
- Победы считаются по **уникальным играм**: игра, где один и тот же победивший участник перечислен пятьдесят раз, даёт одну победу, а не пятьдесят.
- `display_name`: имя из `player_profiles`, иначе имя участника из его самой свежей игры.
- В рейтинг попадают только сыгравшие не меньше `min_games` партий. Без порога разовый победитель со своими 100% стоит выше того, кто выиграл сорок из шестидесяти.
- Ранжирование: `win_rate DESC, games_won DESC, total_games DESC`, тай-брейк по идентификатору.
- `limit_count` (0–100) и `min_games` (1–100) клэмпятся: RPC доступен анонимам, а `NULL` в `LIMIT` означал бы «без ограничения».

Вызов с клиента (`components/leaderboard/leaderboard-list.tsx`):

```typescript
const { data, error } = await createClient().rpc('get_leaderboard', { limit_count: limit })   // limit = 15
```

> Сигнатура сменилась в 00013 через `DROP FUNCTION` + создание заново: Postgres различает функции по имени и типам аргументов, поэтому добавление параметра создало бы вторую перегрузку, и вызов с одним аргументом продолжил бы попадать в старое тело. v6 сигнатуру не меняет и заменяет тело через `CREATE OR REPLACE`.

### check_achievements

**Миграция:** `00015_game_integrity_and_spam_limits.sql` (v3; основа — v2 из `00011`). `SECURITY DEFINER SET search_path = public, pg_temp`, `GRANT EXECUTE ... TO authenticated` (гостям недоступна).

```sql
CREATE OR REPLACE FUNCTION check_achievements(p_user_id UUID, p_game_id UUID)
RETURNS TABLE(achievement_type TEXT, is_new BOOLEAN)
```

Логика:

- Требует `p_user_id = auth.uid()` (иначе молча возвращает пусто) — начислить ачивки чужому пользователю нельзя; `EXECUTE` отозван у `PUBLIC`/`anon`.
- Читает игру `WHERE id = p_game_id AND status = 'completed' AND created_by = p_user_id` (v3); выходит, если игры/победителя нет.
- Ачивки получает **только победитель**, и только если победивший участник принадлежит вызывающему пользователю (`participants[].userId = p_user_id`). Все сравнения id — текстовые, а `::INTEGER`-касты защищены числовым regex (JSON пишется клиентами и может быть порченым).
- Считает статистику победителя: жизни, потерянные жизни, pot_black; суммарные победы, текущую серию побед и «социальные» игры (4+ игрока) — **только по играм с `created_by = p_user_id`** (v3): подброшенная анонимом игра не добавляет жертве ни побед, ни поражений и не обрывает серию. Пер-пользовательские выборки префильтруются jsonb-containment (`participants @> ...`) под GIN-индекс `idx_games_participants_gin`.
- Проверяет все 10 типов: `first_win`, `wins_10`, `wins_25`, `wins_50`, `win_streak_3`, `win_streak_5`, `survivor` (победа с 1 жизнью), `perfect_game` (без потерь жизней; нужна хотя бы одна запись истории победителя — v3, — и все его записи должны иметь числовые `livesBefore`/`livesAfter`), `pot_black_master` (5+ pot black за игру), `social_player` (10 игр с 4+ игроками). Пороговые проверки через `>=` — milestone'ы выдаются ретроактивно при следующей победе.
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

### games (финальное состояние — 00009, ужесточено в 00014, 00015 и 00016)

| Политика | Команда | Роли | Условие |
|----------|---------|------|---------|
| `games_select_all` | SELECT | anon, authenticated | `USING (true)` — публичное чтение для зрителей |
| `games_insert_authenticated` | INSERT | authenticated | `WITH CHECK (created_by = auth.uid())` |
| `games_insert_anon` | INSERT | anon | `WITH CHECK (created_by IS NULL)` |
| `games_update_authenticated` | UPDATE | authenticated | `USING` и `WITH CHECK`: `created_by = auth.uid()` |
| `games_update_anon` | UPDATE | anon | `USING (created_by IS NULL AND created_at > now() - interval '24 hours' AND (status = 'active' OR updated_at > now() - interval '1 hour') AND (host_secret_hash IS NULL OR host_secret_hash = <sha256 заголовка x-host-secret>))`, `WITH CHECK (created_by IS NULL)` |
| `games_delete_authenticated` | DELETE | authenticated | `USING (created_by = auth.uid())` |

Гостевая игра записываема для `anon` сутки от серверного `created_at`; завершённая или брошенная — ещё и только в течение часа после последней записи (гоночные записи завершения и Undo победы). Офлайн-игра, залитая через несколько дней, — это INSERT, ограничения по времени на него не действуют. Игру с `host_secret_hash` (00016) `anon` пишет только с верным секретом в заголовке `x-host-secret`: PostgREST кладёт заголовки в GUC `request.headers`, политика хеширует секрет встроенной `sha256` и сравнивает. Строку без хеша (старый клиент, браузер без `crypto.subtle`) пишет любой, как до 00016. Вставка не тронута, поэтому хеш задаёт первая строка с данным id.

Две вещи, о которые легко споткнуться при отладке политик (обе зафиксированы тестами в `supabase/test/rls-policies.sql`):

- обычный `UPDATE`, не прошедший `USING`, **не поднимает ошибку** — он меняет ноль строк; upsert в той же ситуации падает с `42501`;
- `WITH CHECK` INSERT-политики применяется к предлагаемой строке и в ветке `DO UPDATE` любого upsert, поэтому условие по статусу или времени в `games_insert_anon` заблокировало бы и обычный ход хоста — такие условия живут в `USING` политики UPDATE.

### user_achievements (после миграции 00011)

- Осталась одна политика: `"Users can view all achievements"` (SELECT `USING (true)`).
- INSERT-политик **нет** — запись возможна только через RPC `check_achievements` (`SECURITY DEFINER` обходит RLS). Политики `"Service role can insert achievements"` и `"Users can view own achievements"` удалены (первая была чит-вектором: позволяла любому authenticated-пользователю вставлять себе произвольные ачивки).

### player_profiles / rulesets (00001, INSERT пересмотрен в 00015)

- `player_profiles`: SELECT для всех; INSERT — только `authenticated` и только свой (`WITH CHECK (user_id = auth.uid())`); UPDATE/DELETE — только своя запись. До 00015 INSERT-политика была без `TO` и с `OR user_id IS NULL`: аноним мог плодить профили без владельца, а UNIQUE пропускает сколько угодно `NULL`.
- `rulesets`: SELECT для всех; INSERT-политики нет (политика `"Authenticated users can create rulesets"` с `WITH CHECK (true)` удалена в 00015), UPDATE/DELETE — тоже нет.

---

## Error Handling

Соглашение в кодовой базе: функции `lib/*` **не бросают** ошибки наружу при сбоях сети/БД — логируют в консоль и возвращают безопасное значение (`false`, `[]`, `null` или `UpsertOutcome` с `ok: false`). Исключения бросают: `createGame` (больше `MAX_PLAYERS` игроков), `applyAction`/`abandonGame`/`addPlayerToGame` (невалидное состояние игры, предел игроков), `useGame` вне провайдера, фабрики Supabase-клиентов без env-переменных, а также `generateInviteQRCode`/`downloadQRCode` (`lib/invite.ts`) и `exportScreenshot` (`lib/export.ts`) — их вызывающие обязаны ловить ошибки сами. `exportGameToCSV` свои ошибки (например, сбой `URL.createObjectURL`) тоже не ловит — их ловит страница деталей.

### Частые коды ошибок Supabase/PostgREST

| Code | Описание | Для `lib/sync.ts` |
|------|----------|-------------------|
| `PGRST116` | Row not found (`.single()` без результата) | — (чтение) |
| `PGRST204` | Колонки нет в схеме (клиент новее базы) | окончательный; для `host_secret_hash` — один повтор без колонки |
| `42501` | Permission denied (RLS), в том числе замёрзшая гостевая игра и гостевая игра с хешем без верного `x-host-secret` | окончательный |
| `23514` | CHECK violation — в том числе лимиты 00015 и `winner_id` не из участников | окончательный |
| `23505` | Unique constraint violation | окончательный |
| `23503` | Foreign key violation | окончательный |

Полный список окончательных кодов — `PERMANENT_ERROR_CODES` в `lib/sync.ts` (см. [Sync API](#sync-api)).

---

## Полезные ссылки

- [Supabase JavaScript Client](https://supabase.com/docs/reference/javascript/introduction)
- [Supabase Auth](https://supabase.com/docs/guides/auth)
- [Supabase Realtime — postgres_changes](https://supabase.com/docs/guides/realtime/postgres-changes)
- [Row Level Security](https://supabase.com/docs/guides/auth/row-level-security)

---

**Документ обновлен:** 2026-10-16
