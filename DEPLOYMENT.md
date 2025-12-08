# 🚀 Deployment Guide - Killerpool

Полное руководство по деплою Killerpool.app на различные платформы.

## 📋 Содержание

- [Vercel (рекомендуется)](#vercel-рекомендуется)
- [Netlify](#netlify)
- [Docker](#docker)
- [Self-hosted](#self-hosted)
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

## Netlify

Альтернативная платформа для деплоя.

### Шаг 1: Подключение

1. Зайдите на [netlify.com](https://netlify.com)
2. **"Add new site"** → **"Import an existing project"**
3. Выберите GitHub и авторизуйтесь
4. Выберите репозиторий

### Шаг 2: Build Settings

```
Build command: npm run build
Publish directory: .next
```

### Шаг 3: Environment Variables

Добавьте те же переменные что и для Vercel:

```bash
NEXT_PUBLIC_SUPABASE_URL=your-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-key
SUPABASE_SERVICE_ROLE_KEY=your-service-key
NEXT_PUBLIC_APP_URL=https://your-site.netlify.app
```

### Шаг 4: Deploy

Нажмите **"Deploy site"**

**Важно:** Для Next.js на Netlify может потребоваться установка `@netlify/plugin-nextjs`:

Создайте `netlify.toml`:

```toml
[[plugins]]
package = "@netlify/plugin-nextjs"
```

---

## Docker

Для деплоя в контейнере Docker.

### Dockerfile

Создайте `Dockerfile` в корне проекта:

```dockerfile
# Stage 1: Dependencies
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

# Stage 2: Builder
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Environment variables для build time
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_APP_URL

ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL

RUN npm run build

# Stage 3: Runner
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Copy necessary files
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000

ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

CMD ["node", "server.js"]
```

### Docker Compose

Создайте `docker-compose.yml`:

```yaml
version: '3.8'

services:
  killerpool:
    build:
      context: .
      args:
        NEXT_PUBLIC_SUPABASE_URL: ${NEXT_PUBLIC_SUPABASE_URL}
        NEXT_PUBLIC_SUPABASE_ANON_KEY: ${NEXT_PUBLIC_SUPABASE_ANON_KEY}
        NEXT_PUBLIC_APP_URL: ${NEXT_PUBLIC_APP_URL}
    ports:
      - "3000:3000"
    environment:
      - SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}
    restart: unless-stopped
```

### Build & Run

```bash
# Build image
docker build -t killerpool:latest .

# Run container
docker run -p 3000:3000 \
  -e NEXT_PUBLIC_SUPABASE_URL=your-url \
  -e NEXT_PUBLIC_SUPABASE_ANON_KEY=your-key \
  -e SUPABASE_SERVICE_ROLE_KEY=your-service-key \
  -e NEXT_PUBLIC_APP_URL=https://your-domain.com \
  killerpool:latest

# Or with docker-compose
docker-compose up -d
```

---

## Self-hosted

Деплой на собственном сервере (VPS, AWS EC2, DigitalOcean, etc.)

### Предварительные требования

- Ubuntu/Debian сервер (20.04 LTS или новее)
- Node.js 20.x
- Nginx (reverse proxy)
- PM2 (process manager)

### Шаг 1: Подготовка сервера

```bash
# Обновление системы
sudo apt update && sudo apt upgrade -y

# Установка Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Установка PM2
sudo npm install -g pm2

# Установка Nginx
sudo apt install -y nginx

# Установка Git
sudo apt install -y git
```

### Шаг 2: Клонирование и настройка проекта

```bash
# Создайте директорию для приложения
sudo mkdir -p /var/www/killerpool
sudo chown -R $USER:$USER /var/www/killerpool

# Клонируйте репозиторий
cd /var/www/killerpool
git clone https://github.com/yourusername/killerpool.git .

# Установите зависимости
npm install

# Создайте .env.local
cp .env.local.example .env.local
nano .env.local  # Добавьте ваши переменные

# Build проекта
npm run build
```

### Шаг 3: PM2 Configuration

Создайте `ecosystem.config.js`:

```javascript
module.exports = {
  apps: [{
    name: 'killerpool',
    script: 'npm',
    args: 'start',
    cwd: '/var/www/killerpool',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    }
  }]
};
```

Запустите приложение:

```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup  # Следуйте инструкциям для автозапуска
```

### Шаг 4: Настройка Nginx

Создайте конфигурацию:

```bash
sudo nano /etc/nginx/sites-available/killerpool
```

Добавьте:

```nginx
server {
    listen 80;
    server_name killerpool.app www.killerpool.app;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Активируйте конфигурацию:

```bash
sudo ln -s /etc/nginx/sites-available/killerpool /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### Шаг 5: SSL с Let's Encrypt

```bash
# Установите Certbot
sudo apt install -y certbot python3-certbot-nginx

# Получите SSL сертификат
sudo certbot --nginx -d killerpool.app -d www.killerpool.app

# Проверьте автообновление
sudo certbot renew --dry-run
```

### Управление приложением

```bash
# Просмотр логов
pm2 logs killerpool

# Перезапуск
pm2 restart killerpool

# Остановка
pm2 stop killerpool

# Обновление приложения
cd /var/www/killerpool
git pull
npm install
npm run build
pm2 restart killerpool
```

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
- [ ] Security headers настроены (CSP, X-Frame-Options, etc.)
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

## Continuous Deployment

### GitHub Actions (опционально)

Для дополнительного контроля можно настроить GitHub Actions.

Создайте `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Run tests
        run: npm test

      - name: Build
        run: npm run build
        env:
          NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.NEXT_PUBLIC_SUPABASE_URL }}
          NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.NEXT_PUBLIC_SUPABASE_ANON_KEY }}

      # Vercel автоматически задеплоит при push в main
```

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
