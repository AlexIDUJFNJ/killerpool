# Устранение проблем с лидербордом

## Проблема
Лидерборд показывает "The Leaderboard Awaits!" даже после завершения игры.

## Возможные причины

### 1. Игра не сохранилась в базу данных

**Как проверить:**
Откройте консоль браузера (F12) и проверьте наличие ошибок при завершении игры. Ищите сообщения вроде:
- `Failed to sync game to Supabase`
- `Failed to auto-sync game`

**Запустите отладочные SQL запросы** из файла `debug_leaderboard.sql` в Supabase SQL Editor:

```sql
-- Проверить наличие завершенных игр
SELECT
    id,
    status,
    winner_id,
    created_at,
    created_by,
    jsonb_array_length(participants) as player_count
FROM games
WHERE status = 'completed'
ORDER BY created_at DESC
LIMIT 10;
```

**Если игр нет:**
- Проверьте, что пользователь аутентифицирован при создании игры
- Проверьте RLS политики для таблицы `games`
- Проверьте логи ошибок в консоли браузера

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
- `player_id` должен быть UUID
- `player_name` должен содержать имя игрока
- `userId` должен быть UUID создателя игры (может быть NULL для анонимных игр)
- `winner_id` должен совпадать с одним из `player_id`

### 3. Функция get_leaderboard не возвращает данные

**Как проверить:**
Запустите функцию напрямую в Supabase SQL Editor:

```sql
SELECT * FROM get_leaderboard(15);
```

**Если результат пустой:**
- Убедитесь, что есть хотя бы одна завершенная игра (см. пункт 1)
- Проверьте, что функция имеет права `SECURITY DEFINER`
- Проверьте, что функция имеет `GRANT EXECUTE` для `authenticated` и `anon`

### 4. Проблема с userId в participants

**Текущее поведение:**
При создании игры все игроки получают `userId` создателя игры. Это правильно для сценария, когда один человек создает игру для группы.

**Важно:**
Функция `get_leaderboard` группирует по `player_id`, а не по `user_id`, поэтому каждый игрок в игре будет отображаться отдельно в лидерборде.

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

Функция `autoSyncGame` автоматически создает профиль при синхронизации игры, если его еще нет.

## Решение

### Шаг 1: Запустить все отладочные запросы
Откройте файл `debug_leaderboard.sql` и запустите все запросы по очереди в Supabase SQL Editor.

### Шаг 2: Проверить логи
1. Откройте консоль браузера (F12)
2. Сыграйте новую игру до конца
3. Проверьте наличие ошибок
4. Ищите сообщение "Game successfully synced to Supabase"

### Шаг 3: Проверить аутентификацию
Убедитесь, что:
- Пользователь аутентифицирован при создании игры
- `user?.id` не undefined в `app/game/new/page.tsx:79`

### Шаг 4: Проверить базу данных
После завершения игры, запустите:
```sql
SELECT
    id,
    status,
    winner_id,
    jsonb_pretty(participants) as participants,
    created_by
FROM games
ORDER BY created_at DESC
LIMIT 1;
```

Убедитесь, что:
- `status` = `'completed'`
- `winner_id` не NULL
- `participants` содержит массив игроков с правильной структурой
- `created_by` содержит UUID аутентифицированного пользователя

### Шаг 5: Вручную синхронизировать игры
Если игры есть в localStorage, но не в базе данных, можно создать страницу для ручной синхронизации:

```typescript
import { syncAllGamesToSupabase } from '@/lib/sync'

const result = await syncAllGamesToSupabase()
console.log('Synced:', result)
```

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

### Проверить, работает ли функция get_leaderboard с SECURITY DEFINER
```sql
-- Проверить определение функции
\df+ get_leaderboard

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

## Контакт для поддержки

Если проблема не решена, предоставьте:
1. Результаты всех отладочных запросов из `debug_leaderboard.sql`
2. Скриншот консоли браузера после завершения игры
3. Результат запроса структуры последней завершенной игры
