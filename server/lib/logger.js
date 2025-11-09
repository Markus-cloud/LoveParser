import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logsDir = path.resolve(__dirname, '..', 'logs');
const logFile = path.join(logsDir, 'app.log');

function ensureLog() {
  if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
  if (!fs.existsSync(logFile)) fs.writeFileSync(logFile, '', 'utf-8');
}

// Helper function to convert BigInt to string recursively
function serializeBigInt(obj) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'bigint') return String(obj);
  if (Array.isArray(obj)) return obj.map(serializeBigInt);
  if (typeof obj === 'object') {
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = serializeBigInt(value);
    }
    return result;
  }
  return obj;
}

export function log(level, message, meta = {}) {
  ensureLog();
  const sanitizedMeta = serializeBigInt(meta);
  const entry = { ts: new Date().toISOString(), level, message, ...sanitizedMeta };
  const line = JSON.stringify(entry) + '\n';
  try {
    fs.appendFileSync(logFile, line);
  } catch {}
  console[level === 'error' ? 'error' : 'log'](`[${level}] ${message}`, meta);
}

export const logger = {
  info: (msg, meta) => log('info', msg, meta),
  warn: (msg, meta) => log('warn', msg, meta),
  error: (msg, meta) => log('error', msg, meta),
};

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}


