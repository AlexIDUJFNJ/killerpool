# 📱 PWA Setup Guide - Killerpool

Полное руководство по настройке и использованию PWA функциональности в Killerpool.

**Последнее обновление:** 2026-07-07

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

- ✅ **Service Worker** (`@ducanh2912/next-pwa` + Workbox) с регистрацией из `components/pwa-init.tsx`
- ✅ **Офлайн режим** - игра полностью работает без интернета (состояние в localStorage)
- ✅ **Кеширование ресурсов** - статика, Supabase API, изображения, видео
- ✅ **Retry-синхронизация** - неудачные синки игр помечаются pending и повторяются при восстановлении связи (`retryPendingSyncs()` из `lib/sync.ts`)
- ✅ **Установка на устройства** - iOS, Android, Desktop
- ✅ **Manifest.json** с полной конфигурацией
- ✅ **Иконки** - 16x16 до 512x512, генерируются из `public/icon.svg`
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
│   └── pwa-init.tsx        # Регистрация SW + retry pending-синков
├── lib/
│   ├── sync.ts             # autoSyncGame / retryPendingSyncs / syncActiveGameToSupabase
│   └── storage.ts          # killerpool_pending_sync (mark/unmark/getPendingSyncIds)
└── scripts/
    └── generate-icons.js   # Генерация иконок из icon.svg (sharp)
```

### Поток работы PWA

```
1. User загружает приложение
   ↓
2. PWAInit (components/pwa-init.tsx) регистрирует /sw.js
   и сразу вызывает retryPendingSyncs()
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

Помимо `register: true`, регистрация продублирована в `components/pwa-init.tsx` (клиентский компонент, монтируется в `app/layout.tsx`):

- `navigator.serviceWorker.register('/sw.js')`
- слушает `updatefound` / `statechange` — логирует появление новой версии SW
- слушает `beforeinstallprompt` / `appinstalled` (сохраняет deferred prompt, кастомная UI-кнопка установки пока не показывается)

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

Находится в `app/offline/page.tsx` (client component):

- Показывает статус подключения (`navigator.onLine` + события `online`/`offline`)
- При восстановлении связи автоматически редиректит на `/` через 1 секунду
- Кнопка "Повторить попытку" (`router.push('/')` если онлайн, иначе `window.location.reload()`)
- Блок с информацией об офлайн режиме и автоматической синхронизации

### Тестирование офлайн режима

1. Откройте приложение в Chrome DevTools
2. Application → Service Workers → проверьте регистрацию
3. Network → Offline checkbox
4. Обновите страницу → приложение должно работать из кеша

---

## 🔄 Офлайн-синхронизация (pending sync retry)

> Заменяет прежний Background Sync API + `lib/sync-manager.ts` — эта подсистема удалена. Никакого `sync`-события в SW и очереди `killerpool_sync_queue` больше нет. REST-эндпоинтов `/api/games*` в проекте тоже нет — вся синхронизация идёт напрямую через Supabase JS-клиент.

### Как работает

1. После завершения игры вызывается `autoSyncGame(game)` (`lib/sync.ts`) — upsert игры в таблицу `games` Supabase
2. Если синк не удался (например, офлайн) → id игры помечается в localStorage-ключе **`killerpool_pending_sync`** (`markPendingSync`, `lib/storage.ts`)
3. `retryPendingSyncs()` проходит по pending-ids, находит игры в истории и повторяет `syncGameToSupabase(game)`; успешные — снимаются с pending (`unmarkPendingSync`)
4. Игры, удалённые из истории, просто снимаются с pending

### API

```typescript
// lib/sync.ts
export async function autoSyncGame(game: Game): Promise<void>
export async function retryPendingSyncs(): Promise<void>
export async function syncGameToSupabase(game: Game): Promise<boolean>

// lib/storage.ts (ключ killerpool_pending_sync)
export function getPendingSyncIds(): string[]
export function markPendingSync(gameId: string): void
export function unmarkPendingSync(gameId: string): void
```

### Когда запускается retry

`components/pwa-init.tsx` вызывает `retryPendingSyncs()`:

- при монтировании приложения
- на событии `window` `online`
- на `document` `visibilitychange` (если вкладка стала видимой и `navigator.onLine`)

`retryPendingSyncs()` сам выходит рано, если выполняется на сервере или `navigator.onLine === false`.

### Ручная синхронизация

Страница `/sync` (`app/sync/page.tsx`) позволяет вручную выгрузить всю локальную историю игр в Supabase через `syncAllGamesToSupabase()`.

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
- `favicon.ico` - Browser (32x32)

### Manifest.json

Актуальные поля `public/manifest.json`:

```json
{
  "name": "Killerpool - Modern Killer Pool Game",
  "short_name": "Killerpool",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0a0f0d",
  "theme_color": "#10b981",
  "orientation": "portrait",
  "scope": "/",
  "categories": ["games", "entertainment", "sports"],
  "lang": "ru"
}
```

Иконки в манифесте: `icon-192.png` и `icon-512.png` с `purpose: "any maskable"`, плюс `apple-touch-icon.png` (180x180, `purpose: "any"`).

### Мета-теги в layout.tsx

`app/layout.tsx` подключает PWA-метаданные:

- `metadata.manifest: '/manifest.json'`
- `metadata.appleWebApp` (`capable: true`, `title: 'Killerpool'`)
- `viewport.themeColor: '#10b981'`
- `<link rel="icon">` для favicon.ico / 16x16 / 32x32, `<link rel="apple-touch-icon">`
- `<meta name="apple-mobile-web-app-capable" content="yes">`, `apple-mobile-web-app-status-bar-style: black-translucent`, `mobile-web-app-capable`, `format-detection: telephone=no`

OG/Twitter-картинки — динамические route-файлы `app/opengraph-image.tsx` и `app/twitter-image.tsx` (статического og-image.png нет).

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

---

## 🧪 Тестирование

### Lighthouse PWA Audit

```bash
npm run build
npm run start

# В Chrome DevTools:
# 1. Lighthouse → PWA
# 2. Generate report
```

> Помните: в dev-режиме (`npm run dev`) SW отключён (`disable: NODE_ENV === 'development'`).

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
   Завершите игру офлайн → id появится в `killerpool_pending_sync` → включите сеть (или вернитесь на вкладку) → массив должен опустеть, игра появится в Supabase.

3. **Manifest**:
   - DevTools → Application → Manifest
   - Проверьте все поля
   - Проверьте иконки

### iOS Safari тестирование

1. Установите приложение на домашний экран
2. Откройте установленное приложение
3. Проверьте:
   - Полноэкранный режим (без адресной строки Safari)
   - Статус-бар (`black-translucent`)
   - Иконка приложения

---

## 🔧 Troubleshooting

### Service Worker не регистрируется

**Проблема**: `navigator.serviceWorker` is undefined

**Решение**:
- Убедитесь, что используете HTTPS (или localhost)
- Убедитесь, что это production-билд — в dev SW отключён
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
3. Триггерните retry вручную: уйдите с вкладки и вернитесь (событие `visibilitychange`) либо перезагрузите страницу — `retryPendingSyncs()` вызывается при монтировании `PWAInit`
4. Проверьте консоль на ошибки Supabase (RLS, сеть)

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
- Проверьте Content-Type: должен быть `application/manifest+json`

---

## 📊 Метрики успеха PWA

### Lighthouse PWA Score

Цель: **100/100**

Критерии:
- ✅ Fast and reliable
- ✅ Installable
- ✅ PWA optimized

### Core Web Vitals

- **LCP** (Largest Contentful Paint): < 2.5s
- **INP** (Interaction to Next Paint): < 200ms
- **CLS** (Cumulative Layout Shift): < 0.1

---

## 🚀 Production Checklist

Перед деплоем убедитесь:

- [ ] Service Worker регистрируется корректно (production-билд)
- [ ] Все иконки сгенерированы и доступны (`node scripts/generate-icons.js`)
- [ ] Manifest.json корректен и доступен
- [ ] Офлайн страница работает
- [ ] Retry-синк работает: игра, завершённая офлайн, попадает в Supabase после восстановления связи
- [ ] Lighthouse PWA score = 100
- [ ] Тестирование на iOS Safari
- [ ] Тестирование на Android Chrome
- [ ] HTTPS включен
- [ ] Кеш-стратегии настроены корректно

---

## 🗺️ Planned / Not implemented

- **Share Target**: объявление `share_target` убрано из `manifest.json` — оно указывало на несуществующий route `/share`, из-за чего Android показывал приложение в системном share-меню, а шаринг приводил к 404
- **UI-кнопка установки**: `beforeinstallprompt` перехватывается в `pwa-init.tsx`, но кастомная кнопка установки не показывается (deferred prompt сохраняется и не используется)
- **Уведомление о новой версии SW**: событие `updatefound` логируется в консоль; toast для пользователя не реализован
- **Screenshots в манифесте**: массив `screenshots` пуст

---

## 📚 Ресурсы

- [Next-PWA Documentation](https://ducanh-next-pwa.vercel.app/)
- [Web.dev PWA Guide](https://web.dev/progressive-web-apps/)
- [MDN Service Worker API](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)
- [PWA Builder](https://www.pwabuilder.com/)
- [Workbox Documentation](https://developer.chrome.com/docs/workbox/)

---

**Последнее обновление:** 2026-07-07
**Статус:** ✅ PWA работает; офлайн-синк переведён с Background Sync API на простой retry-механизм
