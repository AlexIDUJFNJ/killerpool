# 🔧 Troubleshooting Guide - Killerpool

Руководство по устранению частых проблем при разработке и использовании Killerpool.

> Обновлено: 2026-10-16.
>
> Стек проекта: Next.js 16.3 (App Router), React 19, TypeScript 5, Tailwind CSS 4, Supabase, PWA через `@ducanh2912/next-pwa`, Sentry. Node.js 22 (см. `engines` в `package.json`).

## 📋 Содержание

- [Проблемы при установке](#проблемы-при-установке)
- [Проблемы с Supabase](#проблемы-с-supabase)
- [Проблемы с авторизацией](#проблемы-с-авторизацией)
- [Проблемы с деплоем](#проблемы-с-деплоем)
- [Проблемы с PWA и выгрузкой игр](#проблемы-с-pwa-и-выгрузкой-игр)
- [Игровой экран](#игровой-экран)
- [Общие ошибки](#общие-ошибки)
- [Debugging советы](#debugging-советы)

---

## Проблемы при установке

### ❌ `npm install` fails with ERESOLVE error

**Проблема:**
```bash
npm ERR! code ERESOLVE
npm ERR! ERESOLVE unable to resolve dependency tree
```

**Решение:**

1. `legacy-peer-deps=true` уже стоит в `.npmrc` проекта — флаг руками добавлять не нужно. Если ошибка всё равно есть, проверьте, что `.npmrc` на месте и что вы запускаете npm из корня репозитория. Почему флаг нужен и чем опасно его убрать, написано в самом `.npmrc`.

2. Ставьте ровно то, что в lock-файле:
```bash
rm -rf node_modules
npm ci
```
   Не удаляйте `package-lock.json` ради починки установки: новый lock возьмёт свежие версии в пределах диапазонов `package.json`, и сборку (особенно PWA) придётся перепроверять. Пересобрать lock — отдельное изменение, а не способ лечения.

3. Убедитесь что используете Node.js 22.x (задано в `engines` в `package.json`):
```bash
node --version  # Должно быть v22.x.x
nvm install 22 && nvm use 22   # если нет
```

---

### ❌ TypeScript errors при первом запуске

**Проблема:**
```
Type error: Cannot find module '@/lib/utils' or its corresponding type declarations
```

**Решение:**

1. Убедитесь что зависимости установлены (TypeScript входит в devDependencies): `npm ci`.

2. Перезапустите TypeScript server в VS Code: `Cmd/Ctrl + Shift + P` → "TypeScript: Restart TS Server".

3. Проверьте `tsconfig.json` — алиас `@/*` указывает на корень проекта. `baseUrl` в проекте нет и не нужен (`moduleResolution: "bundler"`):
```json
{
  "compilerOptions": {
    "moduleResolution": "bundler",
    "paths": {
      "@/*": ["./*"]
    }
  }
}
```
   Для Jest тот же алиас задан отдельно — `moduleNameMapper` в `jest.config.ts`.

---

### ❌ `next dev` не запускается

**Проблема:**
```
Error: Cannot find module 'next'
```

**Решение:**

1. Переустановите зависимости: `rm -rf node_modules && npm ci`.

2. Проверьте, что Next.js установлен (проект на Next.js 16.3, `next: ^16.3.8` в `package.json`):
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

1. Проверьте `.env.local` — файл должен существовать и содержать корректные значения (шаблон — `.env.local.example`).

2. Убедитесь что URL правильный:
```env
# ✅ Правильно
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co

# ❌ Неправильно
NEXT_PUBLIC_SUPABASE_URL=xxxxx.supabase.co  # без https://
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co/  # с trailing slash
```

3. Перезапустите dev server: `NEXT_PUBLIC_*` вшиваются при старте.

4. Проверьте, что проект Supabase активен (не в паузе) в [Supabase Dashboard](https://supabase.com/dashboard).

> Если переменные не заданы, `updateSession()` в `lib/supabase/middleware.ts` не упадёт, а просто пропустит auth-проверку и выведет ошибку в консоль сервера — ищите там `Missing Supabase environment variables`. Браузерный клиент (`lib/supabase/client.ts`) в этом случае бросает ошибку.

---

### ❌ "Invalid API key"

**Решение:**

1. Скопируйте `anon public` key заново: Supabase Dashboard → Settings → API.
2. Обновите `NEXT_PUBLIC_SUPABASE_ANON_KEY` в `.env.local` — ключ длинный, проверьте, что скопирован целиком.
3. Перезапустите dev server.

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

2. Набор политик для `games` задаётся миграцией `00009_fix_live_sharing_policies.sql` (она заменяет политики из 00006/00008), а `00014` и `00015` ужесточают условия записи, не добавляя новых имён. Должны существовать:
   - `games_select_all` — публичное чтение (нужно зрителям live-игр)
   - `games_insert_authenticated` / `games_insert_anon`
   - `games_update_authenticated` / `games_update_anon`
   - `games_delete_authenticated`

   Если политики отличаются — примените недостающие миграции (см. следующий раздел).

3. Анонимные (guest) игры создаются с `created_by IS NULL` — политики `games_insert_anon` / `games_update_anon` разрешают запись только для таких строк. Если вы пытаетесь записать чужой `created_by` без авторизации, получите RLS violation.

   Законные отказы, которые выглядят как поломка:
   - авторизованный пользователь пишет только свои строки (`created_by = auth.uid()` и в `USING`, и в `WITH CHECK`, 00014) — присвоить гостевую игру, которая уже лежит в облаке без владельца, нельзя;
   - гостевая игра принимает правки от `anon` не дольше **суток** от серверного `created_at` (то есть от начала партии), а завершённая или брошенная — ещё и не дольше **часа** после последней записи (00015). Повторная запись уже выгруженной гостевой игры после этого вернёт `42501` — это политика, клиент считает такой отказ окончательным. Первая выгрузка офлайн-игры — это INSERT, на неё окна не действуют, даже если игра пролежала неделю;
   - строку больше 32 участников, 1000 записей истории или 512 КиБ JSON, а также с `winner_id`, которого нет среди участников, база не примет — это уже `23514 check_violation`, тоже окончательный.

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

1. В `supabase/migrations/` **15 миграций** — их нужно применять строго по порядку:
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
00015_game_integrity_and_spam_limits.sql
```
   Ошибки вида «column does not exist» почти всегда означают, что пропущена одна из предыдущих миграций.

   Перед тем как везти миграцию в прод, её стоит прогнать локально: `./supabase/test/setup-local.sh` поднимает временный Postgres, подделывает то, что даёт Supabase (схема `auth`, роли `anon`/`authenticated`, `auth.uid()` через GUC), и накатывает всю цепочку с нуля. Для политик есть отдельный прогон под ролями: `psql ... -f supabase/test/rls-policies.sql`.

2. **`supabase db push` пытается накатить всё с 00001** и падает на первом `CREATE TYPE`. Это продовый проект без журнала миграций: 00001–00014 применялись через SQL Editor. Журнал заводится один раз командой `supabase migration repair --linked --status applied 00001 … 00014`, после неё push видит только новые миграции. Порядок — в [DEPLOYMENT.md](./DEPLOYMENT.md#supabase-cli). Не применяйте новые миграции через SQL Editor: в журнал они не попадут, и следующий push повторит их.

3. В крайнем случае (только на своей тестовой базе!) удалите все таблицы и примените миграции заново:
```sql
-- ⚠️ ВНИМАНИЕ: Удалит все данные!
DROP TABLE IF EXISTS user_achievements CASCADE;
DROP TABLE IF EXISTS games CASCADE;
DROP TABLE IF EXISTS player_profiles CASCADE;
DROP TABLE IF EXISTS rulesets CASCADE;

-- Затем запустите миграции 00001 → 00015 по порядку
```

4. Убедитесь что используете актуальные версии миграций из репозитория. В частности:
   - `00011` переписывает `check_achievements`, меняет `max_lives` дефолтного ruleset с 10 на 6 и чинит политики на `user_achievements`;
   - `00012` защищает `get_leaderboard` от падения на клиентских данных (одна игра с нечисловым id раньше делала лидерборд недоступным **для всех**);
   - `00013` меняет сигнатуру `get_leaderboard`, поэтому начинается с `DROP FUNCTION IF EXISTS get_leaderboard(INTEGER)` — иначе рядом останется старая перегрузка и вызов клиента уйдёт в неё;
   - `00014` ужесточает политики записи в `games`;
   - `00015` отдаёт даты серверу, ограничивает срок гостевой записи, размер строки и `winner_id`, закрывает анонимную вставку профилей и вставку rulesets, заменяет `check_achievements` (v3) и `get_leaderboard` (v6). Если на старых данных какое-то из четырёх новых CHECK-ограничений не прошло проверку, миграция не падает: она пишет `NOTICE` с числом нарушающих строк и оставляет ограничение `NOT VALID` — новые записи оно всё равно проверяет.

5. После миграции перегенерируйте типы: `npx supabase gen types typescript --linked --schema public > lib/types/database.types.ts`.

---

## Проблемы с авторизацией

### ❌ Вход не завершился: `/auth` показывает сообщение

`app/auth/callback/route.ts` при неудаче возвращает на `/auth?error=<код>`, а страница показывает текст по коду (`app/auth/auth-errors.ts`):

| Код | Что случилось | Что делать |
|-----|---------------|------------|
| `cancelled` | Пользователь отменил вход у Google (`access_denied`) | Войти ещё раз |
| `link_expired` | Ссылка из письма просрочена или уже использована (`otp_expired`, `flow_state_expired`) | Запросить новую |
| `other_browser` | Ссылку открыли не в том браузере, где её запрашивали: PKCE-верификатор живёт в браузере запроса (`flow_state_not_found`, `bad_code_verifier`) | Открыть ссылку там же или запросить новую здесь |
| `callback_failed` | Всё остальное, в том числе исключение при обмене кода | Смотреть лог сервера: `[auth/callback] exchangeCodeForSession failed: <code> <message>` |

Неизвестный код сообщения не показывает: текст никогда не берётся из URL.

---

### ❌ Google OAuth не работает

**Проблема:**
```
Error: redirect_uri_mismatch
```

**Решение:**

1. Проверьте Authorized redirect URIs в [Google Cloud Console](https://console.cloud.google.com) → APIs & Services → Credentials → OAuth 2.0 Client IDs. Там должен быть callback Supabase:
```
https://your-project.supabase.co/auth/v1/callback
```

2. Authorized JavaScript origins:
```
http://localhost:3000
https://killerpool.app
```

3. В Supabase → Authentication → URL Configuration в Redirect URLs должны быть `http://localhost:3000/auth/callback` и продовый `https://killerpool.app/auth/callback` (или маска `https://killerpool.app/**`).

4. Подождите 5-10 минут для применения изменений.

> Вход через Google вызывается в `app/auth/auth-form.tsx`: `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${window.location.origin}/auth/callback` } })`. Callback выполняет `exchangeCodeForSession(code)` и редиректит на `/`, а при ошибке — на `/auth?error=<код>` (см. выше).

---

### ❌ Magic Link не приходит / не логинит

**Решение:**

1. Magic link отправляется из `app/auth/auth-form.tsx`:
```typescript
const { error } = await supabase.auth.signInWithOtp({
  email,
  options: {
    emailRedirectTo: `${window.location.origin}/auth/callback`,
  },
})
```
   Ссылка из письма обязана вести на `/auth/callback` вашего домена, и открывать её надо в том же браузере, где её запрашивали (иначе — `other_browser`).

2. Проверьте Redirect URLs в Supabase: Authentication → URL Configuration — `http://localhost:3000/auth/callback` и production-URL должны быть в allow list.

3. Проверьте спам и лимиты отправки писем в Supabase (на бесплатном тарифе лимит невысокий).

4. Помните: пароли в приложении не используются — только Google OAuth, Magic Link и гостевой режим (стабильный UUID в `localStorage` под ключом `killerpool_guest_id`, без записи в auth).

---

### ❌ Session не сохраняется

**Проблема:** После логина пользователь сразу разлогинивается

**Решение:**

1. Проверьте что cookies разрешены в браузере.

2. Убедитесь что используете правильные Supabase clients:
```typescript
// ✅ Client Component
'use client'
import { createClient } from '@/lib/supabase/client'  // браузерный клиент

// ✅ Server Component / Route Handler
import { createClient } from '@/lib/supabase/server'
```
   `lib/supabase/client.ts` кидает ошибку `createClient can only be used in browser environment`, если вызвать его вне браузера.

3. Сессия обновляется в `proxy.ts` (конвенция Next.js 16, замена `middleware.ts`) на каждый запрос страницы:
```typescript
// proxy.ts
export async function proxy(request: NextRequest) {
  return await updateSession(request)
}
```
   `updateSession()` живёт в `lib/supabase/middleware.ts` и вызывает `supabase.auth.getUser()` для рефреша сессии. Если вы меняли `proxy.ts` — верните `supabaseResponse` как есть, иначе cookies рассинхронизируются и сессия «слетит».

4. Проверьте Site URL в Supabase (Authentication → URL Configuration) — он должен совпадать с продовым доменом.

---

### ❌ Proxy редиректит в бесконечном цикле

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

2. Проверьте `matcher` в `proxy.ts`. Он исключает `_next/static`, `_next/image`, `favicon.ico` и картинки, файлы next-pwa (`sw.js`, `workbox-*.js`, `swe-worker-*.js`, `fallback-*.js`), `manifest.json`, `robots.txt`, `sitemap.xml`, `opengraph-image` и `twitter-image`. Если сузить его так, что `/auth` перестанет обрабатываться, редиректы сломаются; если расширить на файлы service worker'а — каждый их запрос будет ждать `getUser()` в Supabase.

---

## Проблемы с деплоем

### ❌ Vercel build fails

**Решение:**

1. Проверьте логи билда в Vercel Dashboard: Deployments → Latest → Build Logs.

2. Убедитесь что environment variables заданы (Settings → Environment Variables), см. `.env.local.example`:
   - `NEXT_PUBLIC_SUPABASE_URL` — обязательна
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` — обязательна
   - `NEXT_PUBLIC_APP_URL` — необязательна, только для Production; без неё `lib/site.ts` возьмёт `NEXT_PUBLIC_VERCEL_URL`, а вне Vercel — `https://killerpool.app`
   - `NEXT_PUBLIC_SENTRY_DSN` — необязательна; без неё Sentry просто молчит
   - `SENTRY_AUTH_TOKEN` — только для сборки, загружает карты исходников; без неё билд проходит, но стек-трейсы в Sentry остаются минифицированными

3. Попробуйте локальный build:
```bash
npm run build
```
   Перед build автоматически выполняется `prebuild` → `npm run generate-icons` (генерация иконок скриптом `scripts/generate-icons.js`).

   В `package.json` это `next build --webpack`, а не просто `next build`. Флаг обязателен — `@ducanh2912/next-pwa` цепляется к webpack-хуку, и под Turbopack сборка **проходит успешно**, но `public/sw.js` не появляется. Приложение молча уезжает в прод без офлайна.

4. Пересоберите без кеша: Deployments → Latest → ... → Redeploy (без «Use existing Build Cache»).

---

### ❌ Environment variables не работают на Vercel

**Проблема:** `NEXT_PUBLIC_SUPABASE_URL is undefined`

**Решение:**

1. Клиентские переменные обязаны иметь префикс `NEXT_PUBLIC_` — `SUPABASE_URL` браузер не увидит.

2. Проверьте, что переменная добавлена для нужного окружения (Production / Preview), и сделайте redeploy: `NEXT_PUBLIC_*` вшиваются в сборку.

3. Если не работают `NEXT_PUBLIC_VERCEL_URL` / `NEXT_PUBLIC_VERCEL_ENV` (домен в метаданных не тот, Sentry молчит на деплое) — проверьте, что включено **Automatically expose System Environment Variables**.

4. Если `vercel env pull` отдаёт **пустое** значение переменной, которая в дашборде выглядит заполненной — она помечена как **Sensitive**. Такие переменные доступны только сборке и рантайму, прочитать их нельзя ни через CLI, ни в UI, и это не поломка. Старый CLI даже не показывает тип; проверять свежим:
```bash
npx vercel@latest env ls    # колонка type: Encrypted / Sensitive
```

---

### ❌ "Module not found" на production

Импорты на Linux чувствительны к регистру, а файлы в проекте — в kebab-case: `@/components/ui/button`, а не `@/Components/ui/Button`. Если локально (macOS) всё собирается, а на Vercel нет — почти всегда регистр. Второе — файл не закоммичен (`git status`).

---

## Проблемы с PWA и выгрузкой игр

### ❌ Приложение не устанавливается на iOS

**Решение:**

1. Используйте **Safari**: события `beforeinstallprompt` на iOS нет, поэтому кнопка «Install App» на главной показывает там инструкцию «Поделиться → На экран Домой».

2. Проверьте `public/manifest.json` (реальные значения проекта):
```json
{
  "name": "Killerpool - Modern Killer Pool Game",
  "short_name": "Killerpool",
  "display": "standalone",
  "start_url": "/",
  "lang": "en"
}
```

3. Apple-specific метаданные уже заданы в `app/layout.tsx`:
```typescript
export const metadata: Metadata = {
  // ...
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black',
    title: 'Killerpool',
  },
}
```

4. Apple Touch Icon подключается там же, в `<head>`: `<link rel="apple-touch-icon" href="/apple-touch-icon.png" />`. Иконки лежат в `public/` и генерируются скриптом `npm run generate-icons`.

---

### ❌ Service Worker не регистрируется

**Проблема:**
```
Service Worker registration failed
```

**Решение:**

1. **В development service worker отключён намеренно** (`disable: process.env.NODE_ENV === 'development'` в `next.config.js`) и не регистрируется вообще — даже если в `public/` остался `sw.js` от прошлой сборки. Проверять SW нужно на production-билде (`npm run build && npm run start`) или на деплое.

2. Регистрирует его только next-pwa (`register: true`); в `components/pwa-init.tsx` регистрации нет и добавлять её не нужно.

3. `public/sw.js` не хранится в репозитории — он генерируется во время `npm run build`. Нет файла после билда — смотрите, не ушла ли сборка через Turbopack (см. «Vercel build fails»).

4. Сайт должен открываться по HTTPS (или localhost). Ошибки — в DevTools → Application → Service Workers; сбросить всё — Application → Storage → Clear site data.

---

### ❌ Игра завершена офлайн и не попала в Supabase / лидерборд

**Проблема:** Игра закончена без сети; в истории она есть, а на лидерборде/по ссылке — нет.

**Решение:**

1. Это штатный сценарий. `syncFinishedGame()` (`lib/sync.ts`) ставит игру в очередь `killerpool_pending_sync` **до** первой попытки и снимает её только после подтверждённой записи. Брошенные игры идут той же дорогой.

2. Повторную выгрузку делает `retryPendingSyncs()` — его вызывают `components/pwa-init.tsx` (при монтировании, на `online`, на возврате на вкладку) и кнопка **Sync** на `/history` (для вошедших; она сначала выгружает очередь, потом скачивает). Достаточно открыть приложение с сетью.

3. Если игра так и не уезжает, смотрите DevTools → Application → Local Storage:
```javascript
JSON.parse(localStorage.getItem('killerpool_pending_sync') || '[]')
JSON.parse(localStorage.getItem('killerpool_pending_sync_meta') || '{}')
// { "<game-id>": { attempts: 2, firstFailedAt: 1760600000000, lastAttemptAt: 1760600120000 } }
```
   - между попытками пауза: 1 минута, удваивается, не больше 6 часов — свежая неудача может просто ждать своего срока;
   - игру держат **14 дней** с первой неудачи, потом выбрасывают из очереди (в консоли `[sync] giving up on game after repeated failures`);
   - окончательный отказ (`PERMANENT_ERROR_CODES` в `lib/sync.ts`: `42501`, `23514`, `22P02`, `PGRST204` и др.) снимает игру с очереди сразу — повтор не поможет;
   - игра, созданная под другим аккаунтом, ждёт в очереди его входа и счётчик попыток не тратит;
   - игры, удалённые из истории (`killerpool_game_history`), из очереди просто выбрасываются;
   - ошибки записи — в консоли: `Failed to sync game to Supabase: <сообщение> <код>`.

4. Ачивки, полученные при позднем синке, приходят не из React-дерева: `PWAInit` — сиблинг `GameProvider`, поэтому `lib/achievements.ts` шлёт событие `killerpool:achievements-unlocked`. Если ачивка «пришла, но не показалась» — смотреть надо на подписчика события, а не на синк.

5. Страницы `/sync` со сводкой больше нет. Что стало с только что завершённой игрой, вошедшему игроку пишет экран победителя: сохранено, ждёт сети, отвергнуто сервером или ждёт другого аккаунта.

---

## Игровой экран

### ❌ Свайп не срабатывает

Свайп — не единственный способ: под карточкой игрока есть кнопки Miss / Black / Pot, а на клавиатуре — стрелки ← (Miss), ↑ (Black), → (Pot). Порог свайпа — 100px или скорость 500 (`components/game/swipeable-player-card.tsx`).

### ❌ Зритель видит устаревшее состояние

- Хост должен быть онлайн: строку в Supabase пишет только он, на каждое новое состояние. После перезагрузки страницы у хоста трансляция возобновляется сама (`killerpool_shared_game`).
- Зритель при каждом (пере)подключении канала догружает строку SELECT'ом, так что ходы, сделанные во время обрыва, приходят после восстановления связи.
- Если хост закончил игру через End Game, зритель видит, что игра закончена.
- В консоли зрителя — `[subscribeToGame] Channel error` / `Subscription timed out`: проблема realtime-соединения, а не данных. Проверьте, что `games` в publication `supabase_realtime` (Database → Replication).

### ❌ Масштаб страницы / анимации

Зум не запрещён: в `viewport` (`app/layout.tsx`) нет `maximumScale`, и возвращать его не нужно (WCAG 1.4.4); поля ввода с шрифтом 16px не вызывают автозум iOS. Если анимации «не играют» — проверьте системную настройку «уменьшить движение»: `MotionConfig reducedMotion="user"` её уважает.

### Размер бандла

`npm run size` (`scripts/bundle-size.js`) собирает проект и показывает объём `.next/static`, JS-чанки и файлы больше 100 КБ. Состав бандла это не показывает; для разбора по модулям — `npx next experimental-analyze` (он анализирует Turbopack-сборку, а production собирается webpack'ом).

---

## Общие ошибки

### ❌ "Hydration failed"

**Проблема:**
```
Error: Hydration failed because the initial UI does not match what was rendered on the server
```

**Решение:**

1. Не используйте `Date.now()`, `Math.random()` и browser-only API (`localStorage`, `navigator`) во время рендера. Состояние игры в проекте живёт целиком на клиенте (`contexts/game-context.tsx` + `localStorage`), поэтому всё, что его читает, читает в эффекте после монтирования.

2. **Особый случай — тема.** Класс `dark` на `<html>` ставит инлайн-скрипт в `<head>` (`THEME_SCRIPT` из `components/theme.ts`, вставлен в `app/layout.tsx`) **до** гидратации, читая `localStorage['killerpool-theme']`. Сервер такой класс отрендерить не может, поэтому на `<html>` стоит `suppressHydrationWarning` — и это единственное, что он прикрывает. Отсюда два правила:

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

Код выполнился на сервере. Обращайтесь к `localStorage` только в Client Component (`'use client'`) и только после монтирования (в `useEffect`), либо за проверкой `typeof window !== 'undefined'`. Функции `lib/storage.ts` ошибку не бросают — они ловят её и возвращают пустое значение, поэтому на сервере тихо «теряют» данные.

---

## Debugging советы

### 1. Chrome DevTools

```bash
# Network tab
- Проверьте failed requests к *.supabase.co
- Смотрите на response codes (401, 403, 500)

# Console tab
- Смотрите на errors и warnings

# Application tab
- Проверьте localStorage (ключи killerpool_*, killerpool-theme)
- Проверьте cookies (Supabase auth)
- Проверьте Service Workers
```

> В проекте **нет** `app/api/*` и REST-эндпоинтов — все данные ходят через Supabase JS-клиент напрямую с клиента (плюс единственный route handler `app/auth/callback/route.ts` для OAuth/magic link).

### 2. Supabase debugging

```typescript
// Проверьте пользователя
const { data: { user } } = await supabase.auth.getUser()
console.log('User:', user)

// Проверьте queries
const { data, error } = await supabase.from('games').select('*')
console.log('Data:', data, 'Error:', error)
```

Запросы для SQL Editor по лидерборду — в `supabase/debug/leaderboard.sql`, разбор — в [LEADERBOARD_TROUBLESHOOTING.md](./LEADERBOARD_TROUBLESHOOTING.md).

### 3. Тесты

```bash
npm test           # Jest + React Testing Library
npm run test:watch
npm run test:coverage
```

Отдельно — база: `./supabase/test/setup-local.sh` поднимает временный Postgres и накатывает все миграции, `supabase/test/rls-policies.sql` проверяет политики под ролями. `./supabase/test/setup-local.sh --stop` убирает за собой.

### 4. Sentry

Ошибки с деплоев уезжают в Sentry (`instrumentation-client.ts` — браузер, `instrumentation.ts` — сервер и edge, `app/global-error.tsx` — падение самого layout).

**Ничего не приходит?**
- Sentry **намеренно молчит** вне Vercel. Нужны DSN, `NODE_ENV === 'production'` и окружение Vercel `production` или `preview` (`NEXT_PUBLIC_VERCEL_ENV` в браузере, вшивается при сборке; `VERCEL_ENV` на сервере). Поэтому `npm run dev` и локальная `npm run build && npm run start` не шлют ничего даже с DSN в `.env.local` — так локальная отладка не засоряет боевой проект. Проверять отправку — на preview-деплое: его события приходят с `environment: preview`.
- На деплое молчит — проверьте, что включено **Automatically expose System Environment Variables**: без него в браузерной сборке нет `NEXT_PUBLIC_VERCEL_ENV`.
- Часть офлайн-шума отфильтрована через `ignoreErrors` (`Failed to fetch`, `NetworkError`, `Load failed`, `AbortError`). Если ждёте именно такую ошибку и не видите её — проверьте этот список.
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
   - [PWA_SETUP.md](./PWA_SETUP.md) — service worker и офлайн-выгрузка

2. **Поищите в Issues:** [GitHub Issues](https://github.com/AlexIDUJFNJ/killerpool/issues)

3. **Создайте новый Issue:** опишите проблему, приложите скриншоты, версии (Node.js, npm, браузер) и текст ошибок.

---

**Документ обновлен:** 2026-10-16
