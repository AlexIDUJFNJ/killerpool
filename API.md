# 📡 API Documentation - Killerpool

Документация API и функций для работы с Supabase в Killerpool.

## 📋 Содержание

- [Обзор](#обзор)
- [Supabase Clients](#supabase-clients)
- [Authentication API](#authentication-api)
- [Database API](#database-api)
- [Game Logic API](#game-logic-api)
- [Storage API](#storage-api)
- [TypeScript Types](#typescript-types)
- [Error Handling](#error-handling)

---

## Обзор

Killerpool использует Supabase как Backend-as-a-Service. API построен на следующих принципах:

- **Type-safe** - все функции типизированы с TypeScript
- **Client/Server split** - разные clients для browser и server
- **Error handling** - все ошибки обрабатываются
- **Offline-first** - работа с localStorage + sync с Supabase

---

## Supabase Clients

### Browser Client (Client Components)

**Файл:** `lib/supabase/client.ts`

Используется в Client Components (`'use client'`).

```typescript
import { createBrowserClient } from '@/lib/supabase/client'

export function Component() {
  const supabase = createBrowserClient()

  // Use supabase...
}
```

**Реализация:**

```typescript
import { createBrowserClient as createClient } from '@supabase/ssr'

export function createBrowserClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

---

### Server Client (Server Components & API Routes)

**Файл:** `lib/supabase/server.ts`

Используется в Server Components и API routes.

```typescript
import { createServerClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'

export async function ServerComponent() {
  const cookieStore = cookies()
  const supabase = createServerClient(cookieStore)

  const { data } = await supabase.from('games').select('*')

  return <div>{/* ... */}</div>
}
```

**Реализация:**

```typescript
import { createServerClient as createClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export function createServerClient(cookieStore: ReturnType<typeof cookies>) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options: any) {
          cookieStore.set({ name, value, ...options })
        },
        remove(name: string, options: any) {
          cookieStore.set({ name, value: '', ...options })
        }
      }
    }
  )
}
```

---

### Middleware Client

**Файл:** `lib/supabase/middleware.ts`

Используется в Next.js middleware для проверки auth.

```typescript
import { createMiddlewareClient } from '@/lib/supabase/middleware'
import { NextRequest, NextResponse } from 'next/server'

export async function middleware(request: NextRequest) {
  const { supabase, response } = createMiddlewareClient(request)

  const { data: { session } } = await supabase.auth.getSession()

  if (!session) {
    return NextResponse.redirect(new URL('/auth', request.url))
  }

  return response
}
```

---

## Authentication API

### Sign Up (Email/Password)

```typescript
import { createBrowserClient } from '@/lib/supabase/client'

async function signUp(email: string, password: string) {
  const supabase = createBrowserClient()

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${window.location.origin}/auth/callback`
    }
  })

  if (error) throw error

  return data
}
```

**Response:**
```typescript
{
  user: {
    id: "uuid",
    email: "user@example.com",
    created_at: "2025-11-15T10:00:00Z"
  },
  session: {
    access_token: "jwt-token",
    refresh_token: "refresh-token",
    expires_at: 1700000000
  }
}
```

---

### Sign In (Email/Password)

```typescript
async function signIn(email: string, password: string) {
  const supabase = createBrowserClient()

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  })

  if (error) throw error

  return data
}
```

---

### Sign In with Google OAuth

```typescript
async function signInWithGoogle() {
  const supabase = createBrowserClient()

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}/auth/callback`,
      queryParams: {
        access_type: 'offline',
        prompt: 'consent'
      }
    }
  })

  if (error) throw error

  // Redirect to Google
}
```

---

### Magic Link

```typescript
async function sendMagicLink(email: string) {
  const supabase = createBrowserClient()

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${window.location.origin}/auth/callback`
    }
  })

  if (error) throw error
}
```

---

### Get Session

```typescript
async function getSession() {
  const supabase = createBrowserClient()

  const { data: { session }, error } = await supabase.auth.getSession()

  if (error) throw error

  return session
}
```

**Response:**
```typescript
{
  access_token: "jwt-token",
  refresh_token: "refresh-token",
  expires_at: 1700000000,
  user: {
    id: "uuid",
    email: "user@example.com"
  }
}
```

---

### Sign Out

```typescript
async function signOut() {
  const supabase = createBrowserClient()

  const { error } = await supabase.auth.signOut()

  if (error) throw error
}
```

---

## Database API

### Games

#### Create Game

```typescript
import { Game } from '@/lib/types'

async function createGame(game: Omit<Game, 'id' | 'created_at'>) {
  const supabase = createBrowserClient()

  const { data, error } = await supabase
    .from('games')
    .insert({
      status: 'active',
      participants: game.players.map(p => ({
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        lives: p.lives,
        eliminated: false
      })),
      history: [],
      created_by: (await supabase.auth.getUser()).data.user?.id
    })
    .select()
    .single()

  if (error) throw error

  return data
}
```

**Request:**
```typescript
{
  players: [
    { id: "1", name: "Player 1", avatar: "🎱", lives: 3 },
    { id: "2", name: "Player 2", avatar: "🎯", lives: 3 }
  ]
}
```

**Response:**
```typescript
{
  id: "uuid",
  created_at: "2025-11-15T10:00:00Z",
  status: "active",
  participants: [...],
  winner_id: null,
  history: []
}
```

---

#### Get Game by ID

```typescript
async function getGame(gameId: string) {
  const supabase = createBrowserClient()

  const { data, error } = await supabase
    .from('games')
    .select('*')
    .eq('id', gameId)
    .single()

  if (error) throw error

  return data
}
```

---

#### Update Game

```typescript
async function updateGame(gameId: string, updates: Partial<Game>) {
  const supabase = createBrowserClient()

  const { data, error } = await supabase
    .from('games')
    .update(updates)
    .eq('id', gameId)
    .select()
    .single()

  if (error) throw error

  return data
}
```

**Example:**
```typescript
await updateGame('game-uuid', {
  participants: updatedPlayers,
  history: [...oldHistory, newAction],
  updated_at: new Date().toISOString()
})
```

---

#### Get User's Games

```typescript
async function getUserGames(userId: string) {
  const supabase = createBrowserClient()

  const { data, error } = await supabase
    .from('games')
    .select('*')
    .eq('created_by', userId)
    .order('created_at', { ascending: false })

  if (error) throw error

  return data
}
```

---

#### Complete Game

```typescript
async function completeGame(gameId: string, winnerId: string) {
  const supabase = createBrowserClient()

  const { data, error } = await supabase
    .from('games')
    .update({
      status: 'completed',
      winner_id: winnerId
    })
    .eq('id', gameId)
    .select()
    .single()

  if (error) throw error

  return data
}
```

---

### Player Profiles

#### Get Profile

```typescript
async function getProfile(userId: string) {
  const supabase = createBrowserClient()

  const { data, error } = await supabase
    .from('player_profiles')
    .select('*')
    .eq('user_id', userId)
    .single()

  if (error) throw error

  return data
}
```

---

#### Create/Update Profile

```typescript
async function upsertProfile(profile: {
  user_id: string
  display_name: string
  avatar_url?: string
}) {
  const supabase = createBrowserClient()

  const { data, error } = await supabase
    .from('player_profiles')
    .upsert(profile)
    .select()
    .single()

  if (error) throw error

  return data
}
```

---

### Rulesets

#### Get Default Ruleset

```typescript
async function getDefaultRuleset() {
  const supabase = createBrowserClient()

  const { data, error } = await supabase
    .from('rulesets')
    .select('*')
    .eq('is_default', true)
    .single()

  if (error) throw error

  return data
}
```

**Response:**
```typescript
{
  id: "uuid",
  name: "Classic Killer Pool",
  params: {
    starting_lives: 3,
    miss: -1,
    pot: 0,
    pot_black: 1,
    max_lives: 6
  }
}
```

---

## Game Logic API

**Файл:** `lib/game-logic.ts`

Чистые функции для игровой логики (без side effects).

### Apply Action

```typescript
import { applyAction } from '@/lib/game-logic'

const updatedGame = applyAction(game, playerId, 'MISS')
```

**Signature:**
```typescript
function applyAction(
  game: Game,
  playerId: string,
  action: 'MISS' | 'POT' | 'POT_BLACK'
): Game
```

**Implementation:**
```typescript
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
    default:
      throw new Error(`Unknown action: ${action}`)
  }
}
```

---

### Update Player Lives

```typescript
function updatePlayerLives(
  game: Game,
  playerId: string,
  livesChange: number
): Game
```

---

### Check Winner

```typescript
import { getWinner } from '@/lib/game-logic'

const winner = getWinner(game)
if (winner) {
  console.log(`Winner: ${winner.name}`)
}
```

**Implementation:**
```typescript
export function getWinner(game: Game): Player | null {
  const activePlayers = game.players.filter(p => p.lives > 0)

  if (activePlayers.length === 1) {
    return activePlayers[0]
  }

  return null
}
```

---

### Next Turn

```typescript
function nextTurn(game: Game): Game
```

---

## Storage API

**Файл:** `lib/storage.ts`

Абстракция над localStorage с синхронизацией в Supabase.

### Save Game

```typescript
import { saveGame } from '@/lib/storage'

await saveGame(game)
```

**Implementation:**
```typescript
export async function saveGame(game: Game) {
  // 1. Save to localStorage (immediate)
  localStorage.setItem(`game_${game.id}`, JSON.stringify(game))

  // 2. Try to sync to Supabase (background)
  try {
    const supabase = createBrowserClient()
    await supabase.from('games').upsert({
      id: game.id,
      ...game,
      updated_at: new Date().toISOString()
    })
  } catch (error) {
    console.error('Failed to sync game:', error)
    // Mark for background sync
    markForSync(game.id)
  }
}
```

---

### Load Game

```typescript
import { loadGame } from '@/lib/storage'

const game = await loadGame(gameId)
```

**Implementation:**
```typescript
export async function loadGame(gameId: string): Promise<Game | null> {
  // 1. Try localStorage first (fast)
  const cached = localStorage.getItem(`game_${gameId}`)
  if (cached) {
    return JSON.parse(cached)
  }

  // 2. Fetch from Supabase
  const supabase = createBrowserClient()
  const { data, error } = await supabase
    .from('games')
    .select('*')
    .eq('id', gameId)
    .single()

  if (error) return null

  // 3. Cache locally
  localStorage.setItem(`game_${gameId}`, JSON.stringify(data))

  return data
}
```

---

### Get Active Game

```typescript
import { getActiveGame } from '@/lib/storage'

const activeGame = getActiveGame()
```

---

### Clear Storage

```typescript
import { clearGameData } from '@/lib/storage'

clearGameData(gameId)
```

---

## TypeScript Types

**Файл:** `lib/types.ts`

### Game

```typescript
export interface Game {
  id: string
  created_at: string
  updated_at?: string
  status: 'active' | 'completed' | 'abandoned'
  players: Player[]
  currentPlayerIndex: number
  winner?: Player
  history: GameAction[]
  ruleset?: Ruleset
}
```

### Player

```typescript
export interface Player {
  id: string
  name: string
  avatar: string  // emoji or URL
  lives: number
  eliminated: boolean
  user_id?: string  // if authenticated
}
```

### GameAction

```typescript
export interface GameAction {
  id: string
  type: 'MISS' | 'POT' | 'POT_BLACK'
  player_id: string
  timestamp: string
  lives_before: number
  lives_after: number
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
    miss: number        // -1
    pot: number         // 0
    pot_black: number   // +1
    max_lives: number   // 6
  }
  is_default: boolean
}
```

---

### Database Types (Auto-generated)

**Файл:** `lib/types/database.types.ts`

Генерируется из Supabase схемы:

```bash
npx supabase gen types typescript --project-id your-project-id > lib/types/database.types.ts
```

**Example:**
```typescript
export interface Database {
  public: {
    Tables: {
      games: {
        Row: {
          id: string
          created_at: string
          status: string
          participants: any
          winner_id: string | null
        }
        Insert: {
          id?: string
          created_at?: string
          status: string
          participants: any
        }
        Update: {
          status?: string
          participants?: any
        }
      }
    }
  }
}
```

---

## Error Handling

### Standard Error Response

```typescript
{
  error: {
    message: string
    code?: string
    details?: any
  }
}
```

### Common Error Codes

| Code | Описание |
|------|----------|
| `PGRST116` | Row not found |
| `23505` | Unique constraint violation |
| `42501` | Permission denied (RLS) |
| `23503` | Foreign key violation |

### Error Handling Example

```typescript
import { createBrowserClient } from '@/lib/supabase/client'

async function fetchGame(gameId: string) {
  const supabase = createBrowserClient()

  try {
    const { data, error } = await supabase
      .from('games')
      .select('*')
      .eq('id', gameId)
      .single()

    if (error) {
      // Handle specific errors
      if (error.code === 'PGRST116') {
        throw new Error('Game not found')
      }

      if (error.code === '42501') {
        throw new Error('Permission denied')
      }

      // Generic error
      throw new Error(`Failed to fetch game: ${error.message}`)
    }

    return data
  } catch (error) {
    console.error('Error fetching game:', error)
    throw error
  }
}
```

---

## Rate Limiting

Supabase имеет следующие лимиты на бесплатном плане:

- **Database:** 500 MB storage
- **API Requests:** Unlimited (но с fair use policy)
- **Auth:** 50,000 monthly active users
- **Storage:** 1 GB

Рекомендации:
- Используйте pagination для больших списков
- Кешируйте данные локально
- Используйте debounce для search inputs

---

## Полезные ссылки

- [Supabase JavaScript Client](https://supabase.com/docs/reference/javascript/introduction)
- [Supabase Auth](https://supabase.com/docs/guides/auth)
- [PostgreSQL Functions](https://www.postgresql.org/docs/current/functions.html)
- [Row Level Security](https://supabase.com/docs/guides/auth/row-level-security)

---

**Документ обновлен:** 16 ноября 2025
