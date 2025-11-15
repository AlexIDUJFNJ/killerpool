# 🎱 Killerpool

Современное PWA-приложение для управления игрой в "Killer Pool" (бильярд).

## 🚀 Технологический стек

- **Next.js 15** (App Router)
- **React 19**
- **TypeScript**
- **TailwindCSS 4** + shadcn/ui
- **Framer Motion** (анимации)
- **Supabase** (БД, авторизация)
- **Vercel** (деплой)

## 📦 Установка

```bash
# Установка зависимостей
npm install

# Копируйте .env.local.example в .env.local и заполните переменные
cp .env.local.example .env.local

# Запуск в режиме разработки
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
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

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
├── app/              # Next.js App Router
│   ├── layout.tsx    # Корневой layout
│   ├── page.tsx      # Главная страница
│   └── globals.css   # Глобальные стили
├── components/       # React компоненты
├── lib/              # Утилиты
├── public/           # Статические файлы
└── killerpool-app-technical-doc.pdf  # Техническая документация
```

## 📄 Документация

Подробная техническая документация находится в файле `killerpool-app-technical-doc.pdf`.