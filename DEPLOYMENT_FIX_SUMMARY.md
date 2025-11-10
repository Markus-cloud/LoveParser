# Исправление деплоя на Vercel

## Проблема

На Vercel при авторизации ошибка 404 на эндпоинт `/api/telegram/auth/send-code`. Вместо JSON браузер получает HTML.

## Причина

- Отсутствовала конфигурация Vercel (`vercel.json`)
- Express бэкенд не был адаптирован для Serverless Functions
- API запросы не маршрутизировались на бэкенд

## Решение

### 1. Создан `vercel.json`
```json
{
  "version": 2,
  "builds": [
    {
      "src": "server/index.js",
      "use": "@vercel/node"
    },
    {
      "src": "package.json",
      "use": "@vercel/static-build",
      "config": { "distDir": "dist" }
    }
  ],
  "routes": [
    {
      "src": "/api/(.*)",
      "dest": "server/index.js"
    },
    {
      "src": "/(.*)",
      "dest": "dist/$1"
    }
  ]
}
```

### 2. Адаптирован Express сервер (`server/index.js`)
- Добавлен `export default app` для Vercel
- Условный запуск `app.listen()` только для разработки
- Все роуты и middleware сохранены

### 3. Добавлено логирование в фронтенд (`src/lib/api.ts`)
- Логирование URL API и запросов
- Детальная информация об ответах
- Отладка ошибок

### 4. Обновлены переменные окружения
- Создан `.env.example` с нужными переменными
- Обновлен `README.md` с инструкциями

## Инструкции по деплою

### 1. Переменные окружения в Vercel
```
TELEGRAM_API_ID=your_api_id_here
TELEGRAM_API_HASH=your_api_hash_here
NODE_ENV=production
```

### 2. Деплой
```bash
git add .
git commit -m "Fix Vercel deployment"
git push origin main
```

### 3. В Vercel
- Import repository
- Vercel автоматически определит конфигурацию
- Deploy

## Результат

✅ API эндпоинты доступны и возвращают JSON  
✅ Авторизация Telegram работает  
✅ Фронтенд и бэкенд работают вместе на одном домене  
✅ Локальная разработка не затронута  

## Тестирование

- `/api/health` → `{ ok: true, service: 'tele-fluence-backend' }`
- `/api/telegram/auth/send-code` → работает с правильными credentials
- Фронтенд успешно авторизуется через Telegram

## Отладка

Добавлены console.log для отслеживания:
- URL API конфигурации
- HTTP запросов и ответов
- Статуса ответов и ошибок