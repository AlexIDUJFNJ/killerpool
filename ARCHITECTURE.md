# 🏗️ Architecture - Killerpool

Документация архитектуры Killerpool.app - PWA-приложения для игры в Killer Pool.

**Документ обновлен:** 2026-08-11 (сверен с реальным кодом)

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
- [Наблюдаемость](#наблюдаемость)
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
│  │  (pure functions)│  │ roster       │  │               │  │
│  │                  │  │ pending_sync │  │               │  │
│  └────────┬─────────┘  └──────────────┘  └───────────────┘  │
└───────────┼──────────────────────────────────────────────────┘
            │ Supabase JS client (HTTPS + WebSocket)
            │
┌───────────▼──────────────────────────────────────────────────┐
│                 Vercel (region: fra1)                        │
│  ┌────────────────────────────────────────────────────────┐  │
│  │                Next.js 16 Application                  │  │
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
| **Next.js** | 16.3 | React framework, App Router; dev на Turbopack, production-сборка на webpack |
| **React** | 19.2 | UI библиотека |
| **TypeScript** | 5.x (strict) | Type safety |
| **Tailwind CSS** | 4.3 | Utility-first CSS, токены через `@theme` в `app/globals.css` |
| **shadcn/ui** | — | UI компоненты (Radix UI + CVA) |
| **Motion** | 12 | Анимации (`motion/react`, бывший Framer Motion) |
| **Lucide React** | 0.577 | Иконки |
| **qrcode** | 1.5 | QR-код в invite modal |
| **@sentry/nextjs** | 10 | Сбор ошибок (браузер, сервер, edge) |

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
- Единый маппинг между строкой БД и доменным типом в обе стороны: `mapDbGameToGame` и `mapGameToDbRow` (`lib/game-mapper.ts`)

---

## Структура проекта

```
killerpool/
│
├── app/                          # Next.js App Router
│   ├── layout.tsx                # Root layout (metadataBase, GameProvider,
│   │                             #   PWAInit, инлайн-скрипт темы)
│   ├── page.tsx                  # Home page
│   ├── globals.css               # Tailwind 4: @theme токены, @custom-variant dark
│   ├── error.tsx / loading.tsx / not-found.tsx
│   ├── global-error.tsx          # Падения самого layout (вне error.tsx)
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
│   │   │                         #   invite-modal, black-ball-celebration
│   │   └── __tests__/
│   ├── achievements/             # achievement-card, achievement-toast, list
│   ├── leaderboard/              # leaderboard-card, leaderboard-list
│   ├── pwa-init.tsx              # SW-регистрация + retryPendingSyncs + install-промпт
│   └── pwa-install-button.tsx    # Кнопка установки (на главной)
│
├── contexts/
│   ├── game-context.tsx          # GameProvider: state, персист, синк, ачивки
│   └── __tests__/
│
├── hooks/
│   ├── use-realtime-game.ts      # useRealtimeGame, useSyncGameForRealtime
│   └── use-install-prompt.ts     # Состояние install-промпта (внешний стор)
│
├── lib/
│   ├── game-logic.ts             # Чистые функции игры
│   ├── game-mapper.ts            # Game ↔ строка БД (в обе стороны)
│   ├── storage.ts                # localStorage: игры, ростер, guest ID,
│   │                             #   очередь синка, надгробия удалённых
│   ├── sync.ts                   # Синк с Supabase + офлайн-retry с пределом
│   ├── realtime.ts               # Подписки на postgres_changes
│   ├── achievements.ts           # checkAchievements (RPC) + событие о поздних
│   ├── pwa-install.ts            # Перехват beforeinstallprompt (вне React)
│   ├── site.ts                   # getBaseUrl для метаданных и sitemap
│   ├── logger.ts                 # logger.debug, молчит в проде
│   ├── invite.ts / export.ts / haptic.ts / utils.ts
│   ├── supabase/
│   │   ├── client.ts             # createBrowserClient (Client Components)
│   │   ├── server.ts             # createServerClient (route handlers)
│   │   └── middleware.ts         # updateSession (для proxy.ts)
│   ├── types.ts                  # Game, Player, Ruleset, ачивки
│   ├── types/database.types.ts   # Типы Supabase-схемы
│   └── __tests__/                # Тесты lib-слоя
│
├── supabase/
│   ├── migrations/               # 00001–00014 (см. раздел про БД)
│   └── test/                     # Локальный Postgres + проверка RLS под ролями
├── public/                       # manifest.json, иконки, sw.js (генерируется)
│
├── instrumentation.ts            # Sentry: сервер и edge
├── instrumentation-client.ts     # Sentry: браузер
├── proxy.ts                      # Next 16 proxy (замена middleware.ts)
├── next.config.js                # PWA + Sentry + turbopack, headers() НЕТ
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

Почти все игровые экраны — Client Components (`'use client'`): игра интерактивна и живёт в браузере. Ленивой загрузки нет: обёртки `next/dynamic` лежали в `components/lazy-components.tsx`, но ни один экран их не импортировал — игровой экран тянул `InviteModal` и `BottomSheet` напрямую, — поэтому файл удалён как мёртвый. Если понадобится вынести `qrcode` из основного чанка, `dynamic()` ставится прямо в месте импорта.

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
createGame(игроки с id из ростера, DEFAULT_RULESET, user?.id || getGuestId())
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

**Идентичность игроков.** Знакомое имя получает постоянный id из ростера на
устройстве (`killerpool_roster`), и этот же id уходит в `participants[].id`.
На нём стоит агрегация лидерборда, поэтому человек, сыгравший десять партий,
остаётся одной строкой, а не десятью. Отсюда же требование формы: два игрока в
одной игре не могут носить одно имя — иначе они получили бы один id, а на его
уникальности внутри игры держатся `winner_id` и `history[].playerId`.

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
   └─ failure → markPendingSync(game.id)          ← id в killerpool_pending_sync
                recordSyncFailure(game.id, …)     ← попытки в killerpool_pending_sync_meta

retryPendingSyncs()          ← lib/sync.ts
   │  вызывается из components/pwa-init.tsx:
   │  - при монтировании
   │  - на window 'online'
   │  - на document 'visibilitychange' (visible + navigator.onLine)
   ▼
для каждого id:
   → исчерпан (отказ прав, 5 попыток или 14 дней) → выкинуть из очереди
   → рано (экспоненциальная отсрочка от 1 минуты до 6 часов) → пропустить
   → игра удалена из истории → выкинуть из очереди
   → иначе upsert; при успехе снять из очереди и начислить ачивки
```

Предел попыток обязателен: без него игра, которую сервер отвергает навсегда
(например, по правам), уходила в сеть при **каждом** переключении вкладки.
Ачивки за поздний синк доезжают до тостов через событие — `retryPendingSyncs`
вызывается из `PWAInit`, а он сиблинг `GameProvider` и до его состояния не
дотягивается.

Счётчик попыток лежит в отдельном ключе, чтобы `killerpool_pending_sync`
оставался простым массивом строк: это PWA, и часть пользователей какое-то время
работает со старым бандлом из кеша service worker — он должен уметь дренировать
очередь, которую записал новый.

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

- `NEXT_PUBLIC_SUPABASE_URL` — обязательна
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — обязательна
- `NEXT_PUBLIC_APP_URL` — необязательна; `lib/site.ts` иначе берёт домен из окружения Vercel
- `NEXT_PUBLIC_SENTRY_DSN` — необязательна; без неё Sentry молчит
- `SENTRY_AUTH_TOKEN` — только на этапе сборки, загрузка карт исходников

Service-role ключа нет: приложение целиком клиентское, серверных операций с
Supabase не существует, и ключ, обходящий RLS, в проекте не нужен.

---

## Схема базы данных и RLS

Миграции: `supabase/migrations/00001–00014`.

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

### Финальные RLS-политики games (00009, ужесточены в 00014)

| Политика | Операция | Роли | Условие |
|----------|----------|------|---------|
| `games_select_all` | SELECT | anon, authenticated | `USING (true)` — публичное чтение любой игры (spectator mode) |
| `games_insert_authenticated` | INSERT | authenticated | `WITH CHECK (created_by = auth.uid())` |
| `games_insert_anon` | INSERT | anon | `WITH CHECK (created_by IS NULL)` |
| `games_update_authenticated` | UPDATE | authenticated | `USING` и `WITH CHECK`: `created_by = auth.uid()` |
| `games_update_anon` | UPDATE | anon | `USING (created_by IS NULL AND (status <> 'completed' OR updated_at > now() - interval '1 hour'))`, `WITH CHECK (created_by IS NULL)` |
| `games_delete_authenticated` | DELETE | authenticated | `USING (created_by = auth.uid())` |

Публикация `supabase_realtime` включает `games` начиная с 00009.

Что закрыла 00014 и почему именно так — в SECURITY.md. Коротко: до неё любой
залогиненный пользователь одним запросом присваивал себе чужую гостевую игру, и
её настоящий хост, будучи `anon`, терял доступ навсегда. Условие по времени у
`games_update_anon` — окно, а не запрет: завершение игры это три гоночные записи,
а отмена после победы легальна, поэтому жёсткое `status <> 'completed'` сломало бы
нормальный ход партии.

### RLS user_achievements (после миграции 00011)

- SELECT: `"Users can view all achievements"` — `USING (true)`
- INSERT-политик **нет**: политики `"Service role can insert achievements"` (реально позволявшая любому authenticated вставлять себе ачивки — cheat vector) и `"Users can view own achievements"` (избыточная) удалены в 00011
- Запись — только через RPC `check_achievements` (`SECURITY DEFINER`, `GRANT EXECUTE ... TO authenticated`)

### RPC-функции

- **`get_leaderboard(limit_count INTEGER DEFAULT 15, min_games INTEGER DEFAULT 3)`** — v5 из миграции 00013, `SECURITY DEFINER`, `GRANT anon + authenticated`
- **`check_achievements(p_user_id UUID, p_game_id UUID)`** — v2 из миграции 00011, `SECURITY DEFINER`, `GRANT` только `authenticated`

---

## Leaderboard Architecture

`components/leaderboard/leaderboard-list.tsx` вызывает RPC `get_leaderboard(limit_count)` — вся агрегация выполняется в PostgreSQL:

1. Берутся только `status = 'completed'` игры
2. Участники разворачиваются из JSONB (`jsonb_array_elements(participants)`)
3. Группировка по стабильному идентификатору: `COALESCE(userId участника, id участника)` — сравнения идут текстом, без приведения клиентского JSON к `uuid`
4. Считаются `total_games`, `games_won` (по уникальным играм), `games_lost`, `win_rate`, `total_actions`, `total_black_pots`
5. В рейтинг попадают только сыгравшие не меньше `min_games` партий (по умолчанию 3)
6. Ранжирование: `ORDER BY win_rate DESC, games_won DESC, total_games DESC`, тай-брейк по идентификатору — чтобы равные игроки не менялись местами между вызовами
7. Имя — из `player_profiles.display_name` (если есть профиль), иначе имя игрока из самой свежей его игры

Таблица `games` записывается анонимами (RLS 00009), поэтому `participants`/`history` — недоверенный ввод. До миграции 00012 функция кастовала оттуда id в `uuid` без проверок, и одна игра с некорректным id роняла RPC для **всех** пользователей. Теперь единственный `::uuid` защищён regex'ом, а участник без пригодного идентификатора просто выпадает из выдачи.

**Почему нужен квалификационный минимум.** Ранжирование идёт по проценту побед,
поэтому без порога любой, кто сыграл одну партию и выиграл, стоит со своими 100%
выше того, кто выиграл сорок из шестидесяти. Порог — стандартный приём спортивных
таблиц. Следствие, которое видно новичку: пока сыграно меньше трёх партий,
лидерборд для него пуст, и текст пустого состояния это объясняет.

Ранжировать по числу побед вместо процента отвергнуто: владелец телефона
участвует почти в каждой партии и занял бы первое место объёмом, а не игрой.

**Важные следствия реализации:**

- `userId` получает **только помеченный создателем игрок** (в форме создания это отмечается явно и переживает перемешивание) — либо `user.id`, либо стабильный guest-UUID (`getGuestId()`). Остальные участники имеют `userId = null`, и агрегируются они по `participants[].id`, который берётся из ростера на устройстве.
- Отсюда граница: соперники склеиваются между играми **в пределах устройства**, на котором ведётся счёт. Один и тот же человек, отмеченный на двух разных телефонах, останется двумя строками. Связать их может только вход в аккаунт.
- Гостевые игры **тоже попадают** в лидерборд (guest-UUID стабилен на устройстве), но без профиля и с потерей истории при очистке localStorage. Регистрация даёт стабильный профиль, имя и ачивки.

---

## Ачивки

10 типов (`AchievementType` в `lib/types.ts`): `first_win`, `wins_10`, `wins_25`, `wins_50`, `win_streak_3`, `win_streak_5`, `survivor` (победа с 1 жизнью), `perfect_game` (победа без потери жизней), `pot_black_master` (5+ pot black за игру), `social_player` (10 игр с 4+ игроками).

- Начисление — исключительно в БД: `check_achievements` v2 (миграция 00011) сравнивает id как текст (без cast'ов JSON-значений в uuid), читает статы именно победителя, считает total wins/стрики/социальные игры и вставляет с `ON CONFLICT DO NOTHING`
- Клиент (`lib/achievements.ts`): `checkAchievements(userId, gameId)` вызывает RPC и возвращает только новые (`is_new`) ачивки; `getUserAchievements` — для профиля
- UI: тосты `components/achievements/achievement-toast.tsx` на экране игры, список — в профиле
- Ачивки за игру, синхронизированную позже (офлайн-очередь), приезжают событием `killerpool:achievements-unlocked` с буфером на случай, если провайдер ещё не подписался

---

## Наблюдаемость

Ошибки собирает Sentry (`instrumentation-client.ts` — браузер,
`instrumentation.ts` — сервер и edge, `app/global-error.tsx` — падения самого
корневого layout, до которых `app/error.tsx` не дотягивается, потому что живёт
внутри него).

Осознанные настройки:

- **Только ошибки, без трейсинга** (`tracesSampleRate: 0`) — вопрос стоит «что ломается», а не «что тормозит», а PWA платит за каждый килобайт
- **Молчит вне продакшена** — без DSN и в `next dev` SDK инертен, чтобы ошибки разработки не попадали в проект, который должен показывать падения пользователей
- **Ожидаемый сетевой шум отфильтрован** — офлайн-первый режим постоянно порождает `Failed to fetch` и подобное
- **Карты исходников** загружаются, если задан `SENTRY_AUTH_TOKEN`; без токена сборка не падает, просто трейсы остаются минифицированными. Загруженные карты удаляются из сборки и посетителям не отдаются

Проверять загрузку карт надо через `/projects/{org}/{project}/files/artifact-bundles/`:
современный формат — debug-id бандлы, а легаси-список файлов релиза показывает ноль
и вводит в заблуждение.

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

- Регистрирует `/sw.js`
- Запускает `retryPendingSyncs()` при монтировании и на событиях `online` / `visibilitychange`
- Через `initInstallCapture()` (`lib/pwa-install.ts`) перехватывает `beforeinstallprompt` и `appinstalled`

### Установка приложения

`beforeinstallprompt` приходит один раз и рано — до того, как что-либо
смонтировано, — поэтому событие живёт в модуле-сторе вне React, а компонент
читает его через `useSyncExternalStore`. Кнопка (`components/pwa-install-button.tsx`)
стоит на главной и не рендерит ничего, если приложение уже установлено или
браузер установку не предлагает. В Safari события нет вовсе, поэтому там
показывается инструкция про «Поделиться → На экран Домой».

### Стратегия синхронизации

1. **Запись:** localStorage немедленно (optimistic); Supabase — при завершении игры (`autoSyncGame`) или на каждое действие при включённом шаринге (`syncActiveGameToSupabase`)
2. **Офлайн:** неудачный синк → `markPendingSync(game.id)` → retry при возвращении сети
2. **Conflict resolution:** last-write-wins; `mergeGamesWithSupabase()` (страница `/history`, кнопка Sync) при слиянии истории сравнивает `updatedAt` и берёт более новую версию

---

## Performance оптимизации

Реально применённые техники:

1. **optimizePackageImports** — `['lucide-react']` в `next.config.js`
3. **Бандлеры** — dev на Turbopack (`next dev`); production-сборка на webpack (`next build --webpack`): `@ducanh2912/next-pwa` генерирует service worker через webpack-хук, который Turbopack не выполняет — Turbopack-сборка выпускается без `sw.js`
3. **Динамические OG-изображения** — `app/opengraph-image.tsx` и `app/twitter-image.tsx` (статического og-image.png нет), `metadataBase` в `layout.tsx`
4. **SW-кеширование** — см. раздел PWA
5. **Форматы изображений** — `formats: ['image/avif', 'image/webp']` в `next.config.js`
6. **Bundle analyzer** — `npm run analyze` (`scripts/analyze-bundle.js`)

> Численные Lighthouse/Web Vitals-метрики в этом документе не приводятся — замеры не автоматизированы.

---

## Тестирование

Jest 30 + jsdom + Testing Library (`jest.config.ts`, `jest.setup.ts`). **12 сьютов, 218 тестов** (`npm test`):

| Область | Файлы |
|---------|-------|
| Игровая логика | `lib/__tests__/game-logic.test.ts` |
| Хранилище, ростер, очередь синка | `lib/__tests__/storage.test.ts` |
| Синк с Supabase | `lib/__tests__/sync.test.ts` |
| Машина состояний игры | `contexts/__tests__/game-context.test.tsx` |
| Маппер БД (в обе стороны) | `lib/__tests__/game-mapper.test.ts` |
| Ачивки | `lib/__tests__/achievements.test.ts` (гейтинг `checkAchievementsForGame` + хелперы) |
| Install-промпт | `lib/__tests__/pwa-install.test.ts` |
| Утилиты | `lib/__tests__/utils.test.ts` |
| UI-компоненты | `components/ui/__tests__/{button,badge,card}.test.tsx` |
| Игровые компоненты | `components/game/__tests__/player-card.test.tsx` |

Покрытие неравномерно и осознанно: чистая логика и слой ввода-вывода покрыты
(`game-logic` 86%, `storage` 89%, `sync` 88%, `game-context` 74%), страницы `app/**` —
нет. Общая цифра по проекту около 25% именно поэтому: она считается вместе со
всем UI, который тестами не покрыт.

`jest.setup.ts` не подменяет `localStorage` и `sessionStorage` — jsdom даёт оба
по-настоящему и раздельно, они лишь очищаются перед каждым тестом. Инъекция
ошибок хранилища делается через `jest.spyOn(Storage.prototype, …)`: присваивание
метода экземпляру на настоящем `Storage` молча не сработает.

**Проверка миграций.** SQL тестируется отдельно, вне Jest: `supabase/test/setup-local.sh`
поднимает временный Postgres, подменяет то, что даёт Supabase (схема `auth`, роли
`anon`/`authenticated`, `auth.uid()` через GUC), и накатывает всю цепочку с нуля.
`supabase/test/rls-policies.sql` проверяет политики **под ролями** — читать текст
политики недостаточно. Там же зафиксированы две ловушки Postgres, на которых легко
получить ложный результат: обычный `UPDATE`, не прошедший `USING`, не поднимает
ошибку (меняет ноль строк), а `WITH CHECK` у INSERT-политики применяется и к ветке
`DO UPDATE` любого upsert.

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
7. **RUM и product-аналитика** — не подключены (Sentry собирает ошибки, но не трейсинг и не поведение)
8. **Расширения лидерборда** — недельные/месячные таблицы, рейтинги среди друзей
9. **Push-уведомления** о приглашениях в игру
10. **Кастомные rulesets в UI** — таблица `rulesets` и политика на INSERT есть, но клиент всегда использует `DEFAULT_RULESET` (classic)
11. **Секрет хоста для расшаренной игры** — пока партия идёт, хост и зритель на уровне БД неразличимы (см. SECURITY.md); отличить их может только секрет, которого у зрителя нет
12. **Защита лидерборда от подделки** — аноним может вставить выдуманную завершённую игру с любым `participants[].userId`; лечится в `get_leaderboard`, а не в RLS
13. **Склейка гостевой и аккаунтной личности** — после входа в аккаунт прошлая гостевая статистика пропадает из `/stats`, а гостевые игры не восстанавливаются из облака (`created_by` у них `NULL`)

---

## Полезные ссылки

- [Next.js App Router Documentation](https://nextjs.org/docs/app)
- [Supabase Architecture](https://supabase.com/docs/guides/getting-started/architecture)
- [Supabase Realtime: postgres_changes](https://supabase.com/docs/guides/realtime/postgres-changes)
- [Tailwind CSS v4](https://tailwindcss.com/docs)
- [PWA Best Practices](https://web.dev/progressive-web-apps/)

---

**Документ обновлен:** 2026-07-07
