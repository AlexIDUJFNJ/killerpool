# 🎱 Killerpool

[![Next.js](https://img.shields.io/badge/Next.js-16.3-black?logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19.2-blue?logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4.3-38bdf8?logo=tailwindcss)](https://tailwindcss.com/)
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
| Framework | Next.js 16.3 (App Router) |
| UI | React 19.2, Tailwind CSS 4.3, shadcn/ui |
| Анимации | Motion 12 |
| Backend | Supabase (Postgres, Auth, Realtime, RLS) |
| Деплой | Vercel (fra1 регион) |
| Тесты | Jest 30 + Testing Library |
| Мониторинг | Sentry (ошибки браузера, сервера и edge) |
| Линтинг | ESLint 9 (flat config), Prettier |
| Runtime | Node.js 22 |

## ✨ Возможности

### Игровой процесс
- Свайп по карточке игрока (влево = промах, вправо = забил, вверх = чёрный), а также кнопки Miss / Black / Pot и стрелки клавиатуры
- Haptic feedback на мобильных
- Добавление игрока прямо во время игры; до 32 игроков в партии (столько принимает база)
- Undo действий, в том числе на экране победителя (победа отменяется, игра продолжается)
- Экран победителя с анимациями; вошедшим он показывает плашку о сохранении результата по факту выгрузки, а не заранее
- Празднование при забитии чёрного шара ("CHYORNY!" fiesta)
- Брошенная игра (End Game или новая игра поверх идущей) не пропадает: если в ней был хотя бы один ход, она сохраняется в историю со статусом `abandoned`
- Подтверждения и ошибки на игровом экране и в форме новой игры — в интерфейсе (BottomSheet, inline-сообщения), без системных `alert`/`confirm`

### Live Sharing (Spectator Mode)
- QR-код и ссылка для зрителей прямо из игры
- Realtime-трансляция всех действий через WebSocket (`postgres_changes`)
- Трансляция переживает перезагрузку страницы у хоста
- Зрители могут пере-шарить ссылку другим (цепочка спектаторов)
- Работает без авторизации
- Цвета жизней (красный/жёлтый/зелёный) одинаковы у хоста и зрителей

### PWA
- Установка на iOS/Android (кнопка на главной; в Safari — подсказка про «На экран Домой»)
- Service Worker для офлайн-режима (регистрирует `@ducanh2912/next-pwa`)
- Очередь выгрузки: завершённая или брошенная игра ставится в очередь до первой попытки и догоняется при возврате в сеть (до 14 дней)
- localStorage для оффлайн-игр

### Аккаунт и статистика
- Google OAuth / Magic Link
- Глобальный лидерборд (топ-15; в рейтинг попадают сыгравшие от 3 партий)
- Постоянные игроки: знакомое имя сохраняет статистику между играми
- Детальная статистика игроков (гостевые игры этого устройства учитываются и после входа)
- Система достижений (10 типов бейджей)
- Экспорт игры: CSV, скриншот (PNG), текстовая сводка в буфер обмена, Web Share
- Кнопка Sync в истории (для вошедших): сначала выгружает очередь, потом подтягивает игры аккаунта из облака

### UI/UX
- Mobile-first адаптивный дизайн, интерфейс на английском (`lang="en"`)
- Тема Light / Dark / System (по умолчанию тёмная), применяется до первой отрисовки (без вспышки)
- Масштабирование страницы не запрещено; анимации — и motion-компоненты, и CSS — уважают «уменьшить движение» в системе
- Bottom sheet, анимированные карточки
- Скроллируемые модальные окна на маленьких экранах
- Страница правил и жестов `/help` (ссылка с главной)

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

Необязательные: `NEXT_PUBLIC_APP_URL` (иначе метаданные и sitemap возьмут домен деплоя Vercel, а вне Vercel — `https://killerpool.app`), `NEXT_PUBLIC_SENTRY_DSN` и сборочный `SENTRY_AUTH_TOKEN` (карты исходников). Sentry шлёт события только из сборок Vercel (production и preview): `npm run dev` и локальная `npm run build && npm run start` молчат даже с DSN в `.env.local`.

Подробная настройка Supabase: [supabase/README.md](./supabase/README.md)

## 🏗️ Структура проекта

```
killerpool/
├── app/                    # Next.js App Router (pages)
│   ├── game/[id]/          # Игровой экран (хост + спектатор)
│   ├── game/new/           # Создание игры
│   ├── history/            # История игр (+ [id] — детали и экспорт)
│   ├── leaderboard/        # Лидерборд
│   ├── stats/              # Статистика
│   ├── auth/               # Авторизация (+ callback/route.ts)
│   ├── profile/            # Профиль
│   ├── help/               # Правила и жесты
│   ├── offline/            # Офлайн-фолбэк service worker'а
│   └── globals.css         # Tailwind v4 (@theme)
├── components/
│   ├── game/               # Игровые компоненты
│   │   ├── swipeable-player-card.tsx
│   │   ├── player-card.tsx
│   │   ├── action-styles.ts   # Цвета и иконки ходов, общие для всех экранов
│   │   ├── invite-modal.tsx
│   │   └── black-ball-celebration.tsx
│   ├── theme.ts / theme-toggle.tsx  # Тема Light / Dark / System
│   └── ui/                 # shadcn/ui компоненты
├── contexts/
│   └── game-context.tsx    # Глобальный стейт, персист, выгрузка, шаринг
├── hooks/                  # useRealtimeGame, useInstallPrompt
├── lib/
│   ├── supabase/           # Supabase клиенты
│   ├── game-logic.ts       # Игровая логика
│   ├── game-mapper.ts      # Game ↔ строка games
│   ├── storage.ts          # localStorage: игры, ростер, очередь выгрузки
│   ├── realtime.ts         # Realtime подписки
│   ├── sync.ts             # Синхронизация с Supabase
│   ├── invite.ts           # QR-код и ссылки
│   └── types.ts            # TypeScript типы
├── supabase/
│   ├── migrations/         # SQL миграции (15 шт.)
│   ├── debug/              # Отладочные запросы (leaderboard.sql)
│   └── test/               # Локальный Postgres + проверка RLS под ролями
├── docs/archive/           # Исторические материалы (PDF техдока, скриншот)
├── proxy.ts                # Next.js proxy (auth)
├── eslint.config.mjs       # ESLint 9 flat config
└── postcss.config.js       # @tailwindcss/postcss
```

## 🛠 Команды

```bash
npm run dev           # Dev server (Turbopack)
npm run build         # Production build (webpack; prebuild генерирует иконки)
npm run start         # Production server
npm run lint          # ESLint проверка
npm run lint:fix      # ESLint auto-fix
npm test              # Запустить тесты
npm run test:coverage # Тесты с покрытием
npm run format        # Prettier
npm run format:check  # Prettier без записи
npm run size          # Сборка + отчёт о размере .next/static
```

## 📚 Документация

| Документ | О чём |
|----------|-------|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Слои, потоки данных, наблюдаемость, что осознанно не сделано |
| [API.md](./API.md) | Сигнатуры внутренних модулей, схема БД, RPC |
| [SECURITY.md](./SECURITY.md) | RLS-политики и их следствия, модель угроз |
| [supabase/README.md](./supabase/README.md) | Настройка Supabase, список миграций |
| [PWA_SETUP.md](./PWA_SETUP.md) | Service worker, кеширование, офлайн |
| [DEPLOYMENT.md](./DEPLOYMENT.md) | Деплой на Vercel |
| [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) | Частые проблемы |
| [LEADERBOARD_TROUBLESHOOTING.md](./LEADERBOARD_TROUBLESHOOTING.md) | Почему лидерборд пустой или в нём нет знакомых имён |
| [CONTRIBUTING.md](./CONTRIBUTING.md) | Как вносить изменения |

Исторические материалы, которые **не** описывают текущий код: [DEVELOPMENT_PLAN.md](./DEVELOPMENT_PLAN.md) (план MVP, снимок ноября 2025) и [docs/archive/](./docs/archive/) (PDF техдокументации и скриншот игрового экрана).

## 📝 License

[MIT](./LICENSE)

---

<div align="center">
  Сделано с ❤️ для любителей бильярда
</div>
