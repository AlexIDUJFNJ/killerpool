# 🏗️ Architecture - Killerpool

Документация архитектуры Killerpool.app - PWA-приложения для игры в Killer Pool.

**Документ обновлен:** 2026-07-07 (сверен с реальным кодом)

## 📋 Содержание

- [Общий обзор](#общий-обзор)
- [Технологический стек](#технологический-стек)
- [Архитектурные принципы](#архитектурные-принципы)
- [Структура проекта](#структура-проекта)
- [Слои приложения](#слои-приложения)
- [Потоки данных](#потоки-данных)
- [Авторизация и безопасность](#авторизация-и-безопасность)
- [Схема базы данных и RLS](#схема-базы-данных-и-rls)
- [Leaderboard Architecture](#leaderboard-architecture)
- [Ачивки](#ачивки)
- [PWA и офлайн-режим](#pwa-и-офлайн-режим)
- [Performance оптимизации](#performance-оптимизации)
- [Тестирование](#тестирование)
- [Деплой](#деплой)
- [Planned / Not implemented](#planned--not-implemented)

---

## Общий обзор

Killerpool — это **client-first** приложение на Next.js 16 App Router. Ключевые особенности реальной архитектуры:

- 🎮 **Состояние игры живёт на клиенте** — `GameProvider` (React Context) + чистые функции `lib/game-logic.ts`; первичное хранилище — localStorage
- 🗄️ **Нет собственного API-слоя** — каталога `app/api` не существует; все обращения к данным идут напрямую через Supabase JS-клиент (PostgREST + RLS)
- 📡 **Live sharing** — хост апсертит полную строку игры в таблицу `games`, зрители получают обновления через Supabase Realtime (`postgres_changes`)
- 📱 **PWA** — service worker через `@ducanh2912/next-pwa`, установка на домашний экран, офлайн-страница
- 🔄 **Офлайн-retry** — игры, завершённые офлайн, помечаются в localStorage и досинхронизируются при появлении сети
- 🔐 **Row Level Security** — доступ к данным контролируется политиками PostgreSQL, а не серверным кодом

### Архитектурная диаграмма

```
┌──────────────────────────────────────────────────────────────┐
│                          Client                              │
│  ┌──────────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │  GameProvider    │  │ localStorage │  │ Service Worker│  │
│  │ (game-context)   │→ │ current_game │  │    (sw.js,    │  │
│  │ + game-logic.ts  │  │ game_history │  │   Workbox)    │  │
│  │  (pure functions)│  │ pending_sync │  │               │  │
│  └────────┬─────────┘  └──────────────┘  └───────────────┘  │
└───────────┼──────────────────────────────────────────────────┘
            │ Supabase JS client (HTTPS + WebSocket)
            │
┌───────────▼──────────────────────────────────────────────────┐
│                 Vercel (region: fra1)                        │
│  ┌────────────────────────────────────────────────────────┐  │
│  │           Next.js 16 Application (Turbopack)           │  │
│  │  ┌──────────────┐  ┌──────────────────────────────┐    │  │
│  │  │    Pages     │  │  proxy.ts (Next 16 convention)│    │  │
│  │  │ (App Router) │  │  → updateSession() Supabase   │    │  │
│  │  └──────────────┘  └──────────────────────────────┘    │  │
│  │  Единственный route handler: app/auth/callback/route.ts│  │
│  └────────────────────────────────────────────────────────┘  │
└───────────┬──────────────────────────────────────────────────┘
            │
┌───────────▼──────────────────────────────────────────────────┐
│                      Supabase Cloud                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐    │
│  │  PostgreSQL  │  │     Auth     │  │     Realtime     │    │
│  │  games,      │  │ Google OAuth │  │ postgres_changes │    │
│  │  rulesets,   │  │ (PKCE),      │  │ UPDATE on games  │    │
│  │  profiles,   │  │ Magic Link   │  │ (spectator mode) │    │
│  │  achievements│  │              │  │                  │    │
│  │  + RLS + RPC │  │              │  │                  │    │
│  └──────────────┘  └──────────────┘  └──────────────────┘    │
└──────────────────────────────────────────────────────────────┘
```

---

## Технологический стек

### Frontend

| Технология | Версия | Назначение |
|------------|--------|------------|
| **Next.js** | 16.1 | React framework, App Router, Turbopack |
| **React** | 19.2 | UI библиотека |
| **TypeScript** | 5.x (strict) | Type safety |
| **Tailwind CSS** | 4.2 | Utility-first CSS, токены через `@theme` в `app/globals.css` |
| **shadcn/ui** | — | UI компоненты (Radix UI + CVA) |
| **Motion** | 12 | Анимации (`motion/react`, бывший Framer Motion) |
| **Lucide React** | 0.577 | Иконки |
| **qrcode** | 1.5 | QR-код в invite modal |

### Backend & Database

| Технология | Назначение |
|------------|------------|
| **Supabase** | Backend-as-a-Service (PostgreSQL + Auth + Realtime) |
| **@supabase/supabase-js** 2.x / **@supabase/ssr** 0.9 | Клиенты (browser / server / middleware) |
| **PostgreSQL** | БД: таблицы + RPC-функции (`get_leaderboard`, `check_achievements`) |
| **Row Level Security** | Security на уровне строк БД |

### DevOps & Tooling

| Технология | Назначение |
|------------|------------|
| **Vercel** | Hosting (регион `fra1`), security headers в `vercel.json` |
| **Node.js** | 22.x (`engines` в package.json) |
| **@ducanh2912/next-pwa** | 10.x, service worker (Workbox) |
| **ESLint** | 9.x, flat config (`eslint.config.mjs`) |
| **Jest + Testing Library** | 30.x, unit/component тесты |
| **Prettier** | Форматирование |

> Отдельного `tailwind.config.ts` нет — Tailwind 4 конфигурируется прямо в CSS (`@import 'tailwindcss'`, `@theme`, `@custom-variant` в `app/globals.css`).

---

## Архитектурные принципы

### 1. **Client-first game state**

Игра полностью считается на клиенте:
- `lib/game-logic.ts` — чистые функции (`createGame`, `applyAction`, `undoLastAction`, `addPlayerToGame`, `calculateStats`)
- `contexts/game-context.tsx` — единственный React Context, оркестрирующий состояние, персист и синк
- Supabase — вторичное хранилище: для шаринга, истории, лидерборда и ачивок

### 2. **No API layer**

REST-эндпоинтов нет (`app/api` не существует). Клиент ходит в Supabase напрямую через `createClient()` из `lib/supabase/client.ts`; доступ ограничивается RLS-политиками и `SECURITY DEFINER` RPC-функциями.

### 3. **Offline-first**

- localStorage — первичное хранилище (`killerpool_current_game`, `killerpool_game_history` до 50 игр)
- Service Worker кеширует статику и Supabase-ответы (NetworkFirst)
- Игры, завершённые офлайн, помечаются в `killerpool_pending_sync` и досинхронизируются (`retryPendingSyncs()`)

### 4. **Mobile-First**

- Touch-жесты: свайпы по карточке игрока (`swipeable-player-card.tsx`): **влево = MISS, вправо = POT, вверх = POT BLACK** (порог 100px или velocity 500)
- Haptic feedback (`lib/haptic.ts`)
- PWA с установкой на домашний экран

### 5. **Type Safety**

- `strict: true` в tsconfig
- Типы БД в `lib/types/database.types.ts`
- Единый маппинг строки БД → доменный тип: `mapDbGameToGame` (`lib/game-mapper.ts`)

---

## Структура проекта

```
killerpool/
│
├── app/                          # Next.js App Router
│   ├── layout.tsx                # Root layout (metadataBase, Providers, PWAInit)
│   ├── page.tsx                  # Home page
│   ├── globals.css               # Tailwind 4: @theme токены, @custom-variant dark
│   ├── error.tsx / loading.tsx / not-found.tsx
│   ├── opengraph-image.tsx       # Динамическая OG-картинка
│   ├── twitter-image.tsx         # Динамическая Twitter-картинка
│   ├── robots.ts / sitemap.ts    # SEO
│   │
│   ├── auth/
│   │   ├── page.tsx              # Login (Google OAuth + Magic Link)
│   │   └── callback/route.ts     # exchangeCodeForSession → redirect на "/"
│   │
│   ├── game/
│   │   ├── new/page.tsx          # Создание игры
│   │   └── [id]/page.tsx         # Активная игра / spectator mode
│   │
│   ├── history/                  # История игр (+ [id] — детали игры)
│   ├── leaderboard/page.tsx      # Лидерборд (RPC get_leaderboard)
│   ├── stats/page.tsx            # Статистика
│   ├── profile/page.tsx          # Профиль (protected route)
│   ├── help/page.tsx             # Правила и жесты
│   ├── offline/page.tsx          # Офлайн-фолбэк
│   └── sync/page.tsx             # Ручная синхронизация истории
│
├── components/
│   ├── ui/                       # shadcn/ui: button, card, avatar, badge,
│   │   │                         #   input, label, dialog, bottom-sheet
│   │   └── __tests__/            # Тесты компонентов
│   ├── game/                     # player-card, swipeable-player-card,
│   │   │                         #   action-buttons, life-bar, invite-modal,
│   │   │                         #   black-ball-celebration
│   │   └── __tests__/
│   ├── achievements/             # achievement-card, achievement-toast, list
│   ├── leaderboard/              # leaderboard-card, leaderboard-list
│   ├── lazy-components.tsx       # dynamic() обёртки (InviteModal, BottomSheet)
│   ├── pwa-init.tsx              # SW-регистрация + retryPendingSyncs
│   ├── theme-provider.tsx / theme-switcher.tsx
│
├── contexts/
│   └── game-context.tsx          # GameProvider: state, персист, синк, ачивки
│
├── hooks/
│   └── use-realtime-game.ts      # useRealtimeGame, useSyncGameForRealtime
│
├── lib/
│   ├── game-logic.ts             # Чистые функции игры
│   ├── game-mapper.ts            # mapDbGameToGame (строка БД → Game)
│   ├── storage.ts                # localStorage (игры, guest ID, pending sync)
│   ├── sync.ts                   # Синк с Supabase + офлайн-retry
│   ├── realtime.ts               # Подписки на postgres_changes
│   ├── achievements.ts           # checkAchievements (RPC) + определения
│   ├── invite.ts / export.ts / haptic.ts / utils.ts
│   ├── supabase/
│   │   ├── client.ts             # createBrowserClient (Client Components)
│   │   ├── server.ts             # createServerClient (route handlers)
│   │   └── middleware.ts         # updateSession (для proxy.ts)
│   ├── types.ts                  # Game, Player, Ruleset, ачивки
│   ├── types/database.types.ts   # Типы Supabase-схемы
│   └── __tests__/                # Тесты lib-слоя
│
├── supabase/migrations/          # 00001–00011 (см. раздел про БД)
├── public/                       # manifest.json, иконки, sw.js (генерируется)
│
├── proxy.ts                      # Next 16 proxy (замена middleware.ts)
├── next.config.js                # PWA + turbopack, headers() НЕТ
├── vercel.json                   # regions: fra1, security headers
├── eslint.config.mjs             # ESLint 9 flat config
├── jest.config.ts / jest.setup.ts
└── tsconfig.json
```

> `middleware.ts` и `tailwind.config.ts` **не существуют** — их заменили `proxy.ts` (конвенция Next 16) и CSS-конфигурация Tailwind 4.

---

## Слои приложения

### Layer 1: Presentation (UI)

**Компоненты:** `app/*/page.tsx`, `components/ui/*`, `components/game/*`

Почти все игровые экраны — Client Components (`'use client'`): игра интерактивна и живёт в браузере. Тяжёлые компоненты грузятся лениво через `components/lazy-components.tsx`:

```typescript
// components/lazy-components.tsx
export const InviteModal = dynamic(
  () => import('./game/invite-modal').then((mod) => ({ default: mod.InviteModal })),
  {
    loading: () => <LoadingSpinner />,
    ssr: false, // QR code generation only works on client
  }
)
```

### Layer 2: Business Logic

**Файлы:** `lib/game-logic.ts` (чистые функции), `contexts/game-context.tsx` (state management)

```typescript
// lib/game-logic.ts — реальные сигнатуры
export function createGame(
  players: Array<{ name: string; avatar: string }>,
  ruleset: Ruleset = DEFAULT_RULESET,
  userId?: string | null
): Game

export function applyAction(game: Game, action: GameAction): Game
export function undoLastAction(game: Game): Game
export function addPlayerToGame(game: Game, playerName: string, playerAvatar: string): Game
```

`applyAction` меняет жизни по правилам ruleset (`miss: -1`, `pot: 0`, `pot_black: +1`), ограничивает их `max_lives` (6), помечает элиминацию при `lives <= 0`, пишет запись в `history` и определяет победителя (последний неэлиминированный игрок → `status: 'completed'`).

Важная деталь `createGame`: **userId получает только первый игрок** (авторизованный `user.id` или стабильный guest-UUID из `getGuestId()`), остальные игроки имеют `userId: null` и трекаются по своему `player_id`:

```typescript
// lib/game-logic.ts
const gamePlayers = players.map((p, index) =>
  createPlayer(p.name, p.avatar, ruleset.params.starting_lives, index === 0 ? userId : null)
)
```

### Layer 3: Data Access & Sync

**Файлы:** `lib/storage.ts`, `lib/sync.ts`, `lib/realtime.ts`, `lib/game-mapper.ts`, `lib/supabase/*`

- `storage.ts` — localStorage-ключи: `killerpool_current_game`, `killerpool_game_history` (последние 50), `killerpool_guest_id`, `killerpool_pending_sync`, `killerpool_rematch_players` (sessionStorage)
- `sync.ts` — `syncGameToSupabase` (только completed), `syncActiveGameToSupabase` (любой статус, для live sharing), `autoSyncGame` + `retryPendingSyncs` (офлайн-retry), `syncAllGamesToSupabase` (страница `/sync`), `mergeGamesWithSupabase` (страница `/history`, кнопка Sync)
- `realtime.ts` — `subscribeToGame` / `unsubscribeFromGame` / `updateGameStatus`
- `game-mapper.ts` — единственная точка конверсии строки `games` → `Game` (snake_case → camelCase, фолбэк `currentPlayerIndex` для старых строк, `ruleset = DEFAULT_RULESET`)

### Layer 4: Infrastructure

**Файлы:** `proxy.ts`, `lib/supabase/middleware.ts`, `app/auth/callback/route.ts`, `next.config.js`, `vercel.json`

```typescript
// proxy.ts — вся серверная логика запроса
export async function proxy(request: NextRequest) {
  return await updateSession(request)
}
```

---

## Потоки данных

### 1. Локальная игра (без шаринга)

```
User Input (game/new)
        │
        ▼
createGame(players, DEFAULT_RULESET, user?.id || getGuestId())
        │
        ▼
GameProvider.startGame(game)          ← realtime по умолчанию выключен
        │
        ▼
performAction('miss'|'pot'|'pot_black')   ← кнопки или свайпы
        │
        ▼
applyAction() (pure) → setGame()
        │
        ▼
useEffect → saveCurrentGame(game)     ← localStorage на каждое изменение
        │
        ▼
UI re-render (optimistic, мгновенно, офлайн работает)
```

До завершения игры (или включения шаринга) в Supabase **ничего не пишется**.

### 2. Live sharing / зритель

**Хост** (`enableSharing()` в game-context):

```
enableSharing()
   │
   ▼
syncActiveGameToSupabase(game)    ← upsert ПОЛНОЙ строки games (onConflict: 'id')
   │                                 participants, history, current_player_index...
   ▼
setRealtimeEnabled(true) + setIsSharingEnabled(true)
   │
   ▼
Каждый performAction/undoAction/addPlayer
   → syncActiveGameToSupabase(updatedGame)   ← повторный upsert всей строки
```

**Зритель** (открывает `/game/[id]` без локальной игры):

```
loadGameFromSupabase(gameId)      ← SELECT * FROM games WHERE id = ...
   │                                 (разрешено политикой games_select_all)
   ▼
mapDbGameToGame(row) → setSpectatorGame(game)
   │
   ▼
subscribeToGame(gameId, ...)      ← канал `game:{id}`,
   │                                 postgres_changes UPDATE, filter id=eq.{id}
   ▼
На каждый UPDATE строки: merge payload.new в state зрителя
```

Broadcast-каналов и presence **нет** — весь realtime построен на `postgres_changes` по таблице `games` (она добавлена в publication `supabase_realtime` в миграции 00009). Спектаторский режим read-only: localStorage не трогается, действия недоступны.

### 3. Завершение игры + ачивки

При `game.status === 'completed'` срабатывает useEffect в game-context (защищён `syncedCompletedGamesRef` от повторного запуска):

```
game.status === 'completed'
   │
   ├─ saveToHistory(game)              ← localStorage (до 50 игр)
   │
   └─ autoSyncGame(game)               ← upsert в games (created_by = user?.id || null)
        │ .then(...)
        ▼
      winner.userId === auth user?     ← ачивки только авторизованному победителю
        │ да
        ▼
      checkAchievements(user.id, game.id)   ← RPC check_achievements (SECURITY DEFINER)
        │
        ▼
      setNewAchievements([...])        ← тосты AchievementToast на экране победителя
```

RPC вызывается **после** синка, потому что читает строку игры из БД.

### 4. Офлайн-retry

`lib/sync-manager.ts` и Background Sync API удалены. Текущая схема:

```
autoSyncGame(game)
   │
   ├─ success → unmarkPendingSync(game.id)
   └─ failure → markPendingSync(game.id)     ← id в killerpool_pending_sync

retryPendingSyncs()          ← lib/sync.ts
   │  вызывается из components/pwa-init.tsx:
   │  - при монтировании
   │  - на window 'online'
   │  - на document 'visibilitychange' (visible + navigator.onLine)
   ▼
для каждого id: getGameFromHistory(id) → syncGameToSupabase(game)
   → success: unmarkPendingSync(id)
   → игра удалена из истории: unmarkPendingSync(id) (нечего синкать)
```

---

## Авторизация и безопасность

### Auth-флоу

- **Google OAuth (PKCE)** и **Magic Link** через Supabase Auth (`app/auth/page.tsx`)
- **Guest mode**: без записи в auth — стабильный UUID в localStorage (`killerpool_guest_id`, `getGuestId()` в `lib/storage.ts`); в БД такие игры имеют `created_by = NULL`, гостевой UUID попадает только в `participants[0].userId`

```typescript
// app/auth/callback/route.ts — целиком
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

### proxy.ts вместо middleware.ts

В Next 16 файл называется `proxy.ts`. Его единственная задача — `updateSession()` из `lib/supabase/middleware.ts`: рефреш Supabase-сессии + минимальная route protection:

```typescript
// lib/supabase/middleware.ts (фрагмент)
const protectedRoutes = ['/profile']
const isProtectedRoute = protectedRoutes.some(route =>
  request.nextUrl.pathname.startsWith(route)
)

if (!user && isProtectedRoute) {
  const url = request.nextUrl.clone()
  url.pathname = '/auth'
  return NextResponse.redirect(url)
}

// Redirect authenticated users away from auth page
if (user && request.nextUrl.pathname === '/auth') { /* → '/' */ }
```

Защищён **только** `/profile`. Все игровые страницы доступны гостям — это осознанное решение (guest mode).

### Клиенты Supabase

| Файл | Функция | Где используется |
|------|---------|------------------|
| `lib/supabase/client.ts` | `createBrowserClient` | Client Components (бросает ошибку вне браузера) |
| `lib/supabase/server.ts` | `createServerClient` + `cookies()` | Route handlers (auth callback) |
| `lib/supabase/middleware.ts` | `updateSession(request)` | `proxy.ts` |

### Security headers

Заголовки заданы **только в `vercel.json`** (в `next.config.js` секции `headers()` нет):

```json
"headers": [
  { "key": "X-Content-Type-Options", "value": "nosniff" },
  { "key": "X-Frame-Options", "value": "DENY" },
  { "key": "X-XSS-Protection", "value": "1; mode=block" }
]
```

**CSP не настроен** (см. Planned).

### Environment variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_APP_URL` (metadataBase в `app/layout.tsx`)

---

## Схема базы данных и RLS

Миграции: `supabase/migrations/00001–00011`.

### Таблицы

```sql
-- 00001_initial_schema.sql
CREATE TYPE game_status AS ENUM ('active', 'completed', 'abandoned');

CREATE TABLE games (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status game_status NOT NULL DEFAULT 'active',
    participants JSONB NOT NULL,          -- игроки в формате клиента (camelCase)
    winner_id UUID,
    ruleset_id UUID REFERENCES rulesets(id) ON DELETE SET NULL,
    history JSONB DEFAULT '[]'::jsonb,    -- записи действий в формате клиента
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    CONSTRAINT valid_participants CHECK (jsonb_array_length(participants) >= 2),
    CONSTRAINT valid_history CHECK (jsonb_typeof(history) = 'array')
);
-- + current_player_index INTEGER DEFAULT 0 (миграция 00010, для spectator sync)
```

- **player_profiles** — `user_id → auth.users`, `display_name`, `avatar_url`; создаётся лениво при первом синке (`lib/sync.ts`)
- **rulesets** — JSONB `params`; дефолтный сид "Classic Killer Pool" после миграции 00011: `starting_lives: 3, miss: -1, pot: 0, pot_black: 1, max_lives: 6` (совпадает с `DEFAULT_RULESET` в `lib/types.ts`)
- **user_achievements** (00007) — `UNIQUE(user_id, achievement_type)`, `game_id` nullable

### Финальные RLS-политики games (миграция 00009)

Миграция 00009 дропает все предыдущие политики и создаёт чистый набор:

| Политика | Операция | Роли | Условие |
|----------|----------|------|---------|
| `games_select_all` | SELECT | anon, authenticated | `USING (true)` — публичное чтение любой игры (spectator mode) |
| `games_insert_authenticated` | INSERT | authenticated | `WITH CHECK (true)` |
| `games_insert_anon` | INSERT | anon | `WITH CHECK (created_by IS NULL)` |
| `games_update_authenticated` | UPDATE | authenticated | `USING (created_by = auth.uid() OR created_by IS NULL)`, `WITH CHECK (true)` |
| `games_update_anon` | UPDATE | anon | `created_by IS NULL` (USING и WITH CHECK) |
| `games_delete_authenticated` | DELETE | authenticated | `USING (created_by = auth.uid())` |

Там же таблица `games` добавляется в публикацию `supabase_realtime`.

### RLS user_achievements (после миграции 00011)

- SELECT: `"Users can view all achievements"` — `USING (true)`
- INSERT-политик **нет**: политики `"Service role can insert achievements"` (реально позволявшая любому authenticated вставлять себе ачивки — cheat vector) и `"Users can view own achievements"` (избыточная) удалены в 00011
- Запись — только через RPC `check_achievements` (`SECURITY DEFINER`, `GRANT EXECUTE ... TO authenticated`)

### RPC-функции

- **`get_leaderboard(limit_count INTEGER DEFAULT 15)`** — v3 из миграции 00005, `SECURITY DEFINER`, `GRANT anon + authenticated`
- **`check_achievements(p_user_id UUID, p_game_id UUID)`** — v2 из миграции 00011, `SECURITY DEFINER`, `GRANT` только `authenticated`

---

## Leaderboard Architecture

`components/leaderboard/leaderboard-list.tsx` вызывает RPC `get_leaderboard(limit_count)` — вся агрегация выполняется в PostgreSQL:

1. Берутся только `status = 'completed'` игры
2. Участники разворачиваются из JSONB (`jsonb_array_elements(participants)`)
3. Группировка по стабильному идентификатору: `COALESCE(userId участника, player_id)` — где `userId` парсится как UUID только если проходит regex-валидацию
4. Считаются `total_games`, `games_won`, `games_lost`, `win_rate`, `total_actions`, `total_black_pots`
5. Ранжирование: `ORDER BY win_rate DESC, games_won DESC, total_games DESC`
6. Имя — из `player_profiles.display_name` (если есть профиль), иначе имя игрока из последней игры

**Важные следствия реализации:**

- `userId` получает **только первый игрок** каждой игры (создатель) — либо `user.id`, либо стабильный guest-UUID (`getGuestId()`). Остальные участники имеют `userId = null` и трекаются по своему `player_id`, уникальному для каждой игры — их статистика между играми не агрегируется.
- Гостевые игры **тоже попадают** в лидерборд (guest-UUID стабилен на устройстве), но без профиля и с потерей истории при очистке localStorage. Регистрация даёт стабильный профиль, имя и ачивки.

---

## Ачивки

10 типов (`AchievementType` в `lib/types.ts`): `first_win`, `wins_10`, `wins_25`, `wins_50`, `win_streak_3`, `win_streak_5`, `survivor` (победа с 1 жизнью), `perfect_game` (победа без потери жизней), `pot_black_master` (5+ pot black за игру), `social_player` (10 игр с 4+ игроками).

- Начисление — исключительно в БД: `check_achievements` v2 (миграция 00011) сравнивает id как текст (без cast'ов JSON-значений в uuid), читает статы именно победителя, считает total wins/стрики/социальные игры и вставляет с `ON CONFLICT DO NOTHING`
- Клиент (`lib/achievements.ts`): `checkAchievements(userId, gameId)` вызывает RPC и возвращает только новые (`is_new`) ачивки; `getUserAchievements` — для профиля
- `checkLocalAchievements(game, userId)` — локальный предпросчёт без БД (использует ту же семантику perfect_game: ни одной записи истории с уменьшением жизней)
- UI: тосты `components/achievements/achievement-toast.tsx` на экране игры, список — в профиле

---

## PWA и офлайн-режим

### Service Worker

`@ducanh2912/next-pwa` в `next.config.js`: `dest: 'public'`, `sw: 'sw.js'`, отключён в development. Runtime caching (Workbox):

| Ресурс | Стратегия |
|--------|-----------|
| Google Fonts | CacheFirst (365 дней) |
| `*.supabase.co` | **NetworkFirst** (24ч, таймаут 10с) |
| Изображения / next/image | CacheFirst (24ч) |
| JS / CSS | StaleWhileRevalidate (24ч) |
| JSON | NetworkFirst (24ч) |

Дополнительно: `cacheOnFrontEndNav`, `aggressiveFrontEndNavCaching`, `reloadOnOnline`.

### PWAInit (`components/pwa-init.tsx`)

- Регистрирует `/sw.js`, слушает `updatefound`
- Запускает `retryPendingSyncs()` при монтировании и на событиях `online` / `visibilitychange`
- Перехватывает `beforeinstallprompt` / `appinstalled`

### Стратегия синхронизации

1. **Запись:** localStorage немедленно (optimistic); Supabase — при завершении игры (`autoSyncGame`) или на каждое действие при включённом шаринге (`syncActiveGameToSupabase`)
2. **Офлайн:** неудачный синк → `markPendingSync(game.id)` → retry при возвращении сети
3. **Conflict resolution:** last-write-wins; `mergeGamesWithSupabase()` (страница `/history`, кнопка Sync) при слиянии истории сравнивает `updatedAt` и берёт более новую версию

---

## Performance оптимизации

Реально применённые техники:

1. **Lazy loading** — `components/lazy-components.tsx`: `InviteModal` (qrcode, `ssr: false`) и `BottomSheet` через `next/dynamic`
2. **optimizePackageImports** — `['lucide-react']` в `next.config.js`
3. **Бандлеры** — dev на Turbopack (`next dev`); production-сборка на webpack (`next build --webpack`): `@ducanh2912/next-pwa` генерирует service worker через webpack-хук, который Turbopack не выполняет — Turbopack-сборка выпускается без `sw.js`
4. **Динамические OG-изображения** — `app/opengraph-image.tsx` и `app/twitter-image.tsx` (статического og-image.png нет), `metadataBase` в `layout.tsx`
5. **SW-кеширование** — см. раздел PWA
6. **Форматы изображений** — `formats: ['image/avif', 'image/webp']` в `next.config.js`
7. **Bundle analyzer** — `npm run analyze` (`scripts/analyze-bundle.js`)

> Численные Lighthouse/Web Vitals-метрики в этом документе не приводятся — замеры не автоматизированы.

---

## Тестирование

Jest 30 + jsdom + Testing Library (`jest.config.ts`, `jest.setup.ts`). **10 сьютов, 164 теста** (`npm test`):

| Область | Файлы |
|---------|-------|
| Игровая логика | `lib/__tests__/game-logic.test.ts` |
| Хранилище | `lib/__tests__/storage.test.ts` |
| Маппер БД | `lib/__tests__/game-mapper.test.ts` |
| Ачивки | `lib/__tests__/achievements.test.ts` |
| Утилиты | `lib/__tests__/utils.test.ts` |
| UI-компоненты | `components/ui/__tests__/{button,badge,card}.test.tsx` |
| Игровые компоненты | `components/game/__tests__/{player-card,action-buttons}.test.tsx` |

---

## Деплой

- **Vercel**, регион `fra1` (`vercel.json`), framework preset `nextjs`
- `npm run build` (prebuild-хук генерирует иконки: `scripts/generate-icons.js`)
- Security headers — из `vercel.json` (см. выше)
- Node 22 (`engines`)
- Supabase — отдельный managed-проект; миграции применяются вручную через SQL Editor (`supabase/migrations/`, README рядом)

---

## Planned / Not implemented

Раздел о том, чего в коде **нет** — не путать с текущей архитектурой:

1. **CSP-заголовок** — не настроен ни в `vercel.json`, ни в `next.config.js`
2. **Supabase Storage / Edge Functions** — не используются
3. **Broadcast-каналы / presence** в Realtime — не используются (весь realtime на `postgres_changes`); presence зрителей — возможное улучшение
4. **Background Sync API** — удалён вместе с `lib/sync-manager.ts`; заменён localStorage-очередью `killerpool_pending_sync`
5. **Автогенерация типов из Supabase-схемы** — `lib/types/database.types.ts` поддерживается вручную
6. **E2E-тесты (Playwright)** — только unit/component (Jest)
7. **Мониторинг** — Sentry / RUM / product-аналитика не подключены
8. **Расширения лидерборда** — недельные/месячные таблицы, рейтинги среди друзей
9. **Push-уведомления** о приглашениях в игру
10. **Кастомные rulesets в UI** — таблица `rulesets` и политика на INSERT есть, но клиент всегда использует `DEFAULT_RULESET` (classic)

---

## Полезные ссылки

- [Next.js App Router Documentation](https://nextjs.org/docs/app)
- [Supabase Architecture](https://supabase.com/docs/guides/getting-started/architecture)
- [Supabase Realtime: postgres_changes](https://supabase.com/docs/guides/realtime/postgres-changes)
- [Tailwind CSS v4](https://tailwindcss.com/docs)
- [PWA Best Practices](https://web.dev/progressive-web-apps/)

---

**Документ обновлен:** 2026-07-07
