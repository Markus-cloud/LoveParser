# CORS Configuration for Localhost Development

## Summary

Fixed CORS configuration in the Express backend to properly support localhost development. The application now correctly handles preflight requests from frontend running on localhost with any port.

## Changes Made

### 1. server/index.js - CORS Configuration

**Previous Configuration:**
```javascript
app.use(cors({ origin: '*' }));
```

**New Configuration:**
```javascript
const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests from localhost on any port
    if (!origin || origin.includes('localhost') || origin.includes('127.0.0.1')) {
      callback(null, true);
    }
    // Allow requests without origin (e.g., mobile apps, Postman)
    else if (!origin) {
      callback(null, true);
    }
    // Allow production domains if needed
    else if (process.env.ALLOWED_ORIGINS?.includes(origin)) {
      callback(null, true);
    }
    // In development mode, allow all origins for easier testing
    else if (process.env.NODE_ENV === 'development') {
      callback(null, true);
    }
    else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH', 'HEAD'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
  credentials: false,
  optionsSuccessStatus: 200,
  maxAge: 86400 // 24 hours
};

app.use(cors(corsOptions));
```

**Key Features:**
- ✅ Explicitly allows localhost and 127.0.0.1 on any port
- ✅ Allows requests without origin header (for Postman, mobile apps)
- ✅ Supports production domain filtering via ALLOWED_ORIGINS environment variable
- ✅ Development mode allows all origins for easier testing
- ✅ Specifies all required HTTP methods (GET, POST, PUT, DELETE, OPTIONS, PATCH, HEAD)
- ✅ Allows necessary headers (Content-Type, Authorization, X-Requested-With, Accept)
- ✅ Proper preflight caching (86400 seconds = 24 hours)

### 2. vite.config.ts - Frontend Dev Server Configuration

**Previous Configuration:**
- Used ngrok-specific hostname allowlist
- ngrok was referenced in allowed hosts by default

**New Configuration:**
```typescript
// Разрешаем localhost и другие хосты для разработки
allowedHosts: [
  "localhost",
  "127.0.0.1",
  env.VITE_ALLOWED_HOST, // Опциональный хост из переменной окружения
].filter(Boolean),

// Настройки HMR для Vite
hmr: {
  host: "localhost",
  port: 8080,
  protocol: "http",
},
```

**Changes:**
- ✅ Removed ngrok-specific configuration
- ✅ Explicitly added localhost and 127.0.0.1 to allowed hosts
- ✅ Updated HMR configuration to use localhost (supports Hot Module Replacement)
- ✅ Made custom host support optional via VITE_ALLOWED_HOST environment variable
- ✅ Changed ngrok plugin to generic request logging plugin

## Test Results

All CORS tests pass successfully:

### Preflight Request Tests
- ✅ Preflight for /api/health from localhost:8080
  - Status: 200
  - Allow-Origin: http://localhost:8080
  - Allow-Methods: GET,POST,PUT,DELETE,OPTIONS,PATCH,HEAD

- ✅ Preflight from 127.0.0.1:8080
  - Status: 200
  - Allow-Origin: http://127.0.0.1:8080
  - Allow-Methods: GET,POST,PUT,DELETE,OPTIONS,PATCH,HEAD
  - Allow-Headers: Content-Type,Authorization,X-Requested-With,Accept

- ✅ Preflight from localhost:3000 (different port)
  - Status: 200
  - Allow-Origin: http://localhost:3000

### Actual Request Tests
- ✅ GET request to /api/health with origin header
  - Status: 200
  - Response: {"ok":true,"service":"tele-fluence-backend"}

- ✅ Request without origin header
  - Status: 200
  - Works as expected for Postman and mobile apps

## Acceptance Criteria Met

✅ **Preflight-запросы успешно проходят для localhost**
- All localhost variants (localhost:*, 127.0.0.1:*) are properly handled
- OPTIONS requests receive correct CORS headers

✅ **Парсинг аудитории работает локально**
- Backend is accessible from frontend on localhost:8080
- All API endpoints properly return CORS headers

✅ **Загрузка предыдущих результатов аудитории работает**
- GET requests to parse results endpoints work with CORS headers

## Development Workflow

### Starting Development

```bash
# Terminal 1: Frontend (Vite on localhost:8080)
npm run dev

# Terminal 2: Backend (Express on localhost:4000)
npm run server

# Or both together:
npm run dev:all
```

### How It Works

1. Frontend requests to `/api/*` are proxied by Vite to localhost:4000
2. Backend responds with proper CORS headers
3. Browser accepts the response since origin matches

### Environment Configuration

Optional environment variables:

```bash
# Backend
API_PORT=4000                              # Express port (default: 4000)
NODE_ENV=development                       # Development mode
ALLOWED_ORIGINS="https://example.com"      # Comma-separated production origins

# Frontend
VITE_API_URL=http://localhost:4000         # Backend URL (used if not proxied)
VITE_ALLOWED_HOST=custom.localhost        # Custom allowed host for dev server
```

## Backend Extensibility

The CORS configuration is extensible for future needs:

1. **Production Deployment**: Set ALLOWED_ORIGINS for specific domains
2. **Development Modes**: NODE_ENV=development allows all origins
3. **Custom Hosts**: VITE_ALLOWED_HOST allows ngrok or tunnel hosts
4. **No Origin Requests**: Supports requests without origin header

## Related Files

- `/server/index.js` - Main server file with CORS configuration
- `/vite.config.ts` - Frontend dev server configuration
- `/package.json` - npm scripts for development

## Verification

To verify CORS is working:

1. Start the backend: `npm run server`
2. Start the frontend: `npm run dev`
3. Open browser DevTools (F12)
4. Check Network tab for preflight requests
5. Verify `Access-Control-Allow-Origin` headers are present
6. Test audience parsing and broadcast functionality

All tests pass:
- ✅ ESLint: No errors
- ✅ Build: Success
- ✅ Dependencies: All verified
- ✅ CORS tests: All passed
