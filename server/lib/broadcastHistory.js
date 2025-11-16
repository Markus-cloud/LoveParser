import fs from 'fs';
import { getDataPath, readJson, writeJson } from './storage.js';

const FILE_PREFIX = 'broadcast_results_';
const FILE_SUFFIX = '.json';
const audienceNameCache = new Map();

function sanitizeHistoryFileName(historyId) {
  return `${FILE_PREFIX}${historyId}${FILE_SUFFIX}`;
}

export function buildMessagePreview(message = '', maxLength = 120) {
  if (!message) return '';
  const trimmed = message.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }
  return `${trimmed.slice(0, maxLength).trimEnd()}...`;
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date;
}

function resolveAudienceName(audienceId) {
  if (!audienceId) {
    return null;
  }
  if (audienceNameCache.has(audienceId)) {
    return audienceNameCache.get(audienceId);
  }

  const audienceData = readJson(`audience_results_${audienceId}.json`, null);
  const derived = deriveAudienceName(audienceData) || audienceId;
  audienceNameCache.set(audienceId, derived);
  return derived;
}

export function generateBroadcastHistoryId(userId) {
  const timestamp = Date.now();
  return `broadcast_${timestamp}_${userId}`;
}

export function computeBroadcastStatus(summary = {}) {
  const total = Number(summary.total ?? 0);
  const success = Number(summary.success ?? 0);
  const failed = Number(summary.failed ?? 0);

  if (total <= 0) {
    return 'empty';
  }

  if (success >= total && total > 0) {
    return 'success';
  }

  if (success > 0 && failed > 0) {
    return 'partial';
  }

  if (success === 0 && failed >= total) {
    return 'failed';
  }

  if (failed === 0 && success > 0) {
    return 'success';
  }

  return 'unknown';
}

export function deriveAudienceName(audienceData) {
  if (!audienceData) {
    return null;
  }

  if (typeof audienceData.name === 'string' && audienceData.name.trim()) {
    return audienceData.name.trim();
  }

  if (typeof audienceData.title === 'string' && audienceData.title.trim()) {
    return audienceData.title.trim();
  }

  const identifier = audienceData.sessionId || audienceData.id;
  const timestamp = parseDate(audienceData.timestamp || audienceData.createdAt);

  if (identifier && timestamp) {
    return `${identifier} ${timestamp.toISOString()}`;
  }

  if (timestamp) {
    return `Audience ${timestamp.toISOString()}`;
  }

  if (identifier) {
    return String(identifier);
  }

  return null;
}

export function normalizeBroadcastHistory(raw, { hydrateAudience = true } = {}) {
  if (!raw) {
    return null;
  }

  const summary = {
    total: Number(raw.summary?.total ?? 0),
    success: Number(raw.summary?.success ?? 0),
    failed: Number(raw.summary?.failed ?? 0),
    successRate: raw.summary?.successRate ?? (Number(raw.summary?.total ?? 0) > 0
      ? `${((Number(raw.summary?.success ?? 0) / Number(raw.summary?.total ?? 0)) * 100).toFixed(2)}%`
      : '0%')
  };

  const timestamp = raw.createdAt || raw.timestamp || null;
  const normalized = {
    ...raw,
    id: raw.id || raw.historyId || null,
    userId: raw.userId || null,
    timestamp,
    createdAt: timestamp,
    summary,
    status: raw.status || computeBroadcastStatus(summary),
    message: raw.message ?? '',
    messagePreview: raw.messagePreview || buildMessagePreview(raw.message ?? ''),
    deliveryLog: Array.isArray(raw.deliveryLog) ? raw.deliveryLog : [],
    mode: raw.mode || 'dm',
    audienceId: raw.audienceId || null,
    audienceName: raw.audienceName || null
  };

  if (hydrateAudience && !normalized.audienceName && normalized.audienceId) {
    normalized.audienceName = resolveAudienceName(normalized.audienceId);
  }

  return normalized;
}

function matchesFilters(entry, filters = {}) {
  if (!filters) return true;

  const createdAtTime = entry.createdAt ? Date.parse(entry.createdAt) : null;

  if (filters.status) {
    const allowedStatuses = (Array.isArray(filters.status)
      ? filters.status
      : String(filters.status).split(','))
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);
    const entryStatus = (entry.status || '').toLowerCase();
    if (allowedStatuses.length > 0 && !allowedStatuses.includes(entryStatus)) {
      return false;
    }
  }

  if (filters.audienceId && String(entry.audienceId) !== String(filters.audienceId)) {
    return false;
  }

  if (filters.dateFrom) {
    const fromTime = Date.parse(filters.dateFrom);
    if (!Number.isNaN(fromTime)) {
      if (createdAtTime === null || createdAtTime < fromTime) {
        return false;
      }
    }
  }

  if (filters.dateTo) {
    const toTime = Date.parse(filters.dateTo);
    if (!Number.isNaN(toTime)) {
      if (createdAtTime === null || createdAtTime > toTime) {
        return false;
      }
    }
  }

  return true;
}

export function listBroadcastHistory(userId, filters = {}) {
  if (!userId) {
    return [];
  }

  const dataDir = getDataPath();
  let files = [];

  try {
    files = fs.readdirSync(dataDir);
  } catch {
    return [];
  }

  const entries = [];

  for (const file of files) {
    if (!file.startsWith(FILE_PREFIX) || !file.endsWith(FILE_SUFFIX)) {
      continue;
    }

    const history = normalizeBroadcastHistory(readJson(file, null));
    if (!history) {
      continue;
    }

    if (history.userId !== userId) {
      continue;
    }

    if (!matchesFilters(history, filters)) {
      continue;
    }

    entries.push({
      id: history.id,
      createdAt: history.createdAt,
      status: history.status,
      mode: history.mode,
      audienceId: history.audienceId,
      audienceName: history.audienceName,
      total: history.summary.total,
      success: history.summary.success,
      failed: history.summary.failed,
      messagePreview: history.messagePreview
    });
  }

  entries.sort((a, b) => {
    const timeB = b.createdAt ? Date.parse(b.createdAt) : 0;
    const timeA = a.createdAt ? Date.parse(a.createdAt) : 0;
    return timeB - timeA;
  });

  return entries;
}

export function getBroadcastHistoryById(historyId) {
  if (!historyId) {
    return null;
  }

  const history = normalizeBroadcastHistory(readJson(sanitizeHistoryFileName(historyId), null));
  if (!history) {
    return null;
  }

  if (!history.id) {
    history.id = historyId;
  }

  return history;
}

export function saveBroadcastHistory(history) {
  if (!history?.id) {
    throw new Error('Broadcast history record must include an id');
  }

  writeJson(sanitizeHistoryFileName(history.id), history);
}
