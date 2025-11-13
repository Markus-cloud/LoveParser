import { Router } from 'express';
import { taskManager } from '../lib/taskManager.js';
import { searchDialogs, searchChannels, sendMessage, getParticipantsWithActivity, sendCode, signIn, getAuthStatus, clearSession } from '../services/telegramClient.js';
import { writeJson, readJson } from '../lib/storage.js';
import { logger, sleep } from '../lib/logger.js';

export const telegramRouter = Router();

// Proxy and cache Telegram user profile avatars for current user
telegramRouter.get('/avatar/:username', async (req, res) => {
  try {
    const { username } = req.params;
    logger.info('avatar route called', { username });
    if (!username) return res.status(400).send('username required');

    const fs = await import('fs');
    const path = await import('path');
    const { fileURLToPath } = await import('url');
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const avatarsDir = path.resolve(__dirname, '..', 'public', 'avatars');
    if (!fs.existsSync(avatarsDir)) fs.mkdirSync(avatarsDir, { recursive: true });

    // sanitize filename
    const safeName = String(username).replace(/[^a-zA-Z0-9_-]/g, '_');
    const filePath = path.join(avatarsDir, `${safeName}.jpg`);

    // If cached file exists, serve it
    if (fs.existsSync(filePath)) {
      if (req.query.debug) {
        const stats = fs.statSync(filePath);
        const payload = { cached: true, filePath, size: stats.size };
        const serialized = JSON.stringify(payload, (k, v) => typeof v === 'bigint' ? String(v) : v);
        res.setHeader('Content-Type', 'application/json');
        return res.send(serialized);
      }
      return res.sendFile(filePath);
    }

    // First, try to resolve and download the user's profile photo via Telegram client (preferred)
    const debugResult = { username, clientAttempted: false, entity: null, photosCount: 0, profilePhotoDownloaded: false, errors: [] };
    try {
      const { getClient } = await import('../services/telegramClient.js');
      logger.info('attempting to get Telegram client for avatar fetch', { username });
      const tg = await getClient();
      debugResult.clientAttempted = true;
      let entity = null;
      try {
        entity = await tg.getEntity(username);
        debugResult.entity = { id: entity?.id?.value || entity?.id, username: entity?.username || null, hasPhoto: !!entity?.photo };
        logger.info('got entity from tg.getEntity', { username, entity: debugResult.entity });
      } catch (e) {
        const err = String(e?.message || e);
        debugResult.errors.push({ stage: 'getEntity', error: err });
        logger.warn('tg.getEntity failed', { username, error: err });
      }

      if (entity) {
        try {
          // Direct attempt: download entity.photo (if present)
          if (entity.photo) {
            try {
              logger.info('attempting tg.downloadFile(entity.photo)', { username });
              const buf = await tg.downloadFile(entity.photo);
              logger.info('downloadFile(entity.photo) returned size', { username, size: buf ? buf.length : 0 });
              if (buf && buf.length) {
                debugResult.profilePhotoDownloaded = true;
                try { fs.writeFileSync(filePath, buf); } catch (e) { logger.warn('failed to write avatar cache file', { filePath, error: String(e?.message || e) }); }
                if (req.query.debug) { const serialized = JSON.stringify({ debug: debugResult, cached: false }, (k, v) => typeof v === 'bigint' ? String(v) : v); res.setHeader('Content-Type','application/json'); return res.send(serialized); }
                res.setHeader('Content-Type','image/jpeg'); res.setHeader('Cache-Control','public, max-age=86400'); logger.info('serving downloaded avatar from entity.photo', { username, filePath }); return res.send(buf);
              }
            } catch (e) {
              const err = String(e?.message || e);
              debugResult.errors.push({ stage: 'downloadEntityPhoto', error: err });
              logger.warn('download entity.photo failed', { username, error: err });
            }
          }

          // Try high-level helper: getProfilePhotos
          logger.info('calling tg.getProfilePhotos', { username });
          // Some TelegramClient versions don't have getProfilePhotos helper
          let photos = null;
          try {
            photos = await tg.getProfilePhotos(entity, { limit: 1 });
          } catch (err) {
            debugResult.errors.push({ stage: 'getProfilePhotos', error: String(err?.message || err) });
            logger.warn('tg.getProfilePhotos not available or failed', { username, error: String(err?.message || err) });
            photos = null;
          }

          debugResult.photosCount = Array.isArray(photos) ? photos.length : (photos ? 1 : 0);
          logger.info('getProfilePhotos result', { username, photosCount: debugResult.photosCount });
          if (photos && photos.length > 0) {
            try {
              logger.info('attempting to download first photo via tg.downloadFile', { username });
              const fileBuffer = await tg.downloadFile(photos[0]);
              logger.info('downloadFile returned', { username, size: fileBuffer ? fileBuffer.length : 0 });
              if (fileBuffer && fileBuffer.length) {
                debugResult.profilePhotoDownloaded = true;
                try { fs.writeFileSync(filePath, fileBuffer); } catch (e) { logger.warn('failed to write avatar cache file', { filePath, error: String(e?.message || e) }); }
                if (req.query.debug) { const serialized = JSON.stringify({ debug: debugResult, cached: false }, (k, v) => typeof v === 'bigint' ? String(v) : v); res.setHeader('Content-Type','application/json'); return res.send(serialized); }
                res.setHeader('Content-Type', 'image/jpeg');
                res.setHeader('Cache-Control', 'public, max-age=86400');
                logger.info('serving downloaded avatar from tg client', { username, filePath });
                return res.send(fileBuffer);
              }
            } catch (e) {
              const err = String(e?.message || e);
              debugResult.errors.push({ stage: 'downloadFile', error: err });
              logger.error('tg.downloadFile failed', { username, error: err });
              // ignore and fallback
            }
          }
        } catch (e) {
          const err = String(e?.message || e);
          debugResult.errors.push({ stage: 'getProfilePhotos', error: err });
          logger.error('tg.getProfilePhotos failed', { username, error: err });
          // ignore and fallback
        }

        // Low-level attempt using Api.photos.GetUserPhotos
        try {
          const { Api } = await import('telegram/tl/index.js');
          logger.info('attempting low-level Api.photos.GetUserPhotos', { username, userId: entity?.id });
          const userIdValue = entity?.id?.value || entity?.id;
          const getPhotos = await tg.invoke(new Api.photos.GetUserPhotos({ userId: userIdValue, offset: 0, maxId: 0, limit: 1 }));
          debugResult.lowLevel = { ok: true, resultKeys: Object.keys(getPhotos || {}) };
          logger.info('GetUserPhotos result keys', { username, keys: Object.keys(getPhotos || {}) });
        } catch (e) {
          const err = String(e?.message || e);
          debugResult.errors.push({ stage: 'GetUserPhotos', error: err });
          logger.error('GetUserPhotos failed', { username, error: err });
        }
      }
    } catch (e) {
      debugResult.errors.push({ stage: 'getClient', error: String(e?.message || e) });
      logger.warn('getClient/avatar flow failed', { username, error: String(e?.message || e) });
      // ignore and fallback to CDN
    }

    if (req.query.debug) {
      // Continue to CDN but will return combined debug info later
      req._avatarDebug = debugResult;
    }

    // Fallback: Fetch from Telegram CDN (may 404 for some users)
    const remoteUrl = `https://t.me/i/userpic/320/${encodeURIComponent(username)}`;
    logger.info('falling back to Telegram CDN', { username, remoteUrl });
    const response = await fetch(remoteUrl, { method: 'GET' });
    logger.info('CDN fetch response', { username, status: response.status, ok: response.ok });
    if (!response.ok) {
      logger.warn('CDN fetch failed', { username, status: response.status });
      if (req.query.debug) {
        const debug = req._avatarDebug || { username, errors: [] };
        debug.cdn = { status: response.status, ok: response.ok };
        const serialized = JSON.stringify({ debug }, (k, v) => typeof v === 'bigint' ? String(v) : v);
        res.setHeader('Content-Type', 'application/json');
        return res.status(200).send(serialized);
      }
      return res.status(response.status).send('Failed to fetch avatar');
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    // Save to cache
    try {
      fs.writeFileSync(filePath, buffer);
    } catch (e) {
      logger.warn('failed to write avatar cache file from CDN', { filePath, error: String(e?.message || e) });
    }

    res.setHeader('Content-Type', response.headers.get('content-type') || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    logger.info('serving avatar from CDN', { username, filePath });
    if (req.query.debug) {
      const debug = req._avatarDebug || { username, errors: [] };
      debug.cdn = { status: response.status, ok: response.ok };
      debug.cached = false;
      const serialized = JSON.stringify({ debug }, (k, v) => typeof v === 'bigint' ? String(v) : v);
      res.setHeader('Content-Type', 'application/json');
      return res.status(200).send(serialized);
    }
    res.send(buffer);
  } catch (e) {
    const err = String(e?.stack || e?.message || e);
    logger.error('avatar route failed', { error: err });
    if (req.query && req.query.debug) {
      return res.status(200).json({ error: err });
    }
    res.status(500).send('Internal error');
  }
});

/**
 * Normalizes channel data for backward compatibility
 * Handles both legacy flat records and new enriched records
 * @param {Object} channel - Channel object (legacy or enriched)
 * @returns {Object} Normalized channel object with all required fields
 */
function normalizeChannelData(channel) {
  // Handle null/undefined channel
  if (!channel) {
    return {
      id: '',
      title: 'Без названия',
      username: null,
      address: 'tg://resolve?domain=',
      membersCount: 0,
      description: '',
      type: 'Channel',
      peer: null,
      metadata: {
        isVerified: false,
        isRestricted: false,
        isScam: false,
        isFake: false,
        isGigagroup: false,
        hasUsername: false,
        isPublic: false,
        privacy: 'private'
      },
      category: 'Channel',
      inviteLink: null,
      channelMetadata: {
        linkedChatId: null,
        canViewParticipants: false,
        canSetUsername: false,
        canSetStickers: false,
        hiddenPrehistory: false,
        participantsCount: 0,
        adminsCount: 0,
        kickedCount: 0,
        bannedCount: 0,
        onlineCount: 0,
        readInboxMaxId: 0,
        readOutboxMaxId: 0,
        unreadCount: 0
      },
      resolvedLink: null,
      fullDescription: '',
      searchableText: '',
      date: null,
      hasForwards: false,
      hasScheduled: false,
      canDeleteHistory: false,
      antiSpamEnabled: false,
      joinToSend: false,
      requestJoinRequired: false
    };
  }
  
  // If this is already an enriched record, return as-is with defaults for any missing fields
  if (channel.enriched || channel.peer || channel.metadata) {
    return {
      // Basic fields (always present)
      id: channel.id || '',
      title: channel.title || 'Без названия',
      username: channel.username || null,
      address: channel.address || (channel.username ? `@${channel.username}` : `tg://resolve?domain=${channel.id}`),
      membersCount: Number(channel.membersCount) || 0,
      description: channel.description || '',
      type: channel.type || 'Channel',
      
      // Enriched fields (with defaults for backward compatibility)
      peer: channel.peer || null,
      metadata: channel.metadata || {
        isVerified: false,
        isRestricted: false,
        isScam: false,
        isFake: false,
        isGigagroup: false,
        hasUsername: !!channel.username,
        isPublic: !!channel.username,
        privacy: channel.username ? 'public' : 'private'
      },
      category: channel.category || channel.type || 'Channel',
      inviteLink: channel.inviteLink || null,
      channelMetadata: channel.channelMetadata || {
        linkedChatId: null,
        canViewParticipants: false,
        canSetUsername: false,
        canSetStickers: false,
        hiddenPrehistory: false,
        participantsCount: Number(channel.membersCount) || 0,
        adminsCount: 0,
        kickedCount: 0,
        bannedCount: 0,
        onlineCount: 0,
        readInboxMaxId: 0,
        readOutboxMaxId: 0,
        unreadCount: 0
      },
      resolvedLink: channel.resolvedLink || (channel.username ? `https://t.me/${channel.username}` : null),
      fullDescription: channel.description || '',
      searchableText: `${channel.title || ''} ${channel.description || ''}`.toLowerCase(),
      date: channel.date || null,
      hasForwards: channel.hasForwards || false,
      hasScheduled: channel.hasScheduled || false,
      canDeleteHistory: channel.canDeleteHistory || false,
      antiSpamEnabled: channel.antiSpamEnabled || false,
      joinToSend: channel.joinToSend || false,
      requestJoinRequired: channel.requestJoinRequired || false
    };
  }
  
  // Legacy record - enrich with defaults
  const username = channel.username || null;
  return {
    // Preserve original legacy fields
    id: channel.id || '',
    title: channel.title || 'Без названия',
    username: username,
    address: channel.address || (username ? `@${username}` : `tg://resolve?domain=${channel.id}`),
    membersCount: Number(channel.membersCount) || 0,
    description: channel.description || '',
    type: channel.type || 'Channel',
    
    // Add enriched fields with sensible defaults
    peer: null,
    metadata: {
      isVerified: false,
      isRestricted: false,
      isScam: false,
      isFake: false,
      isGigagroup: false,
      hasUsername: !!username,
      isPublic: !!username,
      privacy: username ? 'public' : 'private'
    },
    category: channel.type || 'Channel',
    inviteLink: null,
    channelMetadata: {
      linkedChatId: null,
      canViewParticipants: false,
      canSetUsername: false,
      canSetStickers: false,
      hiddenPrehistory: false,
      participantsCount: channel.membersCount || 0,
      adminsCount: 0,
      kickedCount: 0,
      bannedCount: 0,
      onlineCount: 0,
      readInboxMaxId: 0,
      readOutboxMaxId: 0,
      unreadCount: 0
    },
    resolvedLink: username ? `https://t.me/${username}` : null,
    fullDescription: channel.description || '',
    searchableText: `${channel.title || ''} ${channel.description || ''}`.toLowerCase(),
    date: null,
    hasForwards: false,
    hasScheduled: false,
    canDeleteHistory: false,
    antiSpamEnabled: false,
    joinToSend: false,
    requestJoinRequired: false
  };
}

/**
 * Normalizes parsing results data for backward compatibility
 * @param {Object} resultsData - Raw results data from storage
 * @returns {Object} Normalized results data
 */
function normalizeParsingResults(resultsData) {
  if (!resultsData) return resultsData;
  
  // Normalize channels array
  const normalizedChannels = (resultsData.channels || []).map(channel => normalizeChannelData(channel));
  
  return {
    ...resultsData,
    channels: normalizedChannels,
    // Add missing fields with defaults for legacy records
    keywords: resultsData.keywords || (resultsData.query ? [resultsData.query] : []),
    searchFilters: resultsData.searchFilters || {
      minMembers: resultsData.minMembers || 0,
      maxMembers: resultsData.maxMembers || null,
      limit: 100,
      channelTypes: {
        megagroup: true,
        discussionGroup: true,
        broadcast: true
      }
    },
    version: resultsData.version || '1.0',
    enriched: resultsData.enriched || false
  };
}

// Authentication endpoints
telegramRouter.post('/auth/send-code', async (req, res) => {
  const startTime = Date.now();
  logger.info('[PERF] POST /auth/send-code received');
  console.log(`[${new Date().toISOString()}] [PERF] POST /auth/send-code received`);
  
  const { phoneNumber } = req.body || {};
  if (!phoneNumber) {
    return res.status(400).json({ error: 'phoneNumber required' });
  }
  try {
    const result = await sendCode(phoneNumber);
    logger.info('[PERF] POST /auth/send-code completed', { elapsed: Date.now() - startTime + 'ms' });
    console.log(`[${new Date().toISOString()}] [PERF] POST /auth/send-code completed: ${Date.now() - startTime}ms`);
    res.json(result);
  } catch (e) {
    const errorMessage = String(e?.message || e);
    logger.error('send-code failed', { error: errorMessage, elapsed: Date.now() - startTime + 'ms' });
    console.log(`[${new Date().toISOString()}] [ERROR] POST /auth/send-code failed after ${Date.now() - startTime}ms: ${errorMessage}`);
    res.status(500).json({ error: errorMessage });
  }
});

telegramRouter.post('/auth/sign-in', async (req, res) => {
  const startTime = Date.now();
  logger.info('[PERF] POST /auth/sign-in received');
  console.log(`[${new Date().toISOString()}] [PERF] POST /auth/sign-in received`);
  
  const { phoneCode, password } = req.body || {};
  if (!phoneCode) {
    return res.status(400).json({ error: 'phoneCode required' });
  }
  try {
    const result = await signIn(phoneCode, password);
    logger.info('[PERF] POST /auth/sign-in completed', { elapsed: Date.now() - startTime + 'ms' });
    console.log(`[${new Date().toISOString()}] [PERF] POST /auth/sign-in completed: ${Date.now() - startTime}ms`);
    res.json(result);
  } catch (e) {
    const errorMessage = String(e?.message || e);
    logger.error('sign-in failed', { error: errorMessage, elapsed: Date.now() - startTime + 'ms' });
    console.log(`[${new Date().toISOString()}] [ERROR] POST /auth/sign-in failed after ${Date.now() - startTime}ms: ${errorMessage}`);
    res.status(500).json({ error: errorMessage });
  }
});

telegramRouter.get('/auth/status', async (_req, res) => {
  try {
    const status = await getAuthStatus();
    res.json(status);
  } catch (e) {
    logger.error('get auth status failed', { error: String(e?.message || e) });
    res.status(500).json({ error: String(e?.message || e) });
  }
});

telegramRouter.post('/auth/clear-session', async (_req, res) => {
  try {
    const result = clearSession();
    res.json(result);
  } catch (e) {
    logger.error('clear session failed', { error: String(e?.message || e) });
    res.status(500).json({ error: String(e?.message || e) });
  }
});

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

// Search channels with filters
telegramRouter.post('/search-channels', async (req, res) => {
  logger.info('search-channels received request', { 
    body: req.body,
    userId: req.body?.userId
  });

  // Support both old format (backward compatibility) and new format
  const { 
    // New format
    keywords, 
    filters, 
    limits,
    // Old format (backward compatibility)
    query = '', 
    minMembers = 0, 
    maxMembers = Infinity, 
    limit = 100, 
    channelTypes,
    userId 
  } = req.body || {};
  
  if (!userId) {
    logger.warn('search-channels called without userId');
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  try {
    // Extract parameters from new format or fall back to old format
    const searchKeywords = keywords || [query];
    const min = filters?.minMembers !== undefined ? Number(filters.minMembers) || 0 : Number(minMembers) || 0;
    const max = filters?.maxMembers !== undefined ? Number(filters.maxMembers) || Infinity : Number(maxMembers) || Infinity;
    const searchLimit = Math.min(Number(limits?.limit) || Number(limit) || 100, 200);
    const channelFilters = filters?.channelTypes || channelTypes || {
      megagroup: true,
      discussion: true,
      broadcast: true,
      basic: true,
      other: false
    };
    
    logger.info('search-channels parameters extracted', { 
      keywords: searchKeywords, 
      min, 
      max: max === Infinity ? 'unlimited' : max, 
      limit: searchLimit, 
      channelFilters: channelFilters,
      userId 
    });
    
    // Search for each keyword and combine results
    let allChannels = [];
    const processedIds = new Set();
    
    for (const keyword of searchKeywords) {
      if (!keyword || !keyword.trim()) continue;
      
      logger.info('searching for keyword', { keyword, filters: channelFilters });
      
      try {
        const channels = await searchChannels(keyword.trim(), min, max, searchLimit, channelFilters);
        
        logger.info('search completed for keyword', { 
          keyword, 
          resultsCount: channels.length,
          categories: channels.map(c => c.category)
        });
        
        // Add channels avoiding duplicates
        for (const channel of channels) {
          const channelId = String(channel.id);
          if (!processedIds.has(channelId)) {
            processedIds.add(channelId);
            allChannels.push(channel);
          }
        }
      } catch (keywordError) {
        logger.error('error searching for keyword', { 
          keyword, 
          error: String(keywordError?.message || keywordError) 
        });
        throw keywordError;
      }
    }
    
    logger.info('all keywords processed', { 
      totalChannels: allChannels.length,
      keywords: searchKeywords 
    });
    
    // Сохраняем результаты для пользователя с обогащенной структурой
    const resultsId = `parsing_${Date.now()}_${userId}`;

    // Extract keywords from input (use provided keywords or split query)
    const queryKeywords = searchKeywords.filter(k => k && k.trim());

    const resultsData = {
      id: resultsId,
      userId: userId,
      query: query,
      keywords: queryKeywords,
      searchFilters: {
        minMembers: min,
        maxMembers: max === Infinity ? null : max,
        limit: searchLimit,
        channelTypes: channelFilters
      },
      channels: allChannels,
      timestamp: new Date().toISOString(),
      count: allChannels.length,
      version: '2.0', // Version for backward compatibility
      enriched: true // Flag to indicate enriched data
    };

    logger.info('saving parsing results', {
      resultsId,
      channelsCount: allChannels.length,
      categories: allChannels.reduce((acc, ch) => {
        acc[ch.category] = (acc[ch.category] || 0) + 1;
        return acc;
      }, {})
    });

    writeJson(`parsing_results_${resultsId}.json`, resultsData);

    logger.info('parsing results saved successfully', {
      resultsId,
      userId
    });

    res.json({
      results: allChannels,
      resultsId: resultsId,
      count: allChannels.length
    });
  } catch (e) {
    logger.error('search-channels failed', { error: String(e?.message || e) });
    res.status(500).json({ error: String(e?.message || e) });
  }
});

// Get all parsing results for user (должен быть ПЕРЕД параметризованным маршрутом)
telegramRouter.get('/parsing-results', async (req, res) => {
  const { userId } = req.query || {};
  
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  try {
    const fs = await import('fs');
    const path = await import('path');
    const { fileURLToPath } = await import('url');
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const dataDir = path.resolve(__dirname, '..', 'data');
    
    if (!fs.existsSync(dataDir)) {
      return res.json({ results: [] });
    }
    
    const files = fs.readdirSync(dataDir);
    const resultsFiles = files.filter(f => f.startsWith('parsing_results_') && f.endsWith('.json'));
    
    const allResults = [];
    for (const file of resultsFiles) {
      try {
        const resultsData = readJson(file, null);
        if (resultsData && resultsData.userId === userId) {
          // Normalize the results data for backward compatibility
          const normalizedData = normalizeParsingResults(resultsData);
          
          const timestamp = new Date(normalizedData.timestamp);
          const dateStr = timestamp.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
          const timeStr = timestamp.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
          
          // Используем ключевые слова из запроса, если они есть, иначе "Результаты поиска"
          const query = normalizedData.query || '';
          const name = query.trim() 
            ? `${query} ${dateStr} ${timeStr}`
            : `Результаты поиска ${dateStr} ${timeStr}`;
          
          allResults.push({
            id: normalizedData.id,
            name: name,
            date: dateStr,
            count: normalizedData.count || 0,
            timestamp: normalizedData.timestamp,
            query: normalizedData.query,
            keywords: normalizedData.keywords,
            enriched: normalizedData.enriched,
            version: normalizedData.version
          });
        }
      } catch (e) {
        logger.warn('Error reading results file', { file, error: String(e?.message || e) });
      }
    }
    
    // Сортируем по дате (новые первыми)
    allResults.sort((a, b) => {
      const tb = new Date(b.timestamp).getTime();
      const ta = new Date(a.timestamp).getTime();
      return tb - ta;
    });
    
    res.json({ results: allResults });
  } catch (e) {
    logger.error('get parsing-results failed', { error: String(e?.message || e) });
    res.status(500).json({ error: String(e?.message || e) });
  }
});

// Download all parsing results as ZIP (должен быть ПЕРЕД параметризованным маршрутом)
telegramRouter.get('/parsing-results/download-all', async (req, res) => {
  const { userId } = req.query || {};
  
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  try {
    const fs = await import('fs');
    const path = await import('path');
    const { fileURLToPath } = await import('url');
    const archiver = await import('archiver');
    
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const dataDir = path.resolve(__dirname, '..', 'data');
    
    if (!fs.existsSync(dataDir)) {
      return res.status(404).json({ error: 'No results found' });
    }
    
    const files = fs.readdirSync(dataDir);
    const resultsFiles = files.filter(f => f.startsWith('parsing_results_') && f.endsWith('.json'));
    
    if (resultsFiles.length === 0) {
      return res.status(404).json({ error: 'No results found' });
    }
    
    // Создаем ZIP архив
    const archive = archiver.default('zip', { zlib: { level: 9 } });
    
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="all_parsing_results_${Date.now()}.zip"`);
    
    archive.pipe(res);
    
    // Добавляем каждый файл результатов в архив как CSV
    for (const file of resultsFiles) {
      try {
        const resultsData = readJson(file, null);
        if (resultsData && resultsData.userId === userId) {
          // Normalize the results data for backward compatibility
          const normalizedData = normalizeParsingResults(resultsData);
          const channels = normalizedData.channels || [];

               // Функция для преобразования типа канала в читаемый статус
                const getStatusLabel = (category) => {
                  switch (category) {
                    // New canonical categories
                    case 'megagroup':
                      return 'Публичный чат';
                    case 'discussion':
                      return 'Каналы с комментариями';
                    case 'broadcast':
                      return 'Каналы';
                    case 'basic':
                      return 'Обычный чат';
                    case 'other':
                      return 'Прочее';
                    // Legacy category names for backward compatibility
                    case 'Megagroup':
                      return 'Публичный чат';
                    case 'Discussion Group':
                      return 'Каналы с комментариями';
                    case 'Broadcast':
                      return 'Каналы';
                    default:
                      return category || 'Неизвестно';
                  }
                };

                const delimiter = ';'; // Точка с запятой для русской локали Excel

                // Enhanced CSV header with additional columns
                const csvHeader = [
            'На��вание канала',
            'Username', 
            'Ссылка на канал',
            'Категория',
            'Приватность',
            'Статус',
            'Количество подписчиков',
            'Описание',
            'Проверен',
            'Ограничен',
            'Скам',
            'Поддельный',
            'Есть ссылка-приглашение',
            'Онлайн участники',
            'Админы'
          ].join(delimiter) + '\n';
          
          const csvRows = channels.map(ch => {
            // Basic fields
            const title = (ch.title || '').replace(/"/g, '""');
            // Формируем ссылку на канал: используем новый link field или fallback к username
            const link = ch.link || (ch.username ? `https://t.me/${ch.username}` : (ch.address || ''));
            const linkEscaped = link.replace(/"/g, '""');
            const status = getStatusLabel(ch.category || ch.type);
            const statusEscaped = status.replace(/"/g, '""');
            const membersCount = ch.membersCount || 0;
            const description = (ch.description || '').replace(/"/g, '""');
            const isVerified = ch.metadata?.isVerified ? 'Да' : 'Нет';
            const isRestricted = ch.metadata?.isRestricted ? 'Да' : 'Нет';
            const isScam = ch.metadata?.isScam ? 'Да' : 'Нет';
            const isFake = ch.metadata?.isFake ? 'Да' : 'Нет';
            const hasInviteLink = ch.inviteLink ? 'Да' : 'Нет';
            const onlineCount = ch.channelMetadata?.onlineCount || 0;
            const adminsCount = ch.channelMetadata?.adminsCount || 0;
            
            // Helper function to escape CSV values
            const escapeCsvValue = (value) => {
              const strValue = String(value);
              return strValue.includes(delimiter) || strValue.includes('"') ? `"${strValue}"` : strValue;
            };
            
            return [
              escapeCsvValue(title),
              escapeCsvValue(username),
              escapeCsvValue(linkEscaped),
              escapeCsvValue(category),
              escapeCsvValue(privacy),
              escapeCsvValue(statusEscaped),
              escapeCsvValue(membersCount),
              escapeCsvValue(description),
              escapeCsvValue(isVerified),
              escapeCsvValue(isRestricted),
              escapeCsvValue(isScam),
              escapeCsvValue(isFake),
              escapeCsvValue(hasInviteLink),
              escapeCsvValue(onlineCount),
              escapeCsvValue(adminsCount)
            ].join(delimiter);
          }).join('\n');
          
          const csv = '\ufeff' + csvHeader + csvRows;
          
          // Формируем имя файла по ключевым словам, как в приложен��и
          const timestamp = new Date(normalizedData.timestamp);
          const dateStr = timestamp.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
          const timeStr = timestamp.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
          const query = normalizedData.query || '';
          const baseName = query.trim() 
            ? `${query} ${dateStr} ${timeStr}`
            : `Результаты поиска ${dateStr} ${timeStr}`;
          
          // Очищаем имя файла от недопустимых символов
          const sanitizedFilename = baseName
            .replace(/[<>:"/\\|?*]/g, '_') // Заменяем недопустимые символы
            .replace(/\s+/g, ' ') // Нормализуем пробелы
            .trim();
          
          const filename = `${sanitizedFilename}.csv`;
          
          archive.append(csv, { name: filename });
        }
      } catch (e) {
        logger.warn('Error processing file for download-all', { file, error: String(e?.message || e) });
      }
    }
    
    await archive.finalize();
  } catch (e) {
    logger.error('download-all parsing-results failed', { error: String(e?.message || e) });
    res.status(500).json({ error: String(e?.message || e) });
  }
});

// Download parsing results as CSV (должен быть ПЕРЕД общи�� параметризованным маршрутом)
telegramRouter.get('/parsing-results/:resultsId/download', async (req, res) => {
  const { resultsId } = req.params;
  const { userId } = req.query || {};
  
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  try {
    const resultsData = readJson(`parsing_results_${resultsId}.json`, null);
    
    if (!resultsData) {
      return res.status(404).json({ error: 'Results not found' });
    }
    
    if (resultsData.userId !== userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    
    // Normalize the results data for backward compatibility
    const normalizedData = normalizeParsingResults(resultsData);
    const channels = normalizedData.channels || [];
    
    // Функция для преобра��ования типа кан��ла в читаемый статус
     const getStatusLabel = (category) => {
       switch (category) {
         // New canonical categories
         case 'megagroup':
           return 'Публичный чат';
         case 'discussion':
           return 'Каналы с комментариями';
         case 'broadcast':
           return 'Каналы';
         case 'basic':
           return 'Обычный чат';
         case 'other':
           return 'Прочее';
         // Legacy category names for backward compatibility
         case 'Megagroup':
           return 'Публичный чат';
         case 'Discussion Group':
           return 'Каналы с комментариями';
         case 'Broadcast':
           return 'Каналы';
         default:
           return category || 'Неизвестно';
       }
     };

     // Генерируем CSV с разделителем точ��а с запятой для русской локали Excel
    const delimiter = ';'; // Точка с запятой для русской локали Excel
    
    // Enhanced CSV header with additional columns
    const csvHeader = [
      'Название канала',
      'Username', 
      'Ссылка на канал',
      'Категори��',
      'Приватность',
      'Статус',
      'Количество подписчиков',
      'Описание',
      'Проверен',
      'Ограничен',
      'Скам',
      'Поддельный',
      'Есть ссылка-приглашение',
      'Онла��н участники',
      'Админы'
    ].join(delimiter) + '\n';
    
    const csvRows = channels.map(ch => {
      // Basic fields
      const title = (ch.title || '').replace(/"/g, '""');
      // Формируем ссылку на канал: используем новый link field или fallback к username
      const link = ch.link || (ch.username ? `https://t.me/${ch.username}` : (ch.address || ''));
      const linkEscaped = link.replace(/"/g, '""');
      const status = getStatusLabel(ch.category || ch.type);
      const statusEscaped = status.replace(/"/g, '""');
      const membersCount = ch.membersCount || 0;
      const description = (ch.description || '').replace(/"/g, '""');
      const isVerified = ch.metadata?.isVerified ? 'Да' : 'Нет';
      const isRestricted = ch.metadata?.isRestricted ? 'Да' : 'Нет';
      const isScam = ch.metadata?.isScam ? 'Да' : 'Нет';
      const isFake = ch.metadata?.isFake ? 'Да' : 'Нет';
      const hasInviteLink = ch.inviteLink ? 'Да' : 'Нет';
      const onlineCount = ch.channelMetadata?.onlineCount || 0;
      const adminsCount = ch.channelMetadata?.adminsCount || 0;
      
      // Helper function to escape CSV values
      const escapeCsvValue = (value) => {
        const strValue = String(value);
        return strValue.includes(delimiter) || strValue.includes('"') ? `"${strValue}"` : strValue;
      };
      
      return [
        escapeCsvValue(title),
        escapeCsvValue(username),
        escapeCsvValue(linkEscaped),
        escapeCsvValue(category),
        escapeCsvValue(privacy),
        escapeCsvValue(statusEscaped),
        escapeCsvValue(membersCount),
        escapeCsvValue(description),
        escapeCsvValue(isVerified),
        escapeCsvValue(isRestricted),
        escapeCsvValue(isScam),
        escapeCsvValue(isFake),
        escapeCsvValue(hasInviteLink),
        escapeCsvValue(onlineCount),
        escapeCsvValue(adminsCount)
      ].join(delimiter);
    }).join('\n');
    
    const csv = csvHeader + csvRows;
    
    // Формируем имя файла по ключевым словам, как в приложении
    const timestamp = new Date(normalizedData.timestamp);
    const dateStr = timestamp.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const timeStr = timestamp.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const query = normalizedData.query || '';
    const baseName = query.trim() 
      ? `${query} ${dateStr} ${timeStr}`
      : `Результаты поиска ${dateStr} ${timeStr}`;
    
    // Очищаем имя файла от недопустимых символов
    const sanitizedFilename = baseName
      .replace(/[<>:"/\\|?*]/g, '_') // Заменяем недопустимые символы
      .replace(/\s+/g, ' ') // Нормализуем пробелы
      .trim();
    
    const filename = `${sanitizedFilename}.csv`;
    
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.send('\ufeff' + csv); // BOM для правиль��ого отображения кириллицы в Excel
  } catch (e) {
    logger.error('download parsing-results failed', { error: String(e?.message || e) });
    res.status(500).json({ error: String(e?.message || e) });
  }
});

// Get channels from parsing results (Megagroup and Discussion Group)
// ВАЖНО: Этот маршрут должен быть ПЕРЕД параметризованным /parsing-results/:resultsId
telegramRouter.get('/parsing-results/channels', async (req, res) => {
  const { userId } = req.query || {};
  
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  try {
    const fs = await import('fs');
    const path = await import('path');
    const { fileURLToPath } = await import('url');
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const dataDir = path.resolve(__dirname, '..', 'data');
    
    if (!fs.existsSync(dataDir)) {
      return res.json({ channels: [] });
    }
    
    const files = fs.readdirSync(dataDir);
    const resultsFiles = files.filter(f => f.startsWith('parsing_results_') && f.endsWith('.json'));
    
    const allChannels = [];
    for (const file of resultsFiles) {
      try {
        const resultsData = readJson(file, null);
        // Сравниваем userId как строки для надежности
        const fileUserId = String(resultsData?.userId || '');
        const requestUserId = String(userId || '');
        
        if (resultsData && fileUserId === requestUserId && resultsData.channels && Array.isArray(resultsData.channels)) {
          // Normalize the results data for backward compatibility
          const normalizedData = normalizeParsingResults(resultsData);
          
          // Включаем все каналы из результатов парсинга
          // Приорит��т от��аем Megagroup и Discussion Group, но показываем все
          const channelsWithMetadata = normalizedData.channels.map(ch => ({
            ...ch,
            // Добавляем и��формацию о результате парсинга
            parsingResultId: normalizedData.id,
            parsingResultName: normalizedData.query || `Результаты поиска ${new Date(normalizedData.timestamp).toLocaleDateString('ru-RU')}`,
            parsingResultKeywords: normalizedData.keywords,
            parsingResultEnriched: normalizedData.enriched,
            parsingResultVersion: normalizedData.version
          }));
          allChannels.push(...channelsWithMetadata);
        }
      } catch (e) {
        logger.warn('Error reading results file', { file, error: String(e?.message || e) });
      }
    }
    
    logger.info('get parsing-results/channels', { 
      userId, 
      filesCount: resultsFiles.length, 
      channelsCount: allChannels.length 
    });
    
    // Удаляем дубликаты по id, оставляя последний (самый свежий)
    const uniqueChannels = Array.from(
      new Map(allChannels.map(ch => [ch.id, ch])).values()
    );
    
    res.json({ channels: uniqueChannels });
  } catch (e) {
    logger.error('get parsing-results/channels failed', { error: String(e?.message || e) });
    res.status(500).json({ error: String(e?.message || e) });
  }
});

// Get saved parsing results by ID (должен быт�� ПОСЛЕ более специфичных маршрутов)
telegramRouter.get('/parsing-results/:resultsId', async (req, res) => {
  const { resultsId } = req.params;
  const { userId } = req.query || {};
  
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  try {
    const resultsData = readJson(`parsing_results_${resultsId}.json`, null);
    
    if (!resultsData) {
      return res.status(404).json({ error: 'Results not found' });
    }
    
    if (resultsData.userId !== userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    
    // Normalize the results data for backward compatibility
    const normalizedData = normalizeParsingResults(resultsData);
    
    res.json(normalizedData);
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

// Get all audience results for user
telegramRouter.get('/audience-results', async (req, res) => {
  const { userId } = req.query || {};
  
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  try {
    const fs = await import('fs');
    const path = await import('path');
    const { fileURLToPath } = await import('url');
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const dataDir = path.resolve(__dirname, '..', 'data');
    
    if (!fs.existsSync(dataDir)) {
      return res.json({ results: [] });
    }
    
    const files = fs.readdirSync(dataDir);
    const resultsFiles = files.filter(f => f.startsWith('audience_results_') && f.endsWith('.json'));
    
    const allResults = [];
    for (const file of resultsFiles) {
      try {
        const resultsData = readJson(file, null);
        if (resultsData && resultsData.userId === userId) {
          const timestamp = new Date(resultsData.timestamp);
          const dateStr = timestamp.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
          const timeStr = timestamp.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
          
          // Generate descriptive name based on parsing type
          let name;
          if (resultsData.sessionId) {
            name = `Аудитория сессии ${dateStr} ${timeStr}`;
            if (resultsData.channelsProcessed && resultsData.totalChannels) {
              name += ` (${resultsData.channelsProcessed}/${resultsData.totalChannels} каналов)`;
            }
          } else {
            name = `Активная аудитория ${dateStr} ${timeStr}`;
          }
          
          // Add filter info to name if applicable
          if (resultsData.participantsLimit) {
            name += ` (лимит: ${resultsData.participantsLimit})`;
          }
          if (resultsData.bioKeywords && resultsData.bioKeywords.length > 0) {
            name += ` (ключевые слова: ${resultsData.bioKeywords.join(', ')})`;
          }
          
          allResults.push({
            id: resultsData.id,
            name: name,
            date: dateStr,
            count: resultsData.count || 0,
            timestamp: resultsData.timestamp,
            chatId: resultsData.chatId,
            sessionId: resultsData.sessionId || null,
            version: resultsData.version || '1.0',
            participantsLimit: resultsData.participantsLimit || null,
            bioKeywords: resultsData.bioKeywords || null,
            channelsProcessed: resultsData.channelsProcessed || null,
            totalChannels: resultsData.totalChannels || null
          });
        }
      } catch (e) {
        logger.warn('Error reading audience results file', { file, error: String(e?.message || e) });
      }
    }
    
    // Сортируем по дате (новые первыми)
    allResults.sort((a, b) => {
      const tb = new Date(b.timestamp).getTime();
      const ta = new Date(a.timestamp).getTime();
      return tb - ta;
    });
    
    res.json({ results: allResults });
  } catch (e) {
    logger.error('get audience-results failed', { error: String(e?.message || e) });
    res.status(500).json({ error: String(e?.message || e) });
  }
});

// Get parsing results for session-based audience parsing
telegramRouter.get('/parsing-results/:resultsId/channels', async (req, res) => {
  const { resultsId } = req.params;
  const { userId } = req.query || {};
  
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  try {
    const resultsData = readJson(`parsing_results_${resultsId}.json`, null);
    
    if (!resultsData) {
      return res.status(404).json({ error: 'Results not found' });
    }
    
    if (resultsData.userId !== userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    
    // Normalize the results data for backward compatibility
    const normalizedData = normalizeParsingResults(resultsData);
    
    res.json({
      id: normalizedData.id,
      name: normalizedData.query || `Результаты поиска ${new Date(normalizedData.timestamp).toLocaleDateString('ru-RU')}`,
      channels: normalizedData.channels,
      count: normalizedData.channels.length,
      timestamp: normalizedData.timestamp,
      keywords: normalizedData.keywords,
      enriched: normalizedData.enriched,
      version: normalizedData.version
    });
  } catch (e) {
    logger.error('get parsing-results channels failed', { error: String(e?.message || e) });
    res.status(500).json({ error: String(e?.message || e) });
  }
});

// Get audience result by ID
telegramRouter.get('/audience-results/:resultsId', async (req, res) => {
  const { resultsId } = req.params;
  const { userId } = req.query || {};
  
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  try {
    const resultsData = readJson(`audience_results_${resultsId}.json`, null);
    
    if (!resultsData) {
      return res.status(404).json({ error: 'Results not found' });
    }
    
    if (resultsData.userId !== userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    
    res.json(resultsData);
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

// Download audience result as CSV
telegramRouter.get('/audience-results/:resultsId/download', async (req, res) => {
  const { resultsId } = req.params;
  const { userId } = req.query || {};
  
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  try {
    const resultsData = readJson(`audience_results_${resultsId}.json`, null);
    
    if (!resultsData) {
      return res.status(404).json({ error: 'Results not found' });
    }
    
    if (resultsData.userId !== userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    
    // Генерируем CSV с разделителем точка с запятой для русской локали Excel
    const users = resultsData.users || [];
    const delimiter = ';';
    
    // Enhanced CSV header with new fields
    const csvHeader = [
      'ID',
      'Username', 
      'Имя',
      'Фамилия',
      'Полное имя',
      'Телефон',
      'Био',
      'Источник канал'
    ].join(delimiter) + '\n';
    
    const csvRows = users.map(u => {
      const id = (u.id || '').replace(/"/g, '""');
      const username = (u.username || '').replace(/"/g, '""');
      const firstName = (u.firstName || '').replace(/"/g, '""');
      const lastName = (u.lastName || '').replace(/"/g, '""');
      const fullName = (u.fullName || `${firstName} ${lastName}`.trim()).replace(/"/g, '""');
      const phone = (u.phone || '').replace(/"/g, '""');
      const bio = (u.bio || '').replace(/"/g, '""');
      const sourceChannel = u.sourceChannel 
        ? `${u.sourceChannel.title}${u.sourceChannel.username ? ` (@${u.sourceChannel.username})` : ''}`
        : ''.replace(/"/g, '""');
      
      return [
        id,
        username,
        firstName,
        lastName,
        fullName,
        phone,
        bio,
        sourceChannel
      ].join(delimiter);
    }).join('\n');
    
    const csv = '\ufeff' + csvHeader + csvRows;
    
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="audience_${resultsId}.csv"`);
    res.send(csv);
  } catch (e) {
    logger.error('download audience-results failed', { error: String(e?.message || e) });
    res.status(500).json({ error: String(e?.message || e) });
  }
});

// Download all audience results as ZIP
telegramRouter.get('/audience-results/download-all', async (req, res) => {
  const { userId } = req.query || {};
  
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  try {
    const fs = await import('fs');
    const path = await import('path');
    const { fileURLToPath } = await import('url');
    const archiver = await import('archiver');
    
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const dataDir = path.resolve(__dirname, '..', 'data');
    
    if (!fs.existsSync(dataDir)) {
      return res.status(404).json({ error: 'No results found' });
    }
    
    const files = fs.readdirSync(dataDir);
    const resultsFiles = files.filter(f => f.startsWith('audience_results_') && f.endsWith('.json'));
    
    if (resultsFiles.length === 0) {
      return res.status(404).json({ error: 'No results found' });
    }
    
    // Создаем ZIP архив
    const archive = archiver.default('zip', { zlib: { level: 9 } });
    
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="all_audience_results_${Date.now()}.zip"`);
    
    archive.pipe(res);
    
    // Добавляем каждый файл результатов в архив как CSV
    for (const file of resultsFiles) {
      try {
        const resultsData = readJson(file, null);
        if (resultsData && resultsData.userId === userId) {
          const users = resultsData.users || [];
          const delimiter = ';';
          
          // Enhanced CSV header with new fields
          const csvHeader = [
            'ID',
            'Username', 
            'Имя',
            'Фамилия',
            'Полное имя',
            'Телефон',
            'Био',
            'Источник канал'
          ].join(delimiter) + '\n';
          
          const csvRows = users.map(u => {
            const id = (u.id || '').replace(/"/g, '""');
            const username = (u.username || '').replace(/"/g, '""');
            const firstName = (u.firstName || '').replace(/"/g, '""');
            const lastName = (u.lastName || '').replace(/"/g, '""');
            const fullName = (u.fullName || `${firstName} ${lastName}`.trim()).replace(/"/g, '""');
            const phone = (u.phone || '').replace(/"/g, '""');
            const bio = (u.bio || '').replace(/"/g, '""');
            const sourceChannel = u.sourceChannel 
              ? `${u.sourceChannel.title}${u.sourceChannel.username ? ` (@${u.sourceChannel.username})` : ''}`
              : ''.replace(/"/g, '""');
            
            return [
              id,
              username,
              firstName,
              lastName,
              fullName,
              phone,
              bio,
              sourceChannel
            ].join(delimiter);
          }).join('\n');
          
          const csv = '\ufeff' + csvHeader + csvRows;
          
          // Формируем имя файла
          const timestamp = new Date(resultsData.timestamp);
          const dateStr = timestamp.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
          const timeStr = timestamp.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
          
          const baseName = `Активная аудитория ${dateStr} ${timeStr}`;
          
          // Очищаем имя файла от недопустимых символов
          const sanitizedFilename = baseName
            .replace(/[<>:"/\\|?*]/g, '_')
            .replace(/\s+/g, ' ')
            .trim();
          
          const filename = `${sanitizedFilename}.csv`;
          
          archive.append(csv, { name: filename });
        }
      } catch (e) {
        logger.warn('Error processing file for download-all', { file, error: String(e?.message || e) });
      }
    }
    
    await archive.finalize();
  } catch (e) {
    logger.error('download-all audience-results failed', { error: String(e?.message || e) });
    res.status(500).json({ error: String(e?.message || e) });
  }
});

// Background parsing job
telegramRouter.post('/parse', (req, res) => {
  const {
    chatId,
    peer,
    lastDays = 30,
    userId,
    criteria = {},
    minActivity = 0,
    sessionId,
    participantsLimit,
    bioKeywords
  } = req.body || {};

  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  // Determine if this is a session-based parsing or single channel parsing
  const isSessionBased = sessionId && typeof sessionId === 'string';

  // For single channel parsing (legacy), require chatId or peer
  if (!isSessionBased) {
    const chat = peer || chatId;
    if (!chat) return res.status(400).json({ error: 'chatId or peer required' });
  }

  const task = taskManager.enqueue('parse_audience', {
    chat: peer || chatId,
    lastDays: Number(lastDays),
    userId,
    criteria,
    minActivity: Number(minActivity) || 0,
    sessionId,
    participantsLimit: participantsLimit ? Number(participantsLimit) : null,
    bioKeywords: bioKeywords && Array.isArray(bioKeywords) ? bioKeywords.filter(k => k && typeof k === 'string') : null
  });
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

/**
 * Enriches user data with full profile information from Telegram
 * @param {Object} tg - Telegram client instance
 * @param {Array} users - Array of user objects to enrich
 * @param {Map} userCache - Cache for already fetched user profiles
 * @returns {Promise<Array>} - Array of enriched user objects
 */
async function enrichUsersWithFullProfile(tg, users, userCache = new Map()) {
  const enrichedUsers = [];
  
  for (const user of users) {
    try {
      const userId = user.id?.value || user.id;
      const userIdString = typeof userId === 'bigint' ? String(userId) : String(userId);
      
      // Check cache first
      if (userCache.has(userIdString)) {
        enrichedUsers.push({ ...user, ...userCache.get(userIdString) });
        continue;
      }
      
      // Fetch full user profile
      const fullUser = await tg.invoke(new Api.users.GetFullUser({
        id: user
      }));
      
      const enrichedUser = {
        ...user,
        phone: fullUser.users[0]?.phone || null,
        bio: fullUser.fullUser?.about || null,
        fullName: `${user.firstName || ''} ${user.lastName || ''}`.trim()
      };
      
      // Cache the enriched data
      userCache.set(userIdString, {
        phone: enrichedUser.phone,
        bio: enrichedUser.bio,
        fullName: enrichedUser.fullName
      });
      
      enrichedUsers.push(enrichedUser);
      
      // Rate limiting
      await sleep(100);
    } catch (e) {
      logger.warn('Failed to enrich user profile', { 
        userId: user.id,
        error: String(e?.message || e) 
      });
      // Return original user data if enrichment fails
      enrichedUsers.push({
        ...user,
        phone: null,
        bio: null,
        fullName: `${user.firstName || ''} ${user.lastName || ''}`.trim()
      });
    }
  }
  
  return enrichedUsers;
}

/**
 * Filters users by bio keywords (case-insensitive)
 * @param {Array} users - Array of user objects with bio field
 * @param {Array} keywords - Keywords to filter by
 * @returns {Array} - Filtered array of users
 */
function filterUsersByBioKeywords(users, keywords) {
  if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
    return users;
  }
  
  return users.filter(user => {
    const bio = user.bio || '';
    const bioLower = bio.toLowerCase();
    
    return keywords.some(keyword => {
      const keywordLower = String(keyword).toLowerCase().trim();
      return keywordLower && bioLower.includes(keywordLower);
    });
  });
}

/**
 * Deduplicates users by ID, keeping the first occurrence with source channel info
 * @param {Array} users - Array of user objects
 * @returns {Array} - Deduplicated array of users
 */
function deduplicateUsers(users) {
  const seen = new Set();
  const deduplicated = [];
  
  for (const user of users) {
    const userId = String(user.id?.value || user.id);
    if (!seen.has(userId)) {
      seen.add(userId);
      deduplicated.push(user);
    }
  }
  
  return deduplicated;
}

// Register workers
taskManager.attachWorker('parse_audience', async (task, manager) => {
  const { 
    chat, 
    lastDays, 
    criteria = {}, 
    minActivity = 0, 
    userId, 
    sessionId, 
    participantsLimit, 
    bioKeywords 
  } = task.payload;
  
  // Import Api here to avoid top-level import issues
  const { Api } = await import('telegram/tl/index.js');
  
  try {
    let allUsers = [];
    let channelsProcessed = 0;
    let totalChannels = 0;
    const userCache = new Map();
    
    if (sessionId) {
      // Session-based parsing - process all channels from parsing results
      manager.setStatus(task.id, 'running', { 
        progress: 5, 
        message: 'Loading parsing session...' 
      });
      
      const sessionData = readJson(`parsing_results_${sessionId}.json`, null);
      if (!sessionData || sessionData.userId !== userId) {
        throw new Error('Parsing session not found or access denied');
      }
      
      const channels = sessionData.channels || [];
      totalChannels = channels.length;
      
      if (totalChannels === 0) {
        throw new Error('No channels found in parsing session');
      }
      
      // Get Telegram client once for the entire session
      const { getClient } = await import('../services/telegramClient.js');
      const tg = await getClient();
      
      for (let i = 0; i < channels.length; i++) {
        const channel = channels[i];
        channelsProcessed = i + 1;
        
        // Check if we've reached the participant limit
        if (participantsLimit && allUsers.length >= participantsLimit) {
          logger.info('Reached participant limit, stopping', { 
            current: allUsers.length, 
            limit: participantsLimit 
          });
          break;
        }
        
        const progress = Math.round(10 + (channelsProcessed / totalChannels) * 60);
        manager.setStatus(task.id, 'running', { 
          progress,
          current: allUsers.length,
          total: participantsLimit || channels.length * 100, // Estimate
          message: `Processing channel ${channelsProcessed}/${totalChannels}: ${channel.title}` 
        });
        
        try {
          // Use peer data if available, otherwise fallback to username/id
          const chatTarget = channel.peer || channel.username || channel.id;
          
          logger.info('Processing channel', { 
            channelId: channel.id,
            title: channel.title,
            hasPeer: !!channel.peer,
            target: chatTarget
          });
          
          const { all: channelUsers, active: channelActive } = await getParticipantsWithActivity(
            chatTarget, 
            lastDays, 
            200, 
            800, 
            criteria, 
            minActivity
          );
          
          // Add source channel metadata to each user
          const usersWithSource = channelActive.map(user => ({
            ...user,
            sourceChannel: {
              id: channel.id,
              title: channel.title,
              username: channel.username || null
            }
          }));
          
          allUsers.push(...usersWithSource);
          
          logger.info('Channel processed', { 
            channelId: channel.id,
            activeUsers: channelActive.length,
            totalUsers: allUsers.length 
          });
          
        } catch (channelError) {
          logger.warn('Failed to process channel', { 
            channelId: channel.id,
            title: channel.title,
            error: String(channelError?.message || channelError) 
          });
          // Continue with next channel
          continue;
        }
        
        // Small delay between channels
        await sleep(200);
      }
      
    } else {
      // Single channel parsing (legacy)
      manager.setStatus(task.id, 'running', { 
        progress: 10, 
        message: 'Processing channel...' 
      });
      
      const { all: channelUsers, active: channelActive } = await getParticipantsWithActivity(
        chat, 
        lastDays, 
        200, 
        800, 
        criteria, 
        minActivity
      );
      
      // Add source channel metadata
      const usersWithSource = channelActive.map(user => ({
        ...user,
        sourceChannel: {
          id: typeof chat === 'object' ? chat.id : chat,
          title: 'Single Channel',
          username: null
        }
      }));
      
      allUsers = usersWithSource;
    }
    
    manager.setStatus(task.id, 'running', { 
      progress: 70, 
      current: allUsers.length,
      total: participantsLimit || allUsers.length,
      message: 'Deduplicating users...' 
    });
    
    // Deduplicate users
    const deduplicatedUsers = deduplicateUsers(allUsers);
    
    // Apply participant limit if specified
    const limitedUsers = participantsLimit 
      ? deduplicatedUsers.slice(0, participantsLimit) 
      : deduplicatedUsers;
    
    manager.setStatus(task.id, 'running', { 
      progress: 75, 
      current: limitedUsers.length,
      total: participantsLimit || limitedUsers.length,
      message: 'Enriching user profiles...' 
    });
    
    // Enrich with full profile data
    const { getClient } = await import('../services/telegramClient.js');
    const tg = await getClient();
    const enrichedUsers = await enrichUsersWithFullProfile(tg, limitedUsers, userCache);
    
    manager.setStatus(task.id, 'running', { 
      progress: 85, 
      current: enrichedUsers.length,
      total: participantsLimit || enrichedUsers.length,
      message: 'Applying bio filters...' 
    });
    
    // Apply bio keyword filtering if specified
    const filteredUsers = bioKeywords && bioKeywords.length > 0
      ? filterUsersByBioKeywords(enrichedUsers, bioKeywords)
      : enrichedUsers;
    
    manager.setStatus(task.id, 'running', { 
      progress: 90, 
      current: filteredUsers.length,
      total: participantsLimit || filteredUsers.length,
      message: 'Saving results...' 
    });
    
    // Save results with enhanced schema
    const resultsId = `audience_${Date.now()}_${userId}`;
    const chatIdForStorage = sessionId || (typeof chat === 'object' ? chat.id : chat);
    
    const resultsData = {
      id: resultsId,
      userId: userId,
      sessionId: sessionId || null,
      chatId: chatIdForStorage,
      lastDays: lastDays,
      criteria: criteria,
      minActivity: minActivity,
      participantsLimit: participantsLimit,
      bioKeywords: bioKeywords,
      channelsProcessed: channelsProcessed,
      totalChannels: totalChannels,
      users: filteredUsers.map((u) => {
        const userId = u.id?.value || u.id;
        const userIdString = typeof userId === 'bigint' ? String(userId) : String(userId);
        return { 
          id: userIdString, 
          username: u.username || null, 
          firstName: u.firstName || null, 
          lastName: u.lastName || null,
          fullName: u.fullName || `${u.firstName || ''} ${u.lastName || ''}`.trim(),
          phone: u.phone || null,
          bio: u.bio || null,
          sourceChannel: u.sourceChannel || null
        };
      }),
      timestamp: new Date().toISOString(),
      count: filteredUsers.length,
      totalFound: limitedUsers.length,
      version: '2.0' // New version for enhanced schema
    };
    
    writeJson(`audience_results_${resultsId}.json`, resultsData);
    
    manager.setProgress(task.id, 100, { 
      current: filteredUsers.length, 
      total: participantsLimit || filteredUsers.length, 
      message: 'Done' 
    });
    
    return { 
      chatId: chatIdForStorage, 
      totalFound: limitedUsers.length,
      active: filteredUsers.length, 
      resultsId,
      sessionId: sessionId || null,
      channelsProcessed: channelsProcessed,
      totalChannels: totalChannels
    };
    
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
