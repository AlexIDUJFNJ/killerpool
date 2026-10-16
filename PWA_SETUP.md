# 📱 PWA Setup Guide - Killerpool

Полное руководство по настройке и использованию PWA функциональности в Killerpool.

**Последнее обновление:** 2026-10-16

## 📋 Содержание

- [Что реализовано](#что-реализовано)
- [Архитектура PWA](#архитектура-pwa)
- [Service Worker](#service-worker)
- [Офлайн режим](#офлайн-режим)
- [Офлайн-синхронизация (pending sync retry)](#офлайн-синхронизация-pending-sync-retry)
- [Иконки и манифест](#иконки-и-манифест)
- [Установка на устройства](#установка-на-устройства)
- [Тестирование](#тестирование)
- [Troubleshooting](#troubleshooting)
- [Planned / Not implemented](#planned--not-implemented)

---

## ✅ Что реализовано

### Основные функции PWA

- ✅ **Service Worker** (`@ducanh2912/next-pwa` + Workbox); регистрирует его только сам плагин (`register: true`)
- ✅ **Офлайн режим** - игра полностью работает без интернета (состояние в localStorage)
- ✅ **Кеширование ресурсов** - статика, Supabase API, изображения, видео
- ✅ **Очередь выгрузки** - завершённая или брошенная игра встаёт в очередь `killerpool_pending_sync` до первой попытки и догоняется при восстановлении связи (`retryPendingSyncs()` из `lib/sync.ts`), до 14 дней
- ✅ **Установка на устройства** - iOS, Android, Desktop
- ✅ **Manifest.json** на английском, как и весь интерфейс
- ✅ **Иконки** - 16x16 до 512x512 и настоящий `favicon.ico`, генерируются из `public/icon.svg`
- ✅ **Офлайн fallback страница** - `/offline`

> ⚠️ Background Sync API и `lib/sync-manager.ts` (очередь `killerpool_sync_queue`) **удалены** — вместо них простой retry-механизм на localStorage, см. раздел [Офлайн-синхронизация](#офлайн-синхронизация-pending-sync-retry).

> ⚠️ **Production-сборка обязана идти через webpack** (`next build --webpack`, так настроен `npm run build`): `@ducanh2912/next-pwa` генерирует `sw.js` через webpack-хук, который Turbopack не выполняет. Turbopack-сборка молча выпускает приложение **без service worker** — регистрация `/sw.js` падает 404, офлайн-кеширование не работает.

### Стратегии кеширования

Все стратегии заданы в `workboxOptions.runtimeCaching` в `next.config.js`:

| Тип ресурса | Стратегия | Кеш | Детали |
|-------------|-----------|-----|--------|
| Google Fonts (`fonts.gstatic.com`, `fonts.googleapis.com`) | CacheFirst | `google-fonts` | 365 дней, до 4 записей |
| Supabase API (`*.supabase.co`) | NetworkFirst | `supabase-api` | 24 часа, до 32 записей, network timeout 10s |
| Изображения (jpg/jpeg/gif/png/svg/ico/webp) | CacheFirst | `static-image-assets` | 24 часа, до 64 записей |
| JavaScript (`.js`) | StaleWhileRevalidate | `static-js-assets` | 24 часа, до 32 записей |
| CSS (`.css`) | StaleWhileRevalidate | `static-css-assets` | 24 часа, до 32 записей |
| JSON данные (`https://*.json`) | NetworkFirst | `static-data-assets` | 24 часа, до 32 записей |
| Next.js Images (`/_next/image?url=...`) | CacheFirst | `next-image` | 24 часа, до 64 записей |
| Видео (mp4/webm) | CacheFirst | `static-video-assets` | 24 часа, до 32 записей |

---

## 🏗️ Архитектура PWA

### Компоненты

```
killerpool/
├── next.config.js          # Конфигурация @ducanh2912/next-pwa + runtimeCaching
├── public/
│   ├── manifest.json       # PWA манифест
│   ├── icon.svg            # Исходная иконка
│   ├── icon-*.png          # Сгенерированные иконки
│   └── sw.js               # Service Worker (генерируется при build)
├── app/
│   ├── layout.tsx          # PWA мета-теги, manifest, viewport themeColor
│   └── offline/
│       └── page.tsx        # Офлайн страница
├── components/
│   ├── pwa-init.tsx        # Retry очереди выгрузки + захват install-события (SW регистрирует next-pwa)
│   └── pwa-install-button.tsx  # Кнопка «Install App» (на главной)
├── hooks/
│   └── use-install-prompt.ts   # useSyncExternalStore над стором установки
├── lib/
│   ├── pwa-install.ts      # Стор beforeinstallprompt вне React
│   ├── sync.ts             # syncFinishedGame / retryPendingSyncs / syncActiveGameToSupabase
│   └── storage.ts          # killerpool_pending_sync + killerpool_pending_sync_meta
└── scripts/
    └── generate-icons.js   # Генерация иконок из icon.svg (sharp)
```

### Поток работы PWA

```
1. User загружает приложение
   ↓
2. Скрипт, который next-pwa вставил в клиентский entry, регистрирует /sw.js;
   PWAInit (components/pwa-init.tsx) сразу вызывает retryPendingSyncs()
   ↓
3. Workbox кеширует статику и API-ответы
   ↓
4. Приложение работает офлайн (игра — в localStorage)
   ↓
5. При событиях 'online' / 'visibilitychange' → retryPendingSyncs()
   досинхронизирует завершённые офлайн игры в Supabase
```

---

## ⚙️ Service Worker

### Конфигурация

Service Worker настраивается через `next.config.js`:

```javascript
const withPWA = require('@ducanh2912/next-pwa').default({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  register: true,
  scope: '/',
  sw: 'sw.js',
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: true,
  swcMinify: true,
  fallbacks: {
    document: '/offline',
  },
  workboxOptions: {
    disableDevLogs: true,
    runtimeCaching: [ /* см. next.config.js */ ],
  },
});
```

Важные опции:

- `disable: process.env.NODE_ENV === 'development'` — в dev-режиме SW **не генерируется**, тестировать нужно на production-билде
- `cacheOnFrontEndNav` + `aggressiveFrontEndNavCaching` — кеширование при клиентской навигации
- `reloadOnOnline` — автоматическая перезагрузка страницы при восстановлении связи

### Регистрация

Service worker регистрирует **только** `@ducanh2912/next-pwa` (`register: true`): плагин вставляет вызов в клиентский entry, и тот же скрипт обслуживает `cacheOnFrontEndNav` и `reloadOnOnline`. В development плагин выключен, поэтому SW там не регистрируется вовсе.

Ручной `navigator.serviceWorker.register('/sw.js')` в `components/pwa-init.tsx` удалён: в production он дублировал плагин, а в `next dev` регистрировал тот `public/sw.js`, что остался от последней сборки. Логирования `updatefound` / `statechange` в коде тоже нет.

`components/pwa-init.tsx` (клиентский компонент в `app/layout.tsx`) теперь делает две вещи: запускает `retryPendingSyncs()` и вызывает `initInstallCapture()` (`lib/pwa-install.ts`), который перехватывает `beforeinstallprompt` / `appinstalled`; сама кнопка живёт в `components/pwa-install-button.tsx`.

`proxy.ts` не обрабатывает `sw.js`, `workbox-*.js`, `swe-worker-*.js`, `fallback-*.js` и `manifest.json`: service worker запрашивает их на каждой проверке обновлений, и каждый такой запрос ждал бы сетевого `getUser()` в Supabase.

### Жизненный цикл

1. **Install** - Service Worker устанавливается и прекеширует ресурсы
2. **Activate** - Очистка старых кешей
3. **Fetch** - Обработка запросов согласно runtimeCaching стратегиям

---

## 📴 Офлайн режим

### Как работает

1. Состояние игры живёт на клиенте (localStorage: `killerpool_current_game`, `killerpool_game_history`) — играть можно полностью офлайн
2. Service Worker перехватывает сетевые запросы и отдаёт из кеша по стратегиям выше
3. Если страницы нет в кеше → показ `/offline` страницы. Это работает благодаря явной опции `fallbacks: { document: '/offline' }` в конфиге `@ducanh2912/next-pwa` (`next.config.js`) — автоопределение fallback-документа у библиотеки срабатывает только для `app/~offline/page.*`, а наша страница лежит в `app/offline/page.tsx`

### Офлайн страница

Находится в `app/offline/page.tsx` (client component, текст на английском):

- Показывает статус подключения (`navigator.onLine` + события `online`/`offline`); смена статуса объявляется скринридерам (`role="status"`)
- При восстановлении связи автоматически редиректит на `/` через 1 секунду
- Кнопка «Try again» (`router.push('/')` если онлайн, иначе `window.location.reload()` — перезагрузка снова спрашивает service worker)
- Блок «Offline mode»: играть можно дальше, игры сохраняются на устройстве и выгружаются, когда сеть вернётся

### Тестирование офлайн режима

1. Откройте приложение в Chrome DevTools
2. Application → Service Workers → проверьте регистрацию
3. Network → Offline checkbox
4. Обновите страницу → приложение должно работать из кеша

---

## 🔄 Офлайн-синхронизация (pending sync retry)

> Заменяет прежний Background Sync API + `lib/sync-manager.ts` — эта подсистема удалена. Никакого `sync`-события в SW и очереди `killerpool_sync_queue` больше нет. REST-эндпоинтов `/api/games*` в проекте тоже нет — вся синхронизация идёт напрямую через Supabase JS-клиент.

### Как работает

1. Игра закончилась (победа) или брошена → `syncFinishedGame(game)` (`lib/sync.ts`). Первым делом id игры встаёт в localStorage-ключ **`killerpool_pending_sync`** (`markPendingSync`, `lib/storage.ts`) — **до** попытки, поэтому вкладка, закрытая посреди запроса, не теряет игру
2. Затем upsert строки в `games`. Исход:
   - успех — игра снимается с очереди (`unmarkPendingSync`);
   - окончательный отказ (`PERMANENT_ERROR_CODES` в `lib/sync.ts`: `42501`, `23514`, `22P02`, `PGRST204` и др.) — тоже снимается: повтор не поможет;
   - игра создана другим аккаунтом, который сейчас не вошёл, — остаётся в очереди без счётчика попыток и ждёт входа этого аккаунта;
   - всё остальное (сеть, 5xx, истёкший токен, сбой `getUser`) — `recordSyncFailure`, повтор позже
3. `retryPendingSyncs()` проходит по очереди, берёт игры из истории и пишет их тем же писателем. Пропускает игры в отсрочке (1 минута, удваиваясь, но не больше 6 часов), игру, чья первая попытка ещё в полёте, и текущую игру, если её победу отменили и она снова идёт
4. Игры, удалённые из истории, просто снимаются с очереди
5. **Попытки не бесконечны, но и не короткие:** игру держат 14 дней с первой неудачи. Прежний предел в 5 попыток при базе в минуту сдавался примерно через четверть часа — телефон, проведший вечер офлайн, терял игры вечера
6. Ачивки, разблокированные при позднем синке, доезжают до UI через событие `killerpool:achievements-unlocked` — `PWAInit` не внутри `GameProvider` и напрямую до состояния не дотянется

### API

```typescript
// lib/sync.ts
export async function syncFinishedGame(game: Game): Promise<UpsertOutcome>
export async function retryPendingSyncs(): Promise<void>
export function syncActiveGameToSupabase(game: Game): Promise<UpsertOutcome>  // live sharing, без очереди

// lib/storage.ts (ключ killerpool_pending_sync)
export function getPendingSyncIds(): string[]
export function markPendingSync(gameId: string): void
export function unmarkPendingSync(gameId: string): void

// lib/storage.ts (ключ killerpool_pending_sync_meta) — попытки и отсрочка
export const MAX_SYNC_AGE_MS = 14 * 24 * 60 * 60 * 1000
export const BACKOFF_BASE_MS = 60_000
export const BACKOFF_MAX_MS = 6 * 60 * 60 * 1000
export function recordSyncFailure(gameId: string, now?: number): void
export function isSyncExhausted(gameId: string, now?: number): boolean
export function isSyncBackedOff(gameId: string, now?: number): boolean
export function clearSyncMeta(gameId: string): void
```

Подробнее о типе `UpsertOutcome` и о том, как выбирается владелец строки, — в [API.md](./API.md#sync-api).

Счётчик держится в **отдельном** ключе намеренно: `killerpool_pending_sync`
остаётся простым массивом строк, потому что часть пользователей какое-то время
работает со старым бандлом из кеша service worker и должна уметь прочитать
очередь, записанную новой версией.

### Когда запускается retry

`components/pwa-init.tsx` вызывает `retryPendingSyncs()`:

- при монтировании приложения
- на событии `window` `online`
- на `document` `visibilitychange` (если вкладка стала видимой и `navigator.onLine`)

`retryPendingSyncs()` сам выходит рано, если выполняется на сервере, `navigator.onLine === false` или предыдущий прогон ещё не закончился.

### Ручная синхронизация

Страницы `/sync` больше нет. Её заменила кнопка **Sync** на `/history` (видна вошедшим и онлайн): она сначала выгружает очередь (`retryPendingSyncs()`), потом скачивает игры аккаунта и сливает их с локальной историей (`mergeGamesWithSupabase()`). Раньше эта кнопка только скачивала, и игры из очереди ждали следующего события.

---

## 🎨 Иконки и манифест

### Генерация иконок

Иконки генерируются из `public/icon.svg` библиотекой `sharp`:

```bash
node scripts/generate-icons.js
```

Создаются следующие файлы (см. `scripts/generate-icons.js`):

- `icon-192.png` - Android (192x192)
- `icon-512.png` - Android (512x512)
- `apple-touch-icon.png` - iOS (180x180)
- `favicon-32x32.png` - Browser
- `favicon-16x16.png` - Browser
- `favicon.ico` - Browser: настоящий ICO-контейнер с PNG 16, 32 и 48 px. `sharp` ICO не кодирует, и раньше под этим именем лежал обычный PNG — браузеры его прощали, Windows и часть краулеров нет

### Manifest.json

Актуальные поля `public/manifest.json`:

```json
{
  "name": "Killerpool - Modern Killer Pool Game",
  "short_name": "Killerpool",
  "description": "Track Killer Pool games with friends: lives, turns, history and stats. Works offline.",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0a0f0d",
  "theme_color": "#10b981",
  "orientation": "portrait",
  "scope": "/",
  "categories": ["games", "entertainment", "sports"],
  "lang": "en",
  "dir": "ltr"
}
```

Иконки в манифесте: `icon-192.png` и `icon-512.png` с `purpose: "any maskable"`, плюс `apple-touch-icon.png` (180x180, `purpose: "any"`).

### Мета-теги в layout.tsx

`app/layout.tsx` подключает PWA-метаданные:

- `metadata.manifest: '/manifest.json'`
- `<html lang="en">`
- `metadata.appleWebApp` (`capable: true`, `statusBarStyle: 'black'`, `title: 'Killerpool'`) — Next выводит из него `mobile-web-app-capable` и `apple-mobile-web-app-status-bar-style`. `black` — непрозрачная полоса со светлым текстом: подходит тёмной теме по умолчанию, читается на светлой и не заводит шапку под часы, как `black-translucent`
- `viewport`: `width: 'device-width'`, `initialScale: 1`, `themeColor: '#10b981'`; `maximumScale` нет — масштабирование разрешено (WCAG 1.4.4), а поля ввода с шрифтом 16px не провоцируют автозум iOS
- `<link rel="icon">` для favicon.ico / 16x16 / 32x32, `<link rel="apple-touch-icon">`
- `<meta name="apple-mobile-web-app-capable" content="yes">` (для старых iOS), `format-detection: telephone=no`

OG/Twitter-картинки — route-файлы `app/opengraph-image.tsx` и `app/twitter-image.tsx` (статического og-image.png нет) на Node.js runtime; входных данных у них нет, поэтому рендерятся один раз при сборке.

---

## 📲 Установка на устройства

### iOS (Safari)

1. Откройте сайт в Safari
2. Нажмите кнопку "Поделиться" (квадрат со стрелкой вверх)
3. Прокрутите вниз → "На экран Домой"
4. Нажмите "Добавить"

**Требования:**
- iOS 11.3+
- Safari браузер
- Иконка `apple-touch-icon.png`

### Android (Chrome)

1. Откройте сайт в Chrome
2. Нажмите меню (три точки)
3. "Установить приложение" / "Add to Home screen"
4. Подтвердите установку

**Требования:**
- Chrome 68+
- manifest.json
- Service Worker
- HTTPS

### Desktop (Chrome, Edge)

1. Откройте сайт в Chrome/Edge
2. Справа в адресной строке появится иконка установки
3. Нажмите на иконку
4. Подтвердите установку

### Кнопка «Install App» в приложении

`components/pwa-install-button.tsx` (на главной, `app/page.tsx`) показывает
кнопку сам, без обращения к системному меню браузера. Состояние приходит из
стора `lib/pwa-install.ts` через `useInstallPrompt()`:

| Состояние | Что показывается |
|-----------|------------------|
| `available` | Кнопка, вызывающая сохранённый `beforeinstallprompt` |
| `ios` | Кнопка, открывающая bottom sheet с инструкцией про «На экран Домой» |
| `installed` | Ничего |
| `unavailable` | Ничего |

Два решения, которые стоит держать в голове при правках:

- Стор живёт **вне React**: `beforeinstallprompt` срабатывает один раз и может
  прилететь раньше, чем что-либо смонтируется. Компонент читает его через
  `useSyncExternalStore`, а не подписывается сам.
- `initInstallCapture()` вызывает `preventDefault()` на событии, то есть гасит
  собственную плашку браузера. Тот, кто это делает, обязан пользователю кнопку:
  без неё приложение просто нельзя установить этим путём.
- iPadOS 13+ представляется как Macintosh, поэтому iOS определяется по
  `navigator.maxTouchPoints`, а не по одному user agent.

---

## 🧪 Тестирование

### Локальный production-билд

```bash
npm run build
npm run start
# Chrome DevTools → Application: Manifest (устанавливаемость) и Service Workers
```

> Помните: в dev-режиме (`npm run dev`) SW отключён (`disable: NODE_ENV === 'development'`). Отдельной PWA-категории в современном Lighthouse нет — устанавливаемость смотрят в DevTools → Application → Manifest.

### Проверка Service Worker

```javascript
// В консоли браузера
navigator.serviceWorker.getRegistration()
  .then(reg => console.log('SW registered:', reg))

// Проверка кешей
caches.keys().then(keys => console.log('Cache keys:', keys))
```

### Тестирование офлайн и retry-синка

1. **Chrome DevTools**:
   - Application → Service Workers → проверьте статус
   - Network → Offline
   - Обновите страницу

2. **Pending sync**:
   ```javascript
   // В консоли — посмотреть очередь pending-игр
   JSON.parse(localStorage.getItem('killerpool_pending_sync') || '[]')
   ```
   Завершите игру офлайн → id появится в `killerpool_pending_sync` (он появляется ещё до попытки, так что виден и онлайн, пока запрос в полёте) → включите сеть (или вернитесь на вкладку) → массив должен опустеть, игра появится в Supabase. Если сеть вернулась быстро, попытка может быть ещё в отсрочке: смотрите `lastAttemptAt` и `attempts` в `killerpool_pending_sync_meta`.

3. **Manifest**:
   - DevTools → Application → Manifest
   - Проверьте все поля
   - Проверьте иконки

### iOS Safari тестирование

1. Установите приложение на домашний экран
2. Откройте установленное приложение
3. Проверьте:
   - Полноэкранный режим (без адресной строки Safari)
   - Статус-бар (`black`, непрозрачный)
   - Иконка приложения

---

## 🔧 Troubleshooting

### Service Worker не регистрируется

**Проблема**: `navigator.serviceWorker` is undefined

**Решение**:
- Убедитесь, что используете HTTPS (или localhost)
- Убедитесь, что это production-билд — в dev SW отключён и не регистрируется вообще, даже если в `public/` остался `sw.js` от прошлой сборки
- Проверьте, что `sw.js` есть: сборка должна идти через webpack (`npm run build`), Turbopack-сборка выходит без него
- Откройте DevTools → Console для ошибок

### Кеш не обновляется

**Проблема**: Старая версия приложения после деплоя

**Решение**:
```javascript
// Обновить Service Worker
navigator.serviceWorker.getRegistrations()
  .then(regs => regs.forEach(reg => reg.update()))

// Очистить все кеши
caches.keys().then(keys =>
  Promise.all(keys.map(key => caches.delete(key)))
)
```

### Игра не досинхронизировалась после офлайна

**Проблема**: Завершённая офлайн игра не появилась в Supabase

**Решение**:
1. Проверьте pending-очередь:
   ```javascript
   JSON.parse(localStorage.getItem('killerpool_pending_sync') || '[]')
   ```
2. Убедитесь, что игра осталась в `killerpool_game_history` — retry берёт данные оттуда (`getGameFromHistory`), удалённые из истории игры снимаются с pending без синка
3. Триггерните retry вручную: кнопка Sync на `/history` (для вошедших), уход с вкладки и возврат (событие `visibilitychange`) или перезагрузка страницы — `retryPendingSyncs()` вызывается при монтировании `PWAInit`. Игра в отсрочке до следующего срока не пойдёт
4. Проверьте консоль на ошибки Supabase (`Failed to sync game to Supabase: <сообщение> <код>`). Если игра создана под другим аккаунтом, она ждёт его входа (когда вошёл другой аккаунт, экран победителя об этом говорит)
5. Гостевая игра, которая уже лежит в облаке, после входа в аккаунт перезаписана быть не может (`42501`, окончательный отказ) — она остаётся только в локальной истории

### iOS не показывает prompt установки

**Проблема**: На iOS нет автоматического prompt

**Решение**:
- iOS не показывает автоматический prompt
- Пользователь должен вручную добавить через Safari menu
- Можно показать инструкцию в UI

### Manifest не обнаружен

**Проблема**: DevTools показывает "No manifest detected"

**Решение**:
- Manifest подключается через `metadata.manifest` в `app/layout.tsx`
- Убедитесь, что `manifest.json` доступен по пути `/manifest.json`

---

## 🚀 Production Checklist

Перед деплоем убедитесь:

- [ ] Service Worker регистрируется корректно (production-билд)
- [ ] Все иконки сгенерированы и доступны (`node scripts/generate-icons.js`)
- [ ] Manifest.json корректен и доступен
- [ ] Офлайн страница работает
- [ ] Retry-синк работает: игра, завершённая офлайн, попадает в Supabase после восстановления связи
- [ ] DevTools → Application → Manifest не показывает ошибок установки
- [ ] Тестирование на iOS Safari
- [ ] Тестирование на Android Chrome
- [ ] HTTPS включен
- [ ] Кеш-стратегии настроены корректно

---

## 🗺️ Planned / Not implemented

- **Share Target**: объявление `share_target` убрано из `manifest.json` — оно указывало на несуществующий route `/share`, из-за чего Android показывал приложение в системном share-меню, а шаринг приводил к 404
- **Уведомление о новой версии SW**: не реализовано — обработчика `updatefound` в коде нет, toast для пользователя тоже
- **Screenshots в манифесте**: массив `screenshots` пуст

---

## 📚 Ресурсы

- [Next-PWA Documentation](https://ducanh-next-pwa.vercel.app/)
- [Web.dev PWA Guide](https://web.dev/progressive-web-apps/)
- [MDN Service Worker API](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)
- [PWA Builder](https://www.pwabuilder.com/)
- [Workbox Documentation](https://developer.chrome.com/docs/workbox/)

---

**Последнее обновление:** 2026-10-16
**Статус:** ✅ PWA работает; SW регистрирует только next-pwa; офлайн-выгрузка — очередь до 14 дней; кнопка установки реализована
