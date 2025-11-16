# 🎱 Killerpool

Современное PWA-приложение для управления игрой в "Killer Pool" (бильярд).

## 🚀 Технологический стек

- **Next.js 15** (App Router)
- **React 19**
- **TypeScript**
- **TailwindCSS 3.4** + shadcn/ui
- **Framer Motion** (анимации)
- **Supabase** (БД, авторизация)
- **Vercel** (деплой)

## 📊 Текущее состояние проекта

### ✅ Реализовано (Week 1 + Week 2 Days 8-11)

#### Основа и инфраструктура
- [x] Next.js 15 с App Router и TypeScript
- [x] Tailwind CSS 3.4 + shadcn/ui компоненты
- [x] Framer Motion для плавных анимаций
- [x] SEO оптимизация (metadata, Open Graph, robots, sitemap)
- [x] Error handling (error.tsx, loading.tsx, not-found.tsx)
- [x] PWA manifest

#### UI Компоненты
- [x] Player Card с аватарами и жизнями
- [x] Анимированный Life Bar
- [x] Action Buttons (MISS, POT, POT BLACK)
- [x] Адаптивный дизайн (mobile-first)

#### Игровая логика
- [x] Создание игры с 2+ игроками
- [x] Отслеживание жизней (MISS -1, POT 0, BLACK +1)
- [x] Определение победителя
- [x] История действий
- [x] localStorage для оффлайн режима
- [x] React Context для состояния игры

#### Аутентификация и База данных
- [x] Supabase настроен и развернут
- [x] Таблицы: games, player_profiles, rulesets
- [x] Row Level Security (RLS)
- [x] Google OAuth
- [x] Magic Link вход
- [x] Защита роутов (middleware)
- [x] Профиль пользователя

#### Экраны
- [x] Главная страница с анимациями
- [x] Создание новой игры
- [x] Игровой экран
- [x] Экран победителя
- [x] Аутентификация
- [x] Профиль
- [x] История игр (базовая)

### 🚧 В процессе разработки

- [ ] Полная интеграция истории с Supabase
- [ ] Детальная статистика игроков
- [ ] Export функционал (CSV, screenshot)
- [ ] Web Share API

### 🔜 Запланировано (Week 3)

- [ ] Service Worker для офлайн режима
- [ ] Realtime мультиплеер
- [ ] Достижения и badges
- [ ] Light theme
- [ ] Apple Sign In

## 📦 Установка

### 1. Установите зависимости

```bash
npm install
```

### 2. Настройте Supabase

**Создайте проект в Supabase:**

1. Зайдите на [supabase.com](https://supabase.com) и создайте новый проект
2. Получите API ключи из Settings → API
3. Запустите SQL миграцию из `supabase/migrations/00001_initial_schema.sql`

**Подробная инструкция:** [supabase/README.md](./supabase/README.md)

### 3. Настройте environment variables

```bash
# Скопируйте пример файла
cp .env.local.example .env.local

# Откройте .env.local и добавьте ваши Supabase ключи
```

Вам нужны:
- `NEXT_PUBLIC_SUPABASE_URL` - URL вашего Supabase проекта
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Public anon key
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key (⚠️ держите в секрете!)

### 4. Запустите dev server

```bash
npm run dev
```

Откройте [http://localhost:3000](http://localhost:3000) в браузере.

## 🔧 Настройка Vercel

### Шаг 1: Подключите GitHub репозиторий

1. Зайдите на [vercel.com](https://vercel.com)
2. Нажмите "Add New Project"
3. Выберите этот GitHub репозиторий
4. Vercel автоматически определит Next.js проект

### Шаг 2: Настройте переменные окружения

В настройках проекта Vercel добавьте:
- `NEXT_PUBLIC_SUPABASE_URL` - URL вашего Supabase проекта
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Public anon key
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key
- `NEXT_PUBLIC_APP_URL=https://killerpool.app` - Production URL

### Шаг 3: Деплой

Нажмите "Deploy" - Vercel автоматически задеплоит проект!

## 🎮 Основные правила MVP

- **2+ игрока**
- **3 жизни** в начале игры
- **MISS** (промах) = минус 1 жизнь
- **POT** (забил не черный) = изменений нет
- **POT BLACK** (забил черный шар) = плюс 1 жизнь
- **Game Over**: когда остался один игрок

## 📱 PWA

Приложение поддерживает установку на домашний экран:
- iOS: Safari → Share → Add to Home Screen
- Android: Chrome → Menu → Install App

## 🏗️ Структура проекта

```
killerpool/
├── app/                    # Next.js App Router
│   ├── layout.tsx          # Корневой layout
│   ├── page.tsx            # Главная страница
│   └── globals.css         # Глобальные стили
├── components/             # React компоненты
├── lib/                    # Утилиты и хелперы
│   ├── supabase/           # Supabase клиенты
│   │   ├── client.ts       # Browser client
│   │   ├── server.ts       # Server client
│   │   └── middleware.ts   # Middleware helper
│   └── types/              # TypeScript типы
│       └── database.types.ts  # Database types
├── supabase/               # Supabase конфигурация
│   ├── migrations/         # SQL миграции
│   │   └── 00001_initial_schema.sql
│   └── README.md           # Supabase setup guide
├── public/                 # Статические файлы
│   └── manifest.json       # PWA manifest
├── middleware.ts           # Next.js middleware (auth)
├── DEVELOPMENT_PLAN.md     # План разработки
└── killerpool-app-technical-doc.pdf  # Техническая документация
```

## 📄 Документация

- **Техническая спецификация:** [killerpool-app-technical-doc.pdf](./killerpool-app-technical-doc.pdf)
- **План разработки:** [DEVELOPMENT_PLAN.md](./DEVELOPMENT_PLAN.md)
- **Настройка Supabase:** [supabase/README.md](./supabase/README.md)
- **Contributing Guide:** [CONTRIBUTING.md](./CONTRIBUTING.md)

## 🛠 Доступные команды

```bash
# Development
npm run dev          # Запустить dev server
npm run build        # Production build
npm run start        # Запустить production server
npm run lint         # Проверить код с ESLint
```