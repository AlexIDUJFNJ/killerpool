# Устранение проблем с лидербордом

> Обновлено: 2026-08-11. Все утверждения сверены с актуальным кодом
> (`lib/game-logic.ts`, `lib/storage.ts`, `lib/sync.ts`, `app/game/new/page.tsx`,
> `components/leaderboard/leaderboard-list.tsx`, миграции `00012`, `00013`).

## Две разные жалобы

Симптом «в лидерборде не то, что я ожидаю» бывает двух видов, и лечатся они
по-разному:

| Симптом | Куда смотреть |
|---------|---------------|
| Лидерборд пуст («The Leaderboard Awaits!») | Игра не доехала до базы — раздел «Игра не сохранилась» |
| Игрок сыграл, но его нет в таблице | Квалификационный минимум — раздел «Меньше трёх партий» |
| Знакомый игрок стоит несколькими строками | Ростер — раздел «Один человек, несколько строк» |

## Как данные попадают в лидерборд

1. **Создание игры** — `app/game/new/page.tsx`. Каждому имени сопоставляется
   идентификатор из локального ростера:
   ```typescript
   const entries = validPlayers.map(p => ({
     name: p.name.trim(),
     avatar: p.avatar,
     isOwner: p.rowId === meRowId,
     id: resolveRosterPlayerId(p.name),   // знакомое имя → прежний id
   }))
   const game = createGame(entries, DEFAULT_RULESET, meRowId === null ? null : userId)
   rememberRosterPlayers(entries.map(e => ({ id: e.id, name: e.name, avatar: e.avatar })))
   ```
   `resolveRosterPlayerId` (`lib/storage.ts`) ищет имя в ключе
   `killerpool_roster` (регистр и пробелы не важны) и возвращает сохранённый
   UUID; для нового имени выдаёт свежий. Именно поэтому имена внутри одной игры
   обязаны различаться — форма это проверяет и отказывает с сообщением.

2. **`createGame`** (`lib/game-logic.ts:42`) проставляет `userId` тому игроку,
   который помечен `isOwner` (в форме — «это я»). Позиция в списке значения не
   имеет: строки можно тасовать и удалять. Если владелец телефона себя не
   отметил, `userId` не получает никто, и все участники агрегируются по своим
   ростерным id.

3. **Синхронизация** — при завершении игры эффект в `contexts/game-context.tsx`
   один раз вызывает `autoSyncGame(game)` (`lib/sync.ts`), которая делает upsert
   строки `games` (`participants`, `winner_id`, `history`,
   `created_by = user?.id || null`). При неудаче id игры попадает в
   `killerpool_pending_sync`, а счётчик попыток — в `killerpool_pending_sync_meta`.
   Ретрай идёт из `components/pwa-init.tsx` на `online`/`visibilitychange`.
   **Важно:** попытки не бесконечны — после 5 неудач или при неустранимой ошибке
   (нет прав, битые данные) игра перестаёт ретраиться. См. «Синк сдался».

4. **Чтение** — `components/leaderboard/leaderboard-list.tsx:54`:
   ```typescript
   const { data, error: queryError } = await supabase
     .rpc('get_leaderboard', { limit_count: limit })
   ```
   Дефолтный `limit = 15`; `min_games` клиент не передаёт, работает
   значение по умолчанию — 3.

5. **RPC `get_leaderboard`** — актуальная версия **v5** (миграция `00013`):
   ```sql
   get_leaderboard(limit_count INTEGER DEFAULT 15, min_games INTEGER DEFAULT 3)
   ```
   `SECURITY DEFINER` (обходит RLS), `GRANT EXECUTE ... TO authenticated, anon`,
   учитывает только игры со `status = 'completed'`. Группировка —
   `COALESCE(user_id, player_id)`, победы считаются по различным играм,
   отображаемое имя берётся из **последней по времени** игры игрока,
   ранжирование — `win_rate DESC, games_won DESC, total_games DESC, stable_id ASC`.

История версий: `00002` — первая (без `SECURITY DEFINER`, упиралась в RLS),
`00003` — `SECURITY DEFINER` + UNIQUE на `player_profiles.user_id`,
`00005` — группировка по `stable_id`, `00012` — защита от падения на клиентских
данных (v4), `00013` — квалификационный минимум (v5).

## Причины

### 1. Меньше трёх партий — игрок не в рейтинге

Самая частая причина «мою игру видно в истории, а в лидерборде меня нет» после
миграции `00013`. Порог введён намеренно: без него случайный победитель одной
партии со 100% всегда стоял выше того, кто сыграл сорок.

**Как проверить** — вызвать функцию без порога и посмотреть, кто отсеивается:
```sql
SELECT display_name, total_games, games_won, win_rate
FROM get_leaderboard(100, 1)     -- min_games = 1, порог фактически снят
WHERE total_games < 3
ORDER BY total_games DESC;
```
(Сравнивать два вызова через `EXCEPT` бесполезно: `rank` пересчитывается, и
строки различаются даже у тех, кто есть в обоих результатах.)

Это не поломка. Играйте дальше — на третьей партии строка появится сама.
Порог не зашит в функцию намертво: `get_leaderboard(15, 1)` вернёт всех.

### 2. Один человек, несколько строк

До ростера каждый соперник получал новый UUID в каждой игре, поэтому «Вася» из
вчерашней и сегодняшней игры были двумя разными строками. Сейчас имя из ростера
переиспользует прежний id, и такие строки схлопываются — но только начиная с
игр, сыгранных **после** появления ростера. Старые игры остаются как есть:
переписать их задним числом нельзя, в базе от того игрока не осталось ничего,
кроме случайного id.

Ещё две законные причины дублей:
- имя написали иначе, чем в прошлый раз, — ростер сопоставляет по имени
  (без учёта регистра и краевых пробелов), «Вася» и «Вася К.» это разные люди;
- игрок сменил устройство: ростер живёт в localStorage конкретного браузера.

**Как проверить содержимое ростера** (в консоли браузера):
```javascript
JSON.parse(localStorage.getItem('killerpool_roster') || '[]')
```

### 3. Игра не сохранилась в базу

**Как проверить:** консоль браузера при завершении игры. При успехе —
`Game successfully synced to Supabase: <game_id>`; при неудаче —
`Failed to sync game to Supabase` / `Failed to auto-sync game`.

Отладочные запросы лежат в `debug_leaderboard.sql` (Supabase SQL Editor):

```sql
SELECT
    id, status, winner_id, created_at, created_by,
    jsonb_array_length(participants) AS player_count,
    jsonb_array_length(history)      AS action_count
FROM games
WHERE status = 'completed'
ORDER BY created_at DESC
LIMIT 10;
```

**Если игр нет:**
- Аутентификация не обязательна: политика `games_insert_anon` разрешает
  анонимную вставку при `created_by IS NULL`, а для гостя `sync` шлёт именно
  `created_by: null`.
- Проверьте `killerpool_pending_sync` — если id игры там, синк падал и ждёт
  ретрая.
- После миграции `00014` завершённая гостевая игра перестаёт принимать записи
  через час после последней. Если игра завершилась офлайн и пролежала сутки,
  её upsert получит `42501` — это неустранимая ошибка, ретрай её не спасёт.
  Строка при этом остаётся в localStorage и видна в истории.

### 4. Синк сдался

`lib/sync.ts` больше не ретраит бесконечно: коды `42501`, `22P02`, `22007`,
`23502`, `23503`, `23514`, `42703` считаются неустранимыми, а любая другая
ошибка отбрасывается после 5 попыток с нарастающей паузой.

**Как проверить** (консоль браузера):
```javascript
JSON.parse(localStorage.getItem('killerpool_pending_sync_meta') || '{}')
```
Поля `attempts` и `lastAttemptAt` на id игры. Если `attempts >= 5` — игра выбыла
из очереди. Страница **`/sync`** покажет сводку `{ success, skipped, refused,
failed, total }`: `skipped` — незавершённые игры (это нормально, они не должны
попадать в облако), `refused` — отказ базы.

### 5. Формат participants

```sql
SELECT
    g.id AS game_id,
    participant->>'id'     AS player_id,
    participant->>'name'   AS player_name,
    participant->>'userId' AS user_id,
    g.winner_id
FROM games g,
LATERAL jsonb_array_elements(g.participants) AS participant
WHERE g.status = 'completed'
LIMIT 10;
```

Ожидания:
- `player_id` — UUID в нижнем регистре (на этом стоит regex-гард в `00012`;
  участник с невалидным id молча выпадает из рейтинга, но не роняет функцию);
- `userId` — UUID у того игрока, который отмечен как владелец устройства,
  `NULL` у остальных; это by design;
- `winner_id` совпадает с одним из `player_id`.

**Не кастуйте `participant->>'userId'` в `::uuid` в своих запросах.** Таблица
`games` пишется анонимными клиентами, поэтому одно мусорное значение уронит
весь запрос с `22P02` — ровно этот баг чинила миграция `00012`: одна битая
строка делала лидерборд недоступным для всех. Запросы в
`debug_leaderboard.sql` сравнивают id как текст именно поэтому.

### 6. Функция не возвращает данные

```sql
SELECT * FROM get_leaderboard(15);
SELECT * FROM get_leaderboard(15, 1);   -- то же самое без порога
```

Если пусто:
```sql
SELECT routine_name, routine_type, security_type   -- security_type = DEFINER
FROM information_schema.routines
WHERE routine_name = 'get_leaderboard';
```

Проверьте, что не осталось двух перегрузок функции. `00013` меняет сигнатуру,
поэтому начинается с `DROP FUNCTION IF EXISTS get_leaderboard(INTEGER)` — без
этого рядом с v5 жила бы старая одноаргументная v4, и вызов клиента
`get_leaderboard(limit_count)` уходил бы в неё:
```sql
SELECT oid::regprocedure FROM pg_proc WHERE proname = 'get_leaderboard';
-- ожидается ровно одна строка: get_leaderboard(integer,integer)
```

### 7. player_profiles

```sql
SELECT user_id, display_name, avatar_url, created_at FROM player_profiles LIMIT 10;
```

`ensurePlayerProfile` (`lib/sync.ts`) создаёт профиль только **авторизованному**
пользователю и только если его ещё нет (`display_name` — часть email до `@`),
существующий не перезаписывается. У гостей профиля нет — лидерборд берёт имя из
`participants` (из последней игры игрока). Профиль влияет только на имя и
аватар: `LEFT JOIN player_profiles` никого не отфильтровывает.

## Порядок разбора

1. **Запустить `debug_leaderboard.sql`** целиком в Supabase SQL Editor.
2. **Посмотреть консоль**: сыграть партию до конца и найти
   `Game successfully synced to Supabase`.
3. **Проверить localStorage**: `killerpool_roster` (id игроков),
   `killerpool_guest_id` (гостевой UUID), `killerpool_pending_sync` и
   `killerpool_pending_sync_meta` (очередь и счётчик попыток).
4. **Проверить строку в базе:**
   ```sql
   SELECT id, status, winner_id, jsonb_pretty(participants) AS participants,
          created_by, current_player_index, updated_at
   FROM games
   ORDER BY created_at DESC
   LIMIT 1;
   ```
   `status = 'completed'`, `winner_id` совпадает с id одного из участников,
   `created_by` — UUID пользователя или `NULL` у гостя (это нормально).
5. **Досинхронизировать**: страница **`/sync`**, кнопка «Sync All Games» →
   `syncAllGamesToSupabase()`. Импортировать модуль из консоли нельзя — алиас
   `@/lib/sync` существует только на этапе сборки.

## Полезные запросы

### Структура последней завершённой игры
```sql
SELECT id, status, winner_id,
       jsonb_pretty(participants) AS participants_structure,
       jsonb_pretty(history)      AS history_structure
FROM games
WHERE status = 'completed'
ORDER BY created_at DESC
LIMIT 1;
```

### Воспроизвести группировку вручную (без порога и без кастов)
```sql
WITH participant_rows AS (
    SELECT
        g.id AS game_id,
        lower(participant->>'id')     AS player_key,
        participant->>'name'          AS player_name,
        CASE
            WHEN lower(participant->>'userId') ~
                 '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            THEN lower(participant->>'userId')
            ELSE NULL
        END                           AS user_key,
        lower(g.winner_id::text)      AS winner_key
    FROM games g
    CROSS JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(g.participants) = 'array'
             THEN g.participants ELSE '[]'::jsonb END
    ) AS participant
    WHERE g.status = 'completed'
)
SELECT
    COALESCE(user_key, player_key)                   AS stable_key,
    max(player_name)                                 AS player_name,
    COUNT(DISTINCT game_id)                          AS total_games,
    COUNT(DISTINCT game_id) FILTER (WHERE player_key = winner_key) AS games_won
FROM participant_rows
GROUP BY COALESCE(user_key, player_key)
ORDER BY games_won DESC, total_games DESC;
```

### Участники с невалидным id
```sql
SELECT g.id AS game_id, participant->>'id' AS bad_id, participant->>'name' AS name
FROM games g,
LATERAL jsonb_array_elements(g.participants) AS participant
WHERE lower(participant->>'id') !~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
```

### Очистить все игры (ОСТОРОЖНО!)
```sql
-- ТОЛЬКО ДЛЯ ТЕСТИРОВАНИЯ!
DELETE FROM games WHERE status = 'completed';
```

## Известные ограничения

- Ростер живёт на устройстве: у каждого браузера свой список игроков, и один
  человек, сыгравший на двух телефонах, останется двумя строками.
- Игры, сыгранные до появления ростера, не склеиваются задним числом.
- Гостевая статистика не переносится в аккаунт при логине: `/stats` показывает
  `user?.id ?? getGuestId()`, поэтому после входа прошлые гостевые игры пропадают
  с экрана, хотя записи в localStorage целы. Это отдельная фича — склейка
  гостевой и аккаунтной личности.
- `participants` пишется анонимными клиентами, поэтому лидерборд в принципе
  подделывается вставкой выдуманной завершённой игры. Лечится это в
  `get_leaderboard` (например, доверять только играм с непустой `history`),
  а не в RLS. См. [SECURITY.md](./SECURITY.md).

## Контакт для поддержки

Если проблема не решена, приложите:
1. Результаты запросов из `debug_leaderboard.sql`
2. Скриншот консоли браузера после завершения игры
3. Структуру последней завершённой игры
4. Содержимое localStorage-ключей `killerpool_roster`, `killerpool_guest_id`,
   `killerpool_pending_sync`, `killerpool_pending_sync_meta`

---
*Документ актуализирован: 2026-08-11*
