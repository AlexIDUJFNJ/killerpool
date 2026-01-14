# 🔐 Security - Killerpool

Руководство по безопасности и best practices для Killerpool.

## 📋 Содержание

- [Обзор безопасности](#обзор-безопасности)
- [Authentication & Authorization](#authentication--authorization)
- [Data Protection](#data-protection)
- [API Security](#api-security)
- [Frontend Security](#frontend-security)
- [Environment Variables](#environment-variables)
- [OWASP Top 10](#owasp-top-10)
- [Security Checklist](#security-checklist)
- [Incident Response](#incident-response)
- [Reporting Vulnerabilities](#reporting-vulnerabilities)

---

## Обзор безопасности

Killerpool следует принципу **security by default**:

- ✅ HTTPS only (enforced)
- ✅ Row Level Security (RLS) в PostgreSQL
- ✅ Environment variables для секретов
- ✅ Content Security Policy (CSP)
- ✅ XSS/CSRF защита через Next.js
- ✅ Input validation & sanitization

---

## Authentication & Authorization

### 🔐 Supabase Auth

Killerpool использует Supabase для аутентификации:

**Supported methods:**
- ✅ Google OAuth 2.0
- ✅ Magic Links (passwordless)
- ✅ Email/Password (опционально)

**Security features:**
- JWT tokens с expiration
- Refresh tokens stored in httpOnly cookies
- PKCE flow для OAuth
- Rate limiting на auth endpoints

---

### 🔒 Row Level Security (RLS)

Все таблицы защищены RLS политиками:

#### Games Table

```sql
-- Users can only view their own games
CREATE POLICY "Users can view own games"
ON games FOR SELECT
USING (auth.uid() = created_by);

-- Users can only insert games they create
CREATE POLICY "Users can insert own games"
ON games FOR INSERT
WITH CHECK (auth.uid() = created_by);

-- Users can only update their own games
CREATE POLICY "Users can update own games"
ON games FOR UPDATE
USING (auth.uid() = created_by);

-- Users can only delete their own games
CREATE POLICY "Users can delete own games"
ON games FOR DELETE
USING (auth.uid() = created_by);
```

#### Player Profiles

```sql
-- Everyone can view profiles (public)
CREATE POLICY "Public profiles are viewable"
ON player_profiles FOR SELECT
TO authenticated
USING (true);

-- Users can only update their own profile
CREATE POLICY "Users can update own profile"
ON player_profiles FOR UPDATE
USING (auth.uid() = user_id);
```

---

### 🛡️ Session Management

**Best practices:**

1. **Session storage:**
```typescript
// ✅ Хорошо: httpOnly cookies (не доступны для JavaScript)
const supabase = createBrowserClient()  // Автоматически использует cookies

// ❌ Плохо: localStorage для токенов
localStorage.setItem('token', accessToken)  // Уязвимо к XSS
```

2. **Session expiration:**
```typescript
// Токены истекают через 1 час
// Refresh token автоматически обновляет access token
const { data: { session } } = await supabase.auth.getSession()

if (!session) {
  // Redirect to login
}
```

3. **Logout везде:**
```typescript
async function signOut() {
  const supabase = createBrowserClient()

  // Удаляет все сессии на всех устройствах
  await supabase.auth.signOut({ scope: 'global' })
}
```

---

### 🚫 Authorization Middleware

**Файл:** `middleware.ts`

```typescript
import { createMiddlewareClient } from '@/lib/supabase/middleware'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  const { supabase, response } = createMiddlewareClient(request)

  // Проверяем сессию
  const { data: { session } } = await supabase.auth.getSession()

  // Защищенные роуты
  const protectedPaths = ['/profile', '/game', '/history']
  const isProtected = protectedPaths.some(path =>
    request.nextUrl.pathname.startsWith(path)
  )

  if (isProtected && !session) {
    // Redirect to login
    return NextResponse.redirect(new URL('/auth', request.url))
  }

  return response
}

export const config = {
  matcher: [
    '/profile/:path*',
    '/game/:path*',
    '/history/:path*'
  ]
}
```

---

## Data Protection

### 🔐 Encryption

**At rest:**
- PostgreSQL data encrypted at rest (Supabase default)
- Backups encrypted

**In transit:**
- HTTPS only (TLS 1.3)
- Certificates auto-renewed (Let's Encrypt)

---

### 🗑️ Data Deletion

**GDPR compliance:**

```typescript
// Полное удаление пользователя и его данных
async function deleteUserData(userId: string) {
  const supabase = createBrowserClient()

  // 1. Удалить все игры
  await supabase
    .from('games')
    .delete()
    .eq('created_by', userId)

  // 2. Удалить профиль
  await supabase
    .from('player_profiles')
    .delete()
    .eq('user_id', userId)

  // 3. Удалить auth аккаунт
  await supabase.auth.admin.deleteUser(userId)
}
```

---

### 📝 Audit Logging

Все критичные действия логируются:

```sql
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id),
  action TEXT NOT NULL,
  resource TEXT NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  ip_address TEXT,
  user_agent TEXT
);

-- Example
INSERT INTO audit_log (user_id, action, resource)
VALUES (auth.uid(), 'DELETE', 'game:123');
```

---

## API Security

### 🔑 API Keys

**НИКОГДА не экспонируйте секретные ключи:**

```typescript
// ✅ Хорошо: Используйте только на сервере
// lib/supabase/server.ts
const supabase = createServerClient()
await supabase.auth.admin.createUser(...)  // Service role key

// ❌ Плохо: В Client Components
'use client'
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY  // ⚠️ Утечет в браузер!
```

**Environment variables:**

```env
# ✅ Публичные (NEXT_PUBLIC_ префикс)
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbG...

# ✅ Приватные (только на сервере)
SUPABASE_SERVICE_ROLE_KEY=eyJhbG...  # НЕ используйте NEXT_PUBLIC_!
```

---

### 🛡️ Rate Limiting

**Supabase built-in:**
- Auth endpoints: 30 requests/hour per IP
- Database: Fair use policy

**Custom rate limiting (будущее):**

```typescript
// middleware.ts
import rateLimit from '@/lib/rate-limit'

const limiter = rateLimit({
  interval: 60 * 1000,  // 1 minute
  uniqueTokenPerInterval: 500
})

export async function middleware(request: NextRequest) {
  try {
    await limiter.check(request, 10)  // 10 requests per minute
  } catch {
    return new NextResponse('Too Many Requests', { status: 429 })
  }

  // Continue...
}
```

---

### 🚫 Input Validation

**Всегда валидируйте пользовательский ввод:**

```typescript
import { z } from 'zod'

// Схема валидации
const gameSchema = z.object({
  players: z.array(z.object({
    name: z.string().min(1).max(50),
    avatar: z.string().emoji().or(z.string().url())
  })).min(2).max(8)
})

// Валидация
function createGame(input: unknown) {
  // Throws error если invalid
  const validated = gameSchema.parse(input)

  // Безопасно использовать
  return validated
}
```

---

### 🧹 SQL Injection Prevention

**Supabase автоматически защищает от SQL injection:**

```typescript
// ✅ Безопасно: Parameterized query
await supabase
  .from('games')
  .select('*')
  .eq('id', userInput)  // Автоматически экранируется

// ❌ НЕ используйте raw SQL с пользовательским вводом
await supabase.rpc('raw_query', {
  query: `SELECT * FROM games WHERE id = '${userInput}'`  // ⚠️ SQL injection!
})
```

---

## Frontend Security

### 🛡️ XSS Protection

**React автоматически экранирует контент:**

```typescript
// ✅ Безопасно: React escapes HTML
<div>{userInput}</div>

// ❌ Опасно: dangerouslySetInnerHTML
<div dangerouslySetInnerHTML={{ __html: userInput }} />  // ⚠️ XSS risk!
```

**Используйте DOMPurify для HTML:**

```typescript
import DOMPurify from 'dompurify'

const sanitized = DOMPurify.sanitize(userInput)
<div dangerouslySetInnerHTML={{ __html: sanitized }} />  // ✅ Safe
```

---

### 🔒 Content Security Policy (CSP)

**Файл:** `next.config.js`

```javascript
const securityHeaders = [
  {
    key: 'Content-Security-Policy',
    value: `
      default-src 'self';
      script-src 'self' 'unsafe-eval' 'unsafe-inline';
      style-src 'self' 'unsafe-inline';
      img-src 'self' data: https:;
      font-src 'self';
      connect-src 'self' https://*.supabase.co;
      frame-ancestors 'none';
    `.replace(/\s{2,}/g, ' ').trim()
  },
  {
    key: 'X-Frame-Options',
    value: 'DENY'
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff'
  },
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin'
  },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=()'
  }
]

module.exports = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders
      }
    ]
  }
}
```

---

### 🚫 CSRF Protection

**Next.js автоматически защищает Server Actions:**

```typescript
// Server Action (защищен CSRF token)
'use server'

export async function deleteGame(gameId: string) {
  // Next.js проверяет CSRF token автоматически
  const supabase = createServerClient()
  await supabase.from('games').delete().eq('id', gameId)
}
```

---

### 🔐 Secure Cookies

```typescript
// Supabase SSR автоматически использует secure cookies
const supabase = createServerClient(cookieStore, {
  cookies: {
    set(name, value, options) {
      cookieStore.set({
        name,
        value,
        ...options,
        httpOnly: true,    // ✅ Не доступны для JavaScript
        secure: true,      // ✅ Только HTTPS
        sameSite: 'lax'    // ✅ CSRF защита
      })
    }
  }
})
```

---

## Environment Variables

### ⚠️ НИКОГДА не коммитьте секреты!

```bash
# .gitignore
.env
.env.local
.env.*.local
```

### ✅ Используйте правильные префиксы

```env
# ✅ Публичные (доступны в браузере)
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
NEXT_PUBLIC_APP_URL=...

# ✅ Приватные (только на сервере)
SUPABASE_SERVICE_ROLE_KEY=...  # БЕЗ NEXT_PUBLIC_!
DATABASE_URL=...
API_SECRET=...
```

### 🔄 Ротация ключей

**Меняйте ключи регулярно:**

1. Создайте новый ключ в Supabase
2. Обновите environment variables
3. Redeploy приложение
4. Удалите старый ключ через 24 часа

---

## OWASP Top 10

### ✅ Защита от OWASP Top 10 (2021)

| # | Vulnerability | Защита |
|---|---------------|--------|
| 1 | **Broken Access Control** | ✅ RLS policies, middleware auth |
| 2 | **Cryptographic Failures** | ✅ HTTPS, encrypted DB |
| 3 | **Injection** | ✅ Parameterized queries |
| 4 | **Insecure Design** | ✅ Security by default |
| 5 | **Security Misconfiguration** | ✅ CSP headers, secure defaults |
| 6 | **Vulnerable Components** | ✅ npm audit, dependabot |
| 7 | **Authentication Failures** | ✅ Supabase Auth, JWT |
| 8 | **Data Integrity Failures** | ✅ Input validation |
| 9 | **Logging Failures** | ✅ Audit logs |
| 10 | **SSRF** | ✅ Input validation, allowlists |

---

## Security Checklist

### 📋 Development

- [ ] Используйте `.env.local` для локальной разработки
- [ ] НЕ коммитьте `.env` файлы
- [ ] Запускайте `npm audit` регулярно
- [ ] Обновляйте зависимости (dependabot)
- [ ] Валидируйте все пользовательские inputs
- [ ] Используйте TypeScript strict mode
- [ ] Code review для security-критичного кода

### 📋 Pre-deployment

- [ ] Все environment variables заданы в Vercel
- [ ] Service role key не используется на клиенте
- [ ] RLS политики настроены и протестированы
- [ ] Security headers настроены (CSP, X-Frame-Options)
- [ ] HTTPS enforced
- [ ] Rate limiting настроен
- [ ] Audit logging включен

### 📋 Production

- [ ] Мониторинг ошибок (Sentry)
- [ ] Логирование security events
- [ ] Регулярные backups БД
- [ ] Incident response plan документирован
- [ ] Ротация ключей каждые 90 дней
- [ ] Security audits ежеквартально

---

## Security Best Practices

### 🔐 Passwords

Если используете email/password auth:

```typescript
// Требования к паролю
const passwordSchema = z.string()
  .min(8, 'Минимум 8 символов')
  .regex(/[A-Z]/, 'Минимум 1 заглавная буква')
  .regex(/[a-z]/, 'Минимум 1 строчная буква')
  .regex(/[0-9]/, 'Минимум 1 цифра')
  .regex(/[^A-Za-z0-9]/, 'Минимум 1 спецсимвол')
```

### 🔒 2FA (Future)

Для повышенной безопасности:

```typescript
// Enable TOTP
await supabase.auth.mfa.enroll({
  factorType: 'totp'
})
```

### 🛡️ Dependency Security

```bash
# Проверка уязвимостей
npm audit

# Автоматический fix
npm audit fix

# Обновление зависимостей
npm update

# Используйте dependabot (GitHub)
```

---

## Incident Response

### 🚨 Security Incident

**Если обнаружена уязвимость:**

1. **Не паникуйте** - оцените серьезность
2. **Изолируйте** - отключите затронутый функционал
3. **Исправьте** - deploy hotfix
4. **Уведомите** - пользователей если необходимо
5. **Документируйте** - post-mortem

### 📊 Severity Levels

| Level | Описание | Response Time |
|-------|----------|---------------|
| **Critical** | RCE, data breach | < 1 hour |
| **High** | Auth bypass, SQL injection | < 4 hours |
| **Medium** | XSS, CSRF | < 24 hours |
| **Low** | Info disclosure | < 1 week |

---

## Reporting Vulnerabilities

### 📧 Responsible Disclosure

Если вы нашли уязвимость:

1. **НЕ создавайте публичный issue**
2. Отправьте email: security@killerpool.app (или создайте private security advisory на GitHub)
3. Опишите:
   - Тип уязвимости
   - Шаги для воспроизведения
   - Потенциальный impact
   - Предложенный fix (опционально)

**Мы обязуемся:**
- Ответить в течение 48 часов
- Исправить critical уязвимости в течение 7 дней
- Упомянуть вас в credits (с вашего согласия)

---

## Security Resources

### 📚 Полезные ссылки

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Supabase Security](https://supabase.com/docs/guides/platform/security)
- [Next.js Security](https://nextjs.org/docs/advanced-features/security-headers)
- [Content Security Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP)
- [NIST Cybersecurity Framework](https://www.nist.gov/cyberframework)

### 🛠️ Security Tools

- **npm audit** - Dependency vulnerabilities
- **Snyk** - Real-time monitoring
- **OWASP ZAP** - Penetration testing
- **Burp Suite** - Web security testing
- **SSL Labs** - SSL/TLS testing

---

## Compliance

### 🌍 GDPR

Killerpool соответствует GDPR:

- ✅ Data minimization
- ✅ Right to access (export data)
- ✅ Right to deletion (delete account)
- ✅ Data encryption
- ✅ Privacy by design

### 🇺🇸 CCPA

California Consumer Privacy Act:

- ✅ Data disclosure
- ✅ Opt-out of data sale (мы не продаем данные)
- ✅ Right to delete

---

**Документ обновлен:** 16 ноября 2025

**Последний security audit:** Не проводился (запланирован на Q1 2026)
