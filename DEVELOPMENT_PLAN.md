# 🎱 Killerpool.app - План разработки MVP

**Дата создания:** 15 ноября 2025
**Домен:** killerpool.app
**Статус:** В разработке

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

### **Week 1 — Rapid MVP** (7 дней)

**Цель:** Создать работающий прототип с базовой функциональностью

#### День 1-2: Основа и UI Kit

- [ ] Установить недостающие зависимости (shadcn/ui, next-pwa)
- [ ] Создать базовые компоненты:
  - [ ] `components/ui/button.tsx`
  - [ ] `components/ui/card.tsx`
  - [ ] `components/ui/avatar.tsx`
  - [ ] `components/game/player-card.tsx`
  - [ ] `components/game/life-bar.tsx`
  - [ ] `components/game/action-buttons.tsx`
- [ ] Настроить кастомную цветовую палитру (темный green, emerald, неон-акценты)

#### День 3-4: Главные экраны

- [ ] **Home Screen** (`app/page.tsx`)
  - [ ] Логотип + градиент
  - [ ] Кнопка "Start New Game"
  - [ ] Кнопка "Game History"
  - [ ] Quick install PWA banner

- [ ] **New Game Screen** (`app/game/new/page.tsx`)
  - [ ] Форма добавления игроков (2-8)
  - [ ] Выбор имени + emoji аватара
  - [ ] Кнопка "Start Game"

- [ ] **Game Screen** (`app/game/[id]/page.tsx`)
  - [ ] Bento-grid с карточками игроков
  - [ ] Life bars с анимацией
  - [ ] Крупные action buttons: MISS, POT, BLACK
  - [ ] Текущий игрок highlighted

- [ ] **Winner Screen** (компонент/модал)
  - [ ] Анимация победы
  - [ ] Конфетти/эффекты
  - [ ] Кнопки: New Game, Share, Home

#### День 5: Игровая логика (localStorage)

- [ ] Создать `lib/game-logic.ts`:
  - [ ] Типы: `Player`, `Game`, `GameAction`
  - [ ] Функции управления жизнями
  - [ ] Проверка победителя
  - [ ] История действий
- [ ] Хранение игры в localStorage (временно)
- [ ] Context/Store для состояния игры (React Context или Zustand)

#### День 6-7: Анимации и полировка

- [ ] Добавить Framer Motion transitions:
  - [ ] Life bar decrease/increase
  - [ ] Player elimination (fade out)
  - [ ] Winner celebration
  - [ ] Page transitions
- [ ] Тестирование на мобильных устройствах
- [ ] Responsive fixes

---

### **Week 2 — Cloud + Social Layer** (7 дней)

**Цель:** Интеграция с Supabase, авторизация, история игр

#### День 8-9: Supabase Setup

- [ ] Создать проект в Supabase
- [ ] Настроить таблицы:
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

- [ ] Настроить Row Level Security (RLS):
  - [ ] Игроки видят только свои игры
  - [ ] Только участники могут обновлять игру
- [ ] Добавить environment variables в Vercel

#### День 10-11: Авторизация

- [ ] Установить `@supabase/supabase-js` и `@supabase/auth-helpers-nextjs`
- [ ] Создать `lib/supabase.ts` (client + server)
- [ ] **Auth Screen** (`app/auth/page.tsx`):
  - [ ] Email/Password форма
  - [ ] Magic Link опция
  - [ ] "Continue as Guest" (anonymous)
- [ ] Middleware для защищенных роутов
- [ ] Профиль пользователя (`app/profile/page.tsx`)

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

#### День 15-16: PWA Setup

- [ ] Установить `@ducanh2912/next-pwa`
- [ ] Настроить Service Worker:
  - [ ] Кеш статики
  - [ ] Офлайн fallback
  - [ ] Background sync для игр
- [ ] Создать иконки:
  - [ ] 192x192
  - [ ] 512x512
  - [ ] Favicon, Apple Touch Icon
- [ ] Тестирование установки на iOS/Android

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
2. ⏳ Игровая логика (MISS, POT, BLACK)
3. ⏳ UI компоненты (players, life bars, buttons)
4. ⏳ Экраны: Home, New Game, Game, Winner
5. ⏳ PWA с офлайн-режимом
6. ⏳ Supabase интеграция
7. ⏳ История игр

### 🟡 Важные (Should Have)

8. ⏳ Авторизация (email/password)
9. ⏳ Framer Motion анимации
10. ⏳ Export/Share функциональность
11. ⏳ Профили игроков
12. ⏳ Responsive design

### 🟢 Желательные (Nice to Have)

13. ⏳ Realtime мультиплеер
14. ⏳ QR invites
15. ⏳ Достижения/badges
16. ⏳ Статистика игрока
17. ⏳ Light mode
18. ⏳ Социальные login (Google, Apple)

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
**Последнее обновление:** 15 ноября 2025
**Статус:** 🟢 Активная разработка
