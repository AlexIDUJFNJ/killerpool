# Supabase Setup Guide

Этот гайд поможет настроить Supabase для проекта Killerpool.

## 🚀 Быстрый старт

### 1. Создайте проект в Supabase

1. Зайдите на [supabase.com](https://supabase.com)
2. Нажмите "New Project"
3. Заполните:
   - **Name:** killerpool
   - **Database Password:** (сохраните в безопасном месте)
   - **Region:** Frankfurt (ближайший к Европе)
   - **Pricing Plan:** Free (для начала)
4. Нажмите "Create new project"

### 2. Получите API ключи

1. В левом меню выберите **Settings** → **API**
2. Скопируйте:
   - **Project URL** (например, `https://xxxxx.supabase.co`)
   - **anon public** key
   - **service_role** key (⚠️ держите в секрете!)

### 3. Настройте environment variables

Создайте файл `.env.local` в корне проекта:

```bash
cp .env.local.example .env.local
```

Откройте `.env.local` и вставьте ваши ключи:

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 4. Запустите миграции

⚠️ **ВАЖНО:** Нужно запустить ВСЕ миграции по порядку!

#### Вариант A: SQL Editor (рекомендуется для начала)

**Миграция 1: Создание таблиц**

1. Откройте **SQL Editor** в Supabase Dashboard
2. Скопируйте содержимое `supabase/migrations/00001_initial_schema.sql`
3. Вставьте в SQL Editor
4. Нажмите **Run** или `Ctrl+Enter`
5. Убедитесь, что нет ошибок (должно быть "Success. No rows returned")

**Миграция 2: Создание функции leaderboard**

1. В том же **SQL Editor** очистите поле
2. Скопируйте содержимое `supabase/migrations/00002_leaderboard_function.sql`
3. Вставьте в SQL Editor
4. Нажмите **Run** или `Ctrl+Enter`
5. Убедитесь, что нет ошибок

**Миграция 3: Исправления для leaderboard и профиля** ⚡ НОВОЕ!

1. В том же **SQL Editor** очистите поле
2. Скопируйте содержимое `supabase/migrations/00003_fix_leaderboard_and_profile.sql`
3. Вставьте в SQL Editor
4. Нажмите **Run** или `Ctrl+Enter`
5. Убедитесь, что нет ошибок

Что исправляет эта миграция:
- ✅ Лидерборд теперь показывает всех игроков (был виден только свой аккаунт)
- ✅ Исправлено обновление Display Name в настройках профиля
- ✅ Добавлен UNIQUE constraint на `user_id` в таблице `player_profiles`
- ✅ Функция `get_leaderboard` теперь использует `SECURITY DEFINER` для обхода RLS

#### Вариант B: Supabase CLI (для продвинутых)

```bash
# Установите Supabase CLI
npm install -g supabase

# Войдите в аккаунт
supabase login

# Свяжите локальный проект с Supabase
supabase link --project-ref your-project-ref

# Примените миграции (применяет все файлы в порядке)
supabase db push
```

### 5. Проверьте таблицы и функции

**Проверка таблиц:**

В Supabase Dashboard откройте **Table Editor** и убедитесь, что созданы таблицы:

- ✅ `player_profiles`
- ✅ `games`
- ✅ `rulesets`

**Проверка функции leaderboard:**

1. Откройте **Database** → **Functions** в Supabase Dashboard
2. Убедитесь, что создана функция `get_leaderboard`
3. Или запустите в SQL Editor:
   ```sql
   SELECT get_leaderboard(15);
   ```
   Должно вернуться 0 строк (если нет игр) или список игроков

## 📊 Структура базы данных

### Таблица: `player_profiles`

Хранит профили игроков (привязаны к `auth.users` или анонимные).

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | UUID | Primary key |
| user_id | UUID | Ссылка на auth.users (UNIQUE, nullable для гостей) |
| display_name | TEXT | Имя игрока (1-50 символов) |
| avatar_url | TEXT | URL аватара |
| created_at | TIMESTAMPTZ | Дата создания |
| updated_at | TIMESTAMPTZ | Дата обновления |

### Таблица: `games`

Хранит игровые сессии.

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | UUID | Primary key |
| created_at | TIMESTAMPTZ | Дата создания |
| updated_at | TIMESTAMPTZ | Дата обновления |
| status | ENUM | 'active', 'completed', 'abandoned' |
| participants | JSONB | Массив игроков с жизнями |
| winner_id | UUID | ID победителя |
| ruleset_id | UUID | Ссылка на ruleset |
| history | JSONB | История действий в игре |
| created_by | UUID | ID создателя игры |

**Пример `participants`:**
```json
[
  {
    "id": "uuid",
    "name": "Player 1",
    "avatar": "🎱",
    "lives": 3,
    "eliminated": false,
    "user_id": "uuid-or-null"
  }
]
```

**Пример `history`:**
```json
[
  {
    "action": "miss",
    "player_id": "uuid",
    "timestamp": "2025-11-15T12:00:00Z",
    "lives_before": 3,
    "lives_after": 2
  }
]
```

### Таблица: `rulesets`

Хранит правила игры.

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | UUID | Primary key |
| name | TEXT | Название ruleset |
| description | TEXT | Описание |
| params | JSONB | Параметры игры |
| created_at | TIMESTAMPTZ | Дата создания |
| is_default | BOOLEAN | Default ruleset для новых игр |

**Пример `params`:**
```json
{
  "starting_lives": 3,
  "miss": -1,
  "pot": 0,
  "pot_black": 1,
  "max_lives": 6
}
```

## 🔒 Row Level Security (RLS)

Все таблицы защищены Row Level Security:

### `player_profiles`
- ✅ Все могут читать профили
- ✅ Пользователи могут создавать свой профиль
- ✅ Пользователи могут обновлять только свой профиль
- ✅ Пользователи могут удалять только свой профиль

### `games`
- ✅ Пользователи видят только свои игры
- ✅ Создатель игры может её обновлять
- ✅ Анонимные пользователи могут создавать и управлять играми (для offline-режима)
- ⚡ **Функция `get_leaderboard` использует SECURITY DEFINER** и видит все завершенные игры для расчета глобального лидерборда

### `rulesets`
- ✅ Все могут читать rulesets
- ✅ Аутентифицированные пользователи могут создавать кастомные rulesets

## 🔐 Настройка Authentication

### 1. Email Authentication

1. В Supabase Dashboard: **Authentication** → **Providers**
2. Убедитесь, что **Email** включен
3. Настройте **Email Templates** (опционально):
   - Confirmation
   - Magic Link
   - Password Recovery

### 2. Google OAuth (рекомендуется)

#### Шаг 1: Создайте Google OAuth клиент

1. Зайдите в [Google Cloud Console](https://console.cloud.google.com/)
2. Создайте новый проект или выберите существующий
3. Перейдите в **APIs & Services** → **Credentials**
4. Нажмите **Create Credentials** → **OAuth client ID**
5. Выберите тип приложения: **Web application**
6. Настройте:
   - **Name:** Killerpool
   - **Authorized JavaScript origins:**
     - `http://localhost:3000` (для разработки)
     - `https://your-app-url.vercel.app` (для production)
   - **Authorized redirect URIs:**
     - `https://your-project-ref.supabase.co/auth/v1/callback` (замените на ваш Supabase URL)
7. Нажмите **Create**
8. Скопируйте **Client ID** и **Client Secret**

#### Шаг 2: Настройте Google Provider в Supabase

1. В Supabase Dashboard: **Authentication** → **Providers**
2. Найдите **Google** и включите его
3. Вставьте:
   - **Client ID** (из Google Cloud Console)
   - **Client Secret** (из Google Cloud Console)
4. Нажмите **Save**

#### Шаг 3: Проверьте настройки

1. Убедитесь, что в Google Cloud Console включен **Google+ API**
2. В **OAuth consent screen** настройте:
   - **User Type:** External
   - **App name:** Killerpool
   - **User support email:** ваш email
   - **Developer contact information:** ваш email
3. Добавьте **Scopes:**
   - `userinfo.email`
   - `userinfo.profile`

### 3. Другие Social Providers (опционально)

- **Apple**: Для iOS пользователей
- **GitHub**: Для разработчиков
- **Discord**: Для игрового сообщества

Для каждого провайдера нужны OAuth credentials.

### 4. Email Settings

1. **Authentication** → **Email Auth**
2. Настройте:
   - ✅ **Enable Email Confirmations** (для production)
   - ⏸️ **Disable Email Confirmations** (для development)
   - **Minimum Password Length:** 8

## 🌐 Vercel Environment Variables

Когда задеплоите на Vercel, добавьте переменные:

1. Зайдите в Vercel Dashboard → Project Settings → Environment Variables
2. Добавьте:

```
NEXT_PUBLIC_SUPABASE_URL = https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY = your-anon-key
SUPABASE_SERVICE_ROLE_KEY = your-service-role-key
NEXT_PUBLIC_APP_URL = https://killerpool.app
```

3. Scope: **Production**, **Preview**, **Development**

## 📝 Полезные команды

### Генерация TypeScript типов

```bash
npx supabase gen types typescript --project-id your-project-id > lib/types/database.types.ts
```

### Сброс базы данных (⚠️ удалит все данные!)

```bash
supabase db reset
```

### Создание новой миграции

```bash
supabase migration new your_migration_name
```

## 🔗 Полезные ссылки

- [Supabase Documentation](https://supabase.com/docs)
- [Next.js + Supabase Guide](https://supabase.com/docs/guides/getting-started/quickstarts/nextjs)
- [Supabase Auth Helpers](https://supabase.com/docs/guides/auth/auth-helpers/nextjs)
- [Row Level Security](https://supabase.com/docs/guides/auth/row-level-security)

---

**Готово!** Теперь ваш проект настроен для работы с Supabase 🎉
