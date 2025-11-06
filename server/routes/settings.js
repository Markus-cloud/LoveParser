import { Router } from 'express';
import { readJson } from '../lib/storage.js';
import { saveSettings } from '../services/telegramClient.js';

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


