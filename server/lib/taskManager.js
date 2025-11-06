import { v4 as uuidv4 } from 'uuid';
import EventEmitter from 'events';
import { readJson, writeJson } from './storage.js';
import { logger } from './logger.js';

const TASKS_FILE = 'tasks.json';

export class TaskManager extends EventEmitter {
  constructor() {
    super();
    this.tasks = readJson(TASKS_FILE, {});
    this.workers = new Map();
    this.streams = new Map(); // taskId -> Set(res)
  }

  list() {
    return Object.values(this.tasks).sort((a, b) => b.createdAt - a.createdAt);
  }

  get(taskId) {
    return this.tasks[taskId] || null;
  }

  create(type, payload) {
    const id = uuidv4();
    const task = {
      id,
      type,
      payload,
      userId: payload?.userId,
      status: 'queued',
      progress: 0,
      result: null,
      error: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.tasks[id] = task;
    this.persist();
    this.emit('created', task);
    return task;
  }

  setStatus(id, status, patch = {}) {
    const task = this.tasks[id];
    if (!task) return;
    Object.assign(task, { status, updatedAt: Date.now(), ...patch });
    this.persist();
    this.emit('updated', task);
    this.broadcast(id, task);
  }

  setProgress(id, progress, patch = {}) {
    this.setStatus(id, this.tasks[id]?.status || 'running', { progress, ...patch });
  }

  attachWorker(type, handler) {
    this.workers.set(type, handler);
  }

  async run(task) {
    const handler = this.workers.get(task.type);
    if (!handler) {
      this.setStatus(task.id, 'failed', { error: `No worker for type ${task.type}` });
      return;
    }
    try {
      this.setStatus(task.id, 'running', { progress: 0 });
      const result = await handler(task, this);
      this.setStatus(task.id, 'completed', { progress: 100, result });
    } catch (err) {
      logger.error('Task failed', { id: task.id, error: String(err?.message || err) });
      this.setStatus(task.id, 'failed', { error: String(err?.message || err) });
    }
  }

  enqueue(type, payload) {
    const task = this.create(type, payload);
    // Fire and forget
    setTimeout(() => this.run(task), 0);
    return task;
  }

  persist() {
    writeJson(TASKS_FILE, this.tasks);
  }

  attachStream(taskId, res) {
    if (!this.streams.has(taskId)) this.streams.set(taskId, new Set());
    this.streams.get(taskId).add(res);
    const task = this.get(taskId);
    if (task) this.broadcast(taskId, task);
  }

  detachStream(taskId, res) {
    const set = this.streams.get(taskId);
    if (!set) return;
    set.delete(res);
    if (set.size === 0) this.streams.delete(taskId);
  }

  broadcast(taskId, task) {
    const set = this.streams.get(taskId);
    if (!set) return;
    const payload = JSON.stringify({
      progress: task.progress,
      status: task.status,
      current: task.current || 0,
      total: task.total || 0,
      message: task.message || '',
    });
    for (const res of set) {
      res.write(`data: ${payload}\n\n`);
    }
  }
}

export const taskManager = new TaskManager();


