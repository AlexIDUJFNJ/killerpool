# 🔧 Troubleshooting Guide - Killerpool

Руководство по устранению частых проблем при разработке и использовании Killerpool.

> Обновлено: 2026-08-11.
>
> Стек проекта: Next.js 16 (App Router), React 19, TypeScript 5, Tailwind CSS 4, Supabase, PWA через `@ducanh2912/next-pwa`, Sentry. Node.js 22 (см. `engines` в `package.json`).

## 📋 Содержание

- [Проблемы при установке](#проблемы-при-установке)
- [Проблемы с Supabase](#проблемы-с-supabase)
- [Проблемы с авторизацией](#проблемы-с-авторизацией)
- [Проблемы с деплоем](#проблемы-с-деплоем)
- [Проблемы с PWA](#проблемы-с-pwa)
- [Performance проблемы](#performance-проблемы)
- [Mobile проблемы](#mobile-проблемы)
- [Общие ошибки](#общие-ошибки)

---

## Проблемы при установке

### ❌ `npm install` fails with ERESOLVE error

**Проблема:**
```bash
npm ERR! code ERESOLVE
npm ERR! ERESOLVE unable to resolve dependency tree
```

**Решение:**

1. Попробуйте с флагом `--legacy-peer-deps`:
```bash
npm install --legacy-peer-deps
```

2. Очистите кеш npm:
```bash
npm cache clean --force
rm -rf node_modules package-lock.json
npm install
```

3. Убедитесь что используете Node.js 22.x (задано в `engines` в `package.json`):
```bash
node --version  # Должно быть v22.x.x
```

4. Установите правильную версию Node.js:
```bash
# С помощью nvm
nvm install 22
nvm use 22
```

---

### ❌ TypeScript errors при первом запуске

**Проблема:**
```
Type error: Cannot find module '@/lib/utils' or its corresponding type declarations
```

**Решение:**

1. Убедитесь что зависимости установлены (TypeScript входит в devDependencies):
```bash
npm install
```

2. Перезапустите TypeScript server в VS Code:
   - `Cmd/Ctrl + Shift + P`
   - "TypeScript: Restart TS Server"

3. Проверьте `tsconfig.json` — алиас `@/*` должен указывать на корень проекта:
```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./*"]
    }
  }
}
```

---

### ❌ `next dev` не запускается

**Проблема:**
```
Error: Cannot find module 'next'
```

**Решение:**

1. Переустановите зависимости:
```bash
rm -rf node_modules package-lock.json
npm install
```

2. Проверьте что Next.js установлен (проект использует Next.js 16.1, `next: ^16.1.6` в `package.json`):
```bash
npm list next
```

---

## Проблемы с Supabase

### ❌ "Failed to connect to Supabase"

**Проблема:**
```
Error: Invalid Supabase URL
```

**Решение:**

1. Проверьте `.env.local`:
```bash
# Должен существовать и содержать корректные значения
cat .env.local
```

2. Убедитесь что URL правильный:
```env
# ✅ Правильно
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co

# ❌ Неправильно
NEXT_PUBLIC_SUPABASE_URL=xxxxx.supabase.co  # без https://
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co/  # с trailing slash
```

3. Перезапустите dev server:
```bash
# Ctrl+C для остановки
npm run dev
```

4. Проверьте что проект Supabase активен:
   - Откройте [Supabase Dashboard](https://supabase.com/dashboard)
   - Убедитесь что проект запущен (не в паузе)

> Если переменные не заданы, `updateSession()` в `lib/supabase/middleware.ts` не упадёт, а просто пропустит auth-проверку и выведет ошибку в консоль сервера — ищите там `Missing Supabase environment variables`.

---

### ❌ "Invalid API key"

**Проблема:**
```
Error: Invalid API key
```

**Решение:**

1. Получите новые ключи из Supabase Dashboard:
   - Settings → API
   - Скопируйте `anon public` key

2. Обновите `.env.local`:
```env
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-new-anon-key-here
```

3. Убедитесь что ключ скопирован полностью (обычно очень длинный ~200+ символов)

4. Перезапустите dev server

---

### ❌ "Row Level Security policy violation"

**Проблема:**
```
Error: new row violates row-level security policy for table "games"
```

**Решение:**

1. Проверьте что RLS политики созданы:
```sql
-- В Supabase SQL Editor
SELECT * FROM pg_policies WHERE tablename = 'games';
```

2. Набор политик для `games` задаётся миграцией `00009_fix_live_sharing_policies.sql` (она заменяет политики из 00006/00008), а `00014_tighten_game_write_policies.sql` ужесточает условия записи, не добавляя новых имён. Должны существовать:
   - `games_select_all` — публичное чтение (нужно зрителям live-игр)
   - `games_insert_authenticated` / `games_insert_anon`
   - `games_update_authenticated` / `games_update_anon`
   - `games_delete_authenticated`

   Если политики отличаются — примените миграции заново **по порядку** (см. следующий раздел).

3. Анонимные (guest) игры создаются с `created_by IS NULL` — политики `games_insert_anon` / `games_update_anon` разрешают запись только для таких строк. Если вы пытаетесь записать чужой `created_by` без авторизации, получите RLS violation.

   После `00014` добавились ещё два законных отказа:
   - авторизованный пользователь пишет только свои строки (`created_by = auth.uid()` и в `USING`, и в `WITH CHECK`) — присвоить чужую гостевую игру больше нельзя;
   - завершённая **гостевая** игра замораживается через час после последней записи. Досинхронизация игры, пролежавшей офлайн сутки, вернёт `42501` — это не поломка, а политика.

4. **Отказ в обычном `UPDATE` не выглядит как отказ.** Если строка не проходит `USING`, Postgres не поднимает ошибку — он меняет ноль строк, а PostgREST отвечает `204 No Content`. Это ровно тот случай, когда «всё ок» и «запрещено» неразличимы. Проверять надо так:
```bash
curl -X PATCH "$URL/rest/v1/games?id=eq.$GAME_ID" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '{"status":"active"}'
# пустой массив [] = политика отказала; строка = запись прошла
```
   У upsert поведение другое: строка, не прошедшая `USING` в ветке `DO UPDATE`, роняет запрос с `42501`. Поэтому клиент видит отказ именно на upsert, а не на PATCH.

5. Проверьте состояние пользователя:
```typescript
// В коде
const { data: { user } } = await supabase.auth.getUser()
console.log('User:', user)  // null = anon/guest
```

6. Проверьте политики под ролями локально, не трогая прод: `./supabase/test/setup-local.sh`, затем `psql -h /tmp/kp-pg-sock -p 55432 -U postgres -f supabase/test/rls-policies.sql`. Прогон переключается на `anon`/`authenticated`, подставляет `auth.uid()` и печатает ALLOWED/DENIED по каждому сценарию.

7. Временно отключите RLS для тестирования (НЕ на production!):
```sql
ALTER TABLE games DISABLE ROW LEVEL SECURITY;
```

---

### ❌ Migration fails

**Проблема:**
```
Error: column "created_by" does not exist
```

**Решение:**

1. В `supabase/migrations/` **14 миграций** — их нужно применять строго по порядку:
```
00001_initial_schema.sql
00002_leaderboard_function.sql
00003_fix_leaderboard_and_profile.sql
00004_fix_uuid_min_issue.sql
00005_fix_leaderboard_grouping.sql
00006_public_game_access.sql
00007_achievements.sql
00008_live_sharing_policies.sql
00009_fix_live_sharing_policies.sql
00010_add_current_player_index.sql
00011_fix_achievements_and_defaults.sql
00012_harden_leaderboard.sql
00013_leaderboard_qualifying_minimum.sql
00014_tighten_game_write_policies.sql
```
   Ошибки вида «column does not exist» почти всегда означают, что пропущена одна из предыдущих миграций.

   Перед тем как везти миграцию в прод, её стоит прогнать локально: `./supabase/test/setup-local.sh` поднимает временный Postgres, подделывает то, что даёт Supabase (схема `auth`, роли `anon`/`authenticated`, `auth.uid()` через GUC), и накатывает всю цепочку с нуля. Для политик есть отдельный прогон под ролями: `psql ... -f supabase/test/rls-policies.sql`.

2. В крайнем случае удалите все таблицы и примените миграции заново:
```sql
-- ⚠️ ВНИМАНИЕ: Удалит все данные!
DROP TABLE IF EXISTS user_achievements CASCADE;
DROP TABLE IF EXISTS games CASCADE;
DROP TABLE IF EXISTS player_profiles CASCADE;
DROP TABLE IF EXISTS rulesets CASCADE;

-- Затем запустите миграции 00001 → 00014 по порядку
```

3. Убедитесь что используете актуальные версии миграций из репозитория. В частности:
   - `00011` переписывает `check_achievements`, меняет `max_lives` дефолтного ruleset с 10 на 6 и чинит политики на `user_achievements`;
   - `00012` защищает `get_leaderboard` от падения на клиентских данных (одна игра с нечисловым id раньше делала лидерборд недоступным **для всех**);
   - `00013` меняет сигнатуру `get_leaderboard`, поэтому начинается с `DROP FUNCTION IF EXISTS get_leaderboard(INTEGER)` — иначе рядом останется старая перегрузка и вызов клиента уйдёт в неё;
   - `00014` ужесточает политики записи в `games`.

---

## Проблемы с авторизацией

### ❌ Google OAuth не работает

**Проблема:**
```
Error: redirect_uri_mismatch
```

**Решение:**

1. Проверьте Authorized redirect URIs в Google Cloud Console:
   - [Google Cloud Console](https://console.cloud.google.com)
   - APIs & Services → Credentials → OAuth 2.0 Client IDs

2. Добавьте правильные redirect URIs:
```
https://your-project.supabase.co/auth/v1/callback
http://localhost:3000  (для development)
https://killerpool.app (для production)
```

3. Обновите Authorized JavaScript origins:
```
http://localhost:3000
https://killerpool.app
```

4. Подождите 5-10 минут для применения изменений

> В приложении вход через Google вызывается в `app/auth/page.tsx` через `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${window.location.origin}/auth/callback` } })`. Callback (`app/auth/callback/route.ts`) выполняет `exchangeCodeForSession(code)` и всегда редиректит на `/`.

---

### ❌ Magic Link не приходит / не логинит

**Проблема:** Письмо со ссылкой не приходит, или после клика по ссылке пользователь не залогинен.

**Решение:**

1. В приложении magic link отправляется из `app/auth/page.tsx`:
```typescript
const { error } = await supabase.auth.signInWithOtp({
  email,
  options: {
    emailRedirectTo: `${window.location.origin}/auth/callback`,
  },
})
```
   Ссылка из письма обязана вести на `/auth/callback` вашего домена.

2. Проверьте Redirect URLs в Supabase:
   - Authentication → URL Configuration
   - `http://localhost:3000/auth/callback` и production-URL должны быть в allow list

3. Проверьте спам и лимиты отправки писем в Supabase (на бесплатном тарифе лимит невысокий).

4. Помните: пароли в приложении не используются — только Google OAuth, Magic Link и гостевой режим (стабильный UUID в `localStorage` под ключом `killerpool_guest_id`, без записи в auth).

---

### ❌ Session не сохраняется

**Проблема:** После логина пользователь сразу разлогинивается

**Решение:**

1. Проверьте что cookies разрешены в браузере

2. Убедитесь что используете правильные Supabase clients:
```typescript
// ✅ Правильно: Client Component
'use client'
import { createClient } from '@/lib/supabase/client'  // браузерный клиент

// ✅ Правильно: Server Component / Route Handler
import { createClient } from '@/lib/supabase/server'

// ❌ Неправильно: браузерный клиент в Server Component
```
   `lib/supabase/client.ts` кидает ошибку `createClient can only be used in browser environment`, если вызвать его вне браузера.

3. Сессия обновляется на каждый запрос в `proxy.ts` (конвенция Next.js 16, замена `middleware.ts`):
```typescript
// proxy.ts
export async function proxy(request: NextRequest) {
  return await updateSession(request)
}
```
   `updateSession()` живёт в `lib/supabase/middleware.ts` и вызывает `supabase.auth.getUser()` для рефреша сессии. Если вы меняли `proxy.ts` — верните `supabaseResponse` как есть, иначе cookies рассинхронизируются и сессия «слетит».

4. Проверьте Site URL в Supabase:
   - Authentication → URL Configuration
   - Site URL должен совпадать с `NEXT_PUBLIC_APP_URL`

---

### ❌ Proxy редиректит в бесконечном цикле

**Проблема:** Страница постоянно перезагружается

**Решение:**

1. Route protection находится в `lib/supabase/middleware.ts` (вызывается из `proxy.ts`). Защищён **только** `/profile`; авторизованных со страницы `/auth` редиректит на `/`:
```typescript
// lib/supabase/middleware.ts (реальный код)
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
if (user && request.nextUrl.pathname === '/auth') {
  const url = request.nextUrl.clone()
  url.pathname = '/'
  return NextResponse.redirect(url)
}
```
   Если вы добавляете новые защищённые маршруты, не включайте в список `/auth` — иначе получите цикл `/auth → /auth`.

2. Проверьте `matcher` в `proxy.ts` — он исключает `_next/static`, `_next/image`, `favicon.ico` и статические картинки. Если сузить matcher так, что `/auth` перестанет обрабатываться, редиректы сломаются.

---

## Проблемы с деплоем

### ❌ Vercel build fails

**Проблема:**
```
Error: Build failed
```

**Решение:**

1. Проверьте логи билда в Vercel Dashboard:
   - Deployments → Latest → View Function Logs

2. Убедитесь что environment variables заданы (Settings → Environment Variables), см. `.env.local.example`:
   - `NEXT_PUBLIC_SUPABASE_URL` — обязательна
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` — обязательна
   - `NEXT_PUBLIC_APP_URL` — необязательна; без неё `lib/site.ts` возьмёт домен из окружения Vercel
   - `NEXT_PUBLIC_SENTRY_DSN` — необязательна; без неё Sentry просто молчит
   - `SENTRY_AUTH_TOKEN` — только для сборки, загружает карты исходников; без неё билд проходит, но стек-трейсы в Sentry остаются минифицированными

3. Попробуйте локальный build:
```bash
npm run build
```
   Обратите внимание: перед build автоматически выполняется `prebuild` → `npm run generate-icons` (генерация иконок скриптом `scripts/generate-icons.js`).

   И на всякий случай: в `package.json` это `next build --webpack`, а не просто `next build`. Флаг обязателен — `@ducanh2912/next-pwa` цепляется к webpack-хуку, и под Turbopack сборка **проходит успешно**, но `public/sw.js` не появляется. Приложение молча уезжает в прод без офлайна.

4. Очистите кеш Vercel:
   - Deployments → Latest → ... → Redeploy

---

### ❌ Environment variables не работают на Vercel

**Проблема:** `NEXT_PUBLIC_SUPABASE_URL is undefined`

**Решение:**

1. Убедитесь что клиентские переменные названы с `NEXT_PUBLIC_` префиксом:
```env
# ✅ Правильно (доступны на клиенте)
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...

# ❌ Неправильно (только на сервере)
SUPABASE_URL=...
```

2. Проверьте что переменные добавлены для Production:
   - Settings → Environment Variables
   - Убедитесь что checkbox "Production" отмечен

3. Сделайте redeploy после добавления переменных:
   - Deployments → Latest → Redeploy

4. Если `vercel env pull` отдаёт **пустое** значение переменной, которая в дашборде выглядит заполненной — она помечена как **Sensitive**. Такие переменные доступны только сборке и рантайму, прочитать их нельзя ни через CLI, ни в UI, и это не поломка. Старый CLI даже не показывает тип; проверять свежим:
```bash
npx vercel@latest env ls    # колонка type: Encrypted / Sensitive
```

---

### ❌ "Module not found" на production

**Проблема:**
```
Error: Cannot find module '@/components/...'
```

**Решение:**

1. Проверьте импорты - они case-sensitive на Linux:
```typescript
// ❌ Неправильно
import { Button } from '@/Components/ui/button'  // Capital C

// ✅ Правильно
import { Button } from '@/components/ui/button'  // lowercase c
```

2. Убедитесь что файлы закоммичены в Git:
```bash
git status  # Не должно быть untracked файлов
```

3. Проверьте `.gitignore` - убедитесь что не игнорируются нужные файлы

---

## Проблемы с PWA

### ❌ Приложение не устанавливается на iOS

**Проблема:** Кнопка "Add to Home Screen" не появляется

**Решение:**

1. Убедитесь что используете **Safari** (Chrome на iOS не поддерживает PWA)

2. Проверьте `public/manifest.json` (реальные значения проекта):
```json
{
  "name": "Killerpool - Modern Killer Pool Game",
  "short_name": "Killerpool",
  "display": "standalone",
  "start_url": "/"
}
```

3. Apple-specific метаданные уже заданы в `app/layout.tsx`:
```typescript
export const metadata: Metadata = {
  // ...
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Killerpool',
  },
}
```

4. Apple Touch Icon подключается там же, в `<head>`:
```html
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
```
   Иконки лежат в `public/` (`icon-192.png`, `icon-512.png`, `apple-touch-icon.png`) и генерируются скриптом `npm run generate-icons`.

---

### ❌ Service Worker не регистрируется

**Проблема:**
```
Service Worker registration failed
```

**Решение:**

1. **В development service worker отключён намеренно** — в `next.config.js`:
```javascript
const withPWA = require('@ducanh2912/next-pwa').default({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  // ...
})
```
   Проверять SW нужно на production-билде (`npm run build && npm start`) или на деплое.

2. `public/sw.js` не хранится в репозитории — он генерируется `@ducanh2912/next-pwa` во время `npm run build`. Если файла нет после билда, смотрите ошибки билда.

3. Убедитесь что сайт доступен по HTTPS (или localhost)

4. Проверьте в Chrome DevTools:
   - Application → Service Workers
   - Смотрите errors

5. Очистите кеш:
   - Application → Storage → Clear site data

---

### ❌ Игра завершена офлайн и не попала в Supabase / лидерборд

**Проблема:** Игра закончена без сети; в истории она есть, а на лидерборде/по ссылке — нет.

**Решение:**

1. Это штатный сценарий: `autoSyncGame()` (`lib/sync.ts`) при неудачном синке помечает игру как pending в `localStorage` (ключ `killerpool_pending_sync`).

2. Повторный синк выполняет `retryPendingSyncs()` (`lib/sync.ts`) — он вызывается из `components/pwa-init.tsx`:
   - при монтировании приложения
   - на событии `online`
   - на `visibilitychange` (возврат на вкладку)

   Достаточно открыть приложение с сетью — pending-игры досинхронизируются автоматически.

3. Если игра так и не синкается, проверьте в DevTools → Application → Local Storage ключ `killerpool_pending_sync` и ошибки Supabase в Console. Игры, удалённые из истории (`killerpool_game_history`), из pending-очереди просто выбрасываются.

4. Ретраи не бесконечны. Счётчик попыток лежит в отдельном ключе `killerpool_pending_sync_meta`:
```javascript
JSON.parse(localStorage.getItem('killerpool_pending_sync_meta') || '{}')
// { "<game-id>": { attempts: 2, lastAttemptAt: 1754900000000 } }
```
   После 5 попыток игра выбывает из очереди; между попытками действует нарастающая пауза. Неустранимые ошибки Postgres (`42501` — нет прав, `22P02` — битые данные и ещё несколько) снимают игру с очереди сразу: повторять их бессмысленно.

5. Ачивки, полученные при позднем синке, приходят не из React-дерева: `PWAInit` — сиблинг `GameProvider`, поэтому `lib/achievements.ts` шлёт событие `killerpool:achievements-unlocked`. Если ачивка «пришла, но не показалась» — смотреть надо на подписчика события, а не на синк.

6. Полная сводка — на странице **`/sync`**: `{ success, skipped, refused, failed, total }`. `skipped` — незавершённые игры (в облако они не едут by design), `refused` — отказ базы, `failed` — сетевые и прочие временные ошибки.

---

## Performance проблемы

### ❌ Медленная загрузка страницы

**Проблема:** FCP > 3 секунды

**Решение:**

1. Оптимизируйте изображения:
```typescript
// Используйте next/image вместо <img>
import Image from 'next/image'

<Image
  src="/logo.png"
  width={200}
  height={200}
  alt="Logo"
  priority  // Для above-the-fold images
/>
```

2. Lazy load компонентов:
```typescript
import dynamic from 'next/dynamic'

const HeavyComponent = dynamic(() => import('./heavy'), {
  loading: () => <Spinner />,
  ssr: false
})
```

3. Проверьте bundle size:
```bash
npm run build
# Смотрите на размеры chunks
# Также есть npm run analyze (scripts/analyze-bundle.js)
```

4. Используйте Server Components где возможно:
```typescript
// ✅ Хорошо: Server Component (по умолчанию)
export default async function Page() {
  const data = await fetchData()
  return <div>{data}</div>
}

// ❌ Плохо: Client Component без причины
'use client'
export default function Page() { ... }
```

---

### ❌ Высокий CLS (Layout Shift)

**Проблема:** Элементы "прыгают" при загрузке

**Решение:**

1. Задайте размеры для изображений:
```typescript
<Image
  src="/avatar.png"
  width={100}
  height={100}  // Предотвращает layout shift
  alt="Avatar"
/>
```

2. Используйте skeleton screens:
```typescript
{loading ? (
  <Skeleton className="h-24 w-full" />
) : (
  <Content />
)}
```

3. Резервируйте пространство для динамического контента:
```css
.container {
  min-height: 200px;  /* Предотвращает collapse */
}
```

---

## Mobile проблемы

### ❌ Кнопки не работают на touch устройствах

**Проблема:** Нужно дважды нажимать на кнопки

**Решение:**

1. Убедитесь что элементы достаточно большие:
```css
.button {
  min-height: 44px;  /* iOS minimum tap target */
  min-width: 44px;
}
```

2. Избегайте hover-only interactions:
```typescript
// ❌ Плохо
<div onMouseEnter={...}>

// ✅ Хорошо
<button onClick={...}>
```

3. Используйте `cursor: pointer`:
```css
.clickable {
  cursor: pointer;
}
```

---

### ❌ Viewport неправильный на мобильных

**Проблема:** Контент слишком мелкий на мобильных

**Решение:**

1. Проверьте viewport в `app/layout.tsx` — в Next.js 16 это отдельный экспорт `viewport`, а не поле `metadata`:
```typescript
import type { Viewport } from 'next'

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#10b981',
}
```

2. Используйте relative units:
```css
/* ✅ Хорошо */
font-size: 1rem;
padding: 1rem;

/* ❌ Плохо */
font-size: 16px;
padding: 16px;
```

---

### ❌ Клавиатура перекрывает input на iOS

**Проблема:** Input field скрыт клавиатурой

**Решение:**

1. Скролл к input при фокусе:
```typescript
<input
  onFocus={(e) => {
    e.target.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }}
/>
```

2. Используйте `viewport-fit=cover` (через экспорт `viewport` в `layout.tsx`):
```typescript
export const viewport: Viewport = {
  // ...
  viewportFit: 'cover',
}
```

---

## Общие ошибки

### ❌ "Hydration failed"

**Проблема:**
```
Error: Hydration failed because the initial UI does not match what was rendered on the server
```

**Решение:**

1. Не используйте `Date.now()` или `Math.random()` в render:
```typescript
// ❌ Плохо
const id = Math.random()

// ✅ Хорошо
const [id, setId] = useState(() => Math.random())
```

2. Не используйте browser-only APIs в Server Components:
```typescript
// ❌ Плохо
const data = localStorage.getItem('key')

// ✅ Хорошо
'use client'
const [data, setData] = useState(() =>
  typeof window !== 'undefined' ? localStorage.getItem('key') : null
)
```

3. Убедитесь что HTML структура идентична на сервере и клиенте

> Состояние игры в проекте живёт целиком на клиенте (`contexts/game-context.tsx` + `localStorage`: ключи `killerpool_current_game`, `killerpool_game_history`), поэтому компоненты, читающие его, — Client Components.

**Особый случай — тема.** Класс `dark` на `<html>` ставит инлайн-скрипт в `<head>` (`app/layout.tsx`) **до** гидратации, читая `localStorage['killerpool-theme']`. Сервер такой класс отрендерить не может, поэтому на `<html>` стоит `suppressHydrationWarning` — и это единственное, что он прикрывает. Отсюда два правила:

- не оборачивайте дерево в провайдер, который до монтирования возвращает `null`. Именно так проект какое-то время отдавал **пустой `<body>` на всех страницах**: сервер честно рендерил контент, клиентская обёртка его стирала, и в HTML оставался только RSC-payload внутри `<script>`. Поисковик получал корректный `<title>` при нулевом тексте;
- проверять это надо на собранном HTML, а не в браузере — в браузере после гидратации всё выглядит нормально:
```bash
npm run build
# видимый текст серверного рендера конкретной страницы
node -e "const h=require('fs').readFileSync('.next/server/app/help.html','utf8'); \
  console.log(h.replace(/<script[\s\S]*?<\/script>/g,'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim().length)"
# ноль = SSR сломан
```

---

### ❌ localStorage is not defined

**Проблема:**
```
ReferenceError: localStorage is not defined
```

**Решение:**

1. Проверьте что используете localStorage только в Client Components:
```typescript
'use client'  // Обязательно!

export function Component() {
  useEffect(() => {
    const data = localStorage.getItem('key')
  }, [])
}
```

2. Или используйте проверку:
```typescript
if (typeof window !== 'undefined') {
  localStorage.setItem('key', 'value')
}
```

---

### ❌ "Invalid hook call"

**Проблема:**
```
Error: Invalid hook call. Hooks can only be called inside of the body of a function component
```

**Решение:**

1. Используйте хуки только в функциональных компонентах:
```typescript
// ✅ Правильно
function Component() {
  const [state, setState] = useState(null)
  return <div>{state}</div>
}

// ❌ Неправильно
const state = useState(null)  // Вне компонента
```

2. Не вызывайте хуки в условиях:
```typescript
// ❌ Плохо
if (condition) {
  const [state, setState] = useState(null)
}

// ✅ Хорошо
const [state, setState] = useState(null)
if (condition) {
  // use state
}
```

---

## Debugging советы

### 1. Chrome DevTools

```bash
# Network tab
- Проверьте failed requests к *.supabase.co
- Смотрите на response codes (401, 403, 500)

# Console tab
- Смотрите на errors и warnings
- console.log для отладки

# Application tab
- Проверьте localStorage (ключи killerpool_*)
- Проверьте cookies (Supabase auth)
- Проверьте Service Workers
```

### 2. Next.js debugging

```typescript
// В компоненте
console.log('Rendering component:', props)
```

> В проекте **нет** `app/api/*` и REST-эндпоинтов — все данные ходят через Supabase JS-клиент напрямую с клиента (плюс единственный route handler `app/auth/callback/route.ts` для OAuth/magic link).

### 3. Supabase debugging

```typescript
// Проверьте пользователя
const { data: { user } } = await supabase.auth.getUser()
console.log('User:', user)

// Проверьте queries
const { data, error } = await supabase.from('games').select('*')
console.log('Data:', data, 'Error:', error)
```

### 4. Network debugging

```bash
# Проверьте что Supabase доступен
curl https://your-project.supabase.co

# Проверьте что Vercel доступен
curl https://killerpool.app
```

### 5. Тесты

```bash
npm test           # Jest + React Testing Library
npm run test:watch
npm run test:coverage
```

Отдельно — база: `./supabase/test/setup-local.sh` поднимает временный Postgres и накатывает все миграции, `supabase/test/rls-policies.sql` проверяет политики под ролями. `./supabase/test/setup-local.sh --stop` убирает за собой.

### 6. Sentry

Ошибки прода уезжают в Sentry (`instrumentation-client.ts` — браузер, `instrumentation.ts` — сервер и edge, `app/global-error.tsx` — падение самого layout).

```bash
# ничего не приходит?
```
- Sentry **намеренно молчит** вне production: инициализация обёрнута в `!!DSN && NODE_ENV === 'production'`, поэтому `npm run dev` и локальный `npm run start` без `NODE_ENV=production` не шлют ничего. Это не поломка — так локальная отладка не засоряет боевой проект.
- Часть офлайн-шума отфильтрована через `ignoreErrors` (обрывы сети, отменённые запросы). Если ждёте именно такую ошибку и не видите её — проверьте этот список.
- Трассировка выключена (`tracesSampleRate: 0`): в Performance пусто by design, отправляются только ошибки.
- Стек-трейсы минифицированы → в сборке не было `SENTRY_AUTH_TOKEN`. Проверять загрузку карт надо по artifact bundles, а не по релизам: `/projects/{org}/{project}/files/artifact-bundles/`. Легаси-эндпоинт `/releases/{version}/files/` для debug-id формата всегда показывает 0 и вводит в заблуждение.

---

## Получение помощи

Если проблема не решена:

1. **Проверьте документацию:**
   - [README.md](./README.md)
   - [CONTRIBUTING.md](./CONTRIBUTING.md)
   - [DEPLOYMENT.md](./DEPLOYMENT.md)
   - [ARCHITECTURE.md](./ARCHITECTURE.md) — как устроены потоки данных и наблюдаемость
   - [SECURITY.md](./SECURITY.md) — модель угроз и следствия RLS-политик
   - [LEADERBOARD_TROUBLESHOOTING.md](./LEADERBOARD_TROUBLESHOOTING.md) — отдельный гайд по проблемам лидерборда

2. **Поищите в Issues:**
   - [GitHub Issues](https://github.com/AlexIDUJFNJ/killerpool/issues)

3. **Создайте новый Issue:**
   - Опишите проблему
   - Приложите скриншоты
   - Укажите версии (Node.js, npm, браузер)
   - Покажите код и error messages

4. **Сообщество:**
   - [Next.js Discord](https://discord.com/invite/nextjs)
   - [Supabase Discord](https://discord.supabase.com)

---

**Документ обновлен:** 2026-08-11
