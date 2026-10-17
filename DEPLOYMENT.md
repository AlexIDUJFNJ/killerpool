# 🚀 Deployment Guide - Killerpool

> Обновлено: 2026-10-16.

Деплой Killerpool на Vercel — проект живёт там (`.vercel/project.json`,
`vercel.json` с регионом `fra1`), а деплой запускается push'ем в GitHub.

Путь коммита длиннее, чем кажется: `origin` указывает не на GitHub, а на зеркало
Entire (`entire://…/gh/AlexIDUJFNJ/killerpool`), которое форвардит push в GitHub;
оттуда уже деплоит Vercel. Прямой `git push origin main` зеркало отклоняет
(«protected branch»), даже когда на самом GitHub никаких branch protection нет —
это правило зеркала. Штатный путь в прод: работать в `dev`, затем
`gh pr create --base main --head dev` и `gh pr merge --merge`. Именно `--merge`,
а не `--rebase`: rebase перепишет хеши, на которые ссылаются чекпоинты Entire.
Запасной remote `github` существует, но обходить им защиту не нужно.

Если клиент в `dev` опирается на новую миграцию, merge в `main` — последний
шаг: сначала миграция в базу и её проверки (см. [Supabase CLI](#supabase-cli)).
Push в `main` деплоит только клиент, базу он не трогает.

Инструкции для Netlify, Docker и self-hosted убраны намеренно: они были
generic-бойлерплейтом, который никто не проверял, и Dockerfile в них копировал
`.next/standalone`, хотя `output: 'standalone'` в `next.config.js` не включён —
то есть заведомо не работал.

Одно требование стоит держать в голове при любом способе сборки: production
build обязан идти через webpack (`next build --webpack`, уже прописано в
`npm run build`). `@ducanh2912/next-pwa` генерирует service worker webpack-хуком,
и сборка Turbopack молча выпустит приложение без `sw.js`.

## 📋 Содержание

- [Vercel (рекомендуется)](#vercel-рекомендуется)
- [Environment Variables](#environment-variables)
- [Supabase CLI](#supabase-cli)
- [Post-deployment проверки](#post-deployment-проверки)

---

## Vercel (рекомендуется)

Vercel — оптимальная платформа для Next.js приложений с автоматическим CI/CD.

### Предварительные требования

- ✅ Аккаунт на [vercel.com](https://vercel.com)
- ✅ GitHub репозиторий проекта
- ✅ Настроенный Supabase проект
- ✅ Домен (опционально, Vercel предоставляет бесплатный)

### Шаг 1: Подключение репозитория

1. Войдите в [Vercel Dashboard](https://vercel.com/dashboard)
2. Нажмите **"Add New Project"**
3. Выберите **"Import Git Repository"**
4. Авторизуйте доступ к GitHub
5. Выберите репозиторий `killerpool`
6. Нажмите **"Import"**

### Шаг 2: Настройка проекта

Vercel автоматически определит Next.js. Проверьте настройки:

```
Framework Preset: Next.js
Build Command: npm run build
Output Directory: .next
Install Command: npm install
```

**Root Directory:** оставьте пустым (если проект в корне репозитория)

### Шаг 3: Environment Variables

Добавьте переменные окружения:

1. В разделе **"Environment Variables"** добавьте:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here

# App URL — только для Production (см. ниже); до подключения своего домена
# можно не задавать или указать https://<project>.vercel.app
NEXT_PUBLIC_APP_URL=https://killerpool.app

# Sentry (необязательно)
NEXT_PUBLIC_SENTRY_DSN=https://<key>@<org>.ingest.de.sentry.io/<project>
SENTRY_AUTH_TOKEN=<token>   # только для сборки, карты исходников
```

2. Выберите для каких окружений применить:
   - Supabase и Sentry — ✅ **Production**, ✅ **Preview**, ✅ **Development**
   - `NEXT_PUBLIC_APP_URL` — **только Production**. Превью без неё берут собственный домен из `NEXT_PUBLIC_VERCEL_URL` (`lib/site.ts`); продовый URL в превью направил бы `robots.txt` на продовый sitemap, а метаданные — на продовое приложение

3. Оставьте включённым **Automatically expose System Environment Variables** (Settings → Environment Variables). Без него сборка не видит `NEXT_PUBLIC_VERCEL_URL` и `NEXT_PUBLIC_VERCEL_ENV`: первый нужен `lib/site.ts`, второй — гейту Sentry в браузере

### Шаг 4: Deploy

1. Нажмите **"Deploy"**
2. Дождитесь завершения билда (обычно 1-3 минуты)
3. После успешного деплоя получите URL: `https://killerpool.vercel.app`

### Шаг 5: Custom Domain (опционально)

#### Если у вас уже есть домен:

1. Перейдите в **Settings** → **Domains**
2. Нажмите **"Add"**
3. Введите ваш домен: `killerpool.app`
4. Следуйте инструкциям по настройке DNS:

**Вариант A: Nameservers (рекомендуется)**
```
ns1.vercel-dns.com
ns2.vercel-dns.com
```

**Вариант B: A Record**
```
Type: A
Name: @
Value: 76.76.21.21
```

**CNAME для www:**
```
Type: CNAME
Name: www
Value: cname.vercel-dns.com
```

5. Дождитесь проверки DNS (может занять до 48 часов, обычно 5-10 минут)
6. SSL сертификат будет автоматически выпущен

#### Обновите environment variables:

После настройки домена обновите `NEXT_PUBLIC_APP_URL`:

```bash
NEXT_PUBLIC_APP_URL=https://killerpool.app
```

Затем сделайте redeploy:
- **Deployments** → последний деплой → **"Redeploy"**

### Шаг 6: Настройка Supabase Redirect URLs

1. Откройте [Supabase Dashboard](https://supabase.com/dashboard)
2. Перейдите в **Authentication** → **URL Configuration**
3. Добавьте в **Redirect URLs**:

```
https://killerpool.app
https://killerpool.app/**
https://killerpool.vercel.app
https://killerpool.vercel.app/**
```

4. Обновите **Site URL**: `https://killerpool.app`

### Автоматический деплой

После настройки каждый push в `main` ветку будет автоматически деплоиться.

**Preview Deployments:**
- Каждый Pull Request получает уникальный preview URL
- Идеально для тестирования фич перед merge

---

## Environment Variables

### Обязательные переменные

| Переменная | Описание | Где взять |
|------------|----------|-----------|
| `NEXT_PUBLIC_SUPABASE_URL` | URL вашего Supabase проекта | Supabase Dashboard → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public anon key | Supabase Dashboard → Settings → API |

### Опциональные переменные

| Переменная | Описание | Что будет без неё |
|------------|----------|-------------------|
| `NEXT_PUBLIC_APP_URL` | Абсолютный URL приложения: метаданные, OG-картинки, `robots.txt`, `sitemap.xml` | `lib/site.ts` возьмёт `NEXT_PUBLIC_VERCEL_URL` (домен деплоя), а вне Vercel — `https://killerpool.app`. Ссылки-приглашения от неё не зависят: они строятся от `window.location.origin` |
| `NEXT_PUBLIC_SENTRY_DSN` | Public DSN проекта Sentry | Sentry просто молчит — сборка и приложение работают как обычно. С DSN события шлют только деплои Vercel (см. [Мониторинг](#мониторинг)) |
| `SENTRY_AUTH_TOKEN` | Токен для загрузки карт исходников **во время сборки** | Билд проходит, загрузка карт пропускается (`sourcemaps.disable` в `next.config.js`), стек-трейсы в Sentry остаются минифицированными |

Системные переменные Vercel, которые читает код (вручную не заводятся):

| Переменная | Где | Зачем |
|------------|-----|-------|
| `NEXT_PUBLIC_VERCEL_URL` | `lib/site.ts` | Домен деплоя, когда `NEXT_PUBLIC_APP_URL` не задана |
| `NEXT_PUBLIC_VERCEL_ENV` | `instrumentation-client.ts` | Гейт Sentry в браузере и тег environment; вшивается при сборке |
| `VERCEL_ENV` | `instrumentation.ts` | То же на сервере и edge, читается в рантайме |

`SUPABASE_SERVICE_ROLE_KEY` в проекте **не используется**: приложение ходит в
Supabase только из браузера под `anon`/`authenticated`, и ни одна строка кода
этот ключ не читает. Ключ, обходящий RLS, не нужно заводить в переменные.

### Безопасность переменных

⚠️ **НИКОГДА не коммитьте `.env.local` в Git!**

**Для production:**
- Секреты, которые не должны быть читаемы обратно (например, `SENTRY_AUTH_TOKEN`), заводите в Vercel как **Sensitive**
- Ротируйте ключи регулярно

**Грабли Sensitive-переменных.** Такая переменная доступна сборке и рантайму, но
прочитать её нельзя ни в UI, ни через CLI: `vercel env pull` кладёт в `.env.local`
**пустое** значение, и это выглядит как «переменную не сохранили». Старый CLI
даже не показывает тип. Проверять свежим:

```bash
npx vercel@latest env ls    # колонка type: Encrypted / Sensitive
```

---

## Supabase CLI

База — отдельный managed-проект Supabase. Код на Vercel и схема в Supabase
деплоятся независимо: push в `main` миграции **не** применяет.

**Привязка.** Репозиторий слинкован с продовым проектом
(`supabase link --project-ref <ref>`); состояние привязки лежит в
`supabase/.temp/` и в git не попадает (`.gitignore`). CLI авторизуется
**личным** токеном доступа — через `supabase login` или переменную
`SUPABASE_ACCESS_TOKEN` в окружении своего терминала. В репозиторий, в
`.env.local` и в переменные Vercel он не кладётся: приложению он не нужен, а
даёт полный доступ ко всем проектам владельца.

**Журнал миграций.** 00001–00014 катали руками через SQL Editor, поэтому
журнала миграций на проде не было. 17.10.2026 его завели (`migration repair`), и
с 00015 миграции идут через `supabase db push`. Только так и дальше: применённое в
SQL Editor в журнал не попадает, и следующий push попробует накатить его снова.
Перед отправкой в прод миграцию прогоняют локально (`supabase/test/setup-local.sh`
и `supabase/test/rls-policies.sql`).

**Выкладка 00015 и 00016 — база раньше клиента** (выполнена 17.10.2026). На проде
были 00001–00014, клиент на `main` был рассчитан на них, а клиент в `dev` — уже на
00015 и 00016. Порядок:

```bash
# 1. журнал (один раз): пометить применённое, не выполняя
supabase migration repair --linked --status applied 00001 00002 00003 00004 00005 00006 00007 00008 00009 00010 00011 00012 00013 00014
# 2. 00001–00014 в обеих колонках, 00015 и 00016 — только Local
supabase migration list --linked
# 3. к применению ровно две: 00015_game_integrity_and_spam_limits.sql и 00016_host_secret.sql
supabase db push --linked --dry-run
# 4.
supabase db push --linked
```

5. Проверить, что ограничения 00015 провалидированы (`convalidated = t`).
6. Проверить gateway для 00016: три `curl`-запроса с выброшенной строкой —
   доходит ли заголовок `x-host-secret` до PostgREST. Если нет — клиент не
   выкладывать и выключить защиту.
7. Только после этого — `gh pr create --base main --head dev` и
   `gh pr merge --merge`, то есть деплой клиента.

Почему клиент последним: он шлёт в строке колонку `host_secret_hash`. На схеме
без 00016 PostgREST ответит `PGRST204`, клиент повторит запись без колонки, и
все игры, записанные до миграции, лягут без защиты. А если gateway Supabase
не передаёт `x-host-secret`, новый клиент после первой же записи запрёт
каждого гостя-хоста в его собственной игре — это и ловит шаг 6. Старый клиент
на новой схеме работает как прежде: колонку и заголовок он не шлёт, его игры
пишутся по правилам 00015.

**Откат клиента после 00016.** Версия до 00016 не шлёт `x-host-secret`, поэтому
гостевые игры с хешем, начатые новой версией, она дописать не может (`42501`)
до конца их суток. Откатывая клиент, выключают и защиту: повторный запуск
PART 2 из 00015 (политика `games_update_anon` без секрета).

Запросы шагов 5 и 6, снятие текущих политик для отката и выключатель защиты
00016 — в [supabase/README.md](./supabase/README.md#-применение-миграций-к-проду).

**Типы.** После каждой миграции `lib/types/database.types.ts` перегенерируется
из продовой схемы и коммитится вместе с кодом, который на неё опирается:

```bash
npx supabase gen types typescript --linked --schema public > lib/types/database.types.ts
```

---

## Post-deployment проверки

После успешного деплоя выполните проверки:

### ✅ Базовая функциональность

- [ ] Главная страница загружается
- [ ] Можно создать новую игру
- [ ] Игровая логика работает (MISS, POT, BLACK)
- [ ] Авторизация работает (Google OAuth, Magic Link)
- [ ] История игр сохраняется

### ✅ PWA

- [ ] Manifest доступен: `https://killerpool.app/manifest.json`
- [ ] **Service worker выпущен**: `curl -sI https://killerpool.app/sw.js | head -1` → `200`, а не `404`. Это главный признак того, что сборка ушла через Turbopack, а не через webpack
- [ ] Можно установить приложение на домашний экран (кнопка «Install App» на главной)
- [ ] Иконки отображаются корректно

### ✅ Серверный рендеринг

Проверять надо на сыром HTML, а не в браузере: после гидратации сломанный SSR
выглядит нормально.

```bash
curl -s https://killerpool.app/help | sed 's/<script[^>]*>.*<\/script>//g' | wc -c
```

Страница `/help` должна содержать заметный объём текста. Ноль означает, что
что-то в дереве снова возвращает `null` до монтирования — этот баг уже был и
обнулял `<body>` на всех страницах.

### ✅ Sentry (если DSN задан)

- [ ] В Sentry приходят события с деплоев Vercel: production и preview, различаются тегом `environment`. `npm run dev` и локальная `npm run build && npm run start` молчат намеренно — гейт по `VERCEL_ENV`, а не только по `NODE_ENV`
- [ ] Стек-трейсы читаемы. Если минифицированы — в сборке не было `SENTRY_AUTH_TOKEN`. Проверять загрузку карт по `/projects/{org}/{project}/files/artifact-bundles/`; легаси-страница релизов для debug-id формата всегда показывает 0 файлов

### ✅ Performance

По желанию — [Lighthouse](https://developer.chrome.com/docs/lighthouse) (`npx lighthouse https://killerpool.app --view`). Целевые цифры не зафиксированы и замеры не автоматизированы; устанавливаемость PWA проверяется в DevTools → Application → Manifest. Размер бандла — `npm run size` локально.

### ✅ SEO

- [ ] Robots.txt доступен: `https://killerpool.app/robots.txt`
- [ ] Sitemap доступен: `https://killerpool.app/sitemap.xml`
- [ ] Open Graph теги работают (проверить на [opengraph.xyz](https://www.opengraph.xyz/))

### ✅ Security

- [ ] HTTPS работает
- [ ] SSL сертификат действителен
- [ ] Security headers отдаются: `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` (см. `vercel.json`); `X-XSS-Protection` намеренно не шлётся. CSP не настроен — см. Planned в ARCHITECTURE.md
- [ ] Environment variables не попадают в клиентский код

**Проверить security headers:**
```bash
curl -I https://killerpool.app
```

### ✅ База

- [ ] `supabase migration list --linked` показывает все миграции из `supabase/migrations/` в обеих колонках
- [ ] Проверка gateway для 00016 пройдена **до** деплоя клиента; после него в DevTools → Network каждый POST в `/rest/v1/games` у гостевой игры несёт `x-host-secret` и отвечает 2xx
- [ ] `lib/types/database.types.ts` перегенерирован после последней миграции

### ✅ Мобильные устройства

Протестируйте на:
- [ ] iOS Safari (iPhone)
- [ ] Android Chrome
- [ ] Разные размеры экранов

---

## Troubleshooting

### Build fails на Vercel

**Проблема:** "Build failed" ошибка

**Решение:**
1. Проверьте логи билда в Vercel Dashboard
2. Убедитесь что все environment variables заданы
3. Проверьте `package.json` на корректность зависимостей
4. Попробуйте локальный билд: `npm run build`

### Supabase connection error

**Проблема:** "Failed to connect to Supabase"

**Решение:**
1. Проверьте `NEXT_PUBLIC_SUPABASE_URL` (должен начинаться с `https://`)
2. Проверьте `NEXT_PUBLIC_SUPABASE_ANON_KEY` (скопирован полностью)
3. Убедитесь что Supabase проект активен
4. Проверьте Redirect URLs в Supabase Dashboard

### Google OAuth не работает

**Проблема:** "OAuth redirect error"

**Решение:**
1. Проверьте Google Cloud Console → Authorized redirect URIs
2. Добавьте: `https://your-project.supabase.co/auth/v1/callback`
3. Добавьте: `https://killerpool.app` в Authorized JavaScript origins

---

## Мониторинг

**Sentry — подключён.** `instrumentation-client.ts` (браузер),
`instrumentation.ts` (сервер и edge), `app/global-error.tsx` (падение самого
layout). Настройки, о которых стоит знать:

- клиент включается только при DSN, `NODE_ENV === 'production'` и окружении Vercel `production` или `preview` (`NEXT_PUBLIC_VERCEL_ENV` в браузере, `VERCEL_ENV` на сервере). Одного `NODE_ENV` было мало: локальная `next build && next start` тоже production, и с DSN из `.env.local` она писала в боевой проект;
- то же окружение уходит тегом `environment`, поэтому ошибки превью не смешиваются с продовыми;
- `tracesSampleRate: 0` — собираются только ошибки, не производительность;
- `ignoreErrors` отсекает офлайн-шум (обрывы сети, отменённые запросы), которого у PWA много и который ничего не значит.

Не подключено (и пока не нужно): Vercel Analytics, product-аналитика,
внешний uptime-мониторинг.

---

## Полезные ссылки

- [Vercel Documentation](https://vercel.com/docs)
- [Next.js Deployment](https://nextjs.org/docs/deployment)
- [Supabase Production Checklist](https://supabase.com/docs/guides/platform/going-into-prod)
- [SSL Labs Test](https://www.ssllabs.com/ssltest/)
- [Google PageSpeed Insights](https://pagespeed.web.dev/)

---

**Готово!** Ваше приложение успешно задеплоено 🚀
