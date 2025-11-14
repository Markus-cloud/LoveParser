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
    photo_id: tgUser.photo_id || null,
    language_code: tgUser.language_code || '',
    lastLogin: now,
    createdAt: existing?.createdAt || now,
    photoUpdatedAt: tgUser.photo_url ? now : (existing?.photoUpdatedAt || null),
  };
  users[id] = profile;
  saveUsersMap(users);
  logger.info('User upserted', { id, hasPhoto: !!tgUser.photo_url });
  return profile;
}

export function getUserById(id) {
  const users = getUsersMap();
  return users[String(id)] || null;
}

/**
 * Update avatar metadata for a user
 * @param {string|number} userId - User ID
 * @param {Object} avatarMeta - Avatar metadata (file_id, file_unique_id, photoUrl, etc.)
 * @returns {Object} Updated user profile
 */
export function updateUserAvatar(userId, avatarMeta) {
  const users = getUsersMap();
  const id = String(userId);
  const existing = users[id];
  
  if (!existing) {
    throw new Error(`User ${id} not found. Please login first.`);
  }

  const now = Date.now();
  const profile = {
    ...existing,
    photo_url: avatarMeta.photoUrl || existing.photo_url || '',
    photo_id: avatarMeta.file_unique_id || existing.photo_id || null,
    photoUpdatedAt: now,
    // Store bot API metadata for cache validation
    avatarMetadata: {
      file_id: avatarMeta.file_id,
      file_unique_id: avatarMeta.file_unique_id,
      file_size: avatarMeta.file_size,
      width: avatarMeta.width,
      height: avatarMeta.height,
      downloadedAt: avatarMeta.downloadedAt,
      fileExtension: avatarMeta.fileExtension
    }
  };

  users[id] = profile;
  saveUsersMap(users);
  logger.info('User avatar updated', { id, photoUrl: avatarMeta.photoUrl });
  return profile;
}

/**
 * Get cached avatar metadata for a user
 * @param {string|number} userId - User ID
 * @returns {Object|null} Avatar metadata or null if not cached
 */
export function getUserAvatarMetadata(userId) {
  const user = getUserById(userId);
  if (!user || !user.avatarMetadata) {
    return null;
  }
  return user.avatarMetadata;
}

