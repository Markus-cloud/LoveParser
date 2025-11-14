import dotenv from 'dotenv';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../lib/logger.js';

// Load environment variables from .env and .env.local
// .env.local takes precedence for local development
dotenv.config({ path: '.env.local' });
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const BOT_API_BASE = 'https://api.telegram.org';

/**
 * Make a request to the Telegram Bot API
 * @param {string} method - API method name
 * @param {Object} params - Request parameters
 * @returns {Promise<Object>} - API response result
 */
async function botApiRequest(method, params = {}) {
  if (!BOT_TOKEN) {
    throw new Error('TELEGRAM_BOT_TOKEN not configured. Bot API features are unavailable.');
  }

  const url = `${BOT_API_BASE}/bot${BOT_TOKEN}/${method}`;
  
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(params);
    
    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(url, options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (!parsed.ok) {
            reject(new Error(parsed.description || 'Bot API request failed'));
          } else {
            resolve(parsed.result);
          }
        } catch (e) {
          reject(new Error(`Failed to parse Bot API response: ${e.message}`));
        }
      });
    });

    req.on('error', (e) => {
      reject(new Error(`Bot API request error: ${e.message}`));
    });

    req.write(postData);
    req.end();
  });
}

/**
 * Download a file from Telegram servers using Bot API
 * @param {string} filePath - File path from getFile API
 * @returns {Promise<Buffer>} - Downloaded file buffer
 */
async function downloadFile(filePath) {
  if (!BOT_TOKEN) {
    throw new Error('TELEGRAM_BOT_TOKEN not configured');
  }

  const url = `${BOT_API_BASE}/file/bot${BOT_TOKEN}/${filePath}`;
  
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`Failed to download file: HTTP ${res.statusCode}`));
        return;
      }

      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

/**
 * Get user profile photos from Bot API
 * @param {string|number} userId - Telegram user ID
 * @returns {Promise<Object|null>} - Photo metadata including file_id, file_unique_id, or null if no photo
 */
export async function getUserProfilePhotos(userId) {
  try {
    logger.info('Fetching user profile photos via Bot API', { userId: String(userId) });
    
    const result = await botApiRequest('getUserProfilePhotos', {
      user_id: Number(userId),
      limit: 1
    });

    if (!result.photos || result.photos.length === 0) {
      logger.info('User has no profile photos', { userId: String(userId) });
      return null;
    }

    // Get the photos array - Bot API returns array of photo sizes
    const photoSizes = result.photos[0];
    
    // Select the preferred size (medium quality, not too large)
    // Sizes are typically ordered from smallest to largest
    // We prefer medium size (index 1 or 2 if available), otherwise largest
    let selectedPhoto;
    if (photoSizes.length >= 2) {
      selectedPhoto = photoSizes[Math.min(1, photoSizes.length - 1)];
    } else {
      selectedPhoto = photoSizes[photoSizes.length - 1];
    }

    logger.info('Selected profile photo', { 
      userId: String(userId),
      fileId: selectedPhoto.file_id,
      fileSize: selectedPhoto.file_size 
    });

    return {
      file_id: selectedPhoto.file_id,
      file_unique_id: selectedPhoto.file_unique_id,
      file_size: selectedPhoto.file_size,
      width: selectedPhoto.width,
      height: selectedPhoto.height
    };
  } catch (error) {
    logger.error('Failed to get user profile photos', { 
      userId: String(userId), 
      error: String(error?.message || error) 
    });
    throw error;
  }
}

/**
 * Download and cache user avatar using Bot API
 * @param {string|number} userId - Telegram user ID
 * @returns {Promise<Object>} - Object with photoPath, photoUrl, metadata
 */
export async function downloadUserAvatar(userId) {
  const userIdString = String(userId);
  const startTime = Date.now();
  
  try {
    logger.info('Starting avatar download via Bot API', { userId: userIdString });

    // Get profile photos metadata
    const photoMeta = await getUserProfilePhotos(userId);
    
    if (!photoMeta) {
      logger.info('User has no profile photo to download', { userId: userIdString });
      return { 
        photoPath: null, 
        photoUrl: null, 
        metadata: null 
      };
    }

    // Get file info to obtain file path
    const fileInfo = await botApiRequest('getFile', {
      file_id: photoMeta.file_id
    });

    if (!fileInfo.file_path) {
      throw new Error('Bot API did not return file_path');
    }

    // Download the file
    logger.info('Downloading avatar file', { 
      userId: userIdString, 
      filePath: fileInfo.file_path 
    });
    
    const buffer = await downloadFile(fileInfo.file_path);

    if (!buffer || buffer.length === 0) {
      throw new Error('Downloaded avatar buffer is empty');
    }

    // Determine file extension from file path
    const ext = path.extname(fileInfo.file_path) || '.jpg';
    
    // Ensure avatars directory exists
    const avatarsDir = path.join(__dirname, '..', 'data', 'avatars');
    if (!fs.existsSync(avatarsDir)) {
      fs.mkdirSync(avatarsDir, { recursive: true });
    }

    // Save the file
    const photoPath = path.join(avatarsDir, `${userIdString}${ext}`);
    fs.writeFileSync(photoPath, buffer);

    const photoUrl = `/api/user/avatar/${userIdString}${ext}`;

    const metadata = {
      file_id: photoMeta.file_id,
      file_unique_id: photoMeta.file_unique_id,
      file_size: photoMeta.file_size,
      width: photoMeta.width,
      height: photoMeta.height,
      downloadedAt: new Date().toISOString(),
      photoUrl: photoUrl,
      fileExtension: ext
    };

    logger.info('Avatar downloaded and cached via Bot API', { 
      userId: userIdString, 
      fileSize: buffer.length,
      elapsed: Date.now() - startTime + 'ms'
    });

    return {
      photoPath,
      photoUrl,
      metadata
    };
  } catch (error) {
    logger.error('Failed to download avatar via Bot API', { 
      userId: userIdString, 
      error: String(error?.message || error),
      elapsed: Date.now() - startTime + 'ms'
    });
    throw error;
  }
}

/**
 * Check if Bot API is configured
 * @returns {boolean}
 */
export function isBotApiConfigured() {
  return !!BOT_TOKEN;
}
