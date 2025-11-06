import { Router } from 'express';
import { taskManager } from '../lib/taskManager.js';
import { searchDialogs, sendMessage, getParticipantsWithActivity } from '../services/telegramClient.js';
import { writeJson } from '../lib/storage.js';
import { logger, sleep } from '../lib/logger.js';

export const telegramRouter = Router();

// Immediate search (short task)
telegramRouter.post('/search', async (req, res) => {
  const { query, limit } = req.body || {};
  if (!query) return res.status(400).json({ error: 'query required' });
  try {
    const results = await searchDialogs(query, Math.min(Number(limit) || 20, 50));
    res.json({ results });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

// Background parsing job
telegramRouter.post('/parse', (req, res) => {
  const { chatId, lastDays = 30, userId } = req.body || {};
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  if (!chatId) return res.status(400).json({ error: 'chatId required' });

  const task = taskManager.enqueue('parse_audience', { chatId, lastDays: Number(lastDays), userId });
  res.json({ taskId: task.id });
});

// Background broadcast job
telegramRouter.post('/broadcast', (req, res) => {
  const { peerId, message, userIds = [], userId } = req.body || {};
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  if (!message) return res.status(400).json({ error: 'message required' });
  const task = taskManager.enqueue('broadcast', { peerId, message, userIds, userId });
  res.json({ taskId: task.id });
});

// Register workers
taskManager.attachWorker('parse_audience', async (task, manager) => {
  const { chatId, lastDays } = task.payload;
  manager.setStatus(task.id, 'running', { progress: 0, message: 'Resolving chat...' });
  try {
    const { all, active } = await getParticipantsWithActivity(chatId, lastDays, 200, 800);
    manager.setStatus(task.id, 'running', { progress: 70, current: active.length, total: all.length, message: 'Saving users...' });
    writeJson(`users_${chatId}.json`, active.map((u) => ({ id: u.id?.value || u.id, username: u.username, firstName: u.firstName, lastName: u.lastName })));
    manager.setProgress(task.id, 100, { current: active.length, total: all.length, message: 'Done' });
    return { chatId, total: all.length, active: active.length };
  } catch (e) {
    logger.error('parse_audience failed', { error: String(e?.message || e) });
    throw e;
  }
});

taskManager.attachWorker('broadcast', async (task, manager) => {
  const { peerId, message, userIds } = task.payload;
  const targets = Array.isArray(userIds) && userIds.length ? userIds : [peerId];
  const total = targets.length;
  for (let i = 0; i < total; i += 1) {
    try { await sendMessage(targets[i], message); } catch (e) { logger.warn('sendMessage failed', { to: targets[i], error: String(e?.message || e) }); }
    if (i % 5 === 0) manager.setProgress(task.id, Math.floor(((i + 1) / total) * 100), { current: i + 1, total });
    await sleep(700);
  }
  return { sent: total };
});


