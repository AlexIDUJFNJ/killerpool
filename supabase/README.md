# Supabase Setup Guide

Этот гайд поможет настроить Supabase для проекта Killerpool.

> **Обновлено:** 2026-08-11. Документ описывает фактическое состояние после миграции `00012`.

## 🚀 Быстрый старт

### 1. Создайте проект в Supabase

1. Зайдите на [supabase.com](https://supabase.com)
2. Нажмите "New Project"
3. Заполните:
   - **Name:** killerpool
   - **Database Password:** (сохраните в безопасном месте)
   - **Region:** Frankfurt (приложение деплоится на Vercel в регион `fra1`)
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

⚠️ **ВАЖНО:** Нужно применить ВСЕ 12 миграций строго по порядку номеров (00001 → 00012). Поздние миграции удаляют и переопределяют политики и функции ранних — итоговое состояние БД определяется только полной последовательностью.

#### Вариант A: Supabase CLI (рекомендуется)

```bash
# Установите Supabase CLI
npm install -g supabase

# Войдите в аккаунт
supabase login

# Свяжите локальный проект с Supabase
supabase link --project-ref your-project-ref

# Примените миграции (применяет все файлы supabase/migrations/ по порядку)
supabase db push
```

#### Вариант B: SQL Editor

Откройте **SQL Editor** в Supabase Dashboard и выполните содержимое каждого файла из `supabase/migrations/` по порядку, от `00001` до `00012`. После каждого запуска убедитесь, что нет ошибок.

### 5. Проверьте таблицы и функции

**Проверка таблиц** (Table Editor):

- ✅ `player_profiles`
- ✅ `games`
- ✅ `rulesets`
- ✅ `user_achievements`

**Проверка функций** (Database → Functions): `get_leaderboard`, `check_achievements`. Или в SQL Editor:

```sql
SELECT * FROM get_leaderboard(15);
```

Должно вернуться 0 строк (если нет завершённых игр) или список игроков.

**Проверка Realtime:** миграция `00009` добавляет таблицу `games` в publication `supabase_realtime`. Убедитесь в **Database** → **Replication**, что для `games` включена репликация — без этого не работает режим зрителя (live sharing).

## 📜 Миграции (все 11)

| # | Файл | Назначение |
|---|------|-----------|
| 00001 | `00001_initial_schema.sql` | Таблицы `player_profiles`, `games`, `rulesets`; enum `game_status`; RLS-политики; триггеры `updated_at`; сид дефолтного ruleset "Classic Killer Pool" |
| 00002 | `00002_leaderboard_function.sql` | Первая версия функции `get_leaderboard` (без SECURITY DEFINER) |
| 00003 | `00003_fix_leaderboard_and_profile.sql` | UNIQUE constraint на `player_profiles.user_id` (для upsert); `get_leaderboard` v2 с `SECURITY DEFINER` (обход RLS для глобального лидерборда) |
| 00004 | `00004_fix_uuid_min_issue.sql` | Повторная чистка дубликатов `user_id` через `DISTINCT ON` (вместо `MIN(id)`, который не работает с UUID); идемпотентное добавление constraint |
| 00005 | `00005_fix_leaderboard_grouping.sql` | `get_leaderboard` v3 (**актуальная**): группировка по `COALESCE(userId, player_id)`, чтобы один игрок не появлялся в лидерборде несколько раз; невалидные `userId` (не-UUID) отбрасываются в NULL |
| 00006 | `00006_public_game_access.sql` | Публичное чтение игр по ссылке: SELECT для anon и authenticated `USING (true)`; INSERT для anon |
| 00007 | `00007_achievements.sql` | Таблица `user_achievements`, её RLS-политики, первая версия функции `check_achievements` |
| 00008 | `00008_live_sharing_policies.sql` | Промежуточная правка политик `games` для live sharing (полностью пересоздаются в 00009) |
| 00009 | `00009_fix_live_sharing_policies.sql` | **Финальные** политики `games`: DROP всех прежних, 6 чистых политик `games_*` (см. ниже); добавление `games` в publication `supabase_realtime` |
| 00010 | `00010_add_current_player_index.sql` | Колонка `games.current_player_index INTEGER DEFAULT 0` — синхронизация текущего хода для зрителей |
| 00011 | `00011_fix_achievements_and_defaults.sql` | `check_achievements` v2 (**актуальная**): требование `p_user_id = auth.uid()`, REVOKE EXECUTE у PUBLIC/anon, текстовые сравнения id, regex-защита кастов, статистика победителя, все 10 типов ачивок (включая `perfect_game`, `win_streak_3`, `win_streak_5`); GIN-индекс `idx_games_participants_gin`; UPDATE дефолтного ruleset `max_lives` 10 → 6; DROP политик "Service role can insert achievements" и "Users can view own achievements" на `user_achievements` |
| 00012 | `00012_harden_leaderboard.sql` | `get_leaderboard` v4 (**актуальная**): убраны касты клиентского JSON — `games` анонимно-записываема, и одна игра с не-UUID `participants[].id` роняла RPC для всех (DoS). Сравнения id текстом с `lower()`, единственный `::uuid` защищён regex'ом, `jsonb_array_elements` за проверкой типа, победы считаются по уникальным играм (раньше 50 копий победителя в одной игре давали 50 побед), запасное `display_name` берётся из самой свежей игры, `limit_count` ограничен диапазоном 0–100 |

## 📊 Структура базы данных

### Таблица: `player_profiles`

Хранит профили игроков (привязаны к `auth.users`).

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | UUID | Primary key |
| user_id | UUID | Ссылка на auth.users (UNIQUE, nullable) |
| display_name | TEXT | Имя игрока (1-50 символов) |
| avatar_url | TEXT | URL аватара |
| created_at | TIMESTAMPTZ | Дата создания |
| updated_at | TIMESTAMPTZ | Дата обновления (триггер) |

### Таблица: `games`

Хранит игровые сессии. Состояние игры живёт на клиенте (GameProvider + localStorage); хост при включённом live sharing upsert'ит полную строку игры на каждое действие (`syncActiveGameToSupabase` в `lib/sync.ts`), зрители подписаны на `postgres_changes` UPDATE по `id` (`lib/realtime.ts`, канал `game:{id}`).

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | UUID | Primary key |
| created_at | TIMESTAMPTZ | Дата создания |
| updated_at | TIMESTAMPTZ | Дата обновления (триггер) |
| status | game_status | 'active', 'completed', 'abandoned' |
| participants | JSONB | Массив игроков (минимум 2) |
| winner_id | UUID | ID победителя (participant id) |
| ruleset_id | UUID | Ссылка на ruleset (ON DELETE SET NULL) |
| history | JSONB | История действий (массив) |
| created_by | UUID | Ссылка на auth.users; NULL для гостевых игр |
| current_player_index | INTEGER | Индекс текущего игрока (default 0), для зрителей |

**Формат `participants`** (ключи camelCase, соответствуют интерфейсу `Player` из `lib/types.ts` — именно `userId`, не `user_id`):

```json
[
  {
    "id": "uuid",
    "name": "Player 1",
    "avatar": "🎱",
    "lives": 3,
    "eliminated": false,
    "userId": "uuid-or-null"
  }
]
```

⚠️ `userId` заполняется **только у первого игрока** (создателя игры): это `user.id` авторизованного пользователя или гостевой UUID из localStorage (`killerpool_guest_id`). Остальные игроки имеют `userId: null` и трекаются в лидерборде по своему `id`.

**Формат `history`** (интерфейс `GameHistoryEntry` из `lib/types.ts`):

```json
[
  {
    "id": "uuid",
    "action": "miss",
    "playerId": "uuid",
    "playerName": "Player 1",
    "timestamp": "2026-07-07T12:00:00Z",
    "livesBefore": 3,
    "livesAfter": 2
  }
]
```

Обратный маппинг строки БД в клиентский `Game` делает `mapDbGameToGame` (`lib/game-mapper.ts`); ruleset при этом всегда `DEFAULT_RULESET`.

### Таблица: `rulesets`

Хранит правила игры.

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | UUID | Primary key |
| name | TEXT | Название ruleset (1-100 символов) |
| description | TEXT | Описание |
| params | JSONB | Параметры (обязательны ключи starting_lives, miss, pot, pot_black) |
| created_at | TIMESTAMPTZ | Дата создания |
| is_default | BOOLEAN | Default ruleset для новых игр |

**`params` дефолтного "Classic Killer Pool"** (после миграции 00011 совпадает с `DEFAULT_RULESET` клиента):

```json
{
  "starting_lives": 3,
  "miss": -1,
  "pot": 0,
  "pot_black": 1,
  "max_lives": 6
}
```

### Таблица: `user_achievements`

Хранит разблокированные ачивки (только для авторизованных пользователей).

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | UUID | Primary key |
| user_id | UUID | Ссылка на auth.users (NOT NULL, ON DELETE CASCADE) |
| achievement_type | TEXT | Тип ачивки (UNIQUE вместе с user_id) |
| unlocked_at | TIMESTAMPTZ | Когда разблокирована |
| game_id | UUID | Игра, в которой получена (ON DELETE SET NULL) |

Типы ачивок (10, начисляет `check_achievements`): `first_win`, `wins_10`, `wins_25`, `wins_50`, `win_streak_3`, `win_streak_5`, `survivor` (победа с 1 жизнью), `perfect_game` (победа без потери жизней), `pot_black_master` (5+ pot black за игру), `social_player` (10 завершённых игр с 4+ игроками).

## 🔒 Row Level Security (RLS)

Все таблицы защищены RLS. Ниже — **финальное** состояние после применения всех миграций (`pg_policies` — источник истины: `SELECT * FROM pg_policies WHERE schemaname = 'public';`).

### `games` (миграция 00009 — все прежние политики удалены)

| Политика | Команда | Роли | Правило |
|----------|---------|------|---------|
| `games_select_all` | SELECT | anon, authenticated | `USING (true)` |
| `games_insert_authenticated` | INSERT | authenticated | `WITH CHECK (true)` |
| `games_insert_anon` | INSERT | anon | `WITH CHECK (created_by IS NULL)` |
| `games_update_authenticated` | UPDATE | authenticated | `USING (created_by = auth.uid() OR created_by IS NULL)`, `WITH CHECK (true)` |
| `games_update_anon` | UPDATE | anon | `USING (created_by IS NULL)`, `WITH CHECK (created_by IS NULL)` |
| `games_delete_authenticated` | DELETE | authenticated | `USING (created_by = auth.uid())` |

⚠️ **Чтение игр публичное** (`games_select_all` с `USING (true)`): любой, у кого есть id игры, может её прочитать — это осознанное решение для режима зрителя и шаринга ссылок. Утверждение «пользователь видит только свои игры» было верно лишь для миграции 00001 и давно не соответствует действительности. Гостевые игры (`created_by IS NULL`) может обновлять кто угодно.

### `user_achievements` (после миграции 00011)

| Политика | Команда | Правило |
|----------|---------|---------|
| `Users can view all achievements` | SELECT | `USING (true)` |

INSERT/UPDATE/DELETE-политик **нет**: запись возможна только через RPC `check_achievements` (SECURITY DEFINER обходит RLS). Миграция 00011 удалила политику "Service role can insert achievements", которая на деле позволяла любому авторизованному пользователю вставлять себе произвольные ачивки.

### `player_profiles` (миграция 00001)

- ✅ SELECT: все (`USING (true)`)
- ✅ INSERT: `auth.uid() = user_id OR user_id IS NULL`
- ✅ UPDATE: только свой профиль (`auth.uid() = user_id`)
- ✅ DELETE: только свой профиль (`auth.uid() = user_id`)

### `rulesets` (миграция 00001)

- ✅ SELECT: все (`USING (true)`)
- ✅ INSERT: только authenticated (`WITH CHECK (true)`)

## ⚙️ RPC-функции

### `get_leaderboard` (актуальная версия — миграция 00005)

```sql
get_leaderboard(limit_count INTEGER DEFAULT 15)
RETURNS TABLE (
    player_id UUID,
    display_name TEXT,
    avatar_url TEXT,
    total_games BIGINT,
    games_won BIGINT,
    games_lost BIGINT,
    win_rate NUMERIC,
    total_actions BIGINT,
    total_black_pots BIGINT,
    rank INTEGER
)
```

- `SECURITY DEFINER`, `SET search_path = public`; `GRANT EXECUTE TO authenticated, anon`
- Только игры со `status = 'completed'`
- Группировка по стабильному идентификатору `COALESCE(userId участника, player_id)`; `userId`, не являющийся валидным UUID, приводится к NULL
- Имя: из `player_profiles.display_name` (join по `userId`), иначе имя участника из одной из его игр (подзапрос сортирует `ORDER BY game_id DESC`, а `game_id` — случайный UUID, так что это произвольная игра, не последняя)
- Сортировка: win rate ↓, затем победы ↓, затем игры ↓

Клиент: `supabase.rpc('get_leaderboard', { limit_count: limit })` в `components/leaderboard/leaderboard-list.tsx`.

### `check_achievements` (актуальная версия — миграция 00011)

```sql
check_achievements(p_user_id UUID, p_game_id UUID)
RETURNS TABLE(achievement_type TEXT, is_new BOOLEAN)
```

- `SECURITY DEFINER`, `SET search_path = public, pg_temp`; `EXECUTE` **отозван** у `PUBLIC` и `anon` (по умолчанию Postgres выдаёт его PUBLIC при создании функции — 00007 этого не отзывала), выдан `authenticated` и `service_role`
- Требует `p_user_id = auth.uid()` — вызов с чужим id молча возвращает пусто; начислить ачивки другому пользователю нельзя
- Работает только если игра `completed`, есть `winner_id` и победивший участник имеет `userId = p_user_id` (т.е. ачивки получает только авторизованный победитель-хост)
- Все сравнения id — текстовые (`p->>'id' = winner_id::TEXT`), а `::INTEGER`-касты `lives`/`livesBefore`/`livesAfter` защищены числовым regex — порченый JSON не роняет вызов; `perfect_game` не выдаётся, если у записей победителя нет числовых `livesBefore`/`livesAfter`
- Пер-пользовательские агрегаты префильтруются containment-запросом `participants @> [{"userId": ...}]` под GIN-индекс `idx_games_participants_gin` (создаётся в 00011)
- Вставляет заработанные ачивки анти-джойном (`INSERT ... SELECT ... WHERE NOT EXISTS`, гонка закрыта обработкой `unique_violation`) и возвращает только новые (`is_new = TRUE`)

Клиент: после завершения игры `game-context` вызывает `autoSyncGame` → `checkAchievementsForGame(game)` (`lib/achievements.ts`) → тосты `AchievementToasts` (рендерятся на уровне провайдера); игры, досинхронизированные позже через `retryPendingSyncs`, получают ачивки там же (без тостов).

## 🔐 Настройка Authentication

Приложение использует **Google OAuth (PKCE)** и **Magic Link** (`signInWithOtp` / `signInWithOAuth` в `app/auth/page.tsx`; обмен кода в `app/auth/callback/route.ts` с редиректом на `/`). Парольного входа нет. Гостевой режим не создаёт auth-запись — используется стабильный UUID в localStorage (`killerpool_guest_id`) с ролью `anon`.

### 1. Email (Magic Link)

1. В Supabase Dashboard: **Authentication** → **Providers**
2. Убедитесь, что **Email** включен
3. Настройте шаблон **Magic Link** в **Email Templates** (опционально)

### 2. Google OAuth

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
3. Вставьте **Client ID** и **Client Secret**
4. Нажмите **Save**

#### Шаг 3: Проверьте OAuth consent screen

1. В **OAuth consent screen** настройте:
   - **User Type:** External
   - **App name:** Killerpool
   - **User support email** и **Developer contact information:** ваш email
2. Добавьте **Scopes:** `userinfo.email`, `userinfo.profile`

### Route protection

Защищён только маршрут `/profile` (redirect на `/auth` для неавторизованных); авторизованного с `/auth` редиректит на `/`. Refresh сессии выполняет `proxy.ts` (конвенция Next.js 16 вместо `middleware.ts`) через `updateSession()` из `lib/supabase/middleware.ts`.

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

Актуальные типы лежат в `lib/types/database.types.ts` (таблицы `player_profiles`, `games`, `user_achievements`, `rulesets`; функции `get_leaderboard`, `check_achievements`; enum `game_status`).

### Сброс базы данных (⚠️ удалит все данные!)

```bash
supabase db reset
```

### Создание новой миграции

```bash
supabase migration new your_migration_name
```

## 🧭 Planned / Not implemented

Идеи из ранних версий этого документа, которые **не реализованы**:

- Social providers: Apple, GitHub, Discord
- Парольная аутентификация (сейчас только Magic Link + Google OAuth)
- Кастомные rulesets в UI (таблица и INSERT-политика есть, клиент всегда использует `DEFAULT_RULESET`)
- Ужесточение публичных политик `games` (сейчас чтение всех игр и обновление гостевых игр доступно любому — принято как trade-off ради live sharing)

## 🔗 Полезные ссылки

- [Supabase Documentation](https://supabase.com/docs)
- [Next.js + Supabase Guide](https://supabase.com/docs/guides/getting-started/quickstarts/nextjs)
- [Row Level Security](https://supabase.com/docs/guides/auth/row-level-security)

---

**Готово!** Теперь ваш проект настроен для работы с Supabase 🎉

_Последнее обновление: 2026-07-07_
