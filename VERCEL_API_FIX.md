# Vercel API 404 Error Fix

## Problem

On Vercel deployment, API requests to `/api/telegram/auth/send-code` and other endpoints were returning 404 errors with HTML pages instead of JSON responses. This caused the frontend to fail with `SyntaxError: Unexpected token 'T', 'The page c...'` errors.

## Root Cause

The issue was with how Vercel serverless functions were configured:

1. **Incorrect Build Configuration**: The `vercel.json` was pointing directly to `server/index.js` instead of using Vercel's standard `api/` directory structure
2. **Module Import Issues**: The Express app was being imported as a module but still tried to start a server, causing conflicts
3. **Route Matching**: Vercel's routing wasn't properly forwarding API requests to the Express app

## Solution

### 1. Created Vercel API Handler (`api/index.js`)

Created a dedicated Vercel serverless function handler:

```javascript
// api/index.js
import app from '../server/index.js';
export default app;
```

This follows Vercel's standard pattern for API routes.

### 2. Updated `vercel.json` Configuration

Changed the build configuration to use the new API handler:

```json
{
  "builds": [
    {
      "src": "api/index.js",
      "use": "@vercel/node"
    },
    ...
  ],
  "routes": [
    {
      "src": "/api/(.*)",
      "dest": "/api/index.js"
    },
    ...
  ],
  "functions": {
    "api/index.js": {
      "maxDuration": 30
    }
  }
}
```

### 3. Fixed Express App Module Detection (`server/index.js`)

Updated the server startup logic to only run when executed directly (not when imported):

```javascript
// Run server locally only if this file is executed directly (not imported)
const isMainModule = process.argv[1] && import.meta.url.endsWith(process.argv[1]);

if (isMainModule && process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`[server] Listening on http://localhost:${PORT}`);
  });
}
```

This prevents the server from starting when the module is imported by Vercel.

## Changes Made

1. **New Files**:
   - `/api/index.js` - Vercel serverless function handler
   - `/test-vercel-api.js` - Comprehensive test script for Vercel configuration

2. **Modified Files**:
   - `/vercel.json` - Updated build and routing configuration
   - `/server/index.js` - Fixed module detection for proper import/export behavior

## Testing

Run the test script to verify the configuration:

```bash
node test-vercel-api.js
```

This tests:
- ✅ API handler can be imported as a module
- ✅ Express app is properly configured
- ✅ API routes are registered
- ✅ Critical auth endpoint (`/auth/send-code`) is available

## Local Development

No changes needed for local development:

```bash
# Frontend only
npm run dev

# Backend only
npm run server

# Both together
npm run dev:all
```

The Express server will still start normally when run directly.

## Deployment to Vercel

1. **Commit and push changes**:
   ```bash
   git add .
   git commit -m "Fix Vercel API 404 errors"
   git push
   ```

2. **Environment Variables** (if not already set):
   - `TELEGRAM_API_ID` - Your Telegram API ID
   - `TELEGRAM_API_HASH` - Your Telegram API Hash
   - `NODE_ENV=production` - Auto-set by Vercel

3. **Deploy**:
   - Vercel will automatically deploy the changes
   - API routes will now work correctly

## Verification

After deployment, test the following endpoints:

1. Health check:
   ```bash
   curl https://your-app.vercel.app/api/health
   ```
   Should return: `{"ok":true,"service":"tele-fluence-backend"}`

2. Auth endpoint:
   ```bash
   curl -X POST https://your-app.vercel.app/api/telegram/auth/send-code \
     -H "Content-Type: application/json" \
     -d '{"phoneNumber":"+1234567890"}'
   ```
   Should return JSON (not HTML 404)

## Technical Details

### Why This Works

1. **Vercel's API Routes**: By placing the handler in `/api/index.js`, Vercel recognizes it as a serverless function and handles it correctly

2. **Express Compatibility**: The Express app is exported as a function, which Vercel's Node.js runtime can invoke directly for each request

3. **Proper Module Detection**: The updated module detection ensures the Express server doesn't try to start a server when imported, only when run directly

### Route Flow

```
Request: POST /api/telegram/auth/send-code
    ↓
Vercel routing: /api/(.*) → /api/index.js
    ↓
Serverless function: api/index.js (Express app)
    ↓
Express router: /api/telegram → telegramRouter
    ↓
Route handler: POST /auth/send-code
    ↓
Response: JSON
```

## Troubleshooting

If issues persist:

1. Check Vercel build logs for errors
2. Verify environment variables are set correctly
3. Run `node test-vercel-api.js` locally to verify configuration
4. Check that all routes return JSON (not HTML) in production
