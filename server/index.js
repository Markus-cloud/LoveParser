import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import bodyParser from 'body-parser';

import { tasksRouter } from './routes/tasks.js';
import { telegramRouter } from './routes/telegram.js';
import { settingsRouter } from './routes/settings.js';
import { userRouter } from './routes/user.js';

// Load environment variables from .env and .env.local
// .env.local takes precedence for local development
dotenv.config({ path: '.env.local' });
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.API_PORT ? Number(process.env.API_PORT) : 4000;

// Configure CORS to support localhost, ngrok, and other testing origins
const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) {
      return callback(null, true);
    }

    // List of allowed origin patterns
    const allowedOrigins = [
      // localhost with any port
      /^http:\/\/localhost(:\d+)?$/,
      /^https:\/\/localhost(:\d+)?$/,
      /^http:\/\/127\.0\.0\.1(:\d+)?$/,
      /^https:\/\/127\.0\.0\.1(:\d+)?$/,
      // ngrok domains
      /^https:\/\/.*\.ngrok(?:-free)?\.app$/,
      /^https:\/\/.*\.ngrok\.io$/,
      // Allow environment variable for custom origins (useful for deployment)
      ...(process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',').map(o => new RegExp(`^${o.trim()}$`)) : []),
    ];

    const isAllowed = allowedOrigins.some(pattern => pattern.test(origin));

    if (isAllowed) {
      callback(null, true);
    } else {
      callback(new Error(`CORS policy: origin ${origin} is not allowed`));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
  exposedHeaders: ['Content-Disposition', 'X-Total-Count'],
  maxAge: 86400 // 24 hours
};

app.use(cors(corsOptions));
app.use(bodyParser.json({ limit: '2mb' }));

// Health check endpoint
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'tele-fluence-backend' });
});

// API routes
app.use('/api/tasks', tasksRouter);
app.use('/api/telegram', telegramRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/user', userRouter);

// Root endpoint
app.get('/', (_req, res) => {
  res.json({ 
    service: 'tele-fluence-backend',
    status: 'running',
    endpoints: {
      health: '/api/health',
      tasks: '/api/tasks',
      telegram: '/api/telegram',
      settings: '/api/settings',
      user: '/api/user'
    }
  });
});

// Handle Chrome DevTools requests (ignore CSP errors)
app.get('/.well-known/*', (_req, res) => {
  res.status(204).send();
});

// Static files for any future need
app.use('/static', express.static(path.join(__dirname, 'public')));

// Serve user avatars with proper caching headers
app.use('/api/user/avatar', express.static(path.join(__dirname, 'data', 'avatars'), {
  maxAge: '1d', // Cache for 1 day
  immutable: false,
  setHeaders: (res, filePath) => {
    res.set('Cache-Control', 'public, max-age=86400'); // 1 day in seconds
    res.set('Access-Control-Allow-Origin', '*'); // CORS for avatars
  }
}));

// 404 handler for API routes
app.use('/api/*', (_req, res) => {
  res.status(404).json({ error: 'API endpoint not found' });
});

// Export app for testing and other uses
export default app;

// Start server if this file is run directly
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
