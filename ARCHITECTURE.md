# 🏗️ Architecture - Killerpool

Документация архитектуры Killerpool.app - PWA-приложения для игры в Killer Pool.

**Документ обновлен:** 2026-10-16 (сверен с реальным кодом)

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
- 📡 **Live sharing** — хост апсертит полную строку игры в таблицу `games`, зрители получают обновления через Supabase Realtime (`postgres_changes`). Сам хост на свою строку не подписан; писать гостевую игру может только его устройство — оно держит секрет хоста (миграция 00016)
- 📱 **PWA** — service worker через `@ducanh2912/next-pwa`, установка на домашний экран, офлайн-страница
- 🔄 **Очередь выгрузки** — завершённая или брошенная игра ставится в очередь `killerpool_pending_sync` до первой попытки и покидает её только после подтверждённой записи (или окончательного отказа)
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
│  │                  │  │ shared_game  │  │               │  │
│  │                  │  │ host_secrets │  │               │  │
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
| **TypeScript** | 5.9 (strict) | Type safety |
| **Tailwind CSS** | 4.3 | Utility-first CSS, токены через `@theme` в `app/globals.css` |
| **shadcn/ui** | — | UI компоненты (Radix UI + CVA) |
| **Motion** | 12 | Анимации (`motion/react`, бывший Framer Motion); `MotionConfig reducedMotion="user"`, CSS-анимации гасит `@media (prefers-reduced-motion: reduce)` в `app/globals.css` |
| **Lucide React** | 0.577 | Иконки |
| **qrcode** | 1.5 | QR-код в invite modal |
| **html2canvas-pro** | 2.5 | Экспорт скриншота игры (импортируется динамически) |
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
| **Prettier** | Форматирование (`.prettierrc`; `*.md` исключены) |
| **Supabase CLI** | Применение миграций (`supabase db push`) и генерация типов |

> Отдельного `tailwind.config.ts` нет — Tailwind 4 конфигурируется прямо в CSS (`@import 'tailwindcss'`, `@theme`, `@custom-variant` в `app/globals.css`).

---

## Архитектурные принципы

### 1. **Client-first game state**

Игра полностью считается на клиенте:
- `lib/game-logic.ts` — чистые функции (`createGame`, `applyAction`, `undoLastAction`, `abandonGame`, `addPlayerToGame` и селекторы)
- `contexts/game-context.tsx` — единственный React Context, оркестрирующий состояние, персист, выгрузку и шаринг
- Supabase — вторичное хранилище: для шаринга, истории, лидерборда и ачивок

### 2. **No API layer**

REST-эндпоинтов нет (`app/api` не существует). Клиент ходит в Supabase напрямую через `createClient()` из `lib/supabase/client.ts`; доступ ограничивается RLS-политиками и `SECURITY DEFINER` RPC-функциями.

### 3. **Offline-first**

- localStorage — первичное хранилище (`killerpool_current_game`, `killerpool_game_history` до 50 игр)
- Service Worker кеширует статику и Supabase-ответы (NetworkFirst)
- Завершённые и брошенные игры ставятся в очередь `killerpool_pending_sync` **до** попытки выгрузки и догоняются `retryPendingSyncs()`

### 4. **Mobile-First**

- Touch-жесты: свайпы по карточке игрока (`swipeable-player-card.tsx`): **влево = MISS, вправо = POT, вверх = POT BLACK** (порог 100px или velocity 500)
- Те же три хода — кнопками Miss / Black / Pot под карточкой и стрелками клавиатуры (← Miss, ↑ Black, → Pot): свайп не единственный путь
- Цвета и иконки ходов заданы в одном месте — `components/game/action-styles.ts` — и одинаковы на главной, в карточке, истории, статистике и помощи
- Haptic feedback (`lib/haptic.ts`)
- PWA с установкой на домашний экран; масштабирование страницы не запрещено (в `viewport` нет `maximumScale`)

### 5. **Type Safety**

- `strict: true` в tsconfig
- Типы БД в `lib/types/database.types.ts` генерируются из продовой схемы, руками не правятся:
  `npx supabase gen types typescript --linked --schema public > lib/types/database.types.ts` (после каждой миграции). Единственное исключение — `games.host_secret_hash`, вписанная руками до того, как 00016 дойдёт до прода; после неё файл перегенерируется
- Единый маппинг между строкой БД и доменным типом в обе стороны: `mapDbGameToGame` и `mapGameToDbRow` (`lib/game-mapper.ts`)

---

## Структура проекта

```
killerpool/
│
├── app/                          # Next.js App Router
│   ├── layout.tsx                # Root layout (lang="en", metadataBase,
│   │                             #   GameProvider, PWAInit, MotionProvider,
│   │                             #   инлайн-скрипт темы)
│   ├── page.tsx                  # Home page (правила, тема, ссылка на /help);
│   │                             #   рендерится на сервере, ждёт только баннер
│   │                             #   Resume и кнопка входа
│   ├── globals.css               # Tailwind 4: @theme токены, @custom-variant dark
│   ├── error.tsx / loading.tsx / not-found.tsx
│   ├── global-error.tsx          # Падения самого layout (вне error.tsx)
│   ├── opengraph-image.tsx       # OG-картинка (Node.js runtime)
│   ├── twitter-image.tsx         # Twitter-картинка (реэкспорт OG)
│   ├── robots.ts / sitemap.ts    # SEO
│   │
│   ├── auth/
│   │   ├── page.tsx              # Серверная часть: ?error=<код> → сообщение
│   │   ├── auth-form.tsx         # Login (Google OAuth + Magic Link + гость)
│   │   ├── auth-errors.ts        # Коды ошибок входа и их тексты
│   │   └── callback/route.ts     # exchangeCodeForSession → "/" или /auth?error=<код>
│   │
│   ├── game/
│   │   ├── new/page.tsx          # Создание игры
│   │   └── [id]/page.tsx         # Активная игра / spectator mode / экран победителя
│   │
│   ├── history/                  # История игр (+ [id] — детали и экспорт;
│   │                             #   history-utils.ts — фильтры)
│   ├── leaderboard/page.tsx      # Лидерборд (RPC get_leaderboard)
│   ├── stats/                    # Статистика (compute-stats.ts — расчёт)
│   ├── profile/page.tsx          # Профиль (protected route)
│   ├── help/page.tsx             # Правила и жесты
│   └── offline/page.tsx          # Офлайн-фолбэк service worker'а
│
├── components/
│   ├── ui/                       # shadcn/ui: button, card, avatar, badge,
│   │   │                         #   input, label, dialog, bottom-sheet
│   │   └── __tests__/            # Тесты компонентов
│   ├── game/                     # player-card, swipeable-player-card,
│   │   │                         #   invite-modal, black-ball-celebration,
│   │   │                         #   action-styles.ts (цвета ходов)
│   │   └── __tests__/
│   ├── achievements/             # achievement-card, achievement-toast, list
│   ├── leaderboard/              # leaderboard-card, leaderboard-list
│   ├── theme.ts                  # Тема: THEME_SCRIPT, чтение/запись выбора
│   ├── theme-toggle.tsx          # Переключатель Light / Dark / System
│   ├── motion-provider.tsx       # prefers-reduced-motion для motion-компонентов
│   ├── pwa-init.tsx              # retryPendingSyncs + install-промпт
│   └── pwa-install-button.tsx    # Кнопка установки (на главной)
│
├── contexts/
│   ├── game-context.tsx          # GameProvider: state, персист, выгрузка,
│   │                             #   шаринг, ачивки
│   └── __tests__/
│
├── hooks/
│   ├── use-realtime-game.ts      # useRealtimeGame (подписка зрителя)
│   └── use-install-prompt.ts     # Состояние install-промпта (внешний стор)
│
├── lib/
│   ├── game-logic.ts             # Чистые функции игры
│   ├── game-mapper.ts            # Game ↔ строка БД (в обе стороны)
│   ├── storage.ts                # localStorage: игры, ростер, guest ID,
│   │                             #   очередь выгрузки, надгробия, шаринг
│   ├── sync.ts                   # Запись в Supabase: владелец, порядок
│   │                             #   записей, очередь с ретраями
│   ├── host-secret.ts            # Секрет хоста игры (00016): localStorage,
│   │                             #   SHA-256, заголовок x-host-secret
│   ├── realtime.ts               # Подписки на postgres_changes
│   ├── achievements.ts           # checkAchievements (RPC) + событие о поздних
│   ├── pwa-install.ts            # Перехват beforeinstallprompt (вне React)
│   ├── site.ts                   # getBaseUrl для метаданных и sitemap
│   ├── invite.ts / export.ts / haptic.ts / utils.ts
│   ├── supabase/
│   │   ├── client.ts             # createBrowserClient (Client Components)
│   │   ├── server.ts             # createServerClient (route handlers)
│   │   └── middleware.ts         # updateSession (для proxy.ts)
│   ├── types.ts                  # Game, Player, Ruleset, ачивки
│   ├── types/database.types.ts   # Типы Supabase-схемы (генерируются)
│   └── __tests__/                # Тесты lib-слоя
│
├── supabase/
│   ├── migrations/               # 00001–00016 (см. раздел про БД)
│   ├── debug/leaderboard.sql     # Отладочные запросы для SQL Editor (v6)
│   └── test/                     # Локальный Postgres + проверка RLS под ролями
├── public/                       # manifest.json, иконки, favicon.ico (ICO),
│                                 #   sw.js и workbox-* (генерируются)
├── scripts/                      # generate-icons.js, bundle-size.js
├── docs/archive/                 # Исторические PDF и скриншот
├── __tests__/                    # Тест гейта Sentry (instrumentation)
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

> `middleware.ts` и `tailwind.config.ts` **не существуют** — их заменили `proxy.ts` (конвенция Next 16) и CSS-конфигурация Tailwind 4. Страницы `/sync` тоже нет: ручную выгрузку делает кнопка Sync на `/history`.

---

## Слои приложения

### Layer 1: Presentation (UI)

**Компоненты:** `app/*/page.tsx`, `components/ui/*`, `components/game/*`

Почти все игровые экраны — Client Components (`'use client'`): игра интерактивна и живёт в браузере. Ленивой загрузки компонентов нет: обёртки `next/dynamic` лежали в `components/lazy-components.tsx`, но ни один экран их не импортировал, поэтому файл удалён как мёртвый. Динамически импортируется только `html2canvas-pro` — в момент нажатия «скриншот». Если понадобится вынести `qrcode` из основного чанка, `dynamic()` ставится прямо в месте импорта.

Системных `alert`/`confirm` в приложении нет. Подтверждение End Game — в `BottomSheet` (там же сказано, что значит закончить: победителя нет, игра остаётся в истории как незаконченная, зрители видят конец), удаление игры из истории — тоже в `BottomSheet` «Delete this game?»: игра удаляется только с этого устройства, а выгруженная копия по-прежнему считается в лидерборде. Ошибка формы новой игры — inline рядом с кнопкой Start; неудача включения шаринга — текстом и кнопкой «Try again» в invite modal, неудача скачивания QR — строкой под кнопкой; исход экспорта на странице игры в истории (ошибка CSV или скриншота, «summary copied») — под кнопками экспорта, в live-регионе (`role="alert"` для ошибки, `role="status"` для сообщения).

Главная (`app/page.tsx`) рендерится на сервере целиком: сохранённая игра лежит в localStorage и известна только после гидрации, поэтому ждёт её один баннер «Resume», а кнопка Sign In / Profile появляется, когда `GameProvider` прочитал сессию (`currentUserId`). Своей подписки на auth у страницы нет.

### Layer 2: Business Logic

**Файлы:** `lib/game-logic.ts` (чистые функции), `contexts/game-context.tsx` (state management)

```typescript
// lib/game-logic.ts — реальные сигнатуры
export function createGame(
  players: NewGamePlayerInput[],          // { name, avatar, isOwner?, id? }
  ruleset: Ruleset = DEFAULT_RULESET,
  userId?: string | null,
  createdBy: string | null | undefined = userId
): Game

export function applyAction(game: Game, action: GameAction): Game
export function undoLastAction(game: Game): Game
export function abandonGame(game: Game): Game
export function addPlayerToGame(
  game: Game,
  playerName: string,
  playerAvatar: string,
  playerId?: string
): Game
```

`createGame` и `addPlayerToGame` бросают ошибку сверх `MAX_PLAYERS = 32` игроков (выбывшие считаются): столько допускает CHECK `games_participants_max` в 00015, и игра крупнее никогда бы не выгрузилась. Форма новой игры и экран игры отключают добавление у предела.

`applyAction` меняет жизни по правилам ruleset (`miss: -1`, `pot: 0`, `pot_black: +1`), ограничивает их `max_lives` (6), помечает элиминацию при `lives <= 0`, пишет запись в `history` и определяет победителя (последний неэлиминированный игрок → `status: 'completed'`). На неактивной игре бросает `'Game is not active'`. `abandonGame` переводит активную игру в `'abandoned'` со свежим `updatedAt`.

Две разные «личности» в `createGame`:

- **`userId`** получает **только игрок, помеченный `isOwner`** («это я» в форме), а не первый по счёту: форма умеет перемешивать строки и отбрасывает безымянные. Без метки — откат на индекс 0, а если «это я» сняли, форма передаёт `userId = null`, и его не получает никто. Остальные игроки — `userId: null`, их трекают по `id` из ростера.
- **`createdBy`** — кто создал игру: uid аккаунта или guest-UUID устройства. Он записывается в `Game.createdBy` всегда, даже когда «это я» никто не отмечен, и по нему выгрузка решает, каким аккаунтом можно писать игру (см. [Владелец строки](#владелец-строки-и-порядок-записей)).

```typescript
// app/game/new/page.tsx
const userId = currentUserId || getGuestId()   // currentUserId из useGame()
const game = createGame(entries, DEFAULT_RULESET, meRowId === null ? null : userId, userId)
```

### Layer 3: Data Access & Sync

**Файлы:** `lib/storage.ts`, `lib/sync.ts`, `lib/host-secret.ts`, `lib/realtime.ts`, `lib/game-mapper.ts`, `lib/supabase/*`

- `storage.ts` — localStorage-ключи: `killerpool_current_game`, `killerpool_game_history` (последние 50, completed и abandoned), `killerpool_guest_id`, `killerpool_roster`, `killerpool_pending_sync` + `killerpool_pending_sync_meta` (очередь и попытки), `killerpool_deleted_games` (надгробия), `killerpool_shared_game` (id расшаренной игры); `killerpool_rematch_players` — в sessionStorage. Историю страница `/history` читает как внешний стор через `useSyncExternalStore` (`subscribeToGameHistory` + `readGameHistorySnapshot`): `saveGameHistory` оповещает своё окно событием, другие вкладки узнают из `storage`
- `sync.ts` — `syncFinishedGame` (completed или abandoned, через очередь), `syncActiveGameToSupabase` (любой статус, для live sharing, без очереди), `retryPendingSyncs` (дренаж очереди), `mergeGamesWithSupabase` (кнопка Sync на `/history`), `loadGamesFromSupabase`, `isSupabaseAvailable`. Массовой выгрузки всей истории (`syncAllGamesToSupabase`) больше нет: невыгруженное ждёт в очереди
- `host-secret.ts` — секрет хоста (00016): `createHostSecret` (зовёт `startGame`), `getHostSecret`, `hashHostSecret`, ключ `killerpool_host_secrets` (последние 50 игр). Секрет есть только у игры, начатой на этом устройстве; `upsertGameRow` кладёт его SHA-256 в строку и сам секрет — в заголовок `x-host-secret`, см. [Владелец строки](#владелец-строки-и-порядок-записей)
- `realtime.ts` — `subscribeToGame` / `unsubscribeFromGame`: только для зрителя, уникальный топик на каждую подписку
- `game-mapper.ts` — единственная точка конверсии строки `games` ↔ `Game` (snake_case ↔ camelCase, фолбэк `currentPlayerIndex` для старых строк, `ruleset = DEFAULT_RULESET`); его же использует realtime-обработчик. `host_secret_hash` в `Game` не попадает: объект игры уходит в историю, экспорт и к зрителям

### Layer 4: Infrastructure

**Файлы:** `proxy.ts`, `lib/supabase/middleware.ts`, `app/auth/callback/route.ts`, `next.config.js`, `vercel.json`, `instrumentation*.ts`

```typescript
// proxy.ts — вся серверная логика запроса
export async function proxy(request: NextRequest) {
  return await updateSession(request)
}
```

`matcher` исключает всё, чему сессия не нужна: `_next/static`, `_next/image`, `favicon.ico` и любые картинки, файлы next-pwa (`sw.js`, `workbox-*.js`, `swe-worker-*.js`, `fallback-*.js`), `manifest.json`, `robots.txt`, `sitemap.xml`, `opengraph-image` и `twitter-image`. `updateSession` делает сетевой `getUser()`, а service worker сам запрашивает часть этих файлов на каждой проверке обновлений.

---

## Потоки данных

**Кто вошёл.** `GameProvider.currentUserId` следует за `onAuthStateChange`: `undefined`, пока сессия не прочитана, `null` у гостя, uid у вошедшего — и меняется сразу при входе, выходе или смене аккаунта в другой вкладке. Из него `/game/new` берёт, под кем создать игру, экран победителя — «это я выиграл?» и какие плашки показывать (пока `undefined`, не показывает ни одной), а главная — показать Sign In или Profile. Под кем уходит запись в Supabase, решает отдельный кеш личности в `lib/sync.ts`, который сверяется с сервером.

### 1. Локальная игра (без шаринга)

```
User Input (game/new)
        │
        ▼
createGame(игроки с id из ростера, DEFAULT_RULESET, userId «это я», createdBy)
        │
        ▼
GameProvider.startGame(game)          ← шаринг выключен; идущая игра,
        │                                если была, уходит в abandoned;
        │                                createHostSecret(game.id) — секрет
        │                                хоста в killerpool_host_secrets
        ▼
performAction('miss'|'pot'|'pot_black')   ← свайп, кнопка или стрелка
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

**Хост** (`InviteModal` → `enableSharing()` в game-context):

```
Invite Players (components/game/invite-modal.tsx)
   │                                 ссылки и QR ещё нет: «Enabling live sharing...»
   ▼
enableSharing()
   │
   ▼
syncActiveGameToSupabase(game)    ← upsert ПОЛНОЙ строки games (onConflict: 'id');
   │                                 в строке host_secret_hash = sha256(секрет),
   │                                 первый INSERT его фиксирует; сам секрет —
   │                                 в заголовке x-host-secret
   ├─ не удалось → «Live sharing couldn't be turned on» + Try again; ссылки нет
   ▼
markCurrentGameShared(game.id)    ← killerpool_shared_game: переживает перезагрузку
setIsSharingEnabled(true)         ← только теперь модалка показывает ссылку и QR
   │
   ▼
Каждое новое состояние игры (ход, undo, новый игрок)
   → эффект шаринга → syncActiveGameToSupabase(game), с тем же заголовком
     (завершённое состояние пишет конвейер завершения, см. ниже)
```

Ссылка ждёт первой записи по двум причинам. Зрителю без строки показывать
нечего. И главное — вставка в `games` открыта, а хеш секрета задаёт первая
строка с этим id: покажи модалка ссылку раньше, кто-то успел бы вставить строку
с этим id первым и забрать игру себе (со своим хешем — записи хоста отвергаются,
без хеша — игра открыта любому). Пока запись в пути или если она не удалась
(офлайн), ссылки и QR нет. Зритель, открывший модалку, видит ссылку сразу —
его игра уже в базе.

Хост **не подписан** на свою строку: он единственный её писатель, а прежняя
подписка вливала каждое эхо обратно в локальное состояние, и запоздавшее эхо
одного хода могло откатить следующий. После перезагрузки страницы
`isCurrentGameShared(id)` возвращает шаринг, и эффект заново отправляет
восстановленное состояние — заодно добивая запись, которую оборвала перезагрузка.

**Зритель** (открывает `/game/[id]` без этой игры в localStorage):

```
loadGameFromSupabase(gameId)      ← SELECT * FROM games WHERE id = ...
   │                                 (разрешено политикой games_select_all)
   ▼
mapDbGameToGame(row) → setSpectatorGame(game)
   │
   ▼
useRealtimeGame(gameId)           ← hooks/use-realtime-game.ts
   │
   ▼
subscribeToGame(gameId, ...)      ← топик `game:{id}:{n}` — свой на каждую
   │                                 подписку; postgres_changes UPDATE,
   │                                 filter id=eq.{id}
   ▼
На каждый UPDATE: mapDbGameToGame(payload.new) → state зрителя
На каждый переход в SUBSCRIBED: догоняющий SELECT строки
```

Уникальный топик нужен потому, что realtime-js на повторный запрос того же топика
отдаёт уже существующий канал, а `removeChannel` асинхронен: StrictMode, уход и
возврат зрителя получали старый, ещё не отписанный канал, и realtime молча
останавливался. Догоняющий SELECT забирает ходы, сделанные, пока канал не был
подписан (между загрузкой и подпиской, во время переподключения); если за время
запроса пришло realtime-обновление, побеждает оно.

Broadcast-каналов и presence **нет** — весь realtime построен на `postgres_changes` по таблице `games` (она добавлена в publication `supabase_realtime` в миграции 00009). Спектаторский режим read-only: localStorage не трогается, действия недоступны. Выход из режима зрителя возвращает на экран собственную активную игру зрителя, если она была.

### 3. Завершение игры + ачивки

При `game.status === 'completed'` срабатывает эффект персиста в game-context; `handledCompletionRef` не даёт обработать одно завершение дважды и сбрасывается, как только игра выходит из `completed`:

```
game.status === 'completed'
   │
   ├─ saveToHistory(game)              ← localStorage (до 50 игр, запись с тем же
   │                                      id заменяется)
   │
   └─ syncFinishedGame(game)           ← markPendingSync ДО попытки, затем upsert
        │                                 через общий писатель (created_by — см. ниже)
        ▼
      setCompletionOutcome → resultSync ← 'saving' | 'saved' | 'retrying' |
        │                                  'refused' | 'other-account'
        │ ok
        ▼
      checkAchievementsForGame(game)   ← только если победитель — текущий аккаунт
        │
        ▼
      RPC check_achievements → setNewAchievements([...]) → тосты
```

RPC вызывается **после** синка, потому что читает строку игры из БД. Плашка на экране победителя (для вошедших) показывает `resultSync` — фактический исход записи: «сохранено» появляется только после подтверждённой выгрузки, а пока запись в полёте, в очереди, отвергнута или ждёт другого аккаунта, экран говорит именно это.

**Undo на экране победителя.** Кнопка «Undo last shot» отменяет последний ход, игра возвращается в `active`. Если конвейер завершения для неё уже отработал (победа могла уйти в Supabase), эффект персиста отправляет откатившееся состояние в строку (`syncActiveGameToSupabase`; при шаринге это и так делает эффект шаринга) — иначе лидерборд хранил бы отменённый результат. `retryPendingSyncs` такую игру не трогает, пока она снова идёт.

**Брошенная игра.** `endGame()` для активной игры и `startGame()` поверх идущей вызывают `recordAbandonedGame`: игра проходит через `abandonGame`, сохраняется в историю и — если она могла оказаться в Supabase (была расшарена, её победа выгружалась и потом отменена, она в очереди) — выгружается через `syncFinishedGame`. Так зрители видят конец игры, а отменённая победа уходит из лидерборда. Игра без единого хода, о которой Supabase не знает, просто отбрасывается.

### 4. Очередь выгрузки и ретраи

`lib/sync-manager.ts` и Background Sync API удалены. Текущая схема:

```
syncFinishedGame(game)                ← completed или abandoned
   │
   ├─ markPendingSync(game.id)        ← в очередь ДО попытки: вкладка, закрытая
   │                                     посреди запроса, не теряет игру
   ├─ writeGameRow(game)
   └─ исход:
        ok / 'refused'   → unmarkPendingSync (готово или никогда не получится)
        'other-account'  → clearSyncMeta (ничего не отправлялось, ждёт владельца)
        'retry'          → recordSyncFailure → killerpool_pending_sync_meta

retryPendingSyncs()          ← lib/sync.ts
   │  вызывается:
   │  - из components/pwa-init.tsx при монтировании,
   │    на window 'online' и на 'visibilitychange' (visible + navigator.onLine)
   │  - кнопкой Sync на /history (перед mergeGamesWithSupabase)
   ▼
для каждого id:
   → исчерпан (старый флаг permanent или 14 дней с первой неудачи) → выкинуть
   → рано (отсрочка 1 мин × 2^(n−1), не больше 6 часов) → пропустить
   → первая попытка ещё в полёте → пропустить
   → игры нет в истории → выкинуть из очереди
   → это текущая игра, и она снова active (отменённая победа) → пропустить
   → иначе writeGameRow; при успехе снять из очереди и начислить ачивки
```

Окончательные отказы определяет `PERMANENT_ERROR_CODES` в `lib/sync.ts` — коды
Postgres (`42501`, `42703`, `22P02`, `22001`, `22003`, `22007`, `22008`,
`23502`, `23503`, `23505`, `23514`) и PostgREST (`PGRST204` — колонки нет в
схеме, `PGRST102` — битое тело запроса). Всё остальное — сеть, истёкший токен,
5xx — повторяется. Ошибка `getUser()`, кроме «сессии нет», тоже временная: если
считать её гостем, игра ушла бы без владельца, RLS отказал бы с `42501`, и этот
отказ стал бы окончательным.

Прежний предел в пять попыток при базе в одну минуту означал отказ примерно
через четверть часа: телефон, проведший вечер офлайн, терял все игры вечера.
Теперь игру держат до 14 дней с первой неудачи, а пауза между попытками растёт
до 6 часов. Ачивки за поздний синк доезжают до тостов через событие —
`retryPendingSyncs` вызывается из `PWAInit`, а он сиблинг `GameProvider` и до
его состояния не дотягивается.

Счётчик попыток лежит в отдельном ключе, чтобы `killerpool_pending_sync`
оставался простым массивом строк: это PWA, и часть пользователей какое-то время
работает со старым бандлом из кеша service worker — он должен уметь дренировать
очередь, которую записал новый.

### Владелец строки и порядок записей

Все записи в `games` идут через одну пару функций в `lib/sync.ts`.

**Владелец (`rowOwner`).** `created_by` строки определяется тем, кто создал
игру (`Game.createdBy`), а не тем, кто вошёл в момент записи:

| `Game.createdBy` | Кто вошёл | `created_by` в строке |
|------------------|-----------|------------------------|
| guest-UUID этого устройства, старый `guest_…` или пусто | никто | `NULL` |
| то же | аккаунт A | `A` — гостевая игра усыновляется первым INSERT после входа |
| аккаунт A | аккаунт A | `A` |
| аккаунт A | никто или аккаунт B | запись не уходит: `'other-account'`, игра ждёт в очереди входа A |

Записать игру аккаунта анонимно значило бы отказаться от неё, а выбросить —
потерять; поэтому она ждёт. Кто вошёл, спрашивается один раз за сессию
(`getUser` кешируется и сбрасывается на смену аккаунта), профиль
`player_profiles` создаётся один раз на аккаунт.

**Секрет хоста (00016, `lib/host-secret.ts`).** `startGame` создаёт для игры
32 случайных байта и кладёт их в localStorage `killerpool_host_secrets`
(`{ [gameId]: secret }`, последние 50; повторный старт той же игры секрет не
меняет). `upsertGameRow` берёт секрет игры (`getHostSecret`), кладёт в строку
`host_secret_hash = hex(sha256(секрет))` (`hashHostSecret`, Web Crypto) и шлёт
сам секрет заголовком `x-host-secret` — на этот запрос, а не на общий клиент:
браузерный клиент один на всё приложение, а секрет принадлежит одной игре.
`games_update_anon` пускает запись `anon` в строку с хешем только с верным
секретом; хеш неизменяем после INSERT (триггер `games_keep_host_secret`).

Секрета нет у игры, которую начал старый бандл, у игры аккаунта, пришедшей с
другого устройства через merge, и там, где секрет не сохранить или не
захешировать (нет localStorage, нет `crypto.subtle` вне secure context): такая
игра пишется без хеша и защищена так же, как до 00016. Если база ещё без
колонки (миграция не применена или PostgREST не перечитал схему), запись
получает `PGRST204` с именем `host_secret_hash`; клиент один раз повторяет её
без колонки, иначе завершённая игра ушла бы из очереди как отвергнутая.
Без секрета гостевую игру с хешем не запишет никто, хост тоже (`42501`,
окончательный). Обычно это незаметно: на другом устройстве игра открывается
как у зрителя, а очистка данных сайта стирает игру вместе с секретом. Заметно
при откате клиента на версию до 00016 — она заголовок не шлёт и игры, начатые
новой версией, не допишет, пока защита включена.

**Порядок (`writeGameRow`).** Для одной игры в полёте не больше одной записи;
всё, что пришло за это время, ждёт, и уходит только последнее ожидающее
состояние — каждая запись это полная строка, промежуточные ничего не добавляют.
Раньше каждый ход расшаренной игры стрелял своим upsert, и запись хода N могла
лечь после записи хода N+1, оставив в базе устаревшее состояние. Тот же писатель
упорядочивает конвейер завершения и очередь ретраев.

---

## Авторизация и безопасность

### Auth-флоу

- **Google OAuth (PKCE)** и **Magic Link** через Supabase Auth (форма — `app/auth/auth-form.tsx`)
- **Guest mode**: без записи в auth — стабильный UUID в localStorage (`killerpool_guest_id`, `getGuestId()` в `lib/storage.ts`). Он попадает в `userId` игрока, отмеченного «это я», и в `Game.createdBy`; в БД гостевая игра имеет `created_by = NULL`

```typescript
// app/auth/callback/route.ts (сокращённо)
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  // Отказ может прийти прямо в редиректе, без code
  const providerError = searchParams.get('error')
  if (providerError || !code) {
    return redirectToAuth(origin, classifyAuthError({ errorCode: searchParams.get('error_code'), error: providerError }))
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) return redirectToAuth(origin, classifyAuthError({ errorCode: error.code }))

  return NextResponse.redirect(new URL('/', origin))
}
```

Неудачный вход возвращает на `/auth?error=<код>`, где код — один из
`cancelled`, `link_expired`, `other_browser`, `callback_failed`
(`app/auth/auth-errors.ts`). В URL уходит только код, никогда текст провайдера:
свободный `?error=` позволил бы любой ссылке написать на странице входа что угодно.
`app/auth/page.tsx` превращает код в сообщение на сервере.

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

Заголовки заданы **только в `vercel.json`** (в `next.config.js` секции `headers()` нет), на все пути:

```json
"headers": [
  { "key": "X-Content-Type-Options", "value": "nosniff" },
  { "key": "X-Frame-Options", "value": "DENY" },
  { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
  { "key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=(), payment=(), usb=(), accelerometer=(), gyroscope=(), magnetometer=(), browsing-topics=()" }
]
```

`X-XSS-Protection` убран: современные браузеры его игнорируют, а старые с ним
были уязвимее. **CSP не настроен** (см. Planned).

### Environment variables

- `NEXT_PUBLIC_SUPABASE_URL` — обязательна
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — обязательна
- `NEXT_PUBLIC_APP_URL` — необязательна; `lib/site.ts` иначе берёт `NEXT_PUBLIC_VERCEL_URL` (системная переменная Vercel с доменом деплоя), а вне Vercel — `https://killerpool.app`
- `NEXT_PUBLIC_SENTRY_DSN` — необязательна; без неё Sentry молчит
- `SENTRY_AUTH_TOKEN` — только на этапе сборки, загрузка карт исходников
- `NEXT_PUBLIC_VERCEL_ENV` / `VERCEL_ENV` — системные переменные Vercel, вручную не заводятся; по ним Sentry решает, включаться ли (см. [Наблюдаемость](#наблюдаемость))

Service-role ключа нет: приложение целиком клиентское, серверных операций с
Supabase не существует, и ключ, обходящий RLS, в проекте не нужен.

---

## Схема базы данных и RLS

Миграции: `supabase/migrations/00001–00016`. Подробности по каждой — в [supabase/README.md](./supabase/README.md#-миграции-все-16), порядок выкладки — в разделе [Деплой](#деплой).

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
-- + host_secret_hash TEXT (миграция 00016, секрет хоста)
```

Что добавила `00015`:

- **Даты принадлежат серверу.** Триггер `games_server_timestamps` (BEFORE INSERT OR UPDATE, заменил `update_games_updated_at`): на INSERT `created_at := LEAST(клиентская, now())` — прошлое разрешено, офлайн-игру заливают позже, будущее нет — и `updated_at := now()`; на UPDATE `created_at` не меняется, `updated_at := now()`. Игра, датированная 2999 годом, больше не может навсегда стать «самой свежей»
- **Размер и победитель** (CHECK): `games_participants_max` (≤ 32 участника), `games_history_max` (≤ 1000 записей), `games_payload_size` (`participants` + `history` ≤ 512 КиБ JSON-текста), `games_winner_is_participant` (`winner_id` — NULL или id участника). Нарушение — `23514`, клиент считает его окончательным
- **Удаление аккаунта** (`ON DELETE SET NULL`) не считается записью: даты сохраняются, незаконченные игры становятся `abandoned`

Что добавила `00016`:

- **`host_secret_hash`** — `hex(sha256(секрет хоста))`, CHECK `games_host_secret_hash_format` (NULL или 64 символа `[0-9a-f]`). Пишет его первый INSERT с устройства хоста; триггер `games_keep_host_secret` (BEFORE UPDATE) на каждом UPDATE возвращает старое значение, так что хеш нельзя ни подменить, ни стереть, ни поставить на строку, вставленную без него. `NULL` — игра старого клиента или браузера без `crypto.subtle`
- **`games_update_anon`** — условия 00015 плюс совпадение хеша с заголовком `x-host-secret` (см. таблицу ниже)

- **player_profiles** — `user_id → auth.users`, `display_name`, `avatar_url`; создаётся лениво при первой записи под аккаунтом (`ensurePlayerProfile` в `lib/sync.ts`)
- **rulesets** — JSONB `params`; дефолтный сид "Classic Killer Pool" после миграции 00011: `starting_lives: 3, miss: -1, pot: 0, pot_black: 1, max_lives: 6` (совпадает с `DEFAULT_RULESET` в `lib/types.ts`); с 00015 дефолтный ruleset ровно один (уникальный индекс `idx_rulesets_one_default`)
- **user_achievements** (00007) — `UNIQUE(user_id, achievement_type)`, `game_id` nullable

### Финальные RLS-политики games (00009, ужесточены в 00014, 00015 и 00016)

| Политика | Операция | Роли | Условие |
|----------|----------|------|---------|
| `games_select_all` | SELECT | anon, authenticated | `USING (true)` — публичное чтение любой игры (spectator mode) |
| `games_insert_authenticated` | INSERT | authenticated | `WITH CHECK (created_by = auth.uid())` |
| `games_insert_anon` | INSERT | anon | `WITH CHECK (created_by IS NULL)` |
| `games_update_authenticated` | UPDATE | authenticated | `USING` и `WITH CHECK`: `created_by = auth.uid()` |
| `games_update_anon` | UPDATE | anon | `USING (created_by IS NULL AND created_at > now() - interval '24 hours' AND (status = 'active' OR updated_at > now() - interval '1 hour') AND (host_secret_hash IS NULL OR host_secret_hash = <sha256 заголовка x-host-secret из request.headers>))`, `WITH CHECK (created_by IS NULL)` |
| `games_delete_authenticated` | DELETE | authenticated | `USING (created_by = auth.uid())` |

Публикация `supabase_realtime` включает `games` начиная с 00009.

Что закрыли 00014–00016 и почему именно так — в [SECURITY.md](./SECURITY.md#row-level-security-rls). Коротко: до 00014
любой залогиненный пользователь одним запросом присваивал себе чужую гостевую
игру, и её настоящий хост, будучи `anon`, терял доступ навсегда. С 00015 гостевая
игра записываема для `anon` не дольше суток от серверного `created_at`, а
завершённая или брошенная — ещё и не дольше часа после последней записи. Оба
условия — окно, а не запрет: завершение игры это три гоночные записи, а отмена
после победы легальна, поэтому жёсткое «завершённую не трогать» сломало бы
нормальный ход партии. Заливка офлайн-игры через несколько дней — это INSERT, на
него ограничения не действуют.

С 00016 внутри этого окна гостевую игру с хешем пишет только устройство хоста:
хост и зритель — одна роль с одной ссылкой, разделяет их только секрет. Открытыми
остаются игры без хеша (до конца своих суток) и первый INSERT: вставка не
ограничена, и первая строка с данным id задаёт хеш. Поэтому invite modal
показывает ссылку только после первой записи хоста (см. [Live sharing](#2-live-sharing--зритель)).

### RLS user_achievements (после миграции 00011)

- SELECT: `"Users can view all achievements"` — `USING (true)`
- INSERT-политик **нет**: политики `"Service role can insert achievements"` (реально позволявшая любому authenticated вставлять себе ачивки — cheat vector) и `"Users can view own achievements"` (избыточная) удалены в 00011
- Запись — только через RPC `check_achievements` (`SECURITY DEFINER`, `GRANT EXECUTE ... TO authenticated`)

### RLS player_profiles и rulesets (после миграции 00015)

- `player_profiles`: SELECT для всех; INSERT — только `authenticated` и только свой (`user_id = auth.uid()`); до 00015 политика без `TO` и с `OR user_id IS NULL` позволяла `anon` плодить профили без владельца. UPDATE/DELETE — своя запись
- `rulesets`: SELECT для всех; INSERT-политики нет — клиент rulesets не пишет

### RPC-функции

- **`get_leaderboard(limit_count INTEGER DEFAULT 15, min_games INTEGER DEFAULT 3)`** — v6 из миграции 00015 (сигнатура из v5, 00013), `SECURITY DEFINER`, `GRANT anon + authenticated`
- **`check_achievements(p_user_id UUID, p_game_id UUID)`** — v3 из миграции 00015 (основа — v2 из 00011), `SECURITY DEFINER`, `GRANT` только `authenticated`

---

## Leaderboard Architecture

`components/leaderboard/leaderboard-list.tsx` вызывает RPC `get_leaderboard(limit_count)` — вся агрегация выполняется в PostgreSQL:

1. Берутся только `status = 'completed'` игры
2. Участники разворачиваются из JSONB (`jsonb_array_elements(participants)`)
3. Группировка по стабильному идентификатору — сравнения идут текстом, без приведения клиентского JSON к `uuid`:
   - нет `userId` (или это не UUID) → `participants[].id`;
   - `userId` — не аккаунт (guest-UUID устройства) → `userId`, как раньше: игры гостя-хоста складываются;
   - `userId` — аккаунт и совпадает с `created_by` строки → `userId`: это собственная игра аккаунта;
   - `userId` — аккаунт, но строку писал не он → `participants[].id`: подделка или чужая запись;
   - участник, сгруппированный по `id`, который сам является uid аккаунта, отбрасывается.

   «Аккаунт» — uid из `player_profiles.user_id` или `games.created_by`.
4. Считаются `total_games`, `games_won` (по уникальным играм), `games_lost`, `win_rate`, `total_actions`, `total_black_pots`
5. В рейтинг попадают только сыгравшие не меньше `min_games` партий (по умолчанию 3)
6. Ранжирование: `ORDER BY win_rate DESC, games_won DESC, total_games DESC`, тай-брейк по идентификатору — чтобы равные игроки не менялись местами между вызовами
7. Имя — из `player_profiles.display_name` (если есть профиль), иначе имя игрока из самой свежей его игры

Таблица `games` записывается анонимами, поэтому `participants`/`history` — недоверенный ввод. До миграции 00012 функция кастовала оттуда id в `uuid` без проверок, и одна игра с некорректным id роняла RPC для **всех** пользователей. Теперь единственный `::uuid` защищён regex'ом, а участник без пригодного идентификатора просто выпадает из выдачи. До 00015 любой аноним одной вставкой добавлял победу или поражение в строку любого зарегистрированного игрока и переименовывал его; правило из пункта 3 это закрывает для аккаунтов (кроме ещё ничего не записавшего).

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
- Гостевая игра, усыновлённая первым INSERT после входа (`created_by` = uid, а у хоста `userId` = guest-UUID), продолжает считаться вместе с гостевыми играми устройства, под guest-UUID, а не под аккаунтом.

---

## Ачивки

10 типов (`AchievementType` в `lib/types.ts`): `first_win`, `wins_10`, `wins_25`, `wins_50`, `win_streak_3`, `win_streak_5`, `survivor` (победа с 1 жизнью), `perfect_game` (победа без потери жизней), `pot_black_master` (5+ pot black за игру), `social_player` (10 игр с 4+ игроками).

- Начисление — исключительно в БД: `check_achievements` v3 (миграция 00015) сравнивает id как текст (без cast'ов JSON-значений в uuid), читает статы именно победителя, считает total wins/стрики/социальные игры и вставляет анти-джойном (`INSERT ... WHERE NOT EXISTS`, гонку добивает обработка `unique_violation`)
- v3 считает **только игры с `created_by = p_user_id`** — и саму игру, и суммарные победы, серию и социальные игры: подброшенная анонимом игра с чужим `userId` не даёт жертве ни побед, ни ачивок и не обрывает серию. `perfect_game` требует хотя бы одного хода победителя (v2 выдавала его за победу без единого удара)
- Клиент (`lib/achievements.ts`): `checkAchievementsForGame(game)` проверяет, что победитель — текущий аккаунт, и зовёт `checkAchievements(userId, gameId)`, который вызывает RPC и возвращает только новые (`is_new`) ачивки; `getUserAchievements` — для профиля
- UI: тосты `components/achievements/achievement-toast.tsx` рендерятся на уровне приложения (в `GameProvider`), список — в профиле
- Ачивки за игру, синхронизированную позже (офлайн-очередь), приезжают событием `killerpool:achievements-unlocked` с буфером на случай, если провайдер ещё не подписался

---

## Наблюдаемость

Ошибки собирает Sentry (`instrumentation-client.ts` — браузер,
`instrumentation.ts` — сервер и edge, `app/global-error.tsx` — падения самого
корневого layout, до которых `app/error.tsx` не дотягивается, потому что живёт
внутри него).

Осознанные настройки:

- **Только ошибки, без трейсинга** (`tracesSampleRate: 0`) — вопрос стоит «что ломается», а не «что тормозит», а PWA платит за каждый килобайт
- **Включается только на деплоях Vercel.** Нужны DSN, `NODE_ENV === 'production'` и окружение Vercel `production` или `preview` — в браузере это `NEXT_PUBLIC_VERCEL_ENV` (вшивается при сборке), на сервере `VERCEL_ENV`. Одного `NODE_ENV` мало: локальная `next build && next start` тоже `production`, и с DSN из `.env.local` она писала в проект, который должен показывать падения пользователей. Теперь молчат и `next dev`, и локальный production-билд
- **Тег environment** — то же значение `production` / `preview`: события превью не смешиваются с продовыми в одном проекте
- **Ожидаемый сетевой шум отфильтрован** — офлайн-первый режим постоянно порождает `Failed to fetch` и подобное
- **Карты исходников** загружаются, если задан `SENTRY_AUTH_TOKEN`; без токена сборка не падает, просто трейсы остаются минифицированными. Загруженные карты удаляются из сборки и посетителям не отдаются

Гейт покрыт тестом `__tests__/instrumentation.test.ts`.

Проверять загрузку карт надо через `/projects/{org}/{project}/files/artifact-bundles/`:
современный формат — debug-id бандлы, а легаси-список файлов релиза показывает ноль
и вводит в заблуждение.

---

## PWA и офлайн-режим

### Service Worker

`@ducanh2912/next-pwa` в `next.config.js`: `dest: 'public'`, `sw: 'sw.js'`, `register: true`, отключён в development, `fallbacks.document: '/offline'`. Runtime caching (Workbox):

| Ресурс | Стратегия |
|--------|-----------|
| Google Fonts | CacheFirst (365 дней) |
| `*.supabase.co` | **NetworkFirst** (24ч, таймаут 10с) |
| Изображения / next/image | CacheFirst (24ч) |
| JS / CSS | StaleWhileRevalidate (24ч) |
| JSON | NetworkFirst (24ч) |
| Видео (mp4/webm) | CacheFirst (24ч) |

Дополнительно: `cacheOnFrontEndNav`, `aggressiveFrontEndNavCaching`, `reloadOnOnline`.

Service worker регистрирует **только next-pwa** — скриптом, который плагин вставляет в клиентский entry. Ручная регистрация в `components/pwa-init.tsx` удалена: в production она дублировала плагин, а в `next dev` регистрировала тот `public/sw.js`, что остался от последней сборки.

### PWAInit (`components/pwa-init.tsx`)

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

1. **Запись:** localStorage немедленно (optimistic); Supabase — при завершении или брошенности игры (`syncFinishedGame`, через очередь) или на каждое новое состояние при включённом шаринге (`syncActiveGameToSupabase`, без очереди). Записи одной игры идут строго по одной
2. **Офлайн:** игра в очереди с самого начала → ретраи до 14 дней с отсрочкой до 6 часов
3. **Ручная синхронизация:** кнопка Sync на `/history` (для вошедших) сначала выгружает очередь (`retryPendingSyncs`), потом скачивает (`mergeGamesWithSupabase`)
4. **Conflict resolution:** last-write-wins; `mergeGamesWithSupabase()` сравнивает `updatedAt` и берёт более новую версию, пропуская игры с надгробием

---

## Performance оптимизации

Реально применённые техники:

1. **optimizePackageImports** — `['lucide-react']` в `next.config.js`
2. **Бандлеры** — dev на Turbopack (`next dev`); production-сборка на webpack (`next build --webpack`): `@ducanh2912/next-pwa` генерирует service worker через webpack-хук, который Turbopack не выполняет — Turbopack-сборка выпускается без `sw.js`
3. **OG-изображения** — `app/opengraph-image.tsx` и `app/twitter-image.tsx` (статического og-image.png нет) на Node.js runtime: входных данных у картинки нет, поэтому она рендерится один раз при сборке; Edge Runtime в Next 16 объявлен устаревшим. `metadataBase` в `layout.tsx`
4. **SW-кеширование** — см. раздел PWA
5. **Форматы изображений** — `formats: ['image/avif', 'image/webp']` в `next.config.js`
6. **Отчёт о размере** — `npm run size` (`scripts/bundle-size.js`): собирает проект и показывает объём `.next/static`, JS-чанки и файлы больше 100 КБ. Это проверка размера, а не анализ состава бандла

> Численные Lighthouse/Web Vitals-метрики в этом документе не приводятся — замеры не автоматизированы.

---

## Тестирование

Jest 30 + jsdom + Testing Library (`jest.config.ts`, `jest.setup.ts`). **37 сьютов, 533 теста** (`npm test`, 2026-10-16):

| Область | Файлы |
|---------|-------|
| Игровая логика | `lib/__tests__/game-logic.test.ts` |
| Хранилище, ростер, очередь синка | `lib/__tests__/storage.test.ts` |
| Синк с Supabase (владелец, порядок записей, ретраи, заголовок и хеш секрета, фолбэк на `PGRST204`) | `lib/__tests__/sync.test.ts` |
| Секрет хоста (хранение, вытеснение, SHA-256 как в политике) | `lib/__tests__/host-secret.test.ts` |
| Realtime | `lib/__tests__/realtime.test.ts`, `hooks/__tests__/use-realtime-game.test.tsx` |
| Машина состояний игры | `contexts/__tests__/game-context.test.tsx` |
| Маппер БД (в обе стороны) | `lib/__tests__/game-mapper.test.ts` |
| Ачивки | `lib/__tests__/achievements.test.ts`, `components/achievements/__tests__/` |
| Экспорт, install-промпт, утилиты | `lib/__tests__/{export,pwa-install,utils}.test.ts` |
| Страницы | `app/{auth,game,history,profile,stats}/__tests__/`, `app/__tests__/` (главная, страница ошибки) |
| Тема | `components/__tests__/theme.test.tsx` (инлайн-скрипт и модуль согласованы) |
| UI- и игровые компоненты | `components/ui/__tests__/`, `components/game/__tests__/`, `components/leaderboard/__tests__/` |
| Гейт Sentry | `__tests__/instrumentation.test.ts` |

Линтер (`npm run lint`) выдаёт одно предупреждение, и оно обосновано в `eslint.config.mjs`: `react-hooks/set-state-in-effect` на восстановлении игры из localStorage в `GameProvider` после гидрации. Чтения хранилища, которые лишь отображают его (история, тема), идут через `useSyncExternalStore`, как и состояние сети.

Покрытие (`npm run test:coverage`, по строкам): `game-logic` 97%, `storage` 94%,
`sync` 94%, `game-context` 95%, `realtime` 95%, `host-secret` 100%; по всему
проекту, вместе с `app/**`, — около 75%.

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
- Supabase — отдельный managed-проект, слинкованный через Supabase CLI. 00001–00014 исторически применялись вручную через SQL Editor, поэтому журнала миграций на проде нет: перед первым `supabase db push` его заводят `supabase migration repair --linked --status applied 00001 … 00014`
- **Порядок выкладки 00015 и 00016: сначала база, потом клиент.** `repair` 00001–00014 → `migration list` → `db push --dry-run` (ровно две: 00015 и 00016) → `db push` → проверка `convalidated` после 00015 → проверка gateway для 00016 (три curl-запроса: доходит ли `x-host-secret` до PostgREST) → только потом merge `dev` в `main`, то есть деплой клиента. Новый клиент шлёт колонку `host_secret_hash`: на старой схеме он получит `PGRST204` и, повторив запись без неё, выложит игры без защиты, а если gateway теряет заголовок, первая же запись запрёт каждого гостя-хоста в его игре. Старый клиент на новой схеме работает как прежде. Команды — в [supabase/README.md](./supabase/README.md#-применение-миграций-к-проду), подробности о деплое — в [DEPLOYMENT.md](./DEPLOYMENT.md#supabase-cli)

---

## Planned / Not implemented

Раздел о том, чего в коде **нет** — не путать с текущей архитектурой:

1. **CSP-заголовок** — не настроен ни в `vercel.json`, ни в `next.config.js` (инлайн-скрипт темы в `<head>` потребует для него nonce или hash)
2. **Supabase Storage / Edge Functions** — не используются
3. **Broadcast-каналы / presence** в Realtime — не используются (весь realtime на `postgres_changes`); presence зрителей — возможное улучшение
4. **Background Sync API** — удалён вместе с `lib/sync-manager.ts`; заменён localStorage-очередью `killerpool_pending_sync`
5. **E2E-тесты (Playwright)** — только unit/component (Jest)
6. **RUM и product-аналитика** — не подключены (Sentry собирает ошибки, но не трейсинг и не поведение)
7. **Расширения лидерборда** — недельные/месячные таблицы, рейтинги среди друзей
8. **Push-уведомления** о приглашениях в игру
9. **Кастомные rulesets в UI** — таблица `rulesets` есть, но клиент всегда использует `DEFAULT_RULESET` (classic), а INSERT в неё с 00015 закрыт
10. **Остаток подделки лидерборда** — 00015 закрыла её для аккаунтов, но гостевая идентичность подделывается по-прежнему (guest-UUID и id участников видны в любой публичной строке), а залогиненный может накрутить себе статистику собственными играми
11. **Ограничение числа анонимных вставок** — CHECK-ограничения 00015 ограничивают размер строки, но не их количество; rate limiting нет
12. **Склейка гостевой и аккаунтной личности в облаке** — `/stats` на устройстве считает и гостевые, и аккаунтные игры, но гостевые игры не восстанавливаются из облака на другом устройстве (`created_by` у них `NULL`)
13. **Остаток после секрета хоста** — гостевые игры без хеша (старый бандл, браузер без `crypto.subtle`) переписывает любой, у кого есть id, до конца их суток; первая строка с данным id задаёт хеш, а id выбирает клиент — invite modal это окно сужает, но закрыл бы его только id, выданный сервером (см. [SECURITY.md](./SECURITY.md#planned--not-implemented))

Сделано из прежнего списка: секрет хоста для расшаренной игры (00016, см. [Владелец строки](#владелец-строки-и-порядок-записей)) и уход от системных `alert`/`confirm` в истории и invite modal (см. [Layer 1](#layer-1-presentation-ui)).

---

## Полезные ссылки

- [Next.js App Router Documentation](https://nextjs.org/docs/app)
- [Supabase Architecture](https://supabase.com/docs/guides/getting-started/architecture)
- [Supabase Realtime: postgres_changes](https://supabase.com/docs/guides/realtime/postgres-changes)
- [Tailwind CSS v4](https://tailwindcss.com/docs)
- [PWA Best Practices](https://web.dev/progressive-web-apps/)

---

**Документ обновлен:** 2026-10-16
