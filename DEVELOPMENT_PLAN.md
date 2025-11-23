# 🎱 Killerpool.app - План разработки MVP

**Дата создания:** 15 ноября 2025
**Последнее обновление:** 23 ноября 2025
**Домен:** killerpool.app
**Статус:** 🚀 Активная разработка - Week 3 (MVP завершен на 98%)

---

## 📋 Оглавление

- [Обзор проекта](#обзор-проекта)
- [Текущее состояние](#текущее-состояние)
- [Технический стек](#технический-стек)
- [Roadmap разработки](#roadmap-разработки)
- [Приоритеты и этапы](#приоритеты-и-этапы)
- [Checklist задач](#checklist-задач)

---

## 🎯 Обзор проекта

**Killerpool.app** — современное PWA-приложение для управления игрой в "Killer Pool" (бильярд), разработанное с упором на максимальное удобство и удовольствие для игроков.

### Ключевые особенности MVP:

- **Mobile-first PWA** — устанавливается как нативное приложение
- **Классические правила**: 2+ игрока, 3 жизни, MISS (-1), POT (0), POT BLACK (+1)
- **Modern UI/UX 2025**: темная тема, bento-гриды, живые анимации, крупные элементы
- **Офлайн-режим** — работает без интернета после установки
- **Быстрый старт** — минимум кликов до начала игры

---

## 📊 Текущее состояние

### ✅ Что уже есть:

- [x] Next.js 15 проект с App Router
- [x] Базовая структура: `app/`, `components/`, `lib/`, `public/`
- [x] Tailwind CSS 3.4 настроен
- [x] PWA manifest.json создан
- [x] Vercel конфигурация с security headers
- [x] TypeScript настроен
- [x] Базовый layout с темной темой
- [x] Заглушка главной страницы

### ❌ Что нужно сделать:

- [ ] Разработать UI компоненты (игроки, life bars, кнопки действий)
- [ ] Реализовать игровую логику
- [ ] Интегрировать Supabase (БД + Auth)
- [ ] Добавить Framer Motion анимации
- [ ] Настроить PWA с офлайн-режимом (next-pwa)
- [ ] Создать все основные экраны
- [ ] Реализовать историю игр и профили
- [ ] Добавить QR/invite links для мультиплеера

---

## 🛠 Технический стек

### Frontend

- **Framework:** Next.js 15 (App Router)
- **React:** 19.0.0
- **TypeScript:** 5.3.3
- **Styling:** Tailwind CSS 3.4 + shadcn/ui
- **Animations:** Framer Motion 11.0.0
- **Icons:** Lucide React

### Backend & Database

- **Database:** Supabase (PostgreSQL)
- **Auth:** Supabase Auth (email + социальные сети)
- **API:** Next.js Server Actions (Edge Runtime)
- **Realtime:** Supabase Realtime (фаза 2)

### DevOps

- **Hosting:** Vercel (custom domain killerpool.app)
- **Region:** fra1 (Frankfurt)
- **PWA:** next-pwa + Workbox
- **Node:** 20.x

---

## 🗓 Roadmap разработки

### **Week 1 — Rapid MVP** ✅ ЗАВЕРШЕНО (7 дней)

**Цель:** Создать работающий прототип с базовой функциональностью

#### День 1-2: Основа и UI Kit ✅

- [x] Установить недостающие зависимости (shadcn/ui)
- [x] Создать базовые компоненты:
  - [x] `components/ui/button.tsx`
  - [x] `components/ui/card.tsx`
  - [x] `components/ui/avatar.tsx`
  - [x] `components/ui/input.tsx`
  - [x] `components/ui/label.tsx`
  - [x] `components/ui/badge.tsx`
  - [x] `components/game/player-card.tsx`
  - [x] `components/game/life-bar.tsx`
  - [x] `components/game/action-buttons.tsx`
- [x] Настроить кастомную цветовую палитру (emerald/green тема)

#### День 3-4: Главные экраны ✅

- [x] **Home Screen** (`app/page.tsx`)
  - [x] Логотип с градиентом
  - [x] Кнопка "Start New Game"
  - [x] Кнопка "Game History"
  - [x] Resume game banner (если есть активная игра)
  - [x] Auth buttons (Sign In / Profile)

- [x] **New Game Screen** (`app/game/new/page.tsx`)
  - [x] Форма добавления игроков (2-8)
  - [x] Выбор имени + emoji аватара
  - [x] Кнопка "Start Game"

- [x] **Game Screen** (`app/game/[id]/page.tsx`)
  - [x] Grid с карточками игроков
  - [x] Life bars с анимацией
  - [x] Action buttons: MISS, POT, BLACK
  - [x] Текущий игрок highlighted

- [x] **Winner Screen** (компонент/модал)
  - [x] Анимация победы
  - [x] Кнопки: New Game, Share, Home

#### День 5: Игровая логика ✅

- [x] Создать `lib/game-logic.ts`:
  - [x] Типы: `Player`, `Game`, `GameAction`
  - [x] Функции управления жизнями
  - [x] Проверка победителя
  - [x] История действий
- [x] Хранение игры в localStorage
- [x] Context для состояния игры (`contexts/game-context.tsx`)

#### День 6-7: Анимации и полировка ✅

- [x] Добавить Framer Motion transitions:
  - [x] Life bar decrease/increase
  - [x] Player elimination (fade out)
  - [x] Winner celebration
  - [x] Page transitions
- [x] Тестирование на мобильных устройствах
- [x] Responsive fixes
- [x] Улучшение мобильного UI

---

### **Week 2 — Cloud + Social Layer** (7 дней)

**Цель:** Интеграция с Supabase, авторизация, история игр

#### День 8-9: Supabase Setup ✅

- [x] Создать проект в Supabase
- [x] Настроить таблицы:
  ```sql
  -- users (managed by Supabase Auth)

  -- player_profiles
  CREATE TABLE player_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id),
    display_name TEXT NOT NULL,
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

  -- games
  CREATE TABLE games (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    status TEXT NOT NULL, -- 'active', 'completed'
    participants JSONB NOT NULL, -- [{id, name, avatar, lives}]
    winner_id UUID,
    ruleset_id UUID,
    history JSONB -- [{action, player_id, timestamp}]
  );

  -- rulesets
  CREATE TABLE rulesets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    params JSONB NOT NULL -- {starting_lives: 3, miss: -1, ...}
  );
  ```

- [x] Настроить Row Level Security (RLS):
  - [x] Игроки видят только свои игры
  - [x] Только участники могут обновлять игру
- [x] Добавить environment variables в Vercel

#### День 10-11: Авторизация ✅

- [x] Установить `@supabase/supabase-js` и `@supabase/ssr`
- [x] Создать `lib/supabase/` (client, server, middleware)
- [x] **Auth Screen** (`app/auth/page.tsx`):
  - [x] Google OAuth
  - [x] Magic Link опция
  - [x] "Continue as Guest"
- [x] Middleware для защищенных роутов
- [x] Профиль пользователя (`app/profile/page.tsx`)
- [x] Auth callback route (`app/auth/callback/route.ts`)

#### День 12-13: История игр

- [ ] **Game History Screen** (`app/history/page.tsx`)
  - [ ] Список завершенных игр
  - [ ] Фильтр по дате
  - [ ] Поиск по игроку
- [ ] **Game Details** (`app/history/[id]/page.tsx`)
  - [ ] Детали партии
  - [ ] Timeline действий
  - [ ] Статистика игроков
- [ ] Синхронизация localStorage → Supabase

#### День 14: Export & Share

- [ ] Функция экспорта игры:
  - [ ] Screenshot (html2canvas)
  - [ ] CSV export
  - [ ] Share API (Web Share API)
- [ ] QR code для приглашения (опционально)

---

### **Week 3 — Beta & Feedback** (7 дней)

**Цель:** PWA, тестирование, доработка

#### День 15-16: PWA Setup ✅

- [x] Установить `@ducanh2912/next-pwa`
- [x] Настроить Service Worker:
  - [x] Кеш статики
  - [x] Офлайн fallback
  - [x] Background sync для игр
- [x] Создать иконки:
  - [x] 192x192
  - [x] 512x512
  - [x] Favicon, Apple Touch Icon
  - [x] SVG исходник
- [x] Настроить manifest.json
- [x] Добавить PWA мета-теги
- [x] Создать офлайн страницу
- [x] Настроить runtime caching стратегии
- [x] Документация PWA_SETUP.md

#### День 17: Realtime (опционально)

- [ ] Supabase Realtime подписки
- [ ] Синхронизация игры между устройствами
- [ ] Мультиплеер в реальном времени

#### День 18-19: Тестирование

- [ ] Бета-тест с друзьями (5-10 человек)
- [ ] Сбор feedback
- [ ] Багфиксы
- [ ] Performance optimization:
  - [ ] Lazy loading компонентов
  - [ ] Image optimization
  - [ ] Bundle size analysis

#### День 20-21: Финальная полировка

- [ ] SEO optimization (metadata, sitemap)
- [ ] OpenGraph images
- [ ] Accessibility (a11y) проверка
- [ ] Light mode поддержка (опционально)
- [ ] Документация для пользователей

---

## 🎯 Приоритеты и этапы

### 🔴 Критичные (Must Have)

1. ✅ Базовая структура проекта
2. ✅ Игровая логика (MISS, POT, BLACK)
3. ✅ UI компоненты (players, life bars, buttons)
4. ✅ Экраны: Home, New Game, Game, Winner
5. ⏳ PWA с офлайн-режимом (manifest готов, Service Worker - в процессе)
6. ✅ Supabase интеграция (БД, Auth, RLS)
7. ⏳ История игр (базовый функционал реализован, интеграция с Supabase - в процессе)

### 🟡 Важные (Should Have)

8. ✅ Авторизация (Google OAuth + Magic Link)
9. ✅ Framer Motion анимации
10. ⏳ Export/Share функциональность (запланировано)
11. ✅ Профили игроков (базовый функционал)
12. ✅ Responsive design (mobile-first)

### 🟢 Желательные (Nice to Have)

13. ⏳ Realtime мультиплеер (Week 3)
14. ⏳ QR invites (Week 2, Days 12-14)
15. ⏳ Достижения/badges (Week 3)
16. ⏳ Статистика игрока (Week 2, Days 12-13)
17. ⏳ Light mode (Week 3)
18. ⏳ Apple Sign In (запланировано)

---

## ✅ Checklist задач

### Фаза 1: Основа (Дни 1-7)

#### Настройка проекта
- [ ] Установить shadcn/ui CLI: `npx shadcn-ui@latest init`
- [ ] Добавить компоненты: button, card, avatar, badge
- [ ] Настроить next-pwa
- [ ] Создать базовую структуру папок

#### UI Компоненты
- [ ] `components/ui/` - базовые shadcn компоненты
- [ ] `components/game/player-card.tsx`
- [ ] `components/game/life-bar.tsx`
- [ ] `components/game/action-buttons.tsx`
- [ ] `components/game/game-board.tsx`
- [ ] `components/layouts/game-layout.tsx`

#### Логика игры
- [ ] `lib/game-logic.ts` - core game functions
- [ ] `lib/types.ts` - TypeScript types
- [ ] `contexts/game-context.tsx` - React Context
- [ ] localStorage persistence

#### Экраны
- [ ] `app/page.tsx` - Home
- [ ] `app/game/new/page.tsx` - New Game
- [ ] `app/game/[id]/page.tsx` - Game Screen
- [ ] `app/history/page.tsx` - History

### Фаза 2: Cloud (Дни 8-14)

#### Supabase
- [ ] Создать проект
- [ ] Настроить таблицы + RLS
- [ ] `lib/supabase/client.ts`
- [ ] `lib/supabase/server.ts`
- [ ] Миграции в `supabase/migrations/`

#### Auth
- [ ] `app/auth/page.tsx`
- [ ] `app/profile/page.tsx`
- [ ] Middleware для защиты роутов
- [ ] Session handling

#### Features
- [ ] Sync localStorage → Supabase
- [ ] История игр с фильтрацией
- [ ] Export (screenshot, CSV)
- [ ] Share via Web Share API

### Фаза 3: PWA & Launch (Дни 15-21)

#### PWA
- [ ] Service Worker config
- [ ] Icons (192, 512, favicon)
- [ ] Manifest обновить
- [ ] Offline fallback page
- [ ] Install prompt

#### Testing & Polish
- [ ] Mobile testing (iOS Safari, Android Chrome)
- [ ] Performance audit (Lighthouse)
- [ ] Accessibility check
- [ ] Beta testing
- [ ] Bug fixes

#### Deploy
- [ ] Vercel environment variables
- [ ] Custom domain (killerpool.app)
- [ ] SSL certificate
- [ ] SEO: sitemap, robots.txt
- [ ] Analytics (опционально)

---

## 📝 Заметки

### Технические решения

**Почему Next.js 15?**
- App Router для улучшенной производительности
- Server Components по умолчанию
- Улучшенный Metadata API
- Edge Runtime для быстрых API

**Почему Tailwind CSS 3.4, а не 4.0?**
- Стабильность для production
- Совместимость с shadcn/ui
- Tailwind 4 еще в beta

**Почему Supabase?**
- Быстрая интеграция auth + БД
- PostgreSQL с RLS из коробки
- Realtime для будущего мультиплеера
- Generous free tier

### Best Practices

1. **Security:**
   - Использовать environment variables для ключей
   - Никогда не коммитить `.env.local`
   - RLS на всех таблицах
   - HTTPS только (enforced на Vercel)

2. **Performance:**
   - Lazy load компонентов
   - Image optimization через Next.js
   - Code splitting автоматически
   - CDN через Vercel

3. **UX:**
   - Mobile-first дизайн
   - Touch-friendly (минимум 44px tap targets)
   - Haptic feedback где возможно
   - Instant loading с Suspense

4. **Code Quality:**
   - TypeScript strict mode
   - ESLint + Prettier
   - Компонентный подход
   - Переиспользуемые UI элементы

---

## 🔗 Полезные ресурсы

- [Next.js 15 Docs](https://nextjs.org/docs)
- [Supabase Docs](https://supabase.com/docs)
- [shadcn/ui](https://ui.shadcn.com)
- [Framer Motion](https://www.framer.com/motion/)
- [PWA with Next.js](https://ducanh-next-pwa.vercel.app/)
- [Vercel Deployment](https://vercel.com/docs)

---

**Создано:** Claude AI
**Последнее обновление:** 23 ноября 2025
**Статус:** 🟢 MVP практически завершен (98%)

---

## 📈 Прогресс разработки

- **Week 1 (Days 1-7):** ✅ **100% Завершено** - Rapid MVP с полной игровой функциональностью
- **Week 2 (Days 8-11):** ✅ **100% Завершено** - Supabase интеграция и аутентификация
- **Week 2 (Days 12-14):** ✅ **100% Завершено** - История игр, статистика, export
- **Week 3 (Days 15-16):** ✅ **100% Завершено** - PWA Setup (Service Worker, офлайн, иконки)
- **Week 3 (Days 17-21):** ✅ **98% Завершено** - Realtime, Light Theme, Stats, Performance Optimization, Spectator Mode

### Последние обновления (23 ноября 2025):

- ✅ **Spectator Mode & Shared Access**
  - Добавлен режим зрителя для QR code гостей
  - Публичный доступ к истории игр через shared links
  - Улучшена безопасность с сохранением пользовательского опыта

- ✅ **Game Mechanics Improvements**
  - Изменен лимит жизней по умолчанию с 10 на 6
  - Улучшено отображение жизней (максимум 6, красный цвет для последней)
  - Исправлен flow создания новой игры

- ✅ **Data Sync & Migration**
  - Добавлена страница синхронизации localStorage → Supabase
  - Сохранение имени профиля при синхронизации
  - Улучшена идентификация игроков в лидерборде

- ✅ **Mobile UX Improvements**
  - Улучшен мобильный responsive дизайн
  - Исправлены проблемы с навигацией

### Предыдущие обновления (18 ноября 2025):

- ✅ **Performance Optimization (Day 18)**
  - Удалены все неиспользуемые переменные и импорты
  - Исправлены ESLint warnings (let→const, unused errors)
  - Оптимизирована работа с изображениями (добавлены eslint-disable где оправдано)
  - Исправлен useEffect dependency warning с помощью useCallback
  - Bundle size analysis: First Load JS ~104-239KB (отлично для PWA)
  - Build проходит без ошибок, только несущественные warnings ✅

- ✅ **Build & Deployment Fixes**
  - Исправлены все критические ESLint ошибки, блокирующие деплой на Vercel
  - Fix stats/page.tsx: заменен несуществующий импорт getAllGames на loadGameHistory
  - Fix help/page.tsx: эскейпированы кавычки и апострофы в JSX тексте
  - Fix invite-modal.tsx, player-card.tsx: эскейпированы апострофы
  - Fix ui/input.tsx: пустой интерфейс заменен на type alias
  - Fix lib/sync-manager.ts: удален triple-slash reference
  - Production build теперь проходит успешно ✅

- ✅ **Quick Wins завершены**
  - Исправлены Next.js metadata warnings (viewport/themeColor)
  - Настроен ESLint + Prettier для code quality
  - Создана Stats страница с детальной статистикой
  - Light Theme полностью реализован (light/dark/system)

- ✅ **Export & Share**
  - CSV export результатов игр
  - JSON export для бэкапов
  - Screenshot функционал (html2canvas)
  - Web Share API интеграция
  - Copy to clipboard для быстрого шаринга

- ✅ **Realtime Multiplayer**
  - Supabase Realtime подписки
  - Синхронизация игры между устройствами
  - QR code invites для приглашения игроков
  - Invite modal с QR кодами

### Недавние улучшения (17 ноября 2025):
- ✅ **PWA Setup завершен** (Days 15-16)
  - Service Worker с кешированием
  - Офлайн режим с fallback страницей
  - Background Sync для синхронизации данных
  - Иконки всех размеров (192, 512, favicon, apple-touch-icon)
  - PWA manifest с полной конфигурацией
  - Runtime caching стратегии для разных типов ресурсов
  - Документация PWA_SETUP.md

### Предыдущие обновления (16 ноября 2025):
- ✅ Добавлены специальные Next.js файлы (error.tsx, loading.tsx, not-found.tsx)
- ✅ Улучшен SEO (Open Graph, Twitter Cards, robots.txt, sitemap)
- ✅ Создан CONTRIBUTING.md для контрибьюторов
- ✅ Обновлена документация проекта с актуальным состоянием
