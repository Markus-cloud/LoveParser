# Vercel Deployment Fix

## Problem

When deploying to Vercel, API endpoints return 404 errors and HTML instead of JSON. This happens because:

1. Express backend is not configured for Vercel serverless functions
2. No `vercel.json` configuration exists
3. API routes are not properly routed to the backend

## Solution

### 1. Vercel Configuration (`vercel.json`)

Created `vercel.json` with:
- Frontend build using `@vercel/static-build`
- Backend serverless function using `@vercel/node`
- API routing: `/api/*` → `server/index.js`
- Static file routing: `/*` → `dist/*`

### 2. Backend Adaptation (`server/index.js`)

Modified Express app to work with Vercel:
- Export app as default for serverless functions
- Conditional `app.listen()` only for development
- Keep all existing routes and middleware

### 3. Frontend API URL Configuration

Updated `src/lib/api.ts`:
- Added debug logging for API requests
- Default to `/api` (works on Vercel)
- Support `VITE_API_URL` override if needed

### 4. Environment Variables

Created `.env.example` with required variables:
- `TELEGRAM_API_ID` (required)
- `TELEGRAM_API_HASH` (required)
- `NODE_ENV` (auto-set by Vercel)

## Deployment Process

1. **Set environment variables in Vercel:**
   - Go to Project Settings → Environment Variables
   - Add `TELEGRAM_API_ID` and `TELEGRAM_API_HASH`

2. **Deploy:**
   - Push to GitHub
   - Vercel auto-deploys with the new configuration

## Testing

After deployment, test:
- `/api/health` should return JSON
- `/api/telegram/auth/send-code` should work with proper credentials
- Frontend should successfully authenticate

## Debug Logging

Added comprehensive logging to track:
- API base URL configuration
- Request URLs and methods
- Response status and errors
- Environment detection

## Local Development

No changes needed - local development still works with:
- Frontend: `npm run dev` (port 8080)
- Backend: `npm run server` (port 4000)
- Both: `npm run dev:all`

The Vercel configuration only affects production deployment.