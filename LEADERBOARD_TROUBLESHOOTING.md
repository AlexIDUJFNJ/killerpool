# Устранение проблем с лидербордом

> Обновлено: 2026-07-07. Все утверждения сверены с актуальным кодом
> (`lib/game-logic.ts`, `lib/sync.ts`, `app/game/new/page.tsx`,
> `components/leaderboard/leaderboard-list.tsx`, миграции `00002`, `00003`, `00005`).

## Проблема
Лидерборд показывает "The Leaderboard Awaits!" даже после завершения игры.

## Как данные попадают в лидерборд (актуальная схема)

1. **Создание игры** — `app/game/new/page.tsx:141-143`:
   ```typescript
   // Use userId if authenticated, otherwise use stable guest_id
   const userId = user?.id || getGuestId()
   const game = createGame(validPlayers, DEFAULT_RULESET, userId)
   ```
   `getGuestId()` (`lib/storage.ts`) возвращает стабильный UUID из localStorage-ключа
   `killerpool_guest_id` — то есть `userId` есть даже у гостя, и это всегда валидный UUID.

2. **`createGame`** (`lib/game-logic.ts:31-54`) присваивает `userId` **только первому игроку**:
   ```typescript
   // Only assign userId to the first player (the authenticated user)
   // Other players should have null userId so they're tracked by their unique player_id
   const gamePlayers = players.map((p, index) =>
     createPlayer(p.name, p.avatar, ruleset.params.starting_lives, index === 0 ? userId : null)
   )
   ```
   У остальных игроков `userId = null`, и в лидерборде они трекаются по своему `player_id`
   (случайный `crypto.randomUUID()` из `createPlayer`).

3. **Синхронизация** — при завершении игры `game-context` (эффект в
   `contexts/game-context.tsx`, строки ~105-150) один раз вызывает `autoSyncGame(game)`
   (`lib/sync.ts`), которая через `syncGameToSupabase` делает `upsert` в таблицу `games`
   (`participants = game.players`, `winner_id`, `history`, `created_by = user?.id || null`).
   Если синк не удался (офлайн), игра помечается в localStorage-ключе
   `killerpool_pending_sync` и повторяется функцией `retryPendingSyncs()`
   (вызывается из `components/pwa-init.tsx` при монтировании и на событиях
   `online` / `visibilitychange`).

4. **Чтение** — `components/leaderboard/leaderboard-list.tsx:53-54`:
   ```typescript
   const { data, error: queryError } = await supabase
     .rpc('get_leaderboard', { limit_count: limit })
   ```
   Дефолтный `limit = 15`.

5. **RPC `get_leaderboard`** — актуальная версия (v3) из миграции
   `00005_fix_leaderboard_grouping.sql`: `SECURITY DEFINER` (обходит RLS),
   `GRANT EXECUTE ... TO authenticated, anon`, учитывает **только** игры со
   `status = 'completed'`. Группировка идёт по стабильному идентификатору:
   ```sql
   COALESCE(pgs.user_id, pgs.player_id) AS stable_id
   ```
   где `user_id` берётся из `participant->>'userId'` **только если** он проходит
   UUID-regex (легаси-значения вида `guest_xxx` превращаются в NULL). Побед считается
   по `(participant->>'id')::uuid = g.winner_id`, ранжирование —
   `win_rate DESC, games_won DESC, total_games DESC`.

История версий функции: `00002` — первая версия (без SECURITY DEFINER, упиралась в RLS),
`00003` — добавлен `SECURITY DEFINER` + UNIQUE на `player_profiles.user_id`,
`00005` — текущая группировка по `stable_id`.

## Возможные причины

### 1. Игра не сохранилась в базу данных

**Как проверить:**
Откройте консоль браузера (F12) и проверьте наличие ошибок при завершении игры. Ищите сообщения вроде:
- `Failed to sync game to Supabase`
- `Failed to auto-sync game`

При успехе в консоли будет `Game successfully synced to Supabase: <game_id>`.

**Запустите отладочные SQL запросы** из файла `debug_leaderboard.sql` в Supabase SQL Editor:

```sql
-- Проверить наличие завершенных игр
SELECT
    id,
    status,
    winner_id,
    created_at,
    created_by,
    jsonb_array_length(participants) as player_count,
    jsonb_array_length(history) as action_count
FROM games
WHERE status = 'completed'
ORDER BY created_at DESC
LIMIT 10;
```

**Если игр нет:**
- Аутентификация **не обязательна**: RLS-политика `games_insert_anon` (миграция `00009`)
  разрешает анонимную вставку при `created_by IS NULL`, а `syncGameToSupabase` для гостя
  как раз шлёт `created_by: null`. Так что гостевые игры тоже должны сохраняться.
- Проверьте localStorage-ключ `killerpool_pending_sync` — если там есть id игры, синк
  падал и ждёт ретрая (сработает при событии `online`/`visibilitychange`).
- Проверьте RLS политики таблицы `games` (финальный набор — миграция
  `00009_fix_live_sharing_policies.sql`).
- Проверьте логи ошибок в консоли браузера.

### 2. Проблема с форматом данных participants

**Как проверить:**
Запустите этот запрос в Supabase SQL Editor:

```sql
SELECT
    g.id as game_id,
    participant->>'id' as player_id,
    participant->>'name' as player_name,
    participant->>'userId' as user_id,
    g.winner_id
FROM games g,
LATERAL jsonb_array_elements(g.participants) AS participant
WHERE g.status = 'completed'
LIMIT 10;
```

**Ожидаемый результат:**
- `player_id` должен быть UUID (генерируется в `createPlayer`)
- `player_name` должен содержать имя игрока
- `userId` — UUID **только у первого игрока** (id авторизованного пользователя или
  guest-UUID); у всех остальных игроков `userId` = NULL — это нормально и by design
- `winner_id` должен совпадать с одним из `player_id`

Внимание: не кастуйте `participant->>'userId'` в `::uuid` напрямую в своих запросах —
в легаси-данных могли остаться значения вида `guest_xxx`, каст упадёт. Сама функция
v3 защищена от этого UUID-regex'ом.

### 3. Функция get_leaderboard не возвращает данные

**Как проверить:**
Запустите функцию напрямую в Supabase SQL Editor:

```sql
SELECT * FROM get_leaderboard(15);
```

**Если результат пустой:**
- Убедитесь, что есть хотя бы одна завершенная игра (см. пункт 1)
- Проверьте, что применена миграция `00005` (актуальная v3), а функция имеет
  `SECURITY DEFINER`:

```sql
SELECT
    routine_name,
    routine_type,
    security_type   -- должно быть DEFINER
FROM information_schema.routines
WHERE routine_name = 'get_leaderboard';
```

- Проверьте `GRANT EXECUTE` для `authenticated` и `anon` (есть в каждой из миграций
  `00002`/`00003`/`00005`)

### 4. Игрок появляется в лидерборде несколько раз / статы не суммируются

**Текущее поведение (важно, старая версия этого документа врала):**
- `userId` получает **только первый игрок** каждой игры (создатель); остальным
  проставляется `null` (`lib/game-logic.ts:36-40`). Никакого «все игроки получают
  userId создателя» нет.
- `get_leaderboard` v3 группирует **не по `player_id`**, а по
  `COALESCE(user_id, player_id)`. Это значит:
  - создатель (авторизованный или гость со стабильным guest-UUID) агрегируется
    между играми по своему `userId`;
  - остальные игроки получают новый `player_id` в каждой игре, поэтому «Вася» из
    вчерашней и сегодняшней игры — это две разные строки лидерборда. Это ожидаемое
    ограничение, а не баг.
- Дубли одного и того же авторизованного игрока возможны только для старых игр,
  созданных до миграции `00005`, или если у пользователя сменился guest-UUID
  (например, очистка localStorage до логина).

### 5. Проверить player_profiles

**Как проверить:**
```sql
SELECT
    user_id,
    display_name,
    avatar_url,
    created_at
FROM player_profiles
LIMIT 10;
```

`syncGameToSupabase` (`lib/sync.ts`) при синхронизации создаёт профиль для
**авторизованного** пользователя, если его ещё нет (display_name = часть email до `@`),
и не перезаписывает существующий. Для гостей профиль не создаётся — в лидерборде
используется имя игрока из `participants`. Нюанс v3: fallback-имя выбирается
`ORDER BY game_id DESC`, а `game_id` — случайный UUID v4, так что берётся имя
из произвольной игры, а не из последней по времени.
Профиль влияет только на отображаемое имя/аватар: `LEFT JOIN player_profiles`
не отфильтровывает игроков без профиля.

## Решение

### Шаг 1: Запустить все отладочные запросы
Откройте файл `debug_leaderboard.sql` и запустите все запросы по очереди в Supabase SQL Editor.
(Учтите: запрос №6 в этом файле кастует `userId` в `::uuid` без проверки — на легаси-данных
с `guest_xxx` он может упасть; это проблема запроса, а не данных.)

### Шаг 2: Проверить логи
1. Откройте консоль браузера (F12)
2. Сыграйте новую игру до конца
3. Проверьте наличие ошибок
4. Ищите сообщение `Game successfully synced to Supabase`

### Шаг 3: Проверить userId создателя
Убедитесь, что:
- `userId` в `app/game/new/page.tsx:142` не пустой — там всегда должен быть либо
  `user.id`, либо guest-UUID из `getGuestId()`
- в localStorage есть валидный UUID в ключе `killerpool_guest_id` (если играете гостем)

### Шаг 4: Проверить базу данных
После завершения игры, запустите:
```sql
SELECT
    id,
    status,
    winner_id,
    jsonb_pretty(participants) as participants,
    created_by,
    current_player_index
FROM games
ORDER BY created_at DESC
LIMIT 1;
```

Убедитесь, что:
- `status` = `'completed'`
- `winner_id` не NULL и совпадает с `id` одного из participants
- `participants` — массив игроков, где `userId` заполнен только у первого
- `created_by` — UUID авторизованного пользователя или NULL для гостя (это нормально)

### Шаг 5: Дождаться авторетрая или синхронизировать вручную
Если игра завершилась офлайн, её id лежит в `killerpool_pending_sync` и синк
повторится автоматически (`retryPendingSyncs()` в `lib/sync.ts`, вызывается из
`components/pwa-init.tsx` при монтировании и на `online`/`visibilitychange`).
Достаточно открыть приложение с сетью.

Принудительную полную синхронизацию истории проще всего запустить со страницы
**`/sync`** — кнопка «Sync All Games» вызывает `syncAllGamesToSupabase()` из
`lib/sync.ts` и показывает результат `{ success, failed, total }`. (Импортировать
модуль из консоли браузера нельзя: алиас `@/lib/sync` существует только на этапе
сборки.)

## Полезные запросы

### Посмотреть структуру последней завершенной игры
```sql
SELECT
    id,
    status,
    winner_id,
    jsonb_pretty(participants) as participants_structure,
    jsonb_pretty(history) as history_structure
FROM games
WHERE status = 'completed'
ORDER BY created_at DESC
LIMIT 1;
```

### Воспроизвести группировку v3 вручную
```sql
WITH player_game_stats AS (
    SELECT
        (participant->>'id')::uuid AS player_id,
        participant->>'name' AS player_name,
        CASE
            WHEN participant->>'userId' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            THEN (participant->>'userId')::uuid
            ELSE NULL
        END AS user_id,
        g.id AS game_id,
        CASE WHEN (participant->>'id')::uuid = g.winner_id THEN 1 ELSE 0 END AS is_winner
    FROM games g,
    LATERAL jsonb_array_elements(g.participants) AS participant
    WHERE g.status = 'completed'
)
SELECT
    COALESCE(user_id, player_id) AS stable_id,
    MAX(player_name) AS player_name,
    COUNT(DISTINCT game_id) AS total_games,
    SUM(is_winner) AS games_won
FROM player_game_stats
GROUP BY COALESCE(user_id, player_id)
ORDER BY games_won DESC, total_games DESC;
```

### Проверить, что get_leaderboard имеет SECURITY DEFINER
```sql
-- В psql:
-- \df+ get_leaderboard

-- Или в Supabase SQL Editor:
SELECT
    routine_name,
    routine_type,
    security_type
FROM information_schema.routines
WHERE routine_name = 'get_leaderboard';
```

### Очистить все игры (ОСТОРОЖНО!)
```sql
-- ТОЛЬКО ДЛЯ ТЕСТИРОВАНИЯ!
DELETE FROM games WHERE status = 'completed';
```

## Planned / Not implemented

- Агрегация статистики «гостевых» соперников (игроков без `userId`) между играми —
  сейчас невозможна by design: у них новый `player_id` в каждой игре.

## Контакт для поддержки

Если проблема не решена, предоставьте:
1. Результаты всех отладочных запросов из `debug_leaderboard.sql`
2. Скриншот консоли браузера после завершения игры
3. Результат запроса структуры последней завершенной игры
4. Содержимое localStorage-ключей `killerpool_guest_id` и `killerpool_pending_sync`

---
*Документ актуализирован: 2026-07-07*
