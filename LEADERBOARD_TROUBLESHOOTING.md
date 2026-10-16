# Устранение проблем с лидербордом

> Обновлено: 2026-10-16. Все утверждения сверены с актуальным кодом
> (`lib/game-logic.ts`, `lib/storage.ts`, `lib/sync.ts`, `contexts/game-context.tsx`,
> `app/game/new/page.tsx`, `components/leaderboard/leaderboard-list.tsx`,
> миграции `00012`, `00013`, `00015`).

## Жалобы и куда смотреть

Симптом «в лидерборде не то, что я ожидаю» бывает нескольких видов, и лечатся
они по-разному:

| Симптом | Куда смотреть |
|---------|---------------|
| Лидерборд пуст («The Leaderboard Awaits!») | Игра не доехала до базы — раздел «Игра не сохранилась» |
| Игрок сыграл, но его нет в таблице | Квалификационный минимум — раздел «Меньше трёх партий» |
| Знакомый игрок стоит несколькими строками | Ростер — раздел «Один человек, несколько строк» |
| У вошедшего игрока меньше игр, чем он сыграл | Правило v6 — раздел «Аккаунт считается только в своих играх» |

## Как данные попадают в лидерборд

1. **Создание игры** — `app/game/new/page.tsx`. Каждому имени сопоставляется
   идентификатор из локального ростера:
   ```typescript
   const userId = user?.id || getGuestId()
   const entries = validPlayers.map(p => ({
     name: p.name.trim(),
     avatar: p.avatar,
     isOwner: p.rowId === meRowId,
     id: resolveRosterPlayerId(p.name),   // знакомое имя → прежний id
   }))
   const game = createGame(entries, DEFAULT_RULESET, meRowId === null ? null : userId, userId)
   rememberRosterPlayers(entries.map(e => ({ id: e.id, name: e.name, avatar: e.avatar })))
   ```
   `resolveRosterPlayerId` (`lib/storage.ts`) ищет имя в ключе
   `killerpool_roster` (регистр и пробелы не важны) и возвращает сохранённый
   UUID; для нового имени выдаёт свежий. Именно поэтому имена внутри одной игры
   обязаны различаться — форма это проверяет и отказывает с сообщением.

2. **`createGame`** (`lib/game-logic.ts`) проставляет `userId` тому игроку,
   который помечен `isOwner` (в форме — «это я»): uid аккаунта или guest-UUID
   устройства. Позиция в списке значения не имеет: строки можно тасовать и
   удалять. Если владелец телефона себя не отметил, `userId` не получает никто,
   и все участники агрегируются по своим ростерным id. Последний аргумент —
   `createdBy` — записывается в игру всегда: по нему выгрузка решает, под каким
   аккаунтом писать строку.

3. **Выгрузка** — при завершении игры эффект в `contexts/game-context.tsx`
   один раз вызывает `syncFinishedGame(game)` (`lib/sync.ts`). Id игры встаёт в
   очередь `killerpool_pending_sync` **до** попытки, затем идёт upsert строки
   `games` (`participants`, `winner_id`, `history`, `created_by`).
   `created_by` берётся из `Game.createdBy`: гостевая игра пишется с
   `created_by` текущего входа (анонимно — `NULL`), игра аккаунта — только этим
   аккаунтом; если вошёл другой или никто, игра ждёт в очереди. Неудачная
   попытка оставляет игру в очереди, счётчик — в `killerpool_pending_sync_meta`.
   Ретрай идёт из `components/pwa-init.tsx` на `online`/`visibilitychange` и с
   кнопки Sync на `/history`, до 14 дней с отсрочкой до 6 часов; окончательный
   отказ (нет прав, битые данные, нарушенный CHECK) снимает игру сразу. См.
   «Синк сдался».

4. **Чтение** — `components/leaderboard/leaderboard-list.tsx`:
   ```typescript
   const { data, error } = await createClient().rpc('get_leaderboard', { limit_count: limit })
   ```
   Дефолтный `limit = 15`; `min_games` клиент не передаёт, работает
   значение по умолчанию — 3.

5. **RPC `get_leaderboard`** — актуальная версия **v6** (миграция `00015`,
   сигнатура из v5, `00013`):
   ```sql
   get_leaderboard(limit_count INTEGER DEFAULT 15, min_games INTEGER DEFAULT 3)
   ```
   `SECURITY DEFINER` (обходит RLS), `GRANT EXECUTE ... TO authenticated, anon`,
   учитывает только игры со `status = 'completed'`. Ключ группировки:
   - нет `userId` (или это не UUID) → `participants[].id`;
   - `userId` — не аккаунт (guest-UUID) → `userId`;
   - `userId` — аккаунт и равен `created_by` строки → `userId`;
   - `userId` — аккаунт, но строку писал не он → `participants[].id`;
   - участник, сгруппированный по `id`, который сам является uid аккаунта, отбрасывается.

   «Аккаунт» — uid из `player_profiles.user_id` или `games.created_by`. Победы
   считаются по различным играм, отображаемое имя — профиль, иначе имя из
   **последней по времени** игры игрока, ранжирование —
   `win_rate DESC, games_won DESC, total_games DESC, stable_id ASC`.

История версий: `00002` — первая (без `SECURITY DEFINER`, упиралась в RLS),
`00003` — `SECURITY DEFINER` + UNIQUE на `player_profiles.user_id`,
`00005` — группировка по `stable_id`, `00012` — защита от падения на клиентских
данных (v4), `00013` — квалификационный минимум (v5), `00015` — личность
аккаунта засчитывается только в его собственных играх (v6).

## Причины

### 1. Меньше трёх партий — игрок не в рейтинге

Самая частая причина «мою игру видно в истории, а в лидерборде меня нет».
Порог введён намеренно: без него случайный победитель одной партии со 100%
всегда стоял выше того, кто сыграл сорок.

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
Вошедшему победителю экран победителя так и пишет: победа сохранена в его
статистике, а лидерборд ранжирует игроков с трёх партий. Порог не зашит в функцию намертво:
`get_leaderboard(15, 1)` вернёт всех.

### 2. Один человек, несколько строк

До ростера каждый соперник получал новый UUID в каждой игре, поэтому «Вася» из
вчерашней и сегодняшней игры были двумя разными строками. Сейчас имя из ростера
переиспользует прежний id, и такие строки схлопываются — но только начиная с
игр, сыгранных **после** появления ростера. Старые игры остаются как есть:
переписать их задним числом нельзя, в базе от того игрока не осталось ничего,
кроме случайного id.

Ещё законные причины дублей:
- имя написали иначе, чем в прошлый раз, — ростер сопоставляет по имени
  (без учёта регистра и краевых пробелов), «Вася» и «Вася К.» это разные люди;
- игрок сменил устройство: ростер живёт в localStorage конкретного браузера;
- строка-«двойник» вошедшего игрока с его именем — это игра, где его uid стоит
  в `userId`, а строку записал кто-то другой (см. следующий раздел).

**Как проверить содержимое ростера** (в консоли браузера):
```javascript
JSON.parse(localStorage.getItem('killerpool_roster') || '[]')
```

### 3. Аккаунт считается только в своих играх

С `00015` `userId`, который является uid аккаунта, группирует игрока только в
строках, где `created_by` — этот же аккаунт. Иначе участник считается по своему
`participants[].id`, то есть отдельной строкой под тем же именем. Это защита:
раньше аноним одной вставкой выдуманной игры добавлял любому вошедшему игроку
победу или поражение и переименовывал его.

Честных игр это не задевает: игру, созданную под аккаунтом, клиент пишет только
этим аккаунтом (`rowOwner` в `lib/sync.ts`). Что сдвигается:
- игры, созданные под аккаунтом, но записанные анонимно или другим аккаунтом,
  — так бывало до `rowOwner`; они больше не считаются аккаунту;
- гостевая игра, сыгранная до входа и усыновлённая первым INSERT после него
  (`created_by` = uid, а `userId` хоста = guest-UUID), считается вместе с
  гостевыми играми устройства, под guest-UUID, а не под аккаунтом. Ачивок она
  не даёт (`check_achievements` v3 тоже требует `created_by = p_user_id`).

**Как найти такие игры:**
```sql
WITH accounts AS (
    SELECT user_id::text AS key FROM player_profiles WHERE user_id IS NOT NULL
    UNION
    SELECT created_by::text FROM games WHERE created_by IS NOT NULL
)
SELECT
    g.id                       AS game_id,
    participant->>'name'       AS player_name,
    participant->>'userId'     AS claimed_user_id,
    g.created_by               AS written_by,
    g.created_at
FROM games g
CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(g.participants) = 'array'
         THEN g.participants ELSE '[]'::jsonb END
) AS participant
JOIN accounts a ON a.key = lower(participant->>'userId')
WHERE g.status = 'completed'
  AND lower(participant->>'userId') IS DISTINCT FROM g.created_by::text
ORDER BY g.created_at DESC;
```
Каждая строка — участник, чей `userId` принадлежит аккаунту, в игре, которую
этот аккаунт не писал. Такая игра в строку аккаунта не попадает.

### 4. Игра не сохранилась в базу

**Как проверить.** Отдельной строки «успешно» в консоли нет. Признаки успеха:
id игры пропал из `killerpool_pending_sync`, а у вошедшего игрока экран
победителя сменил «Saving the result…» на итог. Признаки неудачи в консоли
браузера:
- `Failed to sync game to Supabase: <сообщение> <код>` — ответ базы с ошибкой;
- `Error syncing game to Supabase: <сообщение>` — исключение (обычно сеть);
- `Could not tell who is signed in, will retry: <сообщение>` — не удалось
  узнать, кто вошёл, запись отложена;
- `Failed to auto-sync game` — сбой самого конвейера завершения.

Отладочные запросы лежат в `supabase/debug/leaderboard.sql` (Supabase SQL Editor):

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
  анонимную вставку при `created_by IS NULL`, а для гостевой игры без входа
  клиент шлёт именно `created_by: null`.
- Проверьте `killerpool_pending_sync` — если id игры там, выгрузка ещё не
  прошла и ждёт ретрая (или входа аккаунта, под которым игра создана).
- Первая выгрузка офлайн-игры — это INSERT, на него окна гостевой записи не
  действуют: игра, пролежавшая на телефоне неделю, всё равно доедет. А вот
  **повторная** запись уже выгруженной гостевой игры после того, как ей
  исполнились сутки от начала или прошёл час после последней записи
  завершённой игры, получит `42501` (00015) — это окончательный отказ, ретрай
  его не спасёт. Строка при этом остаётся в localStorage и видна в истории.

### 5. Синк сдался

`lib/sync.ts` не ретраит бесконечно. Окончательными считаются коды из
`PERMANENT_ERROR_CODES`: Postgres `42501`, `42703`, `22P02`, `22001`, `22003`,
`22007`, `22008`, `23502`, `23503`, `23505`, `23514` (в том числе лимиты 00015 —
больше 32 участников, 1000 записей истории, 512 КиБ, `winner_id` не из
участников) и PostgREST `PGRST204`, `PGRST102`. Такая игра снимается с очереди
сразу. Любая другая ошибка повторяется с отсрочкой (1 минута, удваивается, не
больше 6 часов) до 14 дней с первой неудачи.

**Как проверить** (консоль браузера):
```javascript
JSON.parse(localStorage.getItem('killerpool_pending_sync_meta') || '{}')
```
Поля `attempts`, `firstFailedAt` и `lastAttemptAt` на id игры. Игра, которой
больше нет ни в очереди, ни в базе, либо получила окончательный отказ, либо
продержалась 14 дней (в консоли `[sync] giving up on game after repeated
failures`). Страницы `/sync` со сводкой больше нет.

### 6. Формат participants

```sql
SELECT
    g.id AS game_id,
    participant->>'id'     AS player_id,
    participant->>'name'   AS player_name,
    participant->>'userId' AS user_id,
    g.winner_id,
    g.created_by
FROM games g,
LATERAL jsonb_array_elements(g.participants) AS participant
WHERE g.status = 'completed'
LIMIT 10;
```

Ожидания:
- `player_id` — UUID в нижнем регистре (на этом стоит regex-гард в `00012`;
  участник с невалидным id молча выпадает из рейтинга, но не роняет функцию);
- `userId` — UUID у того игрока, который отмечен как владелец устройства
  (uid аккаунта или guest-UUID), `NULL` у остальных; это by design;
- если `userId` — uid аккаунта, `created_by` равен ему же — иначе см. раздел 3;
- `winner_id` совпадает с одним из `player_id` — с `00015` это CHECK
  `games_winner_is_participant`, новая строка с чужим `winner_id` не запишется.

**Не кастуйте `participant->>'userId'` в `::uuid` в своих запросах.** Таблица
`games` пишется анонимными клиентами, поэтому одно мусорное значение уронит
весь запрос с `22P02` — ровно этот баг чинила миграция `00012`: одна битая
строка делала лидерборд недоступным для всех. Запросы в
`supabase/debug/leaderboard.sql` сравнивают id как текст именно поэтому.

### 7. Функция не возвращает данные

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
этого рядом с новой версией жила бы старая одноаргументная v4, и вызов клиента
`get_leaderboard(limit_count)` уходил бы в неё. `00015` сигнатуру не меняет:
```sql
SELECT oid::regprocedure FROM pg_proc WHERE proname = 'get_leaderboard';
-- ожидается ровно одна строка: get_leaderboard(integer,integer)
```

### 8. player_profiles

```sql
SELECT user_id, display_name, avatar_url, created_at FROM player_profiles LIMIT 10;
```

`ensurePlayerProfile` (`lib/sync.ts`) перед записью игры создаёт профиль
только **вошедшему** пользователю и только если его ещё нет (`display_name` —
часть email до `@`; `ignoreDuplicates`, существующий не перезаписывается),
один раз на аккаунт за сессию. С `00015` вставить профиль может только сам
`authenticated` с `user_id = auth.uid()`. У гостей профиля нет — лидерборд
берёт имя из `participants` (из последней игры игрока). Профиль влияет на имя и
аватар, а с v6 ещё и на то, считается ли uid «аккаунтом»: `LEFT JOIN
player_profiles` никого не отфильтровывает.

## Порядок разбора

1. **Запустить `supabase/debug/leaderboard.sql`** целиком в Supabase SQL Editor.
2. **Посмотреть консоль и экран победителя**: сыграть партию до конца; ошибок
   из раздела 4 быть не должно, а у вошедшего игрока экран сообщит итог
   выгрузки.
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
5. **Досинхронизировать**: вошедшему — кнопка **Sync** на `/history` (сначала
   выгружает очередь, потом скачивает); гостю — перезагрузить приложение с
   сетью или вернуться на вкладку. Импортировать модуль из консоли нельзя —
   алиас `@/lib/sync` существует только на этапе сборки.

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

### Воспроизвести группировку v6 вручную (без порога и без кастов)

Результат совпадает с `get_leaderboard(100, 1)` по ключам, числу игр и побед
(проверено на локальной базе со всеми миграциями).

```sql
WITH accounts AS (
    SELECT user_id::text AS key FROM player_profiles WHERE user_id IS NOT NULL
    UNION
    SELECT created_by::text FROM games WHERE created_by IS NOT NULL
),
participant_rows AS (
    SELECT
        g.id                          AS game_id,
        lower(participant->>'id')     AS player_key,
        participant->>'name'          AS player_name,
        g.created_by::text            AS writer_key,
        CASE
            WHEN participant->>'userId' ~*
                 '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            THEN lower(participant->>'userId')
        END                           AS claimed_key,
        lower(g.winner_id::text)      AS winner_key
    FROM games g
    CROSS JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(g.participants) = 'array'
             THEN g.participants ELSE '[]'::jsonb END
    ) AS participant
    WHERE g.status = 'completed'
),
keyed AS (
    SELECT
        pr.*,
        CASE
            WHEN pr.claimed_key IS NULL THEN NULL                      -- нет userId
            WHEN NOT EXISTS (SELECT 1 FROM accounts a WHERE a.key = pr.claimed_key)
                THEN pr.claimed_key                                    -- guest-UUID
            WHEN pr.claimed_key = pr.writer_key THEN pr.claimed_key    -- своя игра аккаунта
            ELSE NULL                                                  -- аккаунт в чужой строке
        END AS user_key
    FROM participant_rows pr
)
SELECT
    COALESCE(user_key, player_key)                                 AS stable_key,
    max(player_name)                                               AS player_name,
    COUNT(DISTINCT game_id)                                        AS total_games,
    COUNT(DISTINCT game_id) FILTER (WHERE player_key = winner_key) AS games_won
FROM keyed k
-- участник по id, который сам uid аккаунта, отбрасывается, как в v6
WHERE k.user_key IS NOT NULL
   OR NOT EXISTS (SELECT 1 FROM accounts a WHERE a.key = k.player_key)
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
- Гостевая и аккаунтная личность в лидерборде не склеиваются: игры, сыгранные
  гостем до входа, остаются строкой guest-UUID. `/stats` на устройстве считает
  обе (`getMyIds(userId, getGuestId())`), а на другом устройстве гостевые игры
  из облака не восстанавливаются (`created_by` у них `NULL` или они считаются
  под guest-UUID).
- Подделка закрыта только для аккаунтов. Гостевую строку по-прежнему можно
  сдвинуть вставкой выдуманной игры: guest-UUID и id участников видны в любой
  публичной строке. Аккаунт, который ещё ничего не записал (ни профиля, ни
  игры), неотличим от гостя. А вошедший игрок может накрутить себе статистику
  собственными играми. См. [SECURITY.md](./SECURITY.md).

## Контакт для поддержки

Если проблема не решена, приложите:
1. Результаты запросов из `supabase/debug/leaderboard.sql`
2. Скриншот консоли браузера после завершения игры
3. Структуру последней завершённой игры
4. Содержимое localStorage-ключей `killerpool_roster`, `killerpool_guest_id`,
   `killerpool_pending_sync`, `killerpool_pending_sync_meta`

---
*Документ актуализирован: 2026-10-16*
