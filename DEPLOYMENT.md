# 🚀 Deployment Guide - Killerpool

Деплой Killerpool на Vercel — проект живёт там (`.vercel/project.json`,
`vercel.json` с регионом `fra1`), а деплой запускается push'ем в GitHub.

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
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here

# App URL (обновите после первого деплоя)
NEXT_PUBLIC_APP_URL=https://killerpool.vercel.app
```

2. Выберите для каких окружений применить:
   - ✅ **Production**
   - ✅ **Preview**
   - ✅ **Development**

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
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (⚠️ секретный!) | Supabase Dashboard → Settings → API |
| `NEXT_PUBLIC_APP_URL` | URL вашего приложения | `https://killerpool.app` |

### Опциональные переменные

| Переменная | Описание | По умолчанию |
|------------|----------|--------------|
| `NODE_ENV` | Окружение | `production` |
| `PORT` | Порт приложения | `3000` |

### Безопасность переменных

⚠️ **НИКОГДА не коммитьте `.env.local` в Git!**

**Для production:**
- Используйте секретные менеджеры (Vercel, AWS Secrets Manager, etc.)
- Ограничьте доступ к `SUPABASE_SERVICE_ROLE_KEY`
- Ротируйте ключи регулярно

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
- [ ] Можно установить приложение на домашний экран
- [ ] Иконки отображаются корректно

### ✅ Performance

Проверьте через [Lighthouse](https://web.dev/measure/):

```bash
npx lighthouse https://killerpool.app --view
```

**Целевые метрики:**
- Performance: ≥90
- Accessibility: ≥95
- Best Practices: ≥95
- SEO: ≥95
- PWA: Installable

### ✅ SEO

- [ ] Robots.txt доступен: `https://killerpool.app/robots.txt`
- [ ] Sitemap доступен: `https://killerpool.app/sitemap.xml`
- [ ] Open Graph теги работают (проверить на [opengraph.xyz](https://www.opengraph.xyz/))

### ✅ Security

- [ ] HTTPS работает
- [ ] SSL сертификат действителен
- [ ] Security headers отдаются: X-Content-Type-Options, X-Frame-Options, Referrer-Policy (см. `vercel.json`). CSP не настроен — это осознанно, см. Planned в ARCHITECTURE.md
- [ ] Environment variables не попадают в клиентский код

**Проверить security headers:**
```bash
curl -I https://killerpool.app
```

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
4. Убедитесь что Google+ API включен

---

## Мониторинг

### Рекомендуемые инструменты

- **Vercel Analytics** - встроенная аналитика
- **Sentry** - error tracking
- **PostHog** - product analytics
- **Uptime Robot** - мониторинг доступности

---

## Полезные ссылки

- [Vercel Documentation](https://vercel.com/docs)
- [Next.js Deployment](https://nextjs.org/docs/deployment)
- [Supabase Production Checklist](https://supabase.com/docs/guides/platform/going-into-prod)
- [SSL Labs Test](https://www.ssllabs.com/ssltest/)
- [Google PageSpeed Insights](https://pagespeed.web.dev/)

---

**Готово!** Ваше приложение успешно задеплоено 🚀
