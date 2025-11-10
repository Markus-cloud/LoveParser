# Vercel Deployment Checklist ✅

## Перед деплоем (Before Deployment)

### 1. Локальное тестирование (Local Testing)

- [x] ✅ Vercel API конфигурация
  ```bash
  node test-vercel-api.js
  ```

- [x] ✅ API эндпоинты
  ```bash
  node test-api-endpoint.js
  ```

- [x] ✅ Сборка фронтенда
  ```bash
  npm run build
  ```

- [x] ✅ Линтинг
  ```bash
  npm run lint
  ```

### 2. Файлы изменены (Files Changed)

#### Новые файлы:
- [x] `/api/index.js` - Vercel serverless function handler
- [x] `/test-vercel-api.js` - Тест конфигурации
- [x] `/test-api-endpoint.js` - Тест эндпоинтов
- [x] `/VERCEL_API_FIX.md` - Подробная документация
- [x] `/VERCEL_404_FIX_SUMMARY.md` - Краткое описание
- [x] `/DEPLOYMENT_CHECKLIST.md` - Этот файл
- [x] `/server/data/.gitkeep` - Сохранить структуру директорий

#### Измененные файлы:
- [x] `/vercel.json` - Обновлена конфигурация
- [x] `/server/index.js` - Добавлено определение main модуля
- [x] `/.gitignore` - Добавлены Vercel и server data

### 3. Результаты тестирования (Test Results)

```
✅ API handler импортируется корректно
✅ Express приложение настроено
✅ Все API маршруты зарегистрированы
✅ Критический эндпоинт /auth/send-code доступен
✅ Health check работает
✅ 404 handler возвращает JSON (не HTML)
✅ Сборка фронтенда успешна
✅ Линтинг проходит (только warnings)
```

## Деплой на Vercel

### 1. Коммит изменений

```bash
git add .
git commit -m "Fix Vercel API 404 errors - add proper serverless function handler"
git push origin fix-vercel-api-404-telegram-auth-send-code
```

### 2. Environment Variables на Vercel

Проверить в Vercel Dashboard → Settings → Environment Variables:

- [ ] `TELEGRAM_API_ID` - должен быть установлен
- [ ] `TELEGRAM_API_HASH` - должен быть установлен
- [ ] `NODE_ENV=production` - устанавливается автоматически ✅

### 3. Деплой

- [ ] Push на GitHub
- [ ] Vercel автоматически запустит деплой
- [ ] Дождаться завершения деплоя

## После деплоя (Post-Deployment)

### 1. Проверка эндпоинтов (Endpoint Verification)

#### Health Check
```bash
curl https://your-app.vercel.app/api/health
```

**Ожидается:**
```json
{"ok":true,"service":"tele-fluence-backend"}
```

**НЕ должно быть:**
- 404 ошибка
- HTML страница
- "Cannot GET /api/health"

#### Auth Endpoint
```bash
curl -X POST https://your-app.vercel.app/api/telegram/auth/send-code \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber":"+1234567890"}'
```

**Ожидается:**
```json
{"error":"..."}  # JSON ответ (ошибка ожидаема без реального номера)
```

**НЕ должно быть:**
- 404 ошибка
- HTML страница вместо JSON
- "SyntaxError: Unexpected token"

### 2. Проверка фронтенда (Frontend Check)

- [ ] Открыть приложение в браузере
- [ ] Попробовать залогиниться
- [ ] Проверить консоль браузера на ошибки
- [ ] Убедиться что запросы к `/api/*` возвращают JSON

### 3. Проверка логов Vercel (Vercel Logs)

- [ ] Открыть Vercel Dashboard → Deployments → Latest
- [ ] Проверить Function Logs на ошибки
- [ ] Убедиться что API requests обрабатываются

## Ожидаемое поведение (Expected Behavior)

### ✅ Правильное поведение:

1. **API запросы возвращают JSON**
   - Content-Type: application/json
   - Структурированные данные
   - HTTP коды: 200, 400, 401, 500 (не 404 для существующих эндпоинтов)

2. **Фронтенд может авторизоваться**
   - POST /api/telegram/auth/send-code работает
   - POST /api/telegram/auth/sign-in работает
   - GET /api/telegram/auth/status работает

3. **Логи не содержат ошибок**
   - Нет "Module not found"
   - Нет "Cannot read property of undefined"
   - Нет "SyntaxError"

### ❌ Проблемы (должны отсутствовать):

1. **404 ошибки на API эндпоинтах**
2. **HTML страницы вместо JSON**
3. **"SyntaxError: Unexpected token 'T'"**
4. **"The page could not be found"**
5. **CORS ошибки**

## Откат (Rollback)

Если что-то пошло не так:

```bash
# Откатить коммит
git revert HEAD
git push

# Или перейти на предыдущий коммит
git reset --hard HEAD~1
git push --force
```

## Поддержка (Support)

### Файлы документации:
- `VERCEL_API_FIX.md` - Подробное описание исправления
- `VERCEL_404_FIX_SUMMARY.md` - Краткое описание проблемы и решения
- `ARCHITECTURE.md` - Архитектура приложения
- `README.md` - Основная документация

### Тестовые скрипты:
- `test-vercel-api.js` - Проверка конфигурации
- `test-api-endpoint.js` - Проверка эндпоинтов
- `test-vercel.sh` - Bash скрипт для проверки

## Статус: ✅ ГОТОВО К ДЕПЛОЮ

Все проверки пройдены, код готов к деплою на Vercel.
