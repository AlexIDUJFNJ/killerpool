# 🎱 Killerpool

[![Next.js](https://img.shields.io/badge/Next.js-15.0-black?logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19.0-blue?logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Supabase](https://img.shields.io/badge/Supabase-Backend-green?logo=supabase)](https://supabase.com/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

Современное PWA-приложение для управления игрой в "Killer Pool" (бильярд).

[🚀 Демо](https://killerpool.app) · [📖 Документация](ARCHITECTURE.md) · [🐛 Сообщить о проблеме](https://github.com/yourusername/killerpool/issues) · [✨ Предложить фичу](https://github.com/yourusername/killerpool/issues/new)

---

## 📋 Содержание

- [Технологический стек](#-технологический-стек)
- [Текущее состояние проекта](#-текущее-состояние-проекта)
- [Установка](#-установка)
- [Настройка Vercel](#-настройка-vercel)
- [Основные правила MVP](#-основные-правила-mvp)
- [PWA](#-pwa)
- [Структура проекта](#-структура-проекта)
- [Документация](#-документация)
- [Доступные команды](#-доступные-команды)

---

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

### ✅ Дополнительный функционал

- [x] Полная интеграция истории с Supabase
- [x] Детальная статистика игроков (Stats страница)
- [x] Export функционал (CSV, JSON, Screenshot)
- [x] Web Share API для шаринга
- [x] QR code invites для игр
- [x] Realtime мультиплеер (Supabase Realtime)
- [x] Light Theme поддержка (light/dark/system)
- [x] Theme Switcher компонент
- [x] Swipeable player cards
- [x] Haptic feedback
- [x] Bottom sheet UI
- [x] Invite modal с QR кодами

### ✅ Week 3 - PWA Setup (Days 15-16 завершены)

- [x] Service Worker для офлайн режима
- [x] PWA manifest и иконки
- [x] Background Sync для синхронизации данных
- [x] Офлайн fallback страница
- [x] Кеширование статики и API
- [x] Установка на iOS/Android

### ✅ Тестирование

- [x] Jest + React Testing Library настроено
- [x] Unit тесты для game logic (97% покрытие, 33 теста)
- [x] Unit тесты для storage utilities (100% покрытие, 22 теста)
- [x] Unit тесты для utils (100% покрытие, 8 тестов)
- [x] Component тесты для UI компонентов (100% покрытие, 45 тестов):
  - Button, Badge, Card, Avatar
- [x] Component тесты для игровых компонентов (100% покрытие, 39 тестов):
  - ActionButtons, PlayerCard
- [x] **147 тестов** успешно проходят

### 🔜 Запланировано

- [ ] Performance optimization
- [ ] Достижения и badges система
- [ ] Apple Sign In
- [ ] Больше component тестов (Dialog, Input, Label, etc.)
- [ ] Integration тесты
- [ ] E2E тестирование (Playwright/Cypress)
- [ ] Advanced analytics и метрики

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

### Для разработчиков

- 🏗️ **[Архитектура](ARCHITECTURE.md)** - Системная архитектура и технические решения
- 📡 **[API Documentation](API.md)** - Документация API и Supabase функций
- 🚀 **[Deployment Guide](DEPLOYMENT.md)** - Полное руководство по деплою
- 🔧 **[Troubleshooting](TROUBLESHOOTING.md)** - Решение частых проблем
- 🔐 **[Security](SECURITY.md)** - Best practices по безопасности
- 🤝 **[Contributing](CONTRIBUTING.md)** - Как внести свой вклад

### Настройка и планирование

- 📋 **[План разработки](DEVELOPMENT_PLAN.md)** - Roadmap и текущий статус
- 🗄️ **[Supabase Setup](supabase/README.md)** - Настройка базы данных
- 📄 **[Техническая спецификация](killerpool-app-technical-doc.pdf)** - Подробная документация проекта

## 🛠 Доступные команды

```bash
# Development
npm run dev          # Запустить dev server
npm run build        # Production build
npm run start        # Запустить production server
npm run lint         # Проверить код с ESLint
npm run lint:fix     # Исправить проблемы ESLint автоматически

# Testing
npm test             # Запустить все тесты
npm run test:watch   # Запустить тесты в watch режиме
npm run test:coverage # Запустить тесты с отчетом о покрытии

# Formatting
npm run format       # Отформатировать код с Prettier
npm run format:check # Проверить форматирование
```

## 🤝 Contributing

Мы приветствуем вклад в проект! Пожалуйста, ознакомьтесь с [CONTRIBUTING.md](CONTRIBUTING.md) для подробной информации.

### Quick Start для контрибьюторов

1. Fork репозиторий
2. Создайте feature branch (`git checkout -b feature/amazing-feature`)
3. Commit изменения (`git commit -m 'feat: add amazing feature'`)
4. Push в branch (`git push origin feature/amazing-feature`)
5. Откройте Pull Request

## 📊 Статус проекта

- **Week 1 (Days 1-7):** ✅ Завершено - MVP с полной игровой функциональностью
- **Week 2 (Days 8-11):** ✅ Завершено - Supabase интеграция и аутентификация
- **Week 2 (Days 12-14):** ✅ Завершено - История игр, статистика, export
- **Week 3 (Days 15-16):** ✅ Завершено - PWA Setup (Service Worker, офлайн режим, иконки)
- **Week 3 (Days 17-21):** ✅ 95% Завершено - Realtime, Light Theme, Stats, Performance Optimization

**Последнее обновление (18 ноября 2025):**
- ✅ Исправлены все критические ESLint ошибки и warnings
- ✅ Performance optimization: удалены неиспользуемые переменные, оптимизированы изображения
- ✅ Bundle size: First Load JS ~104-239KB (отлично для PWA)
- ✅ Production build проходит без ошибок
- ✅ Готов к production deployment на Vercel

Подробнее см. [DEVELOPMENT_PLAN.md](DEVELOPMENT_PLAN.md)

## 📝 License

Этот проект лицензирован под MIT License - см. [LICENSE](LICENSE) для деталей.

## 💬 Поддержка

Нужна помощь?

- 📖 Прочитайте [документацию](ARCHITECTURE.md)
- 🔧 Проверьте [Troubleshooting Guide](TROUBLESHOOTING.md)
- 🐛 [Создайте issue](https://github.com/yourusername/killerpool/issues)
- 💬 Задайте вопрос в [Discussions](https://github.com/yourusername/killerpool/discussions)

## 🙏 Благодарности

- [Next.js](https://nextjs.org/) - Отличный React framework
- [Supabase](https://supabase.com/) - Backend-as-a-Service
- [shadcn/ui](https://ui.shadcn.com/) - Красивые UI компоненты
- [Vercel](https://vercel.com/) - Hosting и deployment

---

<div align="center">
  Сделано с ❤️ для любителей бильярда
</div>