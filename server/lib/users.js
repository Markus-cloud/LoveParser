import { readJson, writeJson } from './storage.js';
import { logger } from './logger.js';

const USERS_FILE = 'users.json';

export function getUsersMap() {
  return readJson(USERS_FILE, {});
}

export function saveUsersMap(map) {
  writeJson(USERS_FILE, map);
}

export function upsertUser(tgUser) {
  if (!tgUser || !tgUser.id) throw new Error('Invalid user');
  const users = getUsersMap();
  const id = String(tgUser.id);
  const now = Date.now();
  const existing = users[id];
  const profile = {
    id,
    username: tgUser.username || '',
    first_name: tgUser.first_name || '',
    last_name: tgUser.last_name || '',
    photo_url: tgUser.photo_url || '',
    language_code: tgUser.language_code || '',
    lastLogin: now,
    createdAt: existing?.createdAt || now,
  };
  users[id] = profile;
  saveUsersMap(users);
  logger.info('User upserted', { id });
  return profile;
}

export function getUserById(id) {
  const users = getUsersMap();
  return users[String(id)] || null;
}


