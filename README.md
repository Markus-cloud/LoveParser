# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/87928ba7-e238-48e3-96f7-ec279aaae53e

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/87928ba7-e238-48e3-96f7-ec279aaae53e) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## Backend (server)

- Express API runs on `API_PORT` (default 4000).
- Telegram via GramJS with automatic session handling.
- File storage at `server/data/*`. Logs at `server/logs/app.log`.

### Environment variables

📖 **Подробная инструкция по настройке:** см. [SETUP.md](./SETUP.md)

**Быстрый старт:**

1. Создайте файл `.env` в корне проекта:

```env
API_PORT=4000
TELEGRAM_API_ID=your_api_id
TELEGRAM_API_HASH=your_api_hash
TELEGRAM_BOT_TOKEN=123456:abc...
```

2. **Получение credentials:**
   - `TELEGRAM_API_ID` и `TELEGRAM_API_HASH`: получите на https://my.telegram.org
   - `TELEGRAM_BOT_TOKEN`: получите у @BotFather в Telegram (команда `/newbot`)

3. После первого запуска сервер автоматически сохранит сессию в `server/data/session.json`

**Важно:** Файл `.env` должен быть в `.gitignore` и не должен попадать в Git!

### API

- `GET /api/health`
- `POST /api/telegram/search` — поиск каналов/чатов
- `POST /api/telegram/parse` — фоновый парсинг участников с активностью за `lastDays`
- `POST /api/telegram/broadcast` — фоновая рассылка
- `GET /api/tasks` / `GET /api/tasks/:id` — статусы задач
- `GET /api/tasks/:id/stream` — SSE‑поток прогресса (`{ progress, status, current, total, message }`)
- `GET/POST /api/settings` — настройки и сохранение сессии
- `POST /api/user/login` — авторизация пользователя Telegram WebApp
- `GET /api/user/:id` — профиль пользователя

### Notes

- Парсинг активных участников сохраняет список в `server/data/users_<chatId>.json`.
- Запросы к Telegram троттлятся (0.7s) для избежания flood limits.
- В SaaS‑режиме каждый запрос должен содержать `userId` (ID из Telegram WebApp). Задачи фильтруются по пользователю, а эндпоинты возвращают `401`/`403` при отсутствии/несоответствии.

## How can I deploy this project?

### Deploy to Vercel

1. **Push to GitHub:**
   ```bash
   git add .
   git commit -m "Ready for Vercel deployment"
   git push origin main
   ```

2. **Import to Vercel:**
   - Go to [vercel.com](https://vercel.com)
   - Click "New Project"
   - Import your GitHub repository
   - Vercel will automatically detect the framework (Vite)

3. **Set Environment Variables:**
   In Vercel dashboard → Project Settings → Environment Variables:
   ```
   TELEGRAM_API_ID=your_api_id_here
   TELEGRAM_API_HASH=your_api_hash_here
   NODE_ENV=production
   ```

4. **Deploy:**
   - Click "Deploy"
   - Vercel will build and deploy both frontend and backend

**Important:** Get `TELEGRAM_API_ID` and `TELEGRAM_API_HASH` from https://my.telegram.org

### Alternative: Lovable Deploy

Simply open [Lovable](https://lovable.dev/projects/87928ba7-e238-48e3-96f7-ec279aaae53e) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain)
