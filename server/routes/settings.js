import { Router } from 'express';
import { readJson } from '../lib/storage.js';
import { saveSettings, sendCode, signIn, getAuthStatus, clearSession } from '../services/telegramClient.js';
import { logger } from '../lib/logger.js';

const SETTINGS_FILE = 'settings.json';

export const settingsRouter = Router();

settingsRouter.get('/', (_req, res) => {
  const settings = readJson(SETTINGS_FILE, {});
  res.json(settings);
});

settingsRouter.post('/', (req, res) => {
  const { apiId, apiHash, session } = req.body || {};
  const saved = saveSettings({ apiId, apiHash, session });
  res.json(saved);
});

// Отправка кода на номер телефона
settingsRouter.post('/auth/send-code', async (req, res) => {
  const { phoneNumber } = req.body || {};
  
  if (!phoneNumber) {
    return res.status(400).json({ error: 'phoneNumber required' });
  }
  
  // Форматируем номер телефона (убираем пробелы, дефисы и т.д.)
  const formattedPhone = phoneNumber.replace(/\D/g, '');
  
  try {
    const result = await sendCode(formattedPhone);
    res.json(result);
  } catch (e) {
    logger.error('send-code failed', { error: String(e?.message || e) });
    res.status(500).json({ error: String(e?.message || e) });
  }
});

// Ввод кода и завершение авторизации
settingsRouter.post('/auth/sign-in', async (req, res) => {
  const { phoneCode, password } = req.body || {};
  
  if (!phoneCode) {
    return res.status(400).json({ error: 'phoneCode required' });
  }
  
  try {
    const result = await signIn(phoneCode, password);
    res.json(result);
  } catch (e) {
    logger.error('sign-in failed', { error: String(e?.message || e) });
    res.status(500).json({ error: String(e?.message || e) });
  }
});

// Проверка статуса авторизации
settingsRouter.get('/auth/status', async (_req, res) => {
  try {
    const status = await getAuthStatus();
    res.json(status);
  } catch (e) {
    logger.error('get auth status failed', { error: String(e?.message || e) });
    res.status(500).json({ error: String(e?.message || e) });
  }
});

// Очистка сессии (для повторной авторизации)
settingsRouter.post('/auth/clear', async (_req, res) => {
  try {
    const result = clearSession();
    res.json(result);
  } catch (e) {
    logger.error('clear session failed', { error: String(e?.message || e) });
    res.status(500).json({ error: String(e?.message || e) });
  }
});


