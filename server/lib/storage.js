import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.resolve(__dirname, '..', 'data');

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

export function readJson(fileName, defaultValue) {
  ensureDir(dataDir);
  const filePath = path.join(dataDir, fileName);
  if (!fs.existsSync(filePath)) return defaultValue;
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return defaultValue;
  }
}

export function writeJson(fileName, value) {
  ensureDir(dataDir);
  const filePath = path.join(dataDir, fileName);
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf-8');
}

export function getDataPath() {
  ensureDir(dataDir);
  return dataDir;
}


