# 🔧 Troubleshooting Guide - Killerpool

Руководство по устранению частых проблем при разработке и использовании Killerpool.

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

3. Убедитесь что используете Node.js 20.x:
```bash
node --version  # Должно быть v20.x.x
```

4. Установите правильную версию Node.js:
```bash
# С помощью nvm
nvm install 20
nvm use 20
```

---

### ❌ TypeScript errors при первом запуске

**Проблема:**
```
Type error: Cannot find module '@/lib/utils' or its corresponding type declarations
```

**Решение:**

1. Убедитесь что TypeScript установлен:
```bash
npm install --save-dev typescript
```

2. Перезапустите TypeScript server в VS Code:
   - `Cmd/Ctrl + Shift + P`
   - "TypeScript: Restart TS Server"

3. Проверьте `tsconfig.json`:
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

2. Проверьте что Next.js установлен:
```bash
npm list next
```

3. Установите Next.js вручную:
```bash
npm install next@latest react@latest react-dom@latest
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

2. Запустите миграцию заново:
   - Откройте `supabase/migrations/00001_initial_schema.sql`
   - Скопируйте весь код
   - Выполните в SQL Editor

3. Проверьте что пользователь аутентифицирован:
```typescript
// В коде
const { data: { session } } = await supabase.auth.getSession()
console.log('Session:', session)  // Должен быть не null
```

4. Временно отключите RLS для тестирования (НЕ на production!):
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

1. Проверьте порядок выполнения SQL команд в миграции

2. Удалите все таблицы и запустите миграцию заново:
```sql
-- ⚠️ ВНИМАНИЕ: Удалит все данные!
DROP TABLE IF EXISTS games CASCADE;
DROP TABLE IF EXISTS player_profiles CASCADE;
DROP TABLE IF EXISTS rulesets CASCADE;

-- Затем запустите миграцию
```

3. Убедитесь что используете актуальную версию миграции из репозитория

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

---

### ❌ "User already registered"

**Проблема:**
```
Error: User already registered
```

**Решение:**

1. Используйте другой email или social provider

2. Или войдите вместо регистрации:
```typescript
// Используйте signIn вместо signUp
await supabase.auth.signInWithPassword({
  email,
  password
})
```

3. Сбросьте пароль если забыли:
```typescript
await supabase.auth.resetPasswordForEmail(email)
```

---

### ❌ Session не сохраняется

**Проблема:** После логина пользователь сразу разлогинивается

**Решение:**

1. Проверьте что cookies разрешены в браузере

2. Убедитесь что используете правильные Supabase clients:
```typescript
// ✅ Правильно: Client Component
'use client'
import { createBrowserClient } from '@/lib/supabase/client'

// ❌ Неправильно: Server Component с browser client
import { createBrowserClient } from '@/lib/supabase/client'
```

3. Проверьте middleware:
```typescript
// middleware.ts должен обновлять session
await supabase.auth.getSession()
```

4. Проверьте Site URL в Supabase:
   - Authentication → URL Configuration
   - Site URL должен совпадать с `NEXT_PUBLIC_APP_URL`

---

### ❌ Middleware редиректит в бесконечном цикле

**Проблема:** Страница постоянно перезагружается

**Решение:**

1. Проверьте условия в `middleware.ts`:
```typescript
// ❌ Плохо: может создать infinite loop
if (!session) {
  return NextResponse.redirect(new URL('/auth', request.url))
}

// ✅ Хорошо: exclude auth page
if (!session && !request.nextUrl.pathname.startsWith('/auth')) {
  return NextResponse.redirect(new URL('/auth', request.url))
}
```

2. Исключите публичные страницы:
```typescript
export const config = {
  matcher: [
    '/profile/:path*',
    '/game/:path*',
    '/history/:path*'
  ]
}
```

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

2. Убедитесь что environment variables заданы:
   - Settings → Environment Variables
   - Проверьте что все 3 переменные добавлены

3. Попробуйте локальный build:
```bash
npm run build
```

4. Проверьте размер бандла:
```bash
# Должен быть < 50MB
du -sh .next
```

5. Очистите кеш Vercel:
   - Deployments → Latest → ... → Redeploy

---

### ❌ Environment variables не работают на Vercel

**Проблема:** `NEXT_PUBLIC_SUPABASE_URL is undefined`

**Решение:**

1. Убедитесь что переменные названы с `NEXT_PUBLIC_` префиксом:
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

2. Проверьте `manifest.json`:
```json
{
  "name": "Killerpool",
  "short_name": "Killerpool",
  "display": "standalone",
  "start_url": "/"
}
```

3. Добавьте Apple-specific meta tags в `layout.tsx`:
```typescript
export const metadata = {
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Killerpool'
  }
}
```

4. Добавьте Apple Touch Icon:
```html
<link rel="apple-touch-icon" href="/icons/icon-192x192.png" />
```

---

### ❌ Service Worker не регистрируется

**Проблема:**
```
Service Worker registration failed
```

**Решение:**

1. Убедитесь что сайт доступен по HTTPS (или localhost)

2. Проверьте что Service Worker файл существует:
```bash
ls public/sw.js
```

3. Проверьте в Chrome DevTools:
   - Application → Service Workers
   - Смотрите errors

4. Очистите кеш:
   - Application → Storage → Clear site data

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

1. Проверьте viewport meta tag в `layout.tsx`:
```typescript
export const metadata = {
  viewport: {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1
  }
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

2. Используйте `viewport-fit=cover`:
```typescript
viewport: {
  viewportFit: 'cover'
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
- Проверьте failed requests
- Смотрите на response codes (401, 403, 500)

# Console tab
- Смотрите на errors и warnings
- console.log для отладки

# Application tab
- Проверьте localStorage
- Проверьте cookies
- Проверьте Service Workers
```

### 2. Next.js debugging

```typescript
// В компоненте
console.log('Rendering component:', props)

// В API route
console.log('Request:', request.method, request.url)
```

### 3. Supabase debugging

```typescript
// Проверьте session
const { data: { session } } = await supabase.auth.getSession()
console.log('Session:', session)

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

---

## Получение помощи

Если проблема не решена:

1. **Проверьте документацию:**
   - [README.md](./README.md)
   - [CONTRIBUTING.md](./CONTRIBUTING.md)
   - [DEPLOYMENT.md](./DEPLOYMENT.md)

2. **Поищите в Issues:**
   - [GitHub Issues](https://github.com/yourusername/killerpool/issues)

3. **Создайте новый Issue:**
   - Опишите проблему
   - Приложите скриншоты
   - Укажите версии (Node.js, npm, браузер)
   - Покажите код и error messages

4. **Сообщество:**
   - [Next.js Discord](https://discord.com/invite/nextjs)
   - [Supabase Discord](https://discord.supabase.com)

---

**Документ обновлен:** 16 ноября 2025
