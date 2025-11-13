import { Router } from 'express';
import { upsertUser, getUserById, updateUserAvatar, getUserAvatarMetadata } from '../lib/users.js';
import { downloadUserAvatar, isBotApiConfigured } from '../services/telegramBotApi.js';
import { logger } from '../lib/logger.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const userRouter = Router();

userRouter.post('/login', (req, res) => {
  const { user } = req.body || {};
  if (!user || !user.id) return res.status(400).json({ success: false, error: 'Invalid user' });
  try {
    const profile = upsertUser(user);
    res.json({ success: true, user: profile });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e?.message || e) });
  }
});

userRouter.get('/:id', (req, res) => {
  const profile = getUserById(req.params.id);
  if (!profile) return res.status(404).json({ error: 'Not found' });
  res.json(profile);
});

/**
 * GET /api/user/:id/photo
 * Get user profile photo URL, using cache when available
 * Query params:
 *   - refresh=true: Force refresh from Telegram Bot API
 */
userRouter.get('/:id/photo', async (req, res) => {
  const userId = req.params.id;
  const forceRefresh = req.query.refresh === 'true';

  try {
    // Check if Bot API is configured
    if (!isBotApiConfigured()) {
      logger.warn('Bot API not configured, cannot fetch user photo');
      return res.status(503).json({ 
        error: 'TELEGRAM_BOT_TOKEN not configured. Bot API features are unavailable.',
        photo_url: null 
      });
    }

    // Check if user exists
    const user = getUserById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found. Please login first.' });
    }

    // Check cached metadata
    const cachedMeta = getUserAvatarMetadata(userId);
    
    // Use cache if available and not forcing refresh
    if (!forceRefresh && cachedMeta && cachedMeta.photoUrl) {
      // Verify the cached file still exists
      const avatarsDir = path.join(__dirname, '..', 'data', 'avatars');
      const cachedFilePath = path.join(avatarsDir, path.basename(cachedMeta.photoUrl));
      
      if (fs.existsSync(cachedFilePath)) {
        logger.info('Returning cached avatar', { userId, photoUrl: cachedMeta.photoUrl });
        return res.json({ photo_url: cachedMeta.photoUrl });
      } else {
        logger.warn('Cached avatar file missing, will re-download', { userId, cachedPath: cachedFilePath });
      }
    }

    // Download/refresh avatar from Bot API
    logger.info('Fetching avatar via Bot API', { userId, forceRefresh });
    
    const avatarResult = await downloadUserAvatar(userId);
    
    if (!avatarResult.photoUrl) {
      logger.info('User has no profile photo', { userId });
      return res.json({ photo_url: null });
    }

    // Update user record with new avatar metadata
    updateUserAvatar(userId, avatarResult.metadata);

    logger.info('Avatar fetched and cached', { userId, photoUrl: avatarResult.photoUrl });
    res.json({ photo_url: avatarResult.photoUrl });

  } catch (error) {
    const errorMessage = String(error?.message || error);
    logger.error('Failed to fetch user photo', { userId, error: errorMessage });
    
    // Return 503 if Bot API is not configured
    if (errorMessage.includes('TELEGRAM_BOT_TOKEN')) {
      return res.status(503).json({ 
        error: errorMessage,
        photo_url: null 
      });
    }
    
    res.status(500).json({ error: errorMessage, photo_url: null });
  }
});


