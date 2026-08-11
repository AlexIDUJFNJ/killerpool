# 🔐 Security - Killerpool

Руководство по безопасности Killerpool. Документ описывает **реальное** состояние кода и базы данных, включая осознанные компромиссы. Планируемые, но не реализованные меры вынесены в отдельный раздел [Planned / Not Implemented](#planned--not-implemented).

## 📋 Содержание

- [Обзор безопасности](#обзор-безопасности)
- [Модель безопасности](#модель-безопасности)
- [Authentication & Authorization](#authentication--authorization)
- [Route Protection](#route-protection)
- [Row Level Security (RLS)](#row-level-security-rls)
- [Realtime & Spectator Mode](#realtime--spectator-mode)
- [Security Headers](#security-headers)
- [Environment Variables](#environment-variables)
- [Frontend Security](#frontend-security)
- [Planned / Not Implemented](#planned--not-implemented)
- [Security Checklist](#security-checklist)
- [Incident Response](#incident-response)
- [Reporting Vulnerabilities](#reporting-vulnerabilities)

---

## Обзор безопасности

Что реально включено:

- ✅ HTTPS enforced (Vercel)
- ✅ Row Level Security (RLS) на всех таблицах Supabase
- ✅ Auth через Supabase (Google OAuth PKCE + Magic Link), сессии в cookies через `@supabase/ssr`
- ✅ Секреты только в environment variables, `.env*` в `.gitignore`
- ✅ Базовые security headers в `vercel.json` (3 штуки, см. [Security Headers](#security-headers))
- ✅ Запись ачивок только через `SECURITY DEFINER` RPC — клиент не может выдать себе ачивку напрямую

Чего **нет** (см. [Planned / Not Implemented](#planned--not-implemented)):

- ❌ Content Security Policy (CSP)
- ❌ Собственный rate limiting (только встроенные лимиты Supabase Auth)
- ❌ Audit logging
- ❌ Схемная валидация входных данных (zod и т.п.)

---

## Модель безопасности

Killerpool — client-heavy приложение:

- **Серверного API нет.** Директория `app/api` не существует. Единственный route handler — `app/auth/callback/route.ts` (OAuth callback). Все операции с данными идут через Supabase JS-клиент с публичным anon key, а авторизация обеспечивается RLS-политиками PostgreSQL.
- **Состояние игры живёт на клиенте** — в localStorage (`killerpool_current_game`, `killerpool_game_history`, `killerpool_pending_sync`, `killerpool_guest_id` и др., см. `lib/storage.ts`). В Supabase попадают только завершённые игры (`autoSyncGame` в `lib/sync.ts`) и игры с включённым live sharing (`syncActiveGameToSupabase`).
- **Следствие:** периметр безопасности — это RLS-политики Supabase плюс auth. Клиентский код по определению недоверенный; любые данные, которые он может записать, ограничиваются только политиками из раздела [RLS](#row-level-security-rls).

---

## Authentication & Authorization

### 🔐 Supabase Auth

Поддерживаемые методы (`app/auth/page.tsx`):

- ✅ **Google OAuth** — `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: ${window.location.origin}/auth/callback } })`; PKCE flow обеспечивается `@supabase/ssr`
- ✅ **Magic Link** — `supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: ... } })`
- ✅ **Guest mode** — кнопка «Continue as Guest» просто уводит на `/`. Auth-записи нет: гость работает под ролью `anon`, а его стабильный UUID хранится в localStorage под ключом `killerpool_guest_id` (`lib/storage.ts`)

Email/password auth **не реализован**.

**OAuth callback** (`app/auth/callback/route.ts`):

```typescript
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

Redirect всегда на `/` — параметр `next`/`redirect_to` из query не читается, поэтому open redirect через callback невозможен.

### 🛡️ Session Management

Сессии управляются `@supabase/ssr`:

- `lib/supabase/client.ts` — `createBrowserClient()` для Client Components
- `lib/supabase/server.ts` — `createServerClient()` с cookie-адаптером поверх `next/headers` для Server Components и Route Handlers
- `lib/supabase/middleware.ts` — `updateSession(request)` обновляет (refresh) сессию на каждый запрос через proxy

Токены хранятся в cookies и автоматически обновляются. JWT имеет ограниченный срок жизни, refresh происходит прозрачно.

---

## Route Protection

В Next.js 16 вместо `middleware.ts` используется **`proxy.ts`** (конвенция Next 16). Его единственная задача — вызвать `updateSession()`:

```typescript
export async function proxy(request: NextRequest) {
  return await updateSession(request)
}
```

Внутри `updateSession` (`lib/supabase/middleware.ts`) защита роутов выглядит так — **защищён только `/profile`**:

```typescript
// Protected routes - require authentication
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

**Честное следствие:** `/game`, `/history` и остальные страницы доступны без авторизации — это осознанно, потому что игра работает в guest mode и состояние живёт в localStorage. Защищать там нечего: доступ к данным в Supabase ограничивается RLS, а не роутингом. Ещё нюанс: если env-переменные Supabase не заданы, `updateSession` пропускает запрос без auth-проверки (fail-open) — при этом клиент Supabase всё равно не создастся, так что деградация только для redirect-логики.

---

## Row Level Security (RLS)

RLS включён на всех таблицах (`00001_initial_schema.sql`). Ниже — **финальное** состояние политик после всех миграций (00001–00014). История правок: 00006 открыл публичное чтение игр, 00008 добавил политики live sharing, 00009 снёс все политики `games` и пересоздал начисто, 00011 ужесточил `user_achievements`, 00014 ужесточил запись в `games`.

### Games (00009 + ужесточение в `00014_tighten_game_write_policies.sql`)

```sql
-- SELECT: Anyone can view any game (required for spectator mode)
CREATE POLICY "games_select_all"
    ON games FOR SELECT
    TO anon, authenticated
    USING (true);

-- INSERT: Authenticated users can create games
CREATE POLICY "games_insert_authenticated"
    ON games FOR INSERT
    TO authenticated
    WITH CHECK (created_by = auth.uid());

-- INSERT: Anonymous users can create games (must have created_by = NULL)
CREATE POLICY "games_insert_anon"
    ON games FOR INSERT
    TO anon
    WITH CHECK (created_by IS NULL);

-- UPDATE: Authenticated users can update only their own games (00014)
CREATE POLICY "games_update_authenticated"
    ON games FOR UPDATE
    TO authenticated
    USING (created_by = auth.uid())
    WITH CHECK (created_by = auth.uid());

-- UPDATE: Anonymous users can update unowned games; completed ones freeze
-- one hour after the last write (00014)
CREATE POLICY "games_update_anon"
    ON games FOR UPDATE
    TO anon
    USING (created_by IS NULL
           AND (status <> 'completed' OR updated_at > now() - interval '1 hour'))
    WITH CHECK (created_by IS NULL);

-- DELETE: Authenticated users can delete their own games
CREATE POLICY "games_delete_authenticated"
    ON games FOR DELETE
    TO authenticated
    USING (created_by = auth.uid());
```

**Честные следствия этой модели:**

- **Любая игра читается кем угодно** (включая роль `anon`) — это фича spectator mode: зритель по ссылке с UUID игры видит её состояние. Обратная сторона: UUID игры — единственный «секрет». Перебор UUID v4 практически невозможен, но кто получил ссылку — видит всё содержимое игры (имена игроков, историю ходов). **Не кладите чувствительные данные в имена игроков.**
- **Идущую гостевую игру (`created_by IS NULL`) может изменить любой, кто знает её ID.** Хост и зритель на уровне БД неразличимы: у обоих есть ровно ссылка, поэтому никакое условие над строкой их не разделит — для этого нужен секрет хоста. Пока партия идёт, чужая правка самозалечивается: хост при каждом ходе перезаписывает полное состояние. После завершения игра перестаёт принимать записи через час (миграция 00014), чтобы старая ссылка не оставалась правом записи навсегда.
- **Авторизованный пишет только свои игры** (миграция 00014): `WITH CHECK (created_by = auth.uid())` на INSERT и UPDATE, `USING` без `OR created_by IS NULL`. До 00014 любой залогиненный мог присвоить себе чужую гостевую игру одним запросом — и настоящий хост, будучи `anon`, терял доступ к ней навсегда. Побочное следствие: игру, сыгранную до регистрации, аккаунт присвоить уже не может (в строке нет ничего, что доказывало бы владельца), поэтому `/sync` показывает такие игры отдельной строкой «нельзя загрузить», а не ошибкой.
- **Удалять игры может только владелец** (`created_by = auth.uid()`). Гостевые игры через клиент не удаляются вообще (DELETE-политики для `anon` нет).

### Player Profiles & Rulesets (миграция `00001_initial_schema.sql`)

```sql
-- Профили читаются всеми
CREATE POLICY "Public profiles are viewable by everyone"
    ON player_profiles FOR SELECT
    USING (true);

-- Вставка своего профиля (или анонимного)
CREATE POLICY "Users can insert their own profile"
    ON player_profiles FOR INSERT
    WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

-- Update/Delete — только своего профиля
CREATE POLICY "Users can update their own profile"
    ON player_profiles FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own profile"
    ON player_profiles FOR DELETE
    USING (auth.uid() = user_id);
```

Rulesets: `SELECT` для всех (`USING (true)`), `INSERT` — только `authenticated` (`WITH CHECK (true)`). UPDATE/DELETE-политик нет — переписать сид-рулсет через клиент нельзя.

### User Achievements (00007 + ужесточение в `00011_fix_achievements_and_defaults.sql`)

Финальное состояние:

- **SELECT** — единственная политика `"Users can view all achievements"` (`USING (true)`): ачивки публичны (нужны для профилей и лидерборда).
- **INSERT-политик нет.** Миграция 00011 удалила политику `"Service role can insert achievements"`, которая на самом деле позволяла любому авторизованному пользователю вставлять себе произвольные ачивки (`WITH CHECK auth.uid() = user_id`) — это был чит-вектор. Теперь запись возможна **только** через RPC `check_achievements(p_user_id UUID, p_game_id UUID)` — функция `SECURITY DEFINER` (обходит RLS). 00011 также отзывает дефолтный `EXECUTE` у `PUBLIC`/`anon` (в Postgres он выдаётся автоматически при создании функции — 00007 этого не делала) и оставляет его только `authenticated`/`service_role`. Внутри функция требует `p_user_id = auth.uid()` — начислить ачивки чужому пользователю нельзя, — затем проверяет, что победивший участник игры принадлежит вызывающему, и начисляет только заслуженные типы.
- Клиент вызывает её через `checkAchievements(userId, gameId)` (`lib/achievements.ts`) после завершения игры.

**Остаточный риск:** `check_achievements` доверяет полю `participants[].userId` в JSONB, которое пишет клиент. Пользователь, вручную записавший выигранную игру с собственным `userId` у победителя, получит ачивку. Это принято как допустимый риск для игры без ставок.

### Leaderboard

`get_leaderboard(limit_count INTEGER DEFAULT 15, min_games INTEGER DEFAULT 3)` — `SECURITY DEFINER` RPC, `GRANT EXECUTE ... TO authenticated, anon` (актуальная версия — миграция `00013`). Считает только `completed`-игры. Лидерборд публичный по дизайну.

Функция вызывается ролью `anon` и читает колонку, которую пишет та же роль, поэтому в ней два отдельных класса защиты:

- **Доступность.** Ни одно значение из клиентского JSON не кастуется. До миграции `00012` функция делала `(participant->>'userId')::uuid`, и одной игры с нечисловым id хватало, чтобы вызов падал с `22P02` **для всех** — лидерборд ложился целиком, а стоило это одного анонимного INSERT. Теперь сравнения идут по тексту, единственный `::uuid` защищён regex-гардом, а `limit_count` зажат в диапазон (NULL означал бы «без лимита»).
- **Достоверность — не закрыта.** `anon` по-прежнему может вставить выдуманную завершённую игру с любыми `participants[].userId` и накрутить себе статистику. Ужесточение RLS этого не лечит: строка создаётся легально. Лечение принадлежит самой функции (например, доверять только играм с непустой `history` или известным `created_by`) и не сделано.

---

## Realtime & Spectator Mode

- Таблица `games` добавлена в публикацию `supabase_realtime` (миграция 00009).
- Зрители подписываются на `postgres_changes` (event `UPDATE`, `filter: id=eq.{gameId}`) в канале `game:{gameId}` — см. `subscribeToGame` в `lib/realtime.ts`.
- Хост при каждом действии upsert'ит полную строку игры (`syncActiveGameToSupabase` в `lib/sync.ts`). Broadcast-каналов и presence нет — единственный источник правды для зрителя это строка в таблице `games`.
- Поскольку `games_select_all` разрешает чтение роли `anon`, realtime-подписка работает и для неавторизованных зрителей. Это намеренно.

---

## Security Headers

Заголовки задаются **только в `vercel.json`** — `next.config.js` функции `headers()` **не содержит**. Реальный конфиг целиком:

```json
"headers": [
  {
    "source": "/(.*)",
    "headers": [
      { "key": "X-Content-Type-Options", "value": "nosniff" },
      { "key": "X-Frame-Options", "value": "DENY" },
      { "key": "X-XSS-Protection", "value": "1; mode=block" }
    ]
  }
]
```

Это всё: три заголовка. **Content-Security-Policy не настроен** — см. [Planned / Not Implemented](#planned--not-implemented). `Referrer-Policy` и `Permissions-Policy` также не заданы. HTTPS форсируется платформой Vercel.

---

## Environment Variables

Реальный список (`.env.local.example`):

```env
# Публичные (доступны в браузере)
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_SENTRY_DSN=                     # необязательно

# Только на этапе сборки, в бандл не попадает
SENTRY_AUTH_TOKEN=                          # загрузка карт исходников
```

- `anon key` публичен по дизайну — вся защита данных лежит на RLS.
- **Service-role ключа в проекте нет и не должно быть.** Приложение целиком клиентское: серверных операций с Supabase не существует, ни одна строка кода не читает `SUPABASE_SERVICE_ROLE_KEY`. Ключ, обходящий RLS, убран даже из `.env.local.example` — чтобы никто не завёл его «на всякий случай» и не вынес потом под префиксом `NEXT_PUBLIC_`.
- `NEXT_PUBLIC_SENTRY_DSN` публичен по дизайну (DSN и рассчитан на браузер: он позволяет слать события, но не читать их). `SENTRY_AUTH_TOKEN` — настоящий секрет, используется только сборкой; в Vercel он заведён как **Sensitive**, поэтому не читается обратно ни через UI, ни через `vercel env pull`.
- `.env`, `.env.local`, `.env.*.local` — в `.gitignore`. Никогда не коммитьте секреты.

**Ротация ключей:** создайте новый ключ в Supabase → обновите env в Vercel → redeploy → отзовите старый ключ.

**Что уезжает в Sentry.** Ошибки прода содержат стек, URL и user agent. Трассировка выключена (`tracesSampleRate: 0`), `sendDefaultPii` не включается, тела запросов и содержимое localStorage не отправляются. Имена игроков могут попасть в сообщение об ошибке, если окажутся в её тексте — отдельной фильтрации для этого нет.

---

## Frontend Security

### XSS

- React экранирует контент по умолчанию; `dangerouslySetInnerHTML` в кодовой базе **не используется**.
- Пользовательский ввод (имена игроков, email) рендерится только через JSX-интерполяцию.

### CSRF

- Server Actions и собственных мутирующих API-эндпоинтов нет — CSRF-поверхность классического вида отсутствует. Мутации идут в Supabase c JWT из cookie-сессии, управляемой `@supabase/ssr`.

### SQL Injection

- Все запросы — через query builder Supabase (`.from('games').select().eq(...)`) с параметризацией. Raw SQL с пользовательским вводом в клиентском коде нет. В RPC-функциях клиентский JSONB защищён от каст-исключений по-разному: `check_achievements` (00011) сравнивает id как `text = text` и гейтит все `::INTEGER`-касты числовым regex; `get_leaderboard` после миграции `00012` не кастует клиентский JSON вообще (сравнения по тексту, единственный `::uuid` под regex-гардом) — до неё не-UUID id участника ронял вызов для всех.

### PWA / Service Worker

- `next.config.js` настраивает `@ducanh2912/next-pwa`: ответы Supabase API кэшируются стратегией `NetworkFirst` до 24 часов (`cacheName: 'supabase-api'`). На общих устройствах данные игр могут оставаться в Cache Storage браузера после выхода из аккаунта — учитывайте при работе на чужих устройствах.

---

## Planned / Not Implemented

> Всё в этом разделе — **рекомендации и планы**. В коде этого нет.

### Content Security Policy (CSP)

CSP сейчас отсутствует. Рекомендуемая стартовая конфигурация — добавить в `vercel.json` (или в `headers()` в `next.config.js`):

```
Content-Security-Policy:
  default-src 'self';
  script-src 'self' 'unsafe-eval' 'unsafe-inline';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: https:;
  font-src 'self' https://fonts.gstatic.com;
  connect-src 'self' https://*.supabase.co wss://*.supabase.co;
  frame-ancestors 'none';
```

Примечания: `connect-src` должен включать `wss://*.supabase.co` для realtime-подписок; `font-src` — Google Fonts (кэшируются service worker'ом). Вводить лучше через `Content-Security-Policy-Report-Only`.

### Дополнительные headers

`Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`.

### Rate limiting

Сейчас — только встроенные лимиты Supabase Auth. Кастомный rate limiting (например, на upsert игр в `proxy.ts` или через Vercel WAF) не реализован.

### Audit logging

Таблицы `audit_log` нет. При росте проекта стоит логировать удаление игр и начисление ачивок.

### Input validation

Схемной валидации (zod) нет — ограничения задаются только CHECK-констрейнтами БД (`display_name_length`, `valid_participants`, `valid_history`, `valid_params` в 00001). Валидация формы игры на клиенте — рекомендация.

### Прочее

- **2FA (TOTP)** через `supabase.auth.mfa` — не включено.
- **Удаление аккаунта / экспорт данных (GDPR-тулинг)** — UI-флоу не реализован; удаление возможно только вручную через Supabase.
- **Секрет хоста для расшаренной игры**: отдельная таблица с хешем секрета и узкий SECURITY DEFINER RPC для записи — единственный способ отличить хоста от зрителя, пока партия идёт. Пока не сделано.
- **Защита лидерборда от подделки**: `anon` по-прежнему может вставить выдуманную завершённую игру с любым `participants[].userId`. Лечится в `get_leaderboard` (засчитывать `userId` только если он совпадает с `created_by`), а не в RLS. Квалификационный минимум из `00013` поднимает цену накрутки (нужно минимум три игры), но не закрывает её.
- **Дефейс внутри окна заморозки**: пока не прошёл час, вандал может вернуть завершённую гостевую игру в `active` и тем самым продлить себе право записи. Закрывается колонкой `completed_at`, которую запись не может стереть.

---

## Security Checklist

### 📋 Development

- [x] `.env.local` для локальной разработки, `.env*` в `.gitignore`
- [x] TypeScript strict mode
- [ ] `npm audit` регулярно
- [ ] Обновление зависимостей (dependabot)

### 📋 Pre-deployment

- [x] Environment variables заданы в Vercel
- [x] Service role key не используется на клиенте (не используется вообще)
- [x] RLS-политики настроены (миграции 00001–00014), проверены под ролями (`supabase/test/rls-policies.sql`)
- [x] Базовые security headers (`vercel.json`)
- [x] HTTPS enforced (Vercel)
- [ ] CSP настроен
- [ ] Rate limiting настроен

### 📋 Production

- [x] Мониторинг ошибок (Sentry: браузер, сервер, edge; только production)
- [ ] Регулярные backups БД (Supabase-managed)
- [ ] Ротация ключей каждые 90 дней
- [ ] Периодические security audits

---

## Incident Response

### 🚨 Security Incident

**Если обнаружена уязвимость:**

1. **Не паникуйте** — оцените серьезность
2. **Изолируйте** — отключите затронутый функционал
3. **Исправьте** — deploy hotfix
4. **Уведомите** — пользователей если необходимо
5. **Документируйте** — post-mortem

### 📊 Severity Levels

| Level | Описание | Response Time |
|-------|----------|---------------|
| **Critical** | RCE, data breach, обход RLS | < 1 hour |
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
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Next.js Security Headers](https://nextjs.org/docs/app/api-reference/config/next-config-js/headers)
- [Content Security Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP)

### 🛠️ Security Tools

- **npm audit** — Dependency vulnerabilities
- **Snyk** — Real-time monitoring
- **OWASP ZAP** — Penetration testing
- **SSL Labs** — SSL/TLS testing

---

**Документ обновлен:** 2026-08-11

**Последний security audit:** Не проводился
