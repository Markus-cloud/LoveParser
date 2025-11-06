# Инструкция по настройке .env файла

## Шаг 1: Создание .env файла

Скопируйте файл `.env.example` в `.env`:

```bash
# Windows (PowerShell)
Copy-Item .env.example .env

# Windows (CMD)
copy .env.example .env

# Linux/Mac
cp .env.example .env
```

## Шаг 2: Получение Telegram API credentials

### 2.1. Получение TELEGRAM_API_ID и TELEGRAM_API_HASH

1. Перейдите на https://my.telegram.org
2. Войдите используя ваш номер телефона Telegram
3. Перейдите в раздел **API development tools**
4. Создайте новое приложение:
   - **App title**: например, "Tele-fluence Bot"
   - **Short name**: например, "telefluence"
   - **Platform**: выберите "Desktop"
   - **Description**: опционально
5. После создания вы получите:
   - **api_id** — это ваш `TELEGRAM_API_ID` (число, например: `12345678`)
   - **api_hash** — это ваш `TELEGRAM_API_HASH` (строка из 32 символов)

### 2.2. Получение TELEGRAM_BOT_TOKEN (рекомендуется)

Этот способ позволяет автоматически авторизоваться без ввода кода:

1. Откройте Telegram и найдите бота **@BotFather**
2. Отправьте команду `/newbot`
3. Следуйте инструкциям:
   - Придумайте имя бота (например: "My Tele-fluence Bot")
   - Придумайте username бота (должен заканчиваться на `bot`, например: `mytelefluence_bot`)
4. После создания BotFather пришлёт вам токен вида:
   ```
   1234567890:ABCdefGHIjklMNOpqrsTUVwxyz
   ```
   Это ваш `TELEGRAM_BOT_TOKEN`

### 2.3. Альтернатива: Готовая сессия (TELEGRAM_SESSION)

Если у вас уже есть готовая string session от GramJS, вы можете использовать её:

1. Используйте существующую сессию или сгенерируйте её через скрипт
2. Вставьте строку сессии в `TELEGRAM_SESSION`

**Примечание:** Если вы используете `TELEGRAM_BOT_TOKEN`, сессия будет создана автоматически при первом запуске.

## Шаг 3: Заполнение .env файла

Откройте файл `.env` в текстовом редакторе и заполните значения:

```env
# Порт API (можно оставить по умолчанию)
API_PORT=4000

# Обязательно: ваши API credentials
TELEGRAM_API_ID=12345678
TELEGRAM_API_HASH=abcdef1234567890abcdef1234567890

# Рекомендуется: токен бота для автоматической авторизации
TELEGRAM_BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrsTUVwxyz

# Или альтернатива: готовая сессия (если не используете токен бота)
# TELEGRAM_SESSION=ваша_готовая_string_session
```

## Шаг 4: Проверка настроек

После заполнения `.env` файла:

1. Убедитесь, что файл `.env` находится в корне проекта (рядом с `package.json`)
2. Проверьте, что все значения заполнены корректно (без лишних пробелов)
3. Запустите сервер:

```bash
npm run server
```

4. Проверьте логи:
   - Если всё настроено правильно, вы увидите: `[server] Listening on http://localhost:4000`
   - Если есть ошибки авторизации Telegram, проверьте правильность `TELEGRAM_API_ID`, `TELEGRAM_API_HASH` и `TELEGRAM_BOT_TOKEN`

## Важные замечания

⚠️ **Безопасность:**
- Никогда не публикуйте файл `.env` в Git
- Файл `.env` уже должен быть в `.gitignore`
- Не делитесь своими API credentials с другими

✅ **После первого успешного запуска:**
- Сессия автоматически сохранится в `server/data/session.json`
- Настройки сохранятся в `server/data/settings.json`
- При следующих запусках сервер будет использовать сохранённую сессию

## Решение проблем

### Ошибка: "Telegram settings missing"
- Проверьте, что `TELEGRAM_API_ID` и `TELEGRAM_API_HASH` заполнены в `.env`

### Ошибка: "No TELEGRAM_SESSION or TELEGRAM_BOT_TOKEN"
- Убедитесь, что указан либо `TELEGRAM_BOT_TOKEN`, либо `TELEGRAM_SESSION`

### Ошибка авторизации Telegram
- Проверьте правильность токена бота (формат: `число:строка`)
- Убедитесь, что используете правильный `api_id` и `api_hash` с my.telegram.org

