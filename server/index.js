import express from 'express';
import cors from 'cors';
import path from 'path';
import { existsSync as fsExistsSync } from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import bodyParser from 'body-parser';

import { tasksRouter } from './routes/tasks.js';
import { telegramRouter } from './routes/telegram.js';
import { settingsRouter } from './routes/settings.js';
import { userRouter } from './routes/user.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.API_PORT ? Number(process.env.API_PORT) : 4000;

app.use(cors({ origin: '*' }));
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

// Serve built frontend (if present) to avoid Vite dev client being loaded in production
const distPath = path.join(__dirname, '..', 'dist');
if (process.env.NODE_ENV === 'production' || fsExistsSync(distPath)) {
  app.use(express.static(distPath));

  // Fallback to index.html for SPA routes
  app.get('*', (_req, res, next) => {
    // If the request is for an API route, skip to API handlers
    if (_req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// 404 handler for API routes
app.use('/api/*', (_req, res) => {
  res.status(404).json({ error: 'API endpoint not found' });
});

// Export app for testing and other uses
export default app;

// Start server if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  app.listen(PORT, () => {
    console.log(`[server] Listening on http://localhost:${PORT}`);
    console.log(`[server] Health check: http://localhost:${PORT}/api/health`);
  });
}
