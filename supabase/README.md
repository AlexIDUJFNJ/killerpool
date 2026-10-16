# Supabase Setup Guide

Этот гайд поможет настроить Supabase для проекта Killerpool.

> **Обновлено:** 2026-10-16. Документ описывает фактическое состояние после миграции `00016`.

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

### 3. Настройте environment variables

Создайте файл `.env.local` в корне проекта:

```bash
cp .env.local.example .env.local
```

Откройте `.env.local` и вставьте ваши ключи:

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Service-role ключ здесь не нужен: приложение работает с Supabase только из
браузера под ролями `anon`/`authenticated`, и в коде он нигде не читается.

### 4. Запустите миграции

⚠️ **ВАЖНО:** Нужно применить ВСЕ 16 миграций строго по порядку номеров (00001 → 00016). Поздние миграции удаляют и переопределяют политики и функции ранних — итоговое состояние БД определяется только полной последовательностью.

Для **нового** проекта (пустая база, пустой журнал миграций):

```bash
brew install supabase/tap/supabase   # глобальная установка через npm CLI не поддерживает; есть ещё `npx supabase …`
supabase login
supabase link --project-ref your-project-ref
supabase db push            # накатывает все файлы supabase/migrations/ по порядку
```

Для **существующего** продакшен-проекта Killerpool `db push` в лоб запускать нельзя — см. [Применение миграций к проду](#-применение-миграций-к-проду).

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

## 📜 Миграции (все 16)

| # | Файл | Назначение |
|---|------|-----------|
| 00001 | `00001_initial_schema.sql` | Таблицы `player_profiles`, `games`, `rulesets`; enum `game_status`; RLS-политики; триггеры `updated_at`; сид дефолтного ruleset "Classic Killer Pool" |
| 00002 | `00002_leaderboard_function.sql` | Первая версия функции `get_leaderboard` (без SECURITY DEFINER) |
| 00003 | `00003_fix_leaderboard_and_profile.sql` | UNIQUE constraint на `player_profiles.user_id` (для upsert); `get_leaderboard` v2 с `SECURITY DEFINER` (обход RLS для глобального лидерборда) |
| 00004 | `00004_fix_uuid_min_issue.sql` | Повторная чистка дубликатов `user_id` через `DISTINCT ON` (вместо `MIN(id)`, который не работает с UUID); идемпотентное добавление constraint |
| 00005 | `00005_fix_leaderboard_grouping.sql` | `get_leaderboard` v3: группировка по `COALESCE(userId, player_id)`, чтобы один игрок не появлялся в лидерборде несколько раз; невалидные `userId` (не-UUID) отбрасываются в NULL |
| 00006 | `00006_public_game_access.sql` | Публичное чтение игр по ссылке: SELECT для anon и authenticated `USING (true)`; INSERT для anon |
| 00007 | `00007_achievements.sql` | Таблица `user_achievements`, её RLS-политики, первая версия функции `check_achievements` |
| 00008 | `00008_live_sharing_policies.sql` | Промежуточная правка политик `games` для live sharing (полностью пересоздаются в 00009) |
| 00009 | `00009_fix_live_sharing_policies.sql` | Политики `games` пересозданы начисто (условия записи позже ужесточены в 00014): DROP всех прежних, 6 чистых политик `games_*` (см. ниже); добавление `games` в publication `supabase_realtime` |
| 00010 | `00010_add_current_player_index.sql` | Колонка `games.current_player_index INTEGER DEFAULT 0` — синхронизация текущего хода для зрителей |
| 00011 | `00011_fix_achievements_and_defaults.sql` | `check_achievements` v2 (в 00015 заменена на v3 с одной правкой): требование `p_user_id = auth.uid()`, REVOKE EXECUTE у PUBLIC/anon, текстовые сравнения id, regex-защита кастов, статистика победителя, все 10 типов ачивок (включая `perfect_game`, `win_streak_3`, `win_streak_5`); GIN-индекс `idx_games_participants_gin`; UPDATE дефолтного ruleset `max_lives` 10 → 6; DROP политик "Service role can insert achievements" и "Users can view own achievements" на `user_achievements` |
| 00012 | `00012_harden_leaderboard.sql` | `get_leaderboard` v4: убраны касты клиентского JSON — `games` анонимно-записываема, и одна игра с не-UUID `participants[].id` роняла RPC для всех (DoS). Сравнения id текстом с `lower()`, единственный `::uuid` защищён regex'ом, `jsonb_array_elements` за проверкой типа, победы считаются по уникальным играм (раньше 50 копий победителя в одной игре давали 50 побед), запасное `display_name` берётся из самой свежей игры, `limit_count` ограничен диапазоном 0–100 |
| 00013 | `00013_leaderboard_qualifying_minimum.sql` | `get_leaderboard` v5 (**актуальная**): параметр `min_games` (по умолчанию 3) — в рейтинг попадают только сыгравшие достаточно партий, иначе разовый победитель со 100% всегда стоял выше регулярного игрока. Старая односигнатурная функция удалена через `DROP FUNCTION`, потому что добавление параметра создало бы вторую перегрузку, и вызов с одним аргументом продолжил бы попадать в старую |
| 00014 | `00014_tighten_game_write_policies.sql` | Ужесточение записи в `games`: у авторизованного `WITH CHECK (created_by = auth.uid())` на INSERT и UPDATE и `USING` без `OR created_by IS NULL` — закрывает захват чужой гостевой игры (после него настоящий хост-гость терял доступ навсегда) и подделку владения. Для `anon` завершённая игра перестаёт принимать записи через час после последней — окно, а не жёсткий запрет, потому что завершение это три гоночные записи, а отмена после победы легальна (политика `games_update_anon` переписана в 00015). Проверено под ролями: `supabase/test/` |
| 00015 | `00015_game_integrity_and_spam_limits.sql` | **Актуальное состояние** `games` (кроме `games_update_anon`, переписанной в 00016), профилей, rulesets, `check_achievements` и `get_leaderboard`. (1) Даты принадлежат серверу: триггер `games_server_timestamps` вместо `update_games_updated_at` — на INSERT `created_at := LEAST(клиентская, now())`, `updated_at := now()`, на UPDATE `created_at` неизменен; строки с датами в будущем исправлены; у `update_updated_at_column` задан `search_path`. (2) Гостевая игра записываема для `anon` 24 часа от серверного `created_at`; `completed` и `abandoned` замерзают через час после последней записи. (3) Удаление аккаунта (`ON DELETE SET NULL`) не считается записью: даты сохраняются, незаконченные игры становятся `abandoned`. (4) CHECK: ≤ 32 участника, ≤ 1000 записей `history`, ≤ 512 КиБ JSON. (5) CHECK: `winner_id` — NULL или id участника. Все четыре — `NOT VALID` + `VALIDATE` в подтранзакции. (6) Профиль вставляет только `authenticated` и только свой; INSERT в `rulesets` закрыт; default-ruleset уникален. (7) `check_achievements` v3: `perfect_game` не выдаётся при пустой истории победителя. (8) Подделка зарегистрированного игрока: `get_leaderboard` v6 и `check_achievements` v3 засчитывают `userId`-аккаунт только в играх с `created_by` этого аккаунта; участник, чей `id` — uid аккаунта, отбрасывается. guestId группирует гостя-хоста, как раньше, в том числе в игре, усыновлённой после входа |
| 00016 | `00016_host_secret.sql` | **Секрет хоста** — зритель больше не может переписать идущую гостевую игру. Колонка `games.host_secret_hash` (hex SHA-256, CHECK `games_host_secret_hash_format`): её пишет первый INSERT с устройства хоста, а триггер `games_keep_host_secret` на каждом UPDATE возвращает OLD, так что хеш нельзя ни подменить, ни стереть, ни поставить на старую строку. `games_update_anon` = условия 00015 плюс `host_secret_hash IS NULL OR host_secret_hash = hex(sha256(заголовок x-host-secret))`: PostgREST кладёт заголовки в GUC `request.headers`, хеш считает встроенная `sha256` (не pgcrypto). Нет заголовка, пустой, неверный — отказ (42501 на upsert, 0 строк на PATCH). Строки с NULL (старый клиент, нет `crypto.subtle`) пишутся как раньше. `games_insert_anon` и политики `authenticated` не тронуты. **Выкладка: сначала миграция, потом клиент**, и между ними — проверка, что gateway передаёт заголовок (см. [Применение миграций к проду](#-применение-миграций-к-проду)) |

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
| created_at | TIMESTAMPTZ | Дата игры. На INSERT — клиентская, но не позже `now()` (офлайн-игра, залитая через дни, сохраняет свою дату); дальше не меняется (триггер `games_server_timestamps`) |
| updated_at | TIMESTAMPTZ | Время последней записи по часам сервера, на INSERT и UPDATE (триггер) |
| status | game_status | 'active', 'completed', 'abandoned' |
| participants | JSONB | Массив игроков: от 2 до 32 |
| winner_id | UUID | ID победителя: NULL или `id` одного из `participants` |
| ruleset_id | UUID | Ссылка на ruleset (ON DELETE SET NULL) |
| history | JSONB | История действий (массив, не больше 1000 записей) |
| created_by | UUID | Ссылка на auth.users (ON DELETE SET NULL); NULL для гостевых игр |
| current_player_index | INTEGER | Индекс текущего игрока (default 0), для зрителей |
| host_secret_hash | TEXT | `hex(sha256(секрет хоста))`, 64 символа `[0-9a-f]` или NULL (00016). Пишется только первым INSERT, дальше неизменен (триггер `games_keep_host_secret`). Сам секрет живёт только на устройстве хоста (localStorage `killerpool_host_secrets`) и уходит в заголовке `x-host-secret`; хеш публичен, как вся строка, но по нему секрет (256 бит) не восстановить |

Ограничения строки (00015): `games_participants_max` (≤ 32), `games_history_max` (≤ 1000), `games_payload_size` (`participants` + `history` ≤ 512 КиБ JSON-текста), `games_winner_is_participant`. Нарушение — `23514 check_violation`; клиент (`lib/sync.ts`) считает этот код окончательным отказом и не повторяет запись. Если на старых данных какое-то ограничение осталось `NOT VALID` (миграция сообщает об этом NOTICE), новые записи оно всё равно проверяет:

```sql
SELECT conname, convalidated FROM pg_constraint
WHERE conrelid = 'games'::regclass AND contype = 'c';
```

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

⚠️ `userId` заполняется **только у игрока, отмеченного в форме новой игры как «это я»** (`isOwner`, `createGame` в `lib/game-logic.ts`) — позиция в списке значения не имеет. Это `user.id` авторизованного пользователя или гостевой UUID из localStorage (`killerpool_guest_id`); если отметку сняли, `userId` нет ни у кого. Остальные игроки имеют `userId: null` и трекаются в лидерборде по своему `id` — для знакомых имён он стабилен между играми (ростер в `lib/storage.ts`). С 00015 лидерборд и ачивки верят `userId`, который является uid аккаунта, только если он равен `created_by` строки; guestId по-прежнему группирует гостя-хоста (см. `get_leaderboard`).

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
| is_default | BOOLEAN | Default ruleset; не больше одного (уникальный частичный индекс `idx_rulesets_one_default`, 00015) |

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

### `games` (00009 создала набор, 00014 ужесточила запись, 00015 ограничила жизнь гостевой записи, 00016 отделила хоста от зрителя)

| Политика | Команда | Роли | Правило |
|----------|---------|------|---------|
| `games_select_all` | SELECT | anon, authenticated | `USING (true)` |
| `games_insert_authenticated` | INSERT | authenticated | `WITH CHECK (created_by = auth.uid())` |
| `games_insert_anon` | INSERT | anon | `WITH CHECK (created_by IS NULL)` |
| `games_update_authenticated` | UPDATE | authenticated | `USING (created_by = auth.uid())`, `WITH CHECK (created_by = auth.uid())` |
| `games_update_anon` | UPDATE | anon | `USING (created_by IS NULL AND created_at > now() - interval '24 hours' AND (status = 'active' OR updated_at > now() - interval '1 hour') AND (host_secret_hash IS NULL OR host_secret_hash = (SELECT encode(sha256(convert_to(<x-host-secret из request.headers>, 'UTF8')), 'hex'))))`, `WITH CHECK (created_by IS NULL)` |
| `games_delete_authenticated` | DELETE | authenticated | `USING (created_by = auth.uid())` |

⚠️ **Чтение игр публичное** (`games_select_all` с `USING (true)`): любой, у кого есть id игры, может её прочитать — это осознанное решение для режима зрителя и шаринга ссылок. Утверждение «пользователь видит только свои игры» было верно лишь для миграции 00001 и давно не соответствует действительности. Гостевую игру (`created_by IS NULL`) с 00016 обновляет только устройство хоста: при старте игры оно генерирует 32 случайных байта, кладёт в строку их SHA-256 (`host_secret_hash`) и каждую запись отправляет с секретом в заголовке `x-host-secret`; зритель знает id, но не секрет. Исключение — строки с `host_secret_hash IS NULL` (их вставил клиент до 00016 или браузер без `crypto.subtle`): такую игру по-прежнему может обновлять любой, у кого есть id. И в любом случае не дольше суток от `created_at`, а завершённая или брошенная игра замерзает через час после последней записи — см. 00014 и 00015. Оба условия проверяются по старой строке (`USING`), поэтому три гоночные записи завершения и отмена победы проходят, а заливка офлайн-игры через несколько дней — это INSERT, на него ограничения не действуют. Цена: игра, возобновлённая больше чем через сутки после начала, или устройство с часами, отстающими больше чем на сутки, для гостя дальше первой записи не пишется (у авторизованного ограничений по времени нет).

### `user_achievements` (после миграции 00011)

| Политика | Команда | Правило |
|----------|---------|---------|
| `Users can view all achievements` | SELECT | `USING (true)` |

INSERT/UPDATE/DELETE-политик **нет**: запись возможна только через RPC `check_achievements` (SECURITY DEFINER обходит RLS). Миграция 00011 удалила политику "Service role can insert achievements", которая на деле позволяла любому авторизованному пользователю вставлять себе произвольные ачивки.

### `player_profiles` (миграция 00001, INSERT — 00015)

- ✅ SELECT: все (`USING (true)`)
- ✅ INSERT: только `authenticated` и только свой (`WITH CHECK (user_id = auth.uid())`). До 00015 политика была без `TO` и с `OR user_id IS NULL`: `anon` мог плодить профили без владельца, а UNIQUE пропускает сколько угодно NULL
- ✅ UPDATE: только свой профиль (`auth.uid() = user_id`)
- ✅ DELETE: только свой профиль (`auth.uid() = user_id`)

### `rulesets` (миграция 00001, INSERT закрыт в 00015)

- ✅ SELECT: все (`USING (true)`)
- ⛔ INSERT/UPDATE/DELETE: политик нет — никто из клиентов не пишет. Клиент играет `DEFAULT_RULESET` из `lib/types.ts` и таблицу не трогает; прежняя `"Authenticated users can create rulesets"` с `WITH CHECK (true)` удалена

## ⚙️ RPC-функции

### `get_leaderboard` (актуальная версия — v6, миграция 00015; сигнатура из v5, 00013)

```sql
get_leaderboard(limit_count INTEGER DEFAULT 15, min_games INTEGER DEFAULT 3)
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

- `SECURITY DEFINER`, `SET search_path = public, pg_temp` (`pg_temp` последним и явно: иначе Postgres ищет временные объекты первыми — опасно для SECURITY DEFINER); `GRANT EXECUTE TO authenticated, anon`
- Только игры со `status = 'completed'`
- Группировка по стабильному идентификатору — `userId` участника или его `participants[].id`. С v6 (00015) — по правилу:

  | `userId` участника | Ключ группировки |
  |---|---|
  | пуст или не UUID | `participants[].id` |
  | не uid аккаунта (guestId устройства) | `userId` — как в 00012/00013, поэтому игры гостя-хоста складываются, включая игры до ростера, когда каждая игра выдавала новые id |
  | uid аккаунта, и `created_by` строки = он | `userId` — своя игра аккаунта |
  | uid аккаунта, но `created_by` другой или NULL | `participants[].id` — подделка или чужая запись |

  «uid аккаунта» — значение из `player_profiles.user_id` или `games.created_by`: обе колонки — FK на `auth.users`, обе в `public`, поэтому функции не нужен доступ к схеме `auth` (потеря SELECT на `auth.users` уронила бы весь лидерборд). Набор считается один раз за вызов и соединяется хешем по тексту. Подделать `created_by` не может никто, кроме самого аккаунта, а честная игра залогиненного всегда пишется с ним (`rowOwner` в `lib/sync.ts`). Гостевая игра, усыновлённая первым INSERT после входа (`created_by` = uid, у хоста guestId), считается вместе с остальными гостевыми играми устройства под guestId. `userId`, не являющийся валидным UUID, приводится к NULL
- Участник, сгруппированный по `participants[].id`, чей `id` — uid аккаунта, отбрасывается: иначе uid жертвы просто переносят из `userId` в `id`, и строка сливается с её строкой и забирает имя профиля
- Цена для старых данных: игры, которые старый клиент записал анонимно или под другим аккаунтом, хотя созданы под аккаунтом, этому аккаунту больше не засчитываются. uid удалённого аккаунта (профиль удалён каскадом, `created_by` обнулён) ведёт себя как guestId — его игры складываются под ним, как в 00013. Остаток: аккаунт, который ещё ничего не записал (ни профиля, ни игры), неотличим от guestId — подделка под его uid сгруппируется под ним до его первой записи
- **Клиентский JSON нигде не кастуется** (00012): `games` записывается ролью `anon`, и одна игра с не-UUID `participants[].id` роняла вызов с `22P02` для всех. Сравнения идут по тексту с `lower()`, единственный `::uuid` стоит за regex-гардом
- Победы считаются по различным играм — 50 копий победителя в одной строке дают одну победу, а не 50
- Имя: из `player_profiles.display_name` (join по стабильному id), иначе имя участника из его **последней по времени** игры
- В рейтинг попадают только игроки с `total_games >= min_games`; сам `min_games` зажат в 1–100, `limit_count` — в 0–100 (RPC доступна `anon`, `NULL` означал бы «без лимита»)
- Сортировка: win rate ↓, победы ↓, игры ↓, затем стабильный id — чтобы равные игроки не менялись местами между запросами

Клиент: `supabase.rpc('get_leaderboard', { limit_count: limit })` в `components/leaderboard/leaderboard-list.tsx` — `min_games` не передаётся, работает значение по умолчанию.

⚠️ При изменении сигнатуры функции обязателен `DROP FUNCTION` старой версии (так делает 00013). Postgres иначе создаст **перегрузку**, и вызов клиента с одним аргументом продолжит уходить в старую функцию — молча, без единой ошибки.

### `check_achievements` (актуальная версия — v3, миграция 00015; основа — v2 из 00011)

```sql
check_achievements(p_user_id UUID, p_game_id UUID)
RETURNS TABLE(achievement_type TEXT, is_new BOOLEAN)
```

- `SECURITY DEFINER`, `SET search_path = public, pg_temp`; `EXECUTE` **отозван** у `PUBLIC` и `anon` (по умолчанию Postgres выдаёт его PUBLIC при создании функции — 00007 этого не отзывала), выдан `authenticated` и `service_role`
- Требует `p_user_id = auth.uid()` — вызов с чужим id молча возвращает пусто; начислить ачивки другому пользователю нельзя
- Работает только если игра `completed`, есть `winner_id`, победивший участник имеет `userId = p_user_id` (т.е. ачивки получает только авторизованный победитель-хост) и игра записана его аккаунтом: `created_by = p_user_id` (v3, 00015). Тот же фильтр — в подсчёте побед, серии и social-игр, поэтому подброшенная `anon` игра с чужим `userId` не даёт жертве ни побед, ни ачивок и не обрывает серию
- Все сравнения id — текстовые (`p->>'id' = winner_id::TEXT`), а `::INTEGER`-касты `lives`/`livesBefore`/`livesAfter` защищены числовым regex — порченый JSON не роняет вызов; `perfect_game` требует хотя бы одной записи победителя в `history` (v2 выдавала её за победу без единого удара — «ни одной потерянной жизни» истинно и для пустого множества) и не выдаётся, если у записей победителя нет числовых `livesBefore`/`livesAfter`
- Пер-пользовательские агрегаты префильтруются containment-запросом `participants @> [{"userId": ...}]` под GIN-индекс `idx_games_participants_gin` (создаётся в 00011)
- Вставляет заработанные ачивки анти-джойном (`INSERT ... SELECT ... WHERE NOT EXISTS`, гонка закрыта обработкой `unique_violation`) и возвращает только новые (`is_new = TRUE`)

Клиент: после завершения игры `game-context` вызывает `autoSyncGame` → `checkAchievementsForGame(game)` (`lib/achievements.ts`) → тосты `AchievementToasts` (рендерятся на уровне провайдера). Игры, досинхронизированные позже через `retryPendingSyncs` (его вызывает `PWAInit`, вне `GameProvider`), тоже получают ачивки, и тосты показываются: `emitUnlockedAchievements` шлёт событие, `GameProvider` подписан на него через `onUnlockedAchievements`.

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
NEXT_PUBLIC_APP_URL = https://killerpool.app
```

3. Scope: **Production**, **Preview**, **Development**

Service-role ключ заводить не нужно: приложение ходит в Supabase только из
браузера под `anon`/`authenticated`, и в коде он не используется. Подробнее —
[DEPLOYMENT.md](../DEPLOYMENT.md#environment-variables).

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

### Прогон миграций и тестов локально (без Supabase CLI)

Локальной среды Supabase в проекте нет (нет даже `config.toml`), поэтому
миграцию перед продом проверяет свой харнесс — временный Postgres 18 и
сценарии под ролями:

```bash
./supabase/test/setup-local.sh          # поднять Postgres, накатить 00001 → 00016
psql -h /tmp/kp-pg-sock -p 55432 -U postgres -f supabase/test/rls-policies.sql
echo $?                                 # 0 — все проверки сошлись, 3 — нет
./supabase/test/setup-local.sh --stop   # убрать за собой
```

Путь к бинарникам — `PGBIN` (по умолчанию `/opt/homebrew/opt/postgresql@18/bin`).
Порт, сокет и каталог данных переопределяются через `PGPORT`, `PGSOCK`,
`PGDATA_DIR`; тогда тесты запускаются с `-v kp_port=… -v kp_sock=…` — точную
команду `setup-local.sh` печатает в конце.

Скрипт подделывает то, что Supabase даёт из коробки: схему `auth`, роли
`anon`/`authenticated`/`service_role`, `auth.uid()` через GUC (её можно
подменять в тестах) и publication `supabase_realtime`. Политики проверяются
**под ролями**, с позитивными и негативными сценариями: хост-гость ведёт игру,
зритель пытается её испортить, авторизованный лезет в чужую, плюс всё из
00015 — даты, срок жизни гостевой записи, удаление аккаунта, размеры строки,
`winner_id`, профили и rulesets, `perfect_game`, подделку зарегистрированного
игрока в лидерборде и ачивках (раздел G, включая усыновлённую гостевую
игру). Раздел H — секрет хоста (00016): заголовок имитируется так же, как его
передаёт PostgREST, через `set_config('request.headers', …, true)`
(`rls_try_h`, `pgrst_headers`); хост с верным секретом проходит всю партию с
тремя гоночными записями завершения и отменой, зритель без заголовка, с пустым,
неверным или публичным хешем вместо секрета получает отказ, хеш нельзя подменить
или стереть, старые строки без хеша пишутся как раньше, `authenticated` не
затронут, окно 24 ч и заморозка 00015 действуют и с верным секретом. Раздел M
накатывает 00015 повторно поверх «плохих» старых строк: проверяет
идемпотентность, исправление дат в будущем и путь `NOT VALID`. Раздел N
проверяет, что повторный 00015 снимает защиту 00016 (это аварийный выключатель),
а повторный 00016 возвращает её.

**Харнесс падает на расхождении.** У каждого сценария записан ожидаемый
результат; строка печатается как `ok` или `FAIL … [expected: …]`, в конце —
`=== N checks: N passed, 0 failed ===`. Любое несовпадение, ошибка вне
сценария или отказ защиты дают код выхода 3 (`ON_ERROR_STOP`), так что
`rls-policies.sql` годится в CI и в pre-push.

⚠️ **Защита от запуска не туда.** Файл удаляет все игры и пишет в
`auth.users`. До первой записи он проверяет, что подключение идёт через
Unix-сокет (не TCP), сервер не слушает TCP (`listen_addresses` пуст), порт и
каталог сокета совпадают с ожидаемыми, а в базе есть маркер
`kp_harness.marker`, который создаёт `setup-local.sh`, и он записан в этом же
кластере (`system_identifier`). Иначе — `rls-policies.sql refuses to run: …` и
код 3, ничего не тронуто.

## 🚚 Применение миграций к проду

00001–00014 на прод катали руками через SQL Editor, поэтому журнал миграций
(`supabase_migrations.schema_migrations`) там пуст. Для `supabase db push` это
значит «не применено ничего»: он попытается накатить всё заново с 00001 (и
упадёт на первом же `CREATE TYPE`). Сначала журнал заводится один раз —
помечаем уже применённое, не выполняя его:

```bash
# из корня репозитория; проект слинкован (supabase/.temp, `supabase link --project-ref …`)
supabase migration repair --linked --status applied 00001 00002 00003 00004 00005 00006 00007 00008 00009 00010 00011 00012 00013 00014
supabase migration list --linked        # 00001–00014 в обеих колонках, 00015 — только Local
supabase db push --linked --dry-run     # должна быть ровно одна: 00015_game_integrity_and_spam_limits.sql
supabase db push --linked
```

С этого момента правильный путь для любой новой миграции — `supabase db push`.
SQL Editor для миграций больше не использовать: применённое руками не попадает
в журнал, и следующий push попробует накатить это ещё раз.

Перед миграцией, меняющей политики, полезно снять текущее определение — это и
есть артефакт отката:

```sql
SELECT polname,
       pg_get_expr(polqual, polrelid)      AS using_expr,
       pg_get_expr(polwithcheck, polrelid) AS with_check_expr
FROM pg_policy WHERE polrelid IN ('games'::regclass, 'player_profiles'::regclass, 'rulesets'::regclass);
```

После 00015 стоит проверить, все ли новые ограничения провалидированы
(`convalidated = t`; запрос — в разделе про таблицу `games`). Если нет, в
выводе `db push` есть NOTICE с именем ограничения, числом нарушающих строк и
запросом, который их находит. Ограничение в состоянии `NOT VALID` всё равно
проверяет все новые записи.

### 00016: сначала миграция, потом клиент, а между ними — проверка заголовка

Порядок обязателен. Клиент с 00016 добавляет в строку колонку
`host_secret_hash`; до миграции PostgREST отвечает на неё `PGRST204`. Клиент
это переживает (повторяет запись без колонки), но все его игры до миграции
остаются без защиты. Старый клиент после миграции работает как раньше: он не
шлёт ни колонку, ни заголовок, его игры ложатся с `NULL` и пишутся по правилам
00015.

Локальный харнесс сам кладёт заголовок в `request.headers`. Что gateway Supabase
действительно доносит `x-host-secret` до PostgREST, видно только на проде (CORS
проверен: preflight возвращает `x-host-secret` в `access-control-allow-headers`).
Если заголовок теряется, новый клиент запирает каждого гостя-хоста в его же
игре после первой записи. Поэтому после `db push` и **до** выкладки клиента —
три запроса с одной выброшенной строкой (`abandoned`: ни в лидерборд, ни в
ачивки она не попадает и замерзает через час):

```bash
URL=https://<project-ref>.supabase.co
KEY=<anon key>                     # NEXT_PUBLIC_SUPABASE_ANON_KEY
ID=$(uuidgen | tr A-Z a-z); P1=$(uuidgen | tr A-Z a-z); P2=$(uuidgen | tr A-Z a-z)
S=$(openssl rand -hex 32); H=$(printf %s "$S" | shasum -a 256 | cut -d' ' -f1)
AUTH=(-H "apikey: $KEY" -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json')

# 1. строка с хешем                                   -> 201
curl -s -o /dev/null -w '%{http_code}\n' "${AUTH[@]}" -H 'Prefer: return=minimal' "$URL/rest/v1/games" \
  -d "{\"id\":\"$ID\",\"status\":\"abandoned\",\"history\":[],\"host_secret_hash\":\"$H\",
       \"participants\":[{\"id\":\"$P1\",\"name\":\"probe\"},{\"id\":\"$P2\",\"name\":\"probe\"}]}"
# 2. без заголовка                                    -> []
curl -s -X PATCH "${AUTH[@]}" -H 'Prefer: return=representation' "$URL/rest/v1/games?id=eq.$ID&select=id" -d '{"history":[]}'
# 3. с заголовком                                     -> [{"id":"<ID>"}]
curl -s -X PATCH "${AUTH[@]}" -H 'Prefer: return=representation' -H "x-host-secret: $S" "$URL/rest/v1/games?id=eq.$ID&select=id" -d '{"history":[]}'
```

`PGRST204` в шаге 1 — схема ещё не перечитана: повторить через минуту.
`[]` в шаге 2 и строка в шаге 3 — заголовок доходит, клиент можно выкладывать.
`[]` в шаге 3 — не доходит: клиент не выкладывать, защиту выключить повторным
запуском PART 2 из 00015 (политика `games_update_anon` без секрета) — колонка и
триггер ничему не мешают.

После выкладки клиента — дымовой тест в приложении: гостевая игра, «Пригласить»,
пара ходов. В DevTools → Network каждый POST в `/rest/v1/games` несёт
`x-host-secret` и отвечает 2xx; в консоли нет `[sharing] Failed to sync game`.
Тот же upsert этой игры из curl без заголовка получает `42501` (`new row violates
row-level security policy (USING expression)`).

## 🧭 Planned / Not implemented

Идеи из ранних версий этого документа, которые **не реализованы**:

- Social providers: Apple, GitHub, Discord
- Парольная аутентификация (сейчас только Magic Link + Google OAuth)
- Кастомные rulesets в UI (таблица есть, INSERT-политику 00015 убрала; клиент всегда использует `DEFAULT_RULESET`)
- ~~Ужесточение записи в **идущую** гостевую игру~~ — закрыто в 00016 секретом хоста (без отдельной RPC: секрет едет в заголовке `x-host-secret`, политика сверяет его хеш). Осталось: игры без хеша — вставленные старым клиентом или браузером без `crypto.subtle` — по-прежнему открыты любому, у кого есть id, до конца своих суток; игра, чей секрет потерян на устройстве хоста (очищены данные сайта посреди партии), для гостя больше не пишется; секрет — токен на предъявителя: кто прочитал localStorage хоста, тот может писать игру до конца её суток; INSERT открыт по-прежнему, и окно модалки приглашения показывает ссылку, пока первая запись хоста ещё в пути или если она не удалась (офлайн) — кто успеет вставить строку с этим id первым, тот задаёт её хеш: со своим хост теряет эту игру на сервере, без хеша игра остаётся открытой, как до 00016. Закрывается в клиенте: показывать ссылку только после успешного включения шаринга
- Защита **гостевых** идентичностей от подделки. Для аккаунтов закрыто в 00015: uid аккаунта засчитывается только в играх с его `created_by` (`get_leaderboard` v6, `check_achievements` v3) — кроме аккаунта, который ещё ничего не записал. Но `participants[].id` и guestId видны в любой публичной строке, поэтому `anon` по-прежнему может вставлять игры под чужим гостем и двигать его строку в лидерборде; залогиненный, конечно, может записать что угодно в свои собственные игры
- Ограничение числа вставок `anon` (rate limit): Postgres его не даёт, 00015 ограничивает только размер каждой строки

## 🔗 Полезные ссылки

- [Supabase Documentation](https://supabase.com/docs)
- [Next.js + Supabase Guide](https://supabase.com/docs/guides/getting-started/quickstarts/nextjs)
- [Row Level Security](https://supabase.com/docs/guides/auth/row-level-security)

---

**Готово!** Теперь ваш проект настроен для работы с Supabase 🎉

_Последнее обновление: 2026-10-16_
