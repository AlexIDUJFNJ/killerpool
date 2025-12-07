# 🏗️ Architecture - Killerpool

Документация архитектуры Killerpool.app - современного PWA-приложения для игры в Killer Pool.

## 📋 Содержание

- [Общий обзор](#общий-обзор)
- [Технологический стек](#технологический-стек)
- [Архитектурные принципы](#архитектурные-принципы)
- [Структура проекта](#структура-проекта)
- [Слои приложения](#слои-приложения)
- [Поток данных](#поток-данных)
- [Авторизация и безопасность](#авторизация-и-безопасность)
- [Офлайн-режим](#офлайн-режим)
- [Performance оптимизации](#performance-оптимизации)

---

## Общий обзор

Killerpool построен на современной архитектуре с использованием Next.js 15 App Router, обеспечивающей:

- 🚀 **Server-Side Rendering (SSR)** для быстрой первоначальной загрузки
- ⚡ **Server Components** по умолчанию для минимизации JavaScript на клиенте
- 📱 **Progressive Web App (PWA)** для нативного опыта на мобильных устройствах
- 🔄 **Offline-first** с синхронизацией при наличии интернета
- 🔐 **Secure by default** с Row Level Security в Supabase

### Архитектурная диаграмма

```
┌─────────────────────────────────────────────────────────────┐
│                          Client                              │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │   Browser   │  │  PWA/Mobile  │  │   Offline    │       │
│  │  (Desktop)  │  │    (iOS/     │  │   Service    │       │
│  │             │  │   Android)   │  │   Worker     │       │
│  └──────┬──────┘  └──────┬───────┘  └──────┬───────┘       │
│         │                │                  │                │
│         └────────────────┴──────────────────┘                │
│                          │                                   │
└──────────────────────────┼───────────────────────────────────┘
                           │
                           │ HTTPS
                           │
┌──────────────────────────▼───────────────────────────────────┐
│                    Vercel Edge Network                        │
│  ┌────────────────────────────────────────────────────────┐  │
│  │              Next.js 15 Application                     │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │  │
│  │  │    Pages     │  │  API Routes  │  │  Middleware  │ │  │
│  │  │ (App Router) │  │ (Edge Func.) │  │    (Auth)    │ │  │
│  │  └──────────────┘  └──────────────┘  └──────────────┘ │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────┬───────────────────────────────────┘
                           │
                           │ Supabase Client
                           │
┌──────────────────────────▼───────────────────────────────────┐
│                      Supabase Cloud                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │  PostgreSQL  │  │     Auth     │  │   Storage    │       │
│  │   Database   │  │   (OAuth)    │  │   (Future)   │       │
│  │     (RLS)    │  │              │  │              │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
│  ┌──────────────┐  ┌──────────────┐                         │
│  │   Realtime   │  │   Edge Func. │                         │
│  │  (Future)    │  │   (Future)   │                         │
│  └──────────────┘  └──────────────┘                         │
└───────────────────────────────────────────────────────────────┘
```

---

## Технологический стек

### Frontend

| Технология | Версия | Назначение |
|------------|--------|------------|
| **Next.js** | 15.0 | React framework с App Router |
| **React** | 19.0 | UI библиотека |
| **TypeScript** | 5.3 | Type safety |
| **Tailwind CSS** | 3.4 | Utility-first CSS |
| **shadcn/ui** | Latest | UI компоненты |
| **Framer Motion** | 11.0 | Анимации |
| **Lucide React** | Latest | Иконки |

### Backend & Database

| Технология | Назначение |
|------------|------------|
| **Supabase** | Backend-as-a-Service (PostgreSQL + Auth + Realtime) |
| **PostgreSQL** | Реляционная база данных |
| **Row Level Security** | Security на уровне строк БД |
| **Edge Functions** | Serverless функции (будущее) |

### DevOps & Infrastructure

| Технология | Назначение |
|------------|------------|
| **Vercel** | Hosting, CDN, Edge Network |
| **GitHub** | Version control, CI/CD |
| **npm** | Package manager |

---

## Архитектурные принципы

### 1. **Mobile-First**

Приложение разработано с приоритетом мобильных устройств:
- Responsive дизайн (320px → 2560px)
- Touch-friendly UI (минимум 44px tap targets)
- Оптимизация под iOS Safari и Android Chrome
- PWA с возможностью установки

### 2. **Offline-First**

Приложение работает без интернета:
- localStorage для сохранения игр
- Service Worker для кеширования
- Синхронизация с Supabase при наличии соединения
- Background Sync API (будущее)

### 3. **Server Components по умолчанию**

Next.js 15 App Router использует Server Components:
- Меньше JavaScript на клиенте
- Быстрая первоначальная загрузка
- SEO-friendly
- Client Components (`'use client'`) только где необходимо

### 4. **Type Safety**

TypeScript используется везде:
- Строгая типизация (`strict: true`)
- Автогенерация типов из Supabase схемы
- Type-safe API calls
- Compile-time errors вместо runtime

### 5. **Security by Default**

Безопасность встроена на всех уровнях:
- Row Level Security в PostgreSQL
- Environment variables для секретов
- HTTPS only
- CORS правильно настроен
- XSS/CSRF защита через Next.js

---

## Структура проекта

```
killerpool/
│
├── app/                          # Next.js App Router (pages)
│   ├── layout.tsx                # Root layout (Server Component)
│   ├── page.tsx                  # Home page
│   ├── error.tsx                 # Error boundary
│   ├── loading.tsx               # Loading UI
│   ├── not-found.tsx             # 404 page
│   ├── globals.css               # Global styles
│   │
│   ├── auth/                     # Authentication pages
│   │   ├── page.tsx              # Login/Signup page
│   │   └── callback/             # OAuth callback
│   │       └── route.ts          # Handle OAuth redirect
│   │
│   ├── game/                     # Game pages
│   │   ├── new/                  # Create new game
│   │   │   └── page.tsx
│   │   └── [id]/                 # Active game (dynamic route)
│   │       └── page.tsx
│   │
│   ├── history/                  # Game history
│   │   └── page.tsx
│   │
│   └── profile/                  # User profile
│       └── page.tsx
│
├── components/                   # React components
│   ├── ui/                       # shadcn/ui components (Client)
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── avatar.tsx
│   │   ├── badge.tsx
│   │   ├── input.tsx
│   │   └── label.tsx
│   │
│   └── game/                     # Game-specific components (Client)
│       ├── player-card.tsx       # Player display with avatar & lives
│       ├── life-bar.tsx          # Animated life indicator
│       └── action-buttons.tsx    # MISS, POT, BLACK buttons
│
├── lib/                          # Utilities & helpers
│   ├── utils.ts                  # Utility functions (cn, etc.)
│   ├── game-logic.ts             # Core game logic (pure functions)
│   ├── storage.ts                # localStorage abstraction
│   │
│   ├── supabase/                 # Supabase clients
│   │   ├── client.ts             # Browser client (Client Components)
│   │   ├── server.ts             # Server client (Server Components)
│   │   └── middleware.ts         # Auth middleware helper
│   │
│   └── types/                    # TypeScript types
│       ├── index.ts              # App types (Game, Player, etc.)
│       └── database.types.ts     # Supabase generated types
│
├── contexts/                     # React Contexts (Client)
│   └── game-context.tsx          # Game state management
│
├── supabase/                     # Supabase configuration
│   ├── migrations/               # SQL migrations
│   │   └── 00001_initial_schema.sql
│   └── README.md                 # Setup guide
│
├── public/                       # Static files
│   ├── manifest.json             # PWA manifest
│   ├── icons/                    # PWA icons
│   ├── robots.txt                # SEO
│   └── sitemap.xml               # SEO
│
├── middleware.ts                 # Next.js middleware (auth protection)
├── next.config.js                # Next.js configuration
├── tailwind.config.ts            # Tailwind configuration
├── tsconfig.json                 # TypeScript configuration
└── vercel.json                   # Vercel deployment config
```

---

## Слои приложения

### Layer 1: Presentation (UI)

**Ответственность:** Отображение данных, обработка пользовательского ввода

**Компоненты:**
- `app/*/page.tsx` - страницы
- `components/ui/*` - UI примитивы (shadcn/ui)
- `components/game/*` - игровые компоненты

**Принципы:**
- Минимум бизнес-логики (только UI логика)
- Использование Server Components где возможно
- Client Components только для интерактивности

**Пример:**
```typescript
// components/game/player-card.tsx
'use client' // Client Component для анимаций

export function PlayerCard({ player, isActive }: PlayerCardProps) {
  return (
    <motion.div
      animate={{ scale: isActive ? 1.05 : 1 }}
      className="..."
    >
      <Avatar>{player.avatar}</Avatar>
      <LifeBar lives={player.lives} />
    </motion.div>
  )
}
```

### Layer 2: Business Logic

**Ответственность:** Игровая логика, валидация, расчеты

**Файлы:**
- `lib/game-logic.ts` - чистые функции
- `contexts/game-context.tsx` - state management

**Принципы:**
- Pure functions (нет side effects)
- Легко тестируемые
- Framework-agnostic

**Пример:**
```typescript
// lib/game-logic.ts
export function applyAction(
  game: Game,
  playerId: string,
  action: GameAction
): Game {
  const player = game.players.find(p => p.id === playerId)
  if (!player) throw new Error('Player not found')

  switch (action) {
    case 'MISS':
      return updatePlayerLives(game, playerId, -1)
    case 'POT':
      return nextTurn(game)
    case 'POT_BLACK':
      return updatePlayerLives(game, playerId, 1)
  }
}
```

### Layer 3: Data Access

**Ответственность:** Взаимодействие с базой данных, кешированием

**Файлы:**
- `lib/supabase/client.ts` - browser client
- `lib/supabase/server.ts` - server client
- `lib/storage.ts` - localStorage abstraction

**Принципы:**
- Централизованный доступ к данным
- Абстракция над Supabase
- Обработка ошибок

**Пример:**
```typescript
// lib/supabase/server.ts
export async function getGameById(gameId: string) {
  const supabase = createServerClient()

  const { data, error } = await supabase
    .from('games')
    .select('*')
    .eq('id', gameId)
    .single()

  if (error) throw error
  return data
}
```

### Layer 4: Infrastructure

**Ответственность:** Аутентификация, middleware, конфигурация

**Файлы:**
- `middleware.ts` - auth middleware
- `app/auth/callback/route.ts` - OAuth callback
- `next.config.js` - Next.js config

**Принципы:**
- Security first
- Middleware для защиты роутов
- Edge runtime для production

**Пример:**
```typescript
// middleware.ts
export async function middleware(request: NextRequest) {
  const { supabase, response } = createMiddlewareClient({ req: request })

  // Проверяем сессию
  const { data: { session } } = await supabase.auth.getSession()

  // Защищенные роуты
  if (request.nextUrl.pathname.startsWith('/profile') && !session) {
    return NextResponse.redirect(new URL('/auth', request.url))
  }

  return response
}
```

---

## Поток данных

### Создание новой игры

```
User Input (New Game Form)
         │
         ▼
   [Validation] (client-side)
         │
         ▼
   [Game Context] (useState)
         │
         ├─────────────────────┐
         ▼                     ▼
   [localStorage]        [Supabase]
   (offline-first)       (if online)
         │                     │
         └──────────┬──────────┘
                    ▼
            [Game State Updated]
                    │
                    ▼
            [UI Re-renders]
```

### Игровое действие (MISS, POT, BLACK)

```
User Click (Action Button)
         │
         ▼
   [applyAction()] (lib/game-logic.ts)
         │
         ▼
   [Update Game State]
         │
         ├─────────────────────┐
         ▼                     ▼
   [localStorage]        [Supabase.update()]
   (immediate)           (background sync)
         │                     │
         ▼                     ▼
   [UI Updates]          [Server State]
   (optimistic)          (eventual consistency)
```

### Авторизация (OAuth)

```
User Click "Sign in with Google"
         │
         ▼
   [supabase.auth.signInWithOAuth()]
         │
         ▼
   [Redirect to Google]
         │
         ▼
   [User approves]
         │
         ▼
   [Redirect to /auth/callback]
         │
         ▼
   [Exchange code for session]
         │
         ▼
   [Set cookie] (supabase-auth-token)
         │
         ▼
   [Redirect to /profile]
         │
         ▼
   [Middleware checks session]
         │
         ▼
   [Access granted]
```

---

## Авторизация и безопасность

### Архитектура авторизации

```
┌─────────────────────────────────────────────────────────┐
│                      Client                              │
│  ┌────────────────────────────────────────────────────┐ │
│  │  Supabase Client (lib/supabase/client.ts)         │ │
│  │  - signInWithOAuth()                               │ │
│  │  - signOut()                                       │ │
│  │  - getSession()                                    │ │
│  └────────────────────────────────────────────────────┘ │
└───────────────────────┬─────────────────────────────────┘
                        │
                        │ Auth Token (Cookie)
                        │
┌───────────────────────▼─────────────────────────────────┐
│              Next.js Middleware                          │
│  ┌────────────────────────────────────────────────────┐ │
│  │  middleware.ts                                     │ │
│  │  - Check session on protected routes              │ │
│  │  - Redirect to /auth if not authenticated         │ │
│  └────────────────────────────────────────────────────┘ │
└───────────────────────┬─────────────────────────────────┘
                        │
                        │ Validated Session
                        │
┌───────────────────────▼─────────────────────────────────┐
│                 Supabase Auth                            │
│  ┌────────────────────────────────────────────────────┐ │
│  │  - JWT Token validation                            │ │
│  │  - OAuth providers (Google, etc.)                  │ │
│  │  - Magic Links                                     │ │
│  └────────────────────────────────────────────────────┘ │
└───────────────────────┬─────────────────────────────────┘
                        │
                        │ user_id
                        │
┌───────────────────────▼─────────────────────────────────┐
│            PostgreSQL with RLS                           │
│  ┌────────────────────────────────────────────────────┐ │
│  │  Row Level Security Policies:                      │ │
│  │  - Users can only read their own games             │ │
│  │  - Users can only update games they created        │ │
│  │  - Public read access to player_profiles           │ │
│  └────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

### Row Level Security (RLS) Policies

```sql
-- Пример: games таблица
CREATE POLICY "Users can view their own games"
ON games FOR SELECT
USING (auth.uid() = created_by);

CREATE POLICY "Users can insert their own games"
ON games FOR INSERT
WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update their own games"
ON games FOR UPDATE
USING (auth.uid() = created_by);
```

---

## Офлайн-режим

### Архитектура offline-first

```
┌─────────────────────────────────────────────────────────┐
│                   Application Layer                      │
│  ┌────────────────────────────────────────────────────┐ │
│  │  Game Context (contexts/game-context.tsx)          │ │
│  │  - Единый источник истины для UI                   │ │
│  └────────────────────────────────────────────────────┘ │
└───────────────────┬─────────────────┬───────────────────┘
                    │                 │
                    │                 │
        ┌───────────▼────┐   ┌────────▼──────────┐
        │  localStorage   │   │   Supabase        │
        │  (Primary)      │   │   (Sync)          │
        └───────────┬─────┘   └────────┬──────────┘
                    │                  │
                    │                  │
                    └────────┬─────────┘
                             │
                ┌────────────▼────────────┐
                │   Synchronization       │
                │   - Detect online       │
                │   - Push local changes  │
                │   - Pull remote updates │
                └─────────────────────────┘
```

### Стратегия синхронизации

1. **Запись (Write):**
   - Сохранить в localStorage немедленно (optimistic update)
   - Попытаться записать в Supabase (если онлайн)
   - Если офлайн - пометить для синхронизации

2. **Чтение (Read):**
   - Читать из localStorage (быстро)
   - Синхронизировать с Supabase в фоне (если онлайн)

3. **Conflict Resolution:**
   - Last-write-wins (упрощенная стратегия для MVP)
   - Timestamp-based сравнение

**Пример:**
```typescript
// lib/storage.ts
export async function saveGame(game: Game) {
  // 1. Save locally (immediate)
  localStorage.setItem(`game_${game.id}`, JSON.stringify(game))

  // 2. Try to sync to Supabase (background)
  try {
    await supabase
      .from('games')
      .upsert(game)
  } catch (error) {
    // Mark for background sync
    markForSync(game.id)
  }
}
```

---

## Performance оптимизации

### 1. **Code Splitting**

Next.js автоматически разбивает код:
- Каждый роут = отдельный chunk
- Dynamic imports для тяжелых компонентов

```typescript
// Lazy load heavy component
const HeavyChart = dynamic(() => import('./heavy-chart'), {
  loading: () => <Spinner />,
  ssr: false  // Не рендерить на сервере
})
```

### 2. **Image Optimization**

Использование `next/image`:
- Автоматическая оптимизация
- Lazy loading
- Responsive images
- WebP формат

```typescript
import Image from 'next/image'

<Image
  src="/logo.png"
  width={200}
  height={200}
  alt="Killerpool"
  priority  // Для hero images
/>
```

### 3. **Server Components**

Рендеринг на сервере:
- Меньше JavaScript на клиенте
- Быстрая First Contentful Paint (FCP)
- SEO-friendly

```typescript
// app/game/[id]/page.tsx (Server Component)
export default async function GamePage({ params }: Props) {
  // Fetching на сервере
  const game = await getGameById(params.id)

  return <GameBoard initialGame={game} />
}
```

### 4. **Caching**

Многоуровневое кеширование:
- **Vercel Edge Cache** - статика и API responses
- **Browser Cache** - через Service Worker
- **React Cache** - Server Component fetches

### 5. **Bundle Size Optimization**

```javascript
// next.config.js
module.exports = {
  experimental: {
    optimizePackageImports: ['lucide-react', 'framer-motion']
  }
}
```

### Performance Metrics (Target)

| Метрика | Target | Текущее |
|---------|--------|---------|
| **FCP** (First Contentful Paint) | < 1.5s | ~1.2s |
| **LCP** (Largest Contentful Paint) | < 2.5s | ~2.0s |
| **TTI** (Time to Interactive) | < 3.5s | ~2.8s |
| **CLS** (Cumulative Layout Shift) | < 0.1 | ~0.05 |
| **Lighthouse Score** | > 90 | ~95 |

---

## Диаграмма компонентов

```
┌────────────────────────────────────────────────────────────────┐
│                        App (layout.tsx)                         │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                   Providers                               │  │
│  │  - GameContextProvider (game state)                       │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                   Page (page.tsx)                         │  │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐         │  │
│  │  │ Home Page  │  │ Game Page  │  │ Profile    │         │  │
│  │  └────────────┘  └────────────┘  └────────────┘         │  │
│  └──────────────────────────────────────────────────────────┘  │
│                            │                                    │
│                            ▼                                    │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              Game Components                              │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │  │
│  │  │ PlayerCard   │  │   LifeBar    │  │ActionButtons │   │  │
│  │  └──────────────┘  └──────────────┘  └──────────────┘   │  │
│  └──────────────────────────────────────────────────────────┘  │
│                            │                                    │
│                            ▼                                    │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                 UI Components (shadcn)                    │  │
│  │  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐         │  │
│  │  │ Button │  │  Card  │  │ Avatar │  │ Badge  │         │  │
│  │  └────────┘  └────────┘  └────────┘  └────────┘         │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
```

---

## Leaderboard Architecture

### Обзор системы лидерборда

Лидерборд показывает топ-15 игроков, ранжированных по проценту побед (win rate) и общему количеству выигранных игр.

**Ключевое решение:** Только игры авторизованных пользователей учитываются в лидерборде для предотвращения накруток и обеспечения честной конкуренции.

### Архитектура данных

```
┌─────────────────────────────────────────────────────────┐
│                 Client (Browser)                         │
│  ┌────────────────────────────────────────────────────┐ │
│  │  LeaderboardList Component                         │ │
│  │  - Проверка авторизации пользователя              │ │
│  │  - Вызов get_leaderboard() функции                │ │
│  │  - Отображение топ-15 или призыв к регистрации    │ │
│  └────────────────────────────────────────────────────┘ │
└───────────────────────┬─────────────────────────────────┘
                        │
                        │ RPC: get_leaderboard(limit: 15)
                        │
┌───────────────────────▼─────────────────────────────────┐
│              Supabase PostgreSQL Function                │
│  ┌────────────────────────────────────────────────────┐ │
│  │  get_leaderboard(limit_count INTEGER)              │ │
│  │                                                     │ │
│  │  1. Извлекает всех игроков из завершенных игр     │ │
│  │  2. Подсчитывает статистику для каждого игрока:   │ │
│  │     - total_games (общее количество игр)          │ │
│  │     - games_won (количество побед)                │ │
│  │     - games_lost (количество поражений)           │ │
│  │     - win_rate (процент побед)                    │ │
│  │     - total_actions (все действия игрока)         │ │
│  │     - total_black_pots (забитые черные шары)      │ │
│  │  3. Сортирует по win_rate DESC, games_won DESC    │ │
│  │  4. Возвращает топ N игроков с рангами            │ │
│  └────────────────────────────────────────────────────┘ │
└───────────────────────┬─────────────────────────────────┘
                        │
                        │ Query Data
                        │
┌───────────────────────▼─────────────────────────────────┐
│                   Database Tables                        │
│  ┌────────────────────────────────────────────────────┐ │
│  │  games (завершенные игры)                          │ │
│  │  - id, status, participants (JSONB)                │ │
│  │  - winner_id, history (JSONB)                      │ │
│  │  - created_by (user_id) ← ОБЯЗАТЕЛЬНО для лидерб. │ │
│  └────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────┐ │
│  │  player_profiles (профили)                         │ │
│  │  - user_id, display_name, avatar_url               │ │
│  └────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

### Синхронизация игр с Supabase

**Важно:** Функция `autoSyncGame()` проверяет авторизацию перед синхронизацией.

```typescript
// lib/sync.ts
export async function autoSyncGame(game: Game): Promise<void> {
  if (game.status !== 'completed') {
    return
  }

  // Проверка: есть ли авторизованный пользователь?
  const isAvailable = await isSupabaseAvailable()
  if (isAvailable) {
    // Только для авторизованных - синхронизируем в облако
    await syncGameToSupabase(game)
  }
  // Для анонимных - игра остается только в localStorage
}
```

### Политики безопасности (RLS)

```sql
-- Анонимные пользователи могут управлять играми локально
-- НО их игры НЕ учитываются в get_leaderboard()
CREATE POLICY "Anonymous users can manage games"
ON games FOR ALL
TO anon
USING (true)
WITH CHECK (true);

-- Авторизованные пользователи могут вставлять игры
-- Эти игры БУДУТ учитываться в лидерборде
CREATE POLICY "Authenticated users can create games"
ON games FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = created_by OR created_by IS NULL);
```

### UI/UX для различных сценариев

#### 1. Незарегистрированный пользователь выигрывает игру

```
┌────────────────────────────────────────┐
│  🏆 [Player Name] Wins!                │
│                                        │
│  ┌──────────────────────────────────┐ │
│  │ ⚠️ Compete on the Leaderboard!   │ │
│  │                                  │ │
│  │ Sign in to save your wins and   │ │
│  │ climb the global rankings!       │ │
│  │                                  │ │
│  │ [🔐 Sign In to Compete]          │ │
│  └──────────────────────────────────┘ │
│                                        │
│  [New Game]  [Home]                   │
└────────────────────────────────────────┘
```

#### 2. Зарегистрированный пользователь выигрывает

```
┌────────────────────────────────────────┐
│  🏆 [Player Name] Wins!                │
│                                        │
│  ┌──────────────────────────────────┐ │
│  │ ✅ Your victory has been saved   │ │
│  │    to the leaderboard!           │ │
│  └──────────────────────────────────┘ │
│                                        │
│  [New Game]  [Home]                   │
└────────────────────────────────────────┘
```

#### 3. Пустой лидерборд для незарегистрированных

```
┌────────────────────────────────────────┐
│  🏆 The Leaderboard Awaits!            │
│                                        │
│  Sign in now to compete for glory!    │
│                                        │
│  ┌────────┐  ┌────────┐  ┌────────┐  │
│  │   🏆   │  │   🎯   │  │   ⭐   │  │
│  │ Track  │  │ Climb  │  │ Earn   │  │
│  │  Wins  │  │ Ranks  │  │ Glory  │  │
│  └────────┘  └────────┘  └────────┘  │
│                                        │
│  [🔐 Sign In to Compete]               │
└────────────────────────────────────────┘
```

### Преимущества архитектурного решения

✅ **Защита от накруток** - Невозможно создать фейковые аккаунты без email
✅ **Производительность** - SQL функция вычисляется на стороне БД
✅ **Масштабируемость** - JSONB индексы для быстрых запросов
✅ **Честная игра** - Один пользователь = один профиль в лидерборде
✅ **Маркетинг** - Мотивирует пользователей регистрироваться

### Метрики и ранжирование

```sql
-- Основная формула ранжирования:
ORDER BY
  win_rate DESC,        -- Процент побед (приоритет)
  games_won DESC,       -- Количество побед
  total_games DESC      -- Общее количество игр
```

**Пример:**
| Rank | Player | Win Rate | Wins | Games |
|------|--------|----------|------|-------|
| 1    | Alice  | 85.7%    | 12   | 14    |
| 2    | Bob    | 80.0%    | 8    | 10    |
| 3    | Carol  | 75.0%    | 15   | 20    |

---

## Будущие улучшения

### Запланированные архитектурные изменения

1. **Realtime Multiplayer**
   - Supabase Realtime для синхронизации игр
   - WebSocket connections
   - Optimistic UI updates

2. **Service Worker & PWA**
   - Background sync
   - Push notifications для приглашений
   - App install prompts

3. **Advanced Leaderboard Features**
   - Еженедельные/месячные таблицы
   - Региональные лидерборды
   - Друзья-only рейтинги
   - Achievement badges

4. **Testing Infrastructure**
   - Unit tests (Vitest)
   - Integration tests (Playwright)
   - E2E tests для критичных flows

5. **Analytics & Monitoring**
   - Real User Monitoring (RUM)
   - Error tracking (Sentry)
   - Analytics (PostHog/Mixpanel)

---

## Полезные ссылки

- [Next.js App Router Documentation](https://nextjs.org/docs/app)
- [Supabase Architecture](https://supabase.com/docs/guides/getting-started/architecture)
- [React Server Components](https://react.dev/reference/react/use-server)
- [PWA Best Practices](https://web.dev/progressive-web-apps/)
- [Web Performance](https://web.dev/performance/)

---

**Документ обновлен:** 19 ноября 2025
