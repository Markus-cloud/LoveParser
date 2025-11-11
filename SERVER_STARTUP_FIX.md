# Backend Server Startup Crash Fix

## Problem

The backend server was immediately exiting with code 0 on startup, causing `ECONNREFUSED` errors when the frontend tried to connect to port 4000.

**Symptoms:**
```
[BE] node server/index.js exited with code 0
[FE] Proxy error: AggregateError [ECONNREFUSED]: connect ECONNREFUSED ::1:4000
```

## Root Cause

The issue was in `server/index.js` line 67. The condition to check if the module is run directly was incorrect:

```javascript
// ❌ BEFORE (BROKEN)
if (import.meta.url === `file://${process.argv[1]}`) {
  app.listen(PORT, ...);
}
```

This condition was comparing `import.meta.url` (a full file:// URL) with a manually constructed string that didn't match the exact format. The condition always evaluated to `false`, so `app.listen()` was never called, and the server process exited immediately.

## Solution

Fixed the comparison logic to properly check if the module is run directly:

```javascript
// ✅ AFTER (FIXED)
const modulePath = fileURLToPath(import.meta.url);
const scriptPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (scriptPath && modulePath === scriptPath) {
  console.log(`[server] Starting server on port ${PORT}...`);
  const server = app.listen(PORT, () => {
    console.log(`[server] Server listening on http://localhost:${PORT}`);
    console.log(`[server] Health check: http://localhost:${PORT}/api/health`);
    console.log(`[server] Ready to accept connections`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`[server] ERROR: Port ${PORT} is already in use`);
      console.error(`[server] Please either:`);
      console.error(`[server]   1. Stop the process using port ${PORT}`);
      console.error(`[server]   2. Set API_PORT environment variable to a different port`);
      console.error(`[server]   Example: API_PORT=3001 node server/index.js`);
      process.exit(1);
    } else {
      console.error(`[server] ERROR: Failed to start server:`, err);
      process.exit(1);
    }
  });
}
```

## Changes Made

1. **Fixed module detection:**
   - Convert `import.meta.url` to file path using `fileURLToPath()`
   - Resolve `process.argv[1]` to absolute path
   - Added null check for `process.argv[1]` (in case module is imported)
   - Compare the resolved paths properly

2. **Added enhanced logging:**
   - "Starting server on port..." message before listening
   - "Server listening..." message on successful start
   - "Ready to accept connections" confirmation

3. **Added error handling:**
   - Specific handling for `EADDRINUSE` (port already in use)
   - Helpful error messages with suggestions
   - Proper exit codes on errors

## Testing

All tests pass successfully:

```bash
# Test server startup
node test-server-startup.js

# Output:
✅ Server module imports correctly
✅ Server started successfully
✅ Health check endpoint responds correctly
✅ Server remains running
```

## Usage

**Start server (default port 4000):**
```bash
npm run server
# or
node server/index.js
```

**Start server on custom port:**
```bash
API_PORT=3001 npm run server
# or
API_PORT=3001 node server/index.js
```

**Start both frontend and backend:**
```bash
npm run dev:all
```

## Verification

The server now:
- ✅ Starts correctly when run directly
- ✅ Stays running (no immediate exit)
- ✅ Responds to health check requests
- ✅ Can be imported as a module without starting
- ✅ Provides clear error messages if port is in use
- ✅ Logs startup progress for debugging

## Related Files

- `server/index.js` - Main server file (fixed)
- `test-server-startup.js` - Automated test for the fix
- `package.json` - Scripts: `server`, `dev:all`
- `vite.config.ts` - Frontend proxy configuration

## Environment Variables

- `API_PORT` - Server port (default: 4000)
- `TELEGRAM_API_ID` - Telegram API ID
- `TELEGRAM_API_HASH` - Telegram API Hash
- `NODE_ENV` - Environment (development/production)

See [SETUP.md](./SETUP.md) for complete environment setup.
