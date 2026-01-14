# 📱 PWA Setup Guide - Killerpool

Полное руководство по настройке и использованию PWA функциональности в Killerpool.

## 📋 Содержание

- [Что реализовано](#что-реализовано)
- [Архитектура PWA](#архитектура-pwa)
- [Service Worker](#service-worker)
- [Офлайн режим](#офлайн-режим)
- [Background Sync](#background-sync)
- [Иконки и манифест](#иконки-и-манифест)
- [Установка на устройства](#установка-на-устройства)
- [Тестирование](#тестирование)
- [Troubleshooting](#troubleshooting)

---

## ✅ Что реализовано

### Основные функции PWA

- ✅ **Service Worker** с автоматической регистрацией
- ✅ **Офлайн режим** - приложение работает без интернета
- ✅ **Кеширование ресурсов** - статика, API, изображения
- ✅ **Background Sync** - синхронизация данных при восстановлении связи
- ✅ **Установка на устройства** - iOS, Android, Desktop
- ✅ **Manifest.json** с полной конфигурацией
- ✅ **Иконки всех размеров** - 16x16 до 512x512
- ✅ **Офлайн fallback страница** - `/offline`

### Стратегии кеширования

| Тип ресурса | Стратегия | Описание |
|-------------|-----------|----------|
| Google Fonts | CacheFirst | Кеш на 365 дней |
| Supabase API | NetworkFirst | Сеть, затем кеш (timeout: 10s) |
| Изображения | CacheFirst | Кеш на 24 часа |
| JavaScript | StaleWhileRevalidate | Показ кеша, обновление в фоне |
| CSS | StaleWhileRevalidate | Показ кеша, обновление в фоне |
| JSON данные | NetworkFirst | Приоритет сети |
| Next.js Images | CacheFirst | Кеш на 24 часа |

---

## 🏗️ Архитектура PWA

### Компоненты

```
killerpool/
├── next.config.js          # Конфигурация next-pwa
├── public/
│   ├── manifest.json       # PWA манифест
│   ├── icon-*.png          # Иконки приложения
│   └── sw.js              # Service Worker (генерируется)
├── app/
│   ├── layout.tsx          # PWA мета-теги
│   └── offline/
│       └── page.tsx        # Офлайн страница
├── components/
│   └── pwa-init.tsx        # PWA инициализация
└── lib/
    └── sync-manager.ts     # Background Sync менеджер
```

### Поток работы PWA

```
1. User загружает приложение
   ↓
2. Service Worker регистрируется
   ↓
3. Статика кешируется
   ↓
4. Приложение работает офлайн
   ↓
5. При восстановлении связи → Background Sync
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
  // ... см. next.config.js для полной конфигурации
});
```

### Runtime Caching

- **Google Fonts**: CacheFirst, 365 дней
- **Supabase API**: NetworkFirst, 24 часа, timeout 10s
- **Изображения**: CacheFirst, 24 часа
- **JS/CSS**: StaleWhileRevalidate, 24 часа

### Жизненный цикл

1. **Install** - Service Worker устанавливается и кеширует ресурсы
2. **Activate** - Очистка старых кешей
3. **Fetch** - Обработка запросов согласно стратегиям
4. **Sync** - Background синхронизация при восстановлении связи

---

## 📴 Офлайн режим

### Как работает

1. Service Worker перехватывает все сетевые запросы
2. Если запрос не может быть выполнен → возврат из кеша
3. Если нет в кеше → показ `/offline` страницы

### Офлайн страница

Находится в `app/offline/page.tsx`:

- Показывает статус подключения
- Автоматически редиректит при восстановлении связи
- Кнопка "Повторить попытку"
- Информация об офлайн режиме

### Тестирование офлайн режима

1. Откройте приложение в Chrome DevTools
2. Application → Service Workers → проверьте регистрацию
3. Network → Offline checkbox
4. Обновите страницу → должна показаться офлайн страница

---

## 🔄 Background Sync

### Архитектура

Background Sync позволяет синхронизировать данные игр с сервером при восстановлении интернет-соединения.

### Sync Manager API

```typescript
import {
  addToSyncQueue,
  getSyncQueue,
  requestBackgroundSync,
  setupSyncListeners
} from '@/lib/sync-manager'

// Добавить игру в очередь синхронизации
addToSyncQueue('game_create', gameData)

// Запросить синхронизацию
await requestBackgroundSync()

// Получить количество pending синхронизаций
const count = getPendingSyncCount()
```

### Типы синхронизации

- `game_create` - Создание новой игры
- `game_update` - Обновление игры
- `game_complete` - Завершение игры

### Retry логика

- Максимум 3 попытки для каждого элемента
- Автоматический retry при восстановлении связи
- Очистка после успешной синхронизации

### События синхронизации

```typescript
// Синхронизация при восстановлении связи
window.addEventListener('online', () => {
  requestBackgroundSync()
})

// Синхронизация при возврате на страницу
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && navigator.onLine) {
    requestBackgroundSync()
  }
})
```

---

## 🎨 Иконки и манифест

### Генерация иконок

Иконки генерируются автоматически из SVG:

```bash
node scripts/generate-icons.js
```

Создаются следующие размеры:

- `icon-192.png` - Android (192x192)
- `icon-512.png` - Android (512x512)
- `apple-touch-icon.png` - iOS (180x180)
- `favicon-16x16.png` - Browser
- `favicon-32x32.png` - Browser
- `favicon.ico` - Browser

### Исходная иконка

`public/icon.svg` - 8-ball дизайн с градиентом:
- Черный шар с белым кругом
- Число "8" внутри
- Emerald градиент вокруг
- Эффект свечения

### Manifest.json

```json
{
  "name": "Killerpool - Modern Killer Pool Game",
  "short_name": "Killerpool",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0a0f0d",
  "theme_color": "#10b981",
  "orientation": "portrait"
}
```

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
# Цель: все зеленые галочки
```

### Проверка Service Worker

```javascript
// В консоли браузера
navigator.serviceWorker.getRegistration()
  .then(reg => console.log('SW registered:', reg))

// Проверка кешей
caches.keys().then(keys => console.log('Cache keys:', keys))
```

### Тестирование офлайн

1. **Chrome DevTools**:
   - Application → Service Workers → проверьте статус
   - Network → Offline
   - Обновите страницу

2. **Background Sync**:
   ```javascript
   // В консоли
   import { addToSyncQueue } from '@/lib/sync-manager'

   // Добавить тестовый элемент
   addToSyncQueue('game_create', { test: true })

   // Проверить очередь
   console.log(getSyncQueue())
   ```

3. **Manifest**:
   - DevTools → Application → Manifest
   - Проверьте все поля
   - Проверьте иконки

### iOS Safari тестирование

1. Установите приложение на домашний экран
2. Откройте установленное приложение
3. Проверьте:
   - Полноэкранный режим (без адресной строки Safari)
   - Правильный цвет статус-бара
   - Иконка приложения
   - Splash screen

---

## 🔧 Troubleshooting

### Service Worker не регистрируется

**Проблема**: `navigator.serviceWorker` is undefined

**Решение**:
- Убедитесь, что используете HTTPS (или localhost)
- Проверьте, что браузер поддерживает Service Workers
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

### Background Sync не работает

**Проблема**: Данные не синхронизируются офлайн

**Решение**:
1. Проверьте поддержку API:
   ```javascript
   console.log('sync' in ServiceWorkerRegistration.prototype)
   ```
2. Проверьте очередь:
   ```javascript
   import { getSyncQueue } from '@/lib/sync-manager'
   console.log(getSyncQueue())
   ```
3. Fallback на `syncNow()` если Background Sync API не поддерживается

### iOS не показывает prompt установки

**Проблема**: На iOS нет автоматического prompt

**Решение**:
- iOS не показывает автоматический prompt
- Пользователь должен вручную добавить через Safari menu
- Можно показать инструкцию в UI

### Manifest не обнаружен

**Проблема**: DevTools показывает "No manifest detected"

**Решение**:
- Проверьте наличие `<link rel="manifest" href="/manifest.json">`
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
- **FID** (First Input Delay): < 100ms
- **CLS** (Cumulative Layout Shift): < 0.1

### Покрытие кеша

Цель: **>90%** запросов из кеша в офлайн режиме

---

## 🚀 Production Checklist

Перед деплоем убедитесь:

- [ ] Service Worker регистрируется корректно
- [ ] Все иконки сгенерированы и доступны
- [ ] Manifest.json корректен и доступен
- [ ] Офлайн страница работает
- [ ] Background Sync настроен
- [ ] Lighthouse PWA score = 100
- [ ] Тестирование на iOS Safari
- [ ] Тестирование на Android Chrome
- [ ] HTTPS включен
- [ ] Кеш-стратегии настроены корректно

---

## 📚 Ресурсы

- [Next-PWA Documentation](https://ducanh-next-pwa.vercel.app/)
- [Web.dev PWA Guide](https://web.dev/progressive-web-apps/)
- [MDN Service Worker API](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)
- [PWA Builder](https://www.pwabuilder.com/)
- [Workbox Documentation](https://developer.chrome.com/docs/workbox/)

---

**Последнее обновление:** 17 ноября 2025
**Статус:** ✅ Week 3 - PWA Setup Complete
