# CORS Configuration for ngrok and Localhost Testing

## Overview

This document describes the CORS (Cross-Origin Resource Sharing) configuration that enables:
- Local frontend development at `localhost:*` and `127.0.0.1:*` to communicate with the backend
- Frontend served through ngrok tunnels (e.g., `https://*.ngrok-free.app`, `https://*.ngrok.io`) to communicate with backend
- Preflight requests are properly handled for all allowed origins

## Configuration Details

### Allowed Origins (by default)

The server automatically allows CORS requests from:

1. **localhost with any port**
   - `http://localhost:*` (e.g., `http://localhost:3000`, `http://localhost:8080`)
   - `https://localhost:*` (e.g., `https://localhost:8443`)

2. **127.0.0.1 with any port**
   - `http://127.0.0.1:*` (e.g., `http://127.0.0.1:8080`)
   - `https://127.0.0.1:*`

3. **ngrok domains**
   - `https://*.ngrok-free.app` (e.g., `https://my-app-12345.ngrok-free.app`)
   - `https://*.ngrok.io` (e.g., `https://my-app-12345.ngrok.io`)

4. **No origin** (requests without Origin header, like curl or mobile apps)

### Custom Origins

To add additional allowed origins for testing or deployment, set the `ALLOWED_ORIGINS` environment variable with comma-separated patterns:

```bash
# .env.local or .env
ALLOWED_ORIGINS=https://example.com,https://app.example.com,https://custom-domain.com
```

Each origin is treated as a regex pattern, so you can use patterns with wildcards if needed.

### CORS Headers Configuration

The following headers are now properly configured:

**Request Headers Allowed:**
- `Content-Type` - For sending JSON data
- `Authorization` - For JWT/token authentication
- `X-Requested-With` - Standard CORS header
- `Accept` - For content negotiation

**Response Headers Exposed:**
- `Content-Disposition` - For file downloads
- `X-Total-Count` - For pagination

**Methods Allowed:**
- `GET` - Fetching data
- `POST` - Creating/submitting data
- `PUT` - Updating data
- `DELETE` - Deleting data
- `PATCH` - Partial updates
- `OPTIONS` - Preflight requests

**Credentials:** Enabled for authenticated requests

**Preflight Cache:** 86400 seconds (24 hours)

## Testing

### Using ngrok

1. Start your backend server:
```bash
npm run server
# or for both frontend and backend:
npm run dev:all
```

2. In a new terminal, expose the backend via ngrok:
```bash
ngrok http 4000
# or with ngrok-free account:
ngrok http --domain=your-unique-name.ngrok-free.app 4000
```

3. Start the frontend pointing to ngrok URL:
```bash
# In your frontend code, use the ngrok URL
# Example: https://my-app-12345.ngrok-free.app
```

### Testing Preflight Requests

Use curl to test preflight (OPTIONS) requests:

```bash
# Test localhost
curl -X OPTIONS http://localhost:4000/api/health \
  -H "Origin: http://localhost:8080" \
  -H "Access-Control-Request-Method: GET" \
  -v

# Test ngrok
curl -X OPTIONS http://localhost:4000/api/health \
  -H "Origin: https://test-app-12345.ngrok-free.app" \
  -H "Access-Control-Request-Method: GET" \
  -v

# Should return: Access-Control-Allow-Origin header
```

### Browser DevTools

1. Open DevTools (F12)
2. Go to Network tab
3. Make a request to your API
4. Look for the preflight `OPTIONS` request
5. Check Response Headers for `Access-Control-Allow-Origin`

## Troubleshooting

### "CORS policy: origin is not allowed"

If you get this error:
1. Verify the origin in your browser console (check for exact domain + port)
2. Add it to `ALLOWED_ORIGINS` environment variable
3. Restart the server

### Preflight requests failing (HTTP 500)

1. Check server logs for CORS errors
2. Verify the request headers match allowed headers
3. Ensure the request method is in the allowed methods list

### Frontend can't reach ngrok backend

1. Make sure ngrok tunnel is running: `ngrok http 4000`
2. Use the full ngrok URL (including `https://`)
3. Check that `ALLOWED_ORIGINS` includes your ngrok domain (should be automatic)

## Environment Setup

### Development (.env.local)

```bash
API_PORT=4000
# Optional: Add custom origins
# ALLOWED_ORIGINS=https://custom-domain.com
TELEGRAM_API_ID=your_id
TELEGRAM_API_HASH=your_hash
TELEGRAM_BOT_TOKEN=your_token
NODE_ENV=development
```

### Production (.env)

```bash
API_PORT=4000
# Add your production domain here
ALLOWED_ORIGINS=https://yourdomain.com,https://app.yourdomain.com
TELEGRAM_API_ID=your_id
TELEGRAM_API_HASH=your_hash
TELEGRAM_BOT_TOKEN=your_token
NODE_ENV=production
```

## Implementation Details

### CORS Middleware (server/index.js)

The CORS middleware uses a custom origin function that:

1. Allows requests with no Origin header (mobile apps, curl)
2. Tests the origin against regex patterns
3. Supports environment-based custom origins
4. Provides detailed error messages on denial

### No Security Risks

- External origins must explicitly match patterns
- No wildcards in actual domain matching
- ngrok domains are restricted to `.ngrok-free.app` and `.ngrok.io`
- Environment variable can override for authorized domains

## Related Files

- `server/index.js` - CORS configuration (lines 24-59)
- `.env.example` - Documentation of ALLOWED_ORIGINS variable
- `.env.local.example` - Example local configuration
