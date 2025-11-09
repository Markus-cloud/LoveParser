# 🏗️ Архитектура проекта Tele-fluence Bot

## Общая схема

```
┌─────────────────────────────────────────────────────────────┐
│                    Telegram WebApp                           │
│  (Открывается внутри Telegram, использует Telegram SDK)      │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       │ HTTP/HTTPS
                       │
┌──────────────────────▼──────────────────────────────────────┐
│                      Frontend                                │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  React 18 + TypeScript + Vite                        │   │
│  │  - React Router (роутинг)                            │   │
│  │  - TanStack Query (серверное состояние)              │   │
│  │  - shadcn/ui + Tailwind CSS (UI)                     │   │
│  │  - Telegram WebApp SDK (авторизация)                 │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                               │
│  Страницы:                                                    │
│  ├── / (Dashboard)                                           │
│  ├── /parsing (Парсинг каналов)                              │
│  ├── /audience (Аудитория)                                   │
│  ├── /broadcast (Рассылка)                                   │
│  └── /help (Помощь)                                          │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       │ API Calls (/api/*)
                       │ SSE Streams (/api/tasks/:id/stream)
                       │
┌──────────────────────▼──────────────────────────────────────┐
│                      Backend                                 │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Express.js API Server                               │   │
│  │  Port: 4000 (настраивается через API_PORT)           │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                               │
│  Routes:                                                      │
│  ├── /api/health          → Health check                    │
│  ├── /api/telegram        → Telegram операции               │
│  │   ├── POST /search     → Поиск каналов                   │
│  │   ├── POST /parse      → Парсинг (фоновая задача)        │
│  │   └── POST /broadcast  → Рассылка (фоновая задача)       │
│  ├── /api/tasks           → Управление задачами             │
│  │   ├── GET /            → Список задач                    │
│  │   ├── GET /:id         → Статус задачи                   │
│  │   └── GET /:id/stream  → SSE поток прогресса             │
│  ├── /api/settings        → Настройки                       │
│  └── /api/user            → Авторизация пользователей       │
│                                                               │
│  Services:                                                    │
│  ├── telegramClient.js    → GramJS клиент                   │
│  └── taskManager.js       → Менеджер фоновых задач          │
│                                                               │
│  Lib:                                                        │
│  ├── storage.js           → Работа с JSON файлами           │
│  ├── logger.js            → Логирование                     │
│  └── users.js             → Управление пользователями       │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       │ GramJS Client
                       │
┌──────────────────────▼──────────────────────────────────────┐
│                  Telegram API                                │
│  (MTProto Protocol через GramJS)                             │
└──────────────────────────────────────────────────────────────┘
```

## Поток данных

### 1. Авторизация

```
Telegram WebApp
    │
    ├─→ window.Telegram.WebApp.initDataUnsafe.user
    │
    ├─→ AuthContext.tsx
    │   └─→ POST /api/user/login
    │
    └─→ Backend сохраняет пользователя
        └─→ server/data/users.json
```

### 2. Парсинг каналов

```
Frontend (Parsing.tsx)
    │
    ├─→ POST /api/telegram/search
    │   └─→ telegramClient.searchDialogs()
    │
    ├─→ Пользователь выбирает канал
    │
    ├─→ POST /api/telegram/parse
    │   └─→ taskManager.enqueue('parse_audience')
    │       └─→ telegramClient.getParticipantsWithActivity()
    │           ├─→ channels.GetParticipants (список участников)
    │           ├─→ messages.GetHistory (активность)
    │           └─→ Сохранение: server/data/users_<chatId>.json
    │
    └─→ GET /api/tasks/:id/stream (SSE)
        └─→ Отображение прогресса в реальном времени
```

### 3. Рассылка сообщений

```
Frontend (Broadcast.tsx)
    │
    ├─→ POST /api/telegram/broadcast
    │   └─→ taskManager.enqueue('broadcast')
    │       └─→ telegramClient.sendMessage() (для каждого пользователя)
    │           ├─→ Throttling: 700ms между запросами
    │           └─→ Обновление прогресса через SSE
    │
    └─→ GET /api/tasks/:id/stream (SSE)
        └─→ Отображение прогресса рассылки
```

## Структура файлов данных

```
server/data/
├── settings.json          # Настройки Telegram (API_ID, API_HASH, session)
├── session.json           # Сессия Telegram (автоматически генерируется)
├── tasks.json             # Все фоновые задачи
├── users.json             # Зарегистрированные пользователи WebApp
└── users_<chatId>.json    # Спарсенные участники канала
```

## Система задач

```
TaskManager (EventEmitter)
    │
    ├─→ create(type, payload)
    │   └─→ Генерирует UUID, создает задачу со статусом 'queued'
    │
    ├─→ enqueue(type, payload)
    │   └─→ create() + run() (асинхронно)
    │
    ├─→ run(task)
    │   └─→ Вызывает worker для типа задачи
    │       ├─→ parse_audience → telegramClient.getParticipantsWithActivity()
    │       └─→ broadcast → telegramClient.sendMessage() (цикл)
    │
    ├─→ setProgress(id, progress, patch)
    │   └─→ Обновляет прогресс и отправляет через SSE
    │
    └─→ attachStream(taskId, res)
        └─→ Подключает SSE клиент для отслеживания прогресса
```

## Компоненты Frontend

### Контексты
- **AuthContext**: Управление авторизацией через Telegram WebApp

### Страницы
- **Dashboard**: Главная страница со статистикой и подписками
- **Parsing**: Поиск и парсинг каналов
- **Audience**: Управление спарсенной аудиторией
- **Broadcast**: Массовая рассылка сообщений
- **Help**: Справка и инструкции

### Компоненты
- **Layout**: Общий layout с навигацией
- **Navigation**: Навигационное меню
- **GlassCard**: Карточка с эффектом стекла
- **StatCard**: Карточка со статистикой
- **ui/**: shadcn/ui компоненты (button, card, dialog, etc.)

## API клиент

```typescript
// src/lib/api.ts

apiFetch(path, options, userId?)
    │
    ├─→ Автоматически добавляет userId в body (если есть)
    ├─→ Добавляет заголовки Content-Type
    ├─→ Обрабатывает ошибки
    └─→ Возвращает JSON

useApi() hook
    │
    ├─→ Использует AuthContext для получения userId
    ├─→ Предоставляет методы: post(), get()
    └─→ Автоматически передает userId в каждый запрос
```

## Безопасность

### Авторизация
- Все защищенные эндпоинты требуют `userId` в body
- `userId` проверяется на backend перед выполнением операций
- Задачи фильтруются по `userId` (мультипользовательский режим)

### Throttling
- Парсинг: 800ms между запросами
- Рассылка: 700ms между сообщениями
- Предотвращает flood limits от Telegram

### Хранение данных
- Сессия Telegram хранится локально (`server/data/session.json`)
- Настройки в `server/data/settings.json`
- `.env` файл не должен попадать в Git

## Масштабируемость

### Текущие ограничения
- File-based storage (JSON файлы)
- Один процесс для всех задач
- Нет очереди задач (fire-and-forget)

### Возможные улучшения
- База данных (PostgreSQL, MongoDB)
- Redis для очередей задач
- Worker процессы для задач
- Кэширование результатов
- Rate limiting на уровне API

## Зависимости

### Frontend
- **React 18**: UI библиотека
- **TypeScript**: Типизация
- **Vite**: Сборщик
- **React Router**: Маршрутизация
- **TanStack Query**: Серверное состояние
- **shadcn/ui**: UI компоненты
- **Tailwind CSS**: Стилизация
- **Telegram WebApp SDK**: Интеграция с Telegram

### Backend
- **Express**: HTTP сервер
- **GramJS (telegram)**: Telegram API клиент
- **dotenv**: Переменные окружения
- **cors**: CORS middleware
- **body-parser**: Парсинг тела запросов
- **uuid**: Генерация ID задач

## Конфигурация

### Переменные окружения (.env)
```env
API_PORT=4000                          # Порт backend сервера
TELEGRAM_API_ID=your_api_id            # Telegram API ID
TELEGRAM_API_HASH=your_api_hash        # Telegram API Hash
TELEGRAM_BOT_TOKEN=your_bot_token      # Токен бота (опционально)
TELEGRAM_SESSION=your_session          # Готовая сессия (опционально)
VITE_API_URL=http://localhost:4000     # URL API (для frontend)
```

### Vite конфигурация
- Frontend порт: 8080 (настраивается в `vite.config.ts`)
- Прокси для `/api` → `http://localhost:4000`
- Alias `@` → `./src`

---

**Версия:** 1.0.0
**Дата:** 2024

