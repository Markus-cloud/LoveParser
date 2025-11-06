import { Router } from 'express';
import { taskManager } from '../lib/taskManager.js';

export const tasksRouter = Router();

tasksRouter.get('/', (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const tasks = taskManager.list().filter((t) => String(t.userId) === String(userId));
  res.json({ tasks });
});

tasksRouter.get('/:id', (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const task = taskManager.get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Not found' });
  if (String(task.userId) !== String(userId)) return res.status(403).json({ error: 'Forbidden' });
  res.json(task);
});

// SSE stream of task updates
tasksRouter.get('/:id/stream', (req, res) => {
  const { id } = req.params;
  const { userId } = req.query;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const task = taskManager.get(id);
  if (!task) return res.status(404).json({ error: 'Not found' });
  if (String(task.userId) !== String(userId)) return res.status(403).json({ error: 'Forbidden' });
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();
  taskManager.attachStream(id, res);
  req.on('close', () => taskManager.detachStream(id, res));
});


