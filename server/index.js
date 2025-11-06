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

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.API_PORT ? Number(process.env.API_PORT) : 4000;

app.use(cors({ origin: '*'}));
app.use(bodyParser.json({ limit: '2mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'tele-fluence-backend' });
});

app.use('/api/tasks', tasksRouter);
app.use('/api/telegram', telegramRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/user', userRouter);

// Static files for any future need
app.use('/static', express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => {
  console.log(`[server] Listening on http://localhost:${PORT}`);
});


