# 🎱 Killerpool

[![Next.js](https://img.shields.io/badge/Next.js-16.1-black?logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19.2-blue?logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4.2-38bdf8?logo=tailwindcss)](https://tailwindcss.com/)
[![Supabase](https://img.shields.io/badge/Supabase-Backend-green?logo=supabase)](https://supabase.com/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

Современное PWA-приложение для управления игрой в "Killer Pool" (бильярд). Мобильный трекер жизней с realtime-трансляцией для зрителей.

[🚀 Демо](https://killerpool.app) · [🐛 Сообщить о проблеме](https://github.com/AlexIDUJFNJ/killerpool/issues)

---

## 🎮 Правила игры

- **2+ игрока**, **3 жизни** в начале (макс. 6)
- **MISS** (промах) = -1 жизнь
- **POT** (забил шар) = без изменений
- **POT BLACK** (забил чёрный) = +1 жизнь
- **Победитель**: последний выживший

## 🚀 Технологический стек

| Категория | Технология |
|-----------|-----------|
| Framework | Next.js 16.1 (App Router) |
| UI | React 19.2, Tailwind CSS 4.2, shadcn/ui |
| Анимации | Motion 12 |
| Backend | Supabase (Postgres, Auth, Realtime, RLS) |
| Деплой | Vercel (fra1 регион) |
| Тесты | Jest 30 + Testing Library |
| Линтинг | ESLint 9 (flat config), Prettier |
| Runtime | Node.js 22 |

## ✨ Возможности

### Игровой процесс
- Свайп-управление (влево = промах, вправо = забил, вверх = чёрный)
- Haptic feedback на мобильных
- Добавление игрока прямо во время игры
- Undo действий
- Экран победителя с анимациями
- Празднование при забитии чёрного шара ("CHYORNY!" fiesta)

### Live Sharing (Spectator Mode)
- QR-код и ссылка для зрителей прямо из игры
- Realtime-трансляция всех действий через WebSocket
- Зрители могут пере-шарить ссылку другим (цепочка спектаторов)
- Работает без авторизации
- Цвета жизней (красный/жёлтый/зелёный) одинаковы у хоста и зрителей

### PWA
- Установка на iOS/Android (кнопка на главной; в Safari — подсказка про «На экран Домой»)
- Service Worker для офлайн-режима
- Догон синхронизации при возврате в сеть
- localStorage для оффлайн-игр

### Аккаунт и статистика
- Google OAuth / Magic Link
- Глобальный лидерборд (топ-15)
- Детальная статистика игроков
- Система достижений (10 типов бейджей)
- Экспорт данных (CSV, JSON, Screenshot)
- Синхронизация localStorage → Supabase

### UI/UX
- Mobile-first адаптивный дизайн
- Dark / Light / System тема
- Bottom sheet, анимированные карточки
- Скроллируемые модальные окна на маленьких экранах

## 📦 Быстрый старт

```bash
# Установка
npm install

# Настройка переменных (скопировать и заполнить Supabase ключи)
cp .env.local.example .env.local

# Dev server
npm run dev
```

Нужны переменные:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Подробная настройка Supabase: [supabase/README.md](./supabase/README.md)

## 🏗️ Структура проекта

```
killerpool/
├── app/                    # Next.js App Router (pages)
│   ├── game/[id]/          # Игровой экран (хост + спектатор)
│   ├── game/new/           # Создание игры
│   ├── history/            # История игр
│   ├── leaderboard/        # Лидерборд
│   ├── stats/              # Статистика
│   ├── auth/               # Авторизация
│   ├── profile/            # Профиль
│   └── globals.css         # Tailwind v4 (@theme)
├── components/
│   ├── game/               # Игровые компоненты
│   │   ├── swipeable-player-card.tsx
│   │   ├── player-card.tsx
│   │   ├── invite-modal.tsx
│   │   └── black-ball-celebration.tsx
│   └── ui/                 # shadcn/ui компоненты
├── contexts/
│   └── game-context.tsx    # Глобальный стейт + realtime sync
├── lib/
│   ├── supabase/           # Supabase клиенты
│   ├── game-logic.ts       # Игровая логика
│   ├── realtime.ts         # Realtime подписки
│   ├── sync.ts             # Синхронизация с Supabase
│   ├── invite.ts           # QR-код и ссылки
│   └── types.ts            # TypeScript типы
├── supabase/migrations/    # SQL миграции (12 шт.)
├── proxy.ts                # Next.js proxy (auth)
├── eslint.config.mjs       # ESLint 9 flat config
└── postcss.config.js       # @tailwindcss/postcss
```

## 🛠 Команды

```bash
npm run dev          # Dev server
npm run build        # Production build
npm run start        # Production server
npm run lint         # ESLint проверка
npm run lint:fix     # ESLint auto-fix
npm test             # Запустить тесты
npm run test:coverage # Тесты с покрытием
npm run format       # Prettier
```

## 📚 Документация

| Документ | О чём |
|----------|-------|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Слои, потоки данных, что осознанно не сделано |
| [API.md](./API.md) | Сигнатуры внутренних модулей, схема БД, RPC |
| [SECURITY.md](./SECURITY.md) | RLS-политики и их следствия, модель угроз |
| [supabase/README.md](./supabase/README.md) | Настройка Supabase, список миграций |
| [PWA_SETUP.md](./PWA_SETUP.md) | Service worker, кеширование, офлайн |
| [DEPLOYMENT.md](./DEPLOYMENT.md) | Деплой на Vercel |
| [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) | Частые проблемы |
| [LEADERBOARD_TROUBLESHOOTING.md](./LEADERBOARD_TROUBLESHOOTING.md) | Почему лидерборд пустой |
| [CONTRIBUTING.md](./CONTRIBUTING.md) | Как вносить изменения |

## 📝 License

[MIT](./LICENSE)

---

<div align="center">
  Сделано с ❤️ для любителей бильярда
</div>
