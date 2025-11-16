import { Router } from 'express';
import { taskManager } from '../lib/taskManager.js';
import { searchDialogs, searchChannels, sendMessage, sendMediaMessage, getParticipantsWithActivity, sendCode, signIn, getAuthStatus, clearSession, peerToInputPeer, extractUserPeerMetadata, resolvePeerFromUser, resolvePeerFromUsername } from '../services/telegramClient.js';
import { writeJson, readJson } from '../lib/storage.js';
import { generateBroadcastHistoryId, listBroadcastHistory, getBroadcastHistoryById, saveBroadcastHistory, computeBroadcastStatus, buildMessagePreview, deriveAudienceName } from '../lib/broadcastHistory.js';
import { logger, sleep } from '../lib/logger.js';

export const telegramRouter = Router();

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

function formatTimestampForFilename(timestamp) {
  const date = timestamp ? new Date(timestamp) : new Date();
  if (Number.isNaN(date.getTime())) {
    return `unknown_${Date.now()}`;
  }
  return date.toISOString().replace(/[:]/g, '-');
}

function escapeCsvValue(value) {
  if (value === null || value === undefined) {
    return '';
  }
  const stringValue = String(value);
  if (stringValue.includes('"') || stringValue.includes(',') || stringValue.includes('\n') || stringValue.includes('\r')) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

// Authentication endpoints
telegramRouter.post('/auth/send-code', async (req, res) => {
  const startTime = Date.now();
  logger.info('[PERF] POST /auth/send-code received');
  
  const { phoneNumber } = req.body || {};
  if (!phoneNumber) {
    return res.status(400).json({ error: 'phoneNumber required' });
  }
  try {
    const result = await sendCode(phoneNumber);
    logger.info('[PERF] POST /auth/send-code completed', { elapsed: Date.now() - startTime + 'ms' });
    res.json(result);
  } catch (e) {
    const errorMessage = String(e?.message || e);
    logger.error('send-code failed', { error: errorMessage, elapsed: Date.now() - startTime + 'ms' });
    res.status(500).json({ error: errorMessage });
  }
});

telegramRouter.post('/auth/sign-in', async (req, res) => {
  const startTime = Date.now();
  logger.info('[PERF] POST /auth/sign-in received');
  
  const { phoneCode, password } = req.body || {};
  if (!phoneCode) {
    return res.status(400).json({ error: 'phoneCode required' });
  }
  try {
    const result = await signIn(phoneCode, password);
    logger.info('[PERF] POST /auth/sign-in completed', { elapsed: Date.now() - startTime + 'ms' });
    res.json(result);
  } catch (e) {
    const errorMessage = String(e?.message || e);
    logger.error('sign-in failed', { error: errorMessage, elapsed: Date.now() - startTime + 'ms' });
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
            'Название канала',
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

// Download parsing results as CSV (должен быть ПЕРЕД общим параметризованным маршрутом)
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

     // Генерируем CSV с разделителем точка с запятой для русской локали Excel
    const delimiter = ';'; // Точка с запятой для русской локали Excel
    
    // Enhanced CSV header with additional columns
    const csvHeader = [
      'Название канала',
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
    res.send('\ufeff' + csv); // BOM для правильного отображения кириллицы в Excel
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
          // Приоритет отдаем Megagroup и Discussion Group, но показываем все
          const channelsWithMetadata = normalizedData.channels.map(ch => ({
            ...ch,
            // Добавляем информацию о результате парсинга
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

// Get saved parsing results by ID (должен быть ПОСЛЕ более специфичных маршрутов)
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
  const { 
    audienceId, 
    mode, 
    manualRecipients = [], 
    message, 
    imageBase64, 
    maxRecipients, 
    delaySeconds = 2,
    userId 
  } = req.body || {};
  
  // Validate authorization
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  // Validate message
  if (!message || !message.trim()) {
    return res.status(400).json({ error: 'message required' });
  }
  
  // Validate mode
  if (!mode || (mode !== 'dm' && mode !== 'chat')) {
    return res.status(400).json({ error: 'mode must be "dm" or "chat"' });
  }
  
  // Validate at least one recipient source
  if (!audienceId && (!manualRecipients || manualRecipients.length === 0)) {
    return res.status(400).json({ error: 'At least one recipient source required (audienceId or manualRecipients)' });
  }
  
  // Validate delay (must be >= 1s)
  const delay = Number(delaySeconds) || 2;
  if (delay < 1) {
    return res.status(400).json({ error: 'delaySeconds must be at least 1 second' });
  }
  
  // Warn if delay is less than 2 seconds (rate limit risk)
  if (delay < 2) {
    logger.warn('Broadcast delay is less than 2 seconds - rate limit risk', { 
      delaySeconds: delay,
      userId 
    });
  }
  
  const historyId = generateBroadcastHistoryId(userId);
  const historyCreatedAt = new Date().toISOString();
  
  const task = taskManager.enqueue('broadcast', {
    audienceId,
    mode,
    manualRecipients: Array.isArray(manualRecipients) ? manualRecipients : [],
    message,
    imageBase64,
    maxRecipients: maxRecipients ? Number(maxRecipients) : null,
    delaySeconds: delay,
    userId,
    historyId,
    historyCreatedAt
  });
  
  res.json({ taskId: task.id, historyId });
});

telegramRouter.get('/broadcast-history', (req, res) => {
  const { userId, status, dateFrom, dateTo, audienceId } = req.query || {};

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const filters = {};
    if (status) filters.status = status;
    if (dateFrom) filters.dateFrom = dateFrom;
    if (dateTo) filters.dateTo = dateTo;
    if (audienceId) filters.audienceId = audienceId;

    const results = listBroadcastHistory(String(userId), filters);
    res.json({ results });
  } catch (e) {
    logger.error('get broadcast-history failed', { error: String(e?.message || e) });
    res.status(500).json({ error: String(e?.message || e) });
  }
});

telegramRouter.get('/broadcast-history/:id/download', (req, res) => {
  const { userId } = req.query || {};
  const { id } = req.params;

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const history = getBroadcastHistoryById(id);
    if (!history || String(history.userId) !== String(userId)) {
      return res.status(404).json({ error: 'Broadcast history not found' });
    }

    const header = ['Recipient', 'Type', 'Status', 'Sent At', 'Error'];
    const rows = [header.map((value) => escapeCsvValue(value)).join(',')];

    const deliveryLog = Array.isArray(history.deliveryLog) ? history.deliveryLog : [];
    const defaultType = history.mode === 'chat' ? 'chat' : 'user';

    for (const entry of deliveryLog) {
      const recipient = entry.recipient || {};
      const username = recipient.username ? `@${recipient.username}` : '';
      const name = recipient.name || username || recipient.id || '';
      const row = [
        name,
        recipient.type || defaultType,
        entry.status || 'unknown',
        entry.timestamp || '',
        entry.error || ''
      ];
      rows.push(row.map((value) => escapeCsvValue(value)).join(','));
    }

    const csvContent = rows.join('\n');
    const filenameTimestamp = formatTimestampForFilename(history.createdAt || history.timestamp);
    const filename = `broadcast_${filenameTimestamp}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    res.send(`\uFEFF${csvContent}`);
  } catch (e) {
    logger.error('download broadcast-history failed', { error: String(e?.message || e) });
    res.status(500).json({ error: String(e?.message || e) });
  }
});

telegramRouter.get('/broadcast-history/:id', (req, res) => {
  const { userId } = req.query || {};
  const { id } = req.params;

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const history = getBroadcastHistoryById(id);
    if (!history || String(history.userId) !== String(userId)) {
      return res.status(404).json({ error: 'Broadcast history not found' });
    }

    res.json(history);
  } catch (e) {
    logger.error('get broadcast-history detail failed', { error: String(e?.message || e) });
    res.status(500).json({ error: String(e?.message || e) });
  }
});

// Get broadcast history list
telegramRouter.get('/broadcast-history', async (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  
  try {
    const { default: fs } = await import('fs');
    const { getDataPath } = await import('../lib/storage.js');
    const dataPath = getDataPath();
    
    const files = fs.readdirSync(dataPath);
    const historyFiles = files
      .filter(file => file.startsWith(`broadcast_history_`) && file.includes(`_${userId}.json`))
      .map(file => {
        const data = readJson(file, {});
        return { filename: file, data };
      })
      .filter(({ data }) => data.id) // Filter out empty/invalid files
      .sort((a, b) => (b.data.createdAt || 0) - (a.data.createdAt || 0));
    
    const summaries = historyFiles.map(({ data }) => ({
      id: data.id,
      message: data.message,
      createdAt: data.createdAt,
      status: data.status,
      audienceName: data.audienceName,
      mode: data.mode,
      successCount: data.successCount || 0,
      failedCount: data.failedCount || 0,
      totalCount: data.totalCount || 0
    }));
    
    res.json({ history: summaries });
  } catch (err) {
    logger.error('Failed to fetch broadcast history', { error: String(err?.message || err) });
    res.status(500).json({ error: 'Failed to fetch broadcast history' });
  }
});

// Get detailed broadcast history entry
telegramRouter.get('/broadcast-history/:id', async (req, res) => {
  const { id } = req.params;
  const { userId } = req.query;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  
  try {
    const filename = `broadcast_history_${id}_${userId}.json`;
    const data = await readJson(filename);
    res.json(data);
  } catch (err) {
    logger.error('Failed to fetch broadcast history detail', { id, error: String(err?.message || err) });
    res.status(404).json({ error: 'Broadcast history not found' });
  }
});

// Download broadcast history as CSV
telegramRouter.get('/broadcast-history/:id/download', async (req, res) => {
  const { id } = req.params;
  const { userId } = req.query;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  
  try {
    const filename = `broadcast_history_${id}_${userId}.json`;
    const data = await readJson(filename);
    
    // Build CSV
    const headers = ['Recipient ID', 'Username', 'Full Name', 'Status', 'Error'];
    const rows = (data.recipients || []).map(r => [
      r.id || '',
      r.username || '',
      r.fullName || '',
      r.status || 'unknown',
      r.error || ''
    ]);
    
    const csv = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n');
    
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="broadcast_${id}_${Date.now()}.csv"`);
    res.send('\uFEFF' + csv);
  } catch (err) {
    logger.error('Failed to download broadcast history', { id, error: String(err?.message || err) });
    res.status(404).json({ error: 'Broadcast history not found' });
  }
});

/**
 * Enriches user data with full profile information from Telegram
 * @param {Object} tg - Telegram client instance
 * @param {Array} users - Array of user objects to enrich
 * @param {Map} userCache - Cache for already fetched user profiles
 * @param {Function} progressCallback - Optional callback to report progress (currentIndex, total)
 * @returns {Promise<Array>} - Array of enriched user objects
 */
async function enrichUsersWithFullProfile(tg, users, userCache = new Map(), progressCallback = null) {
  const enrichedUsers = [];
  const total = users.length;
  
  for (let i = 0; i < users.length; i++) {
    const user = users[i];
    
    try {
      const userId = user.id?.value || user.id;
      const userIdString = typeof userId === 'bigint' ? String(userId) : String(userId);
      
      // Check cache first
      if (userCache.has(userIdString)) {
        enrichedUsers.push({ ...user, ...userCache.get(userIdString) });
        
        // Report progress
        if (progressCallback) {
          progressCallback(i + 1, total);
        }
        continue;
      }
      
      // Fetch full user profile
      const fullUser = await tg.invoke(new Api.users.GetFullUser({
        id: user
      }));
      
      // Extract peer metadata from the user object
      const userPeerMetadata = extractUserPeerMetadata(fullUser.users[0]);
      
      // Log if access hash is missing for later broadcast logic
      if (userPeerMetadata && !userPeerMetadata.accessHash) {
        logger.warn('User access hash missing, broadcast will need runtime lookup', {
          userId: userPeerMetadata.id,
          username: fullUser.users[0]?.username
        });
      }
      
      const enrichedUser = {
        ...user,
        phone: fullUser.users[0]?.phone || null,
        bio: fullUser.fullUser?.about || null,
        fullName: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
        peer: userPeerMetadata
      };
      
      // Cache enriched data (including peer metadata)
      userCache.set(userIdString, {
        phone: enrichedUser.phone,
        bio: enrichedUser.bio,
        fullName: enrichedUser.fullName,
        peer: enrichedUser.peer
      });
      
      enrichedUsers.push(enrichedUser);
      
      // Report progress
      if (progressCallback) {
        progressCallback(i + 1, total);
      }
      
      // Rate limiting
      await sleep(100);
    } catch (e) {
      logger.warn('Failed to enrich user profile', { 
        userId: user.id,
        error: String(e?.message || e) 
      });
      
      // Try to extract peer metadata from original user object as fallback
      const fallbackPeerMetadata = extractUserPeerMetadata(user);
      
      // Return original user data if enrichment fails, but preserve peer metadata if available
      enrichedUsers.push({
        ...user,
        phone: null,
        bio: null,
        fullName: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
        peer: fallbackPeerMetadata
      });
      
      // Report progress even on error
      if (progressCallback) {
        progressCallback(i + 1, total);
      }
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

/**
 * Filters out closed/private profiles (users without username)
 * @param {Array} users - Array of user objects
 * @returns {Array} - Filtered array of users with usernames
 */
function filterClosedProfiles(users) {
  return users.filter(user => {
    const username = user.username;
    return username && typeof username === 'string' && username.trim() !== '';
  });
}

/**
 * Filters out bots (username ending with "bot" or bot flag)
 * @param {Array} users - Array of user objects
 * @returns {Array} - Filtered array of non-bot users
 */
function filterBots(users) {
  return users.filter(user => {
    // Check bot flag if available
    if (user.bot === true) {
      return false;
    }
    
    // Check username ending with "bot"
    const username = user.username;
    if (username && typeof username === 'string') {
      const usernameLower = username.toLowerCase().trim();
      if (usernameLower.endsWith('bot')) {
        return false;
      }
    }
    
    return true;
  });
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
  
  logger.info('[PROGRESS] parse_audience worker started', {
    taskId: task.id,
    userId,
    sessionId,
    participantsLimit,
    bioKeywords
  });
  
  // Import Api here to avoid top-level import issues
  const { Api } = await import('telegram/tl/index.js');
  
  try {
    let allUsers = [];
    let channelsProcessed = 0;
    let totalChannels = 0;
    const userCache = new Map();
    
    // Initial progress update
    manager.setStatus(task.id, 'running', { 
      progress: 0, 
      current: 0,
      limit: participantsLimit || 100,
      message: 'Starting audience search...' 
    });
    
    logger.info('[PROGRESS] Initial status set', {
      taskId: task.id,
      progress: 0
    });
    
    if (sessionId) {
      // Session-based parsing - process all channels from parsing results
      manager.setStatus(task.id, 'running', { 
        progress: 5,
        current: 0,
        limit: participantsLimit || 100,
        message: 'Loading parsing session...' 
      });
      
      logger.info('[PROGRESS] Loading session', {
        taskId: task.id,
        sessionId
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
          
          // Update progress after channel processing
          const progressAfter = Math.round(10 + (channelsProcessed / totalChannels) * 60);
          manager.setStatus(task.id, 'running', { 
            progress: progressAfter,
            current: allUsers.length,
            limit: participantsLimit || channels.length * 100,
            message: `Processed ${channelsProcessed}/${totalChannels} channels, found ${allUsers.length} users` 
          });
          
          logger.info('[PROGRESS] After channel', {
            channelsProcessed,
            totalChannels,
            usersFound: allUsers.length,
            progress: progressAfter
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
    
    // Progress callback for enrichment
    const enrichmentProgressCallback = (current, total) => {
      const enrichmentProgress = 75 + Math.round((current / total) * 5); // 75-80%
      manager.setStatus(task.id, 'running', { 
        progress: enrichmentProgress,
        current: current,
        limit: total,
        message: `Enriching profiles... ${current}/${total}` 
      });
      logger.info('[PROGRESS] Enrichment', { 
        progress: enrichmentProgress,
        current,
        total,
        percentage: Math.round((current / total) * 100)
      });
    };
    
    const enrichedUsers = await enrichUsersWithFullProfile(tg, limitedUsers, userCache, enrichmentProgressCallback);
    
    manager.setStatus(task.id, 'running', { 
      progress: 80, 
      current: enrichedUsers.length,
      total: participantsLimit || enrichedUsers.length,
      message: 'Filtering closed profiles...' 
    });
    
    // Filter out closed profiles (users without username)
    const withUsernameUsers = filterClosedProfiles(enrichedUsers);
    
    logger.info('Filtered closed profiles', { 
      before: enrichedUsers.length, 
      after: withUsernameUsers.length,
      filtered: enrichedUsers.length - withUsernameUsers.length
    });
    
    manager.setStatus(task.id, 'running', { 
      progress: 82, 
      current: withUsernameUsers.length,
      total: participantsLimit || withUsernameUsers.length,
      message: 'Filtering bots...' 
    });
    
    // Filter out bots
    const nonBotUsers = filterBots(withUsernameUsers);
    
    logger.info('Filtered bots', { 
      before: withUsernameUsers.length, 
      after: nonBotUsers.length,
      filtered: withUsernameUsers.length - nonBotUsers.length
    });
    
    manager.setStatus(task.id, 'running', { 
      progress: 85, 
      current: nonBotUsers.length,
      total: participantsLimit || nonBotUsers.length,
      message: 'Applying bio filters...' 
    });
    
    // Apply bio keyword filtering if specified
    const filteredUsers = bioKeywords && bioKeywords.length > 0
      ? filterUsersByBioKeywords(nonBotUsers, bioKeywords)
      : nonBotUsers;
    
    logger.info('Applied bio keyword filtering', { 
      before: nonBotUsers.length, 
      after: filteredUsers.length,
      bioKeywords: bioKeywords || []
    });
    
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
        
        // Extract peer metadata from the user object
        let peerMetadata = null;
        if (u.peer) {
          // Peer metadata already exists from enrichment
          peerMetadata = u.peer;
        } else {
          // Try to extract peer metadata from original user data
          peerMetadata = extractUserPeerMetadata(u);
          
          // Log if access hash is missing for later broadcast logic
          if (peerMetadata && !peerMetadata.accessHash) {
            logger.warn('User access hash missing during save, broadcast will need runtime lookup', {
              userId: peerMetadata.id,
              username: u.username
            });
          }
        }
        
        return { 
          id: userIdString, 
          username: u.username || null, 
          firstName: u.firstName || null, 
          lastName: u.lastName || null,
          fullName: u.fullName || `${u.firstName || ''} ${u.lastName || ''}`.trim(),
          phone: u.phone || null,
          bio: u.bio || null,
          sourceChannel: u.sourceChannel || null,
          peer: peerMetadata // Add peer metadata for broadcast functionality
        };
      }),
      timestamp: new Date().toISOString(),
      count: filteredUsers.length,
      totalFound: limitedUsers.length,
      version: '3.0' // New version for peer metadata schema
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
  const { 
    audienceId, 
    mode, 
    manualRecipients = [], 
    message, 
    imageBase64, 
    maxRecipients, 
    delaySeconds = 2,
    userId,
    historyId: providedHistoryId,
    historyCreatedAt
  } = task.payload;
  
  logger.info('[BROADCAST] Starting broadcast worker', {
    taskId: task.id,
    audienceId,
    mode,
    manualRecipientsCount: manualRecipients.length,
    hasImage: !!imageBase64,
    maxRecipients,
    delaySeconds,
    userId,
    historyId: providedHistoryId
  });
  
  // Get Telegram client
  const { getClient } = await import('../services/telegramClient.js');
  const tg = await getClient();
  
  // Decode image buffer if provided
  let imageBuffer = null;
  if (imageBase64) {
    try {
      imageBuffer = Buffer.from(imageBase64, 'base64');
      logger.info('[BROADCAST] Image decoded', { size: imageBuffer.length });
    } catch (e) {
      logger.warn('[BROADCAST] Failed to decode image', { 
        error: String(e?.message || e) 
      });
    }
  }
  
  // Load audience if audienceId provided
  let audienceUsers = [];
  let audienceName = null;
  if (audienceId) {
    try {
      // Find the audience results file
      const fs = await import('fs');
      const path = await import('path');
      const { fileURLToPath } = await import('url');
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.dirname(__filename);
      const dataDir = path.resolve(__dirname, '..', 'data');
      
      const files = fs.readdirSync(dataDir);
      const audienceFile = files.find(f => 
        f.startsWith('audience_results_') && 
        f.includes(audienceId) && 
        f.endsWith('.json')
      );
      
      if (!audienceFile) {
        throw new Error(`Audience file not found for ID: ${audienceId}`);
      }
      
      const audienceData = readJson(audienceFile, null);
      if (!audienceData || !audienceData.users) {
        throw new Error(`Invalid audience data for ID: ${audienceId}`);
      }
      
      audienceUsers = audienceData.users || [];
      audienceName = deriveAudienceName(audienceData) || audienceId || null;
      logger.info('[BROADCAST] Loaded audience', { 
        audienceId,
        usersCount: audienceUsers.length 
      });
    } catch (e) {
      logger.error('[BROADCAST] Failed to load audience', { 
        audienceId,
        error: String(e?.message || e) 
      });
      throw e;
    }
  } else {
    audienceName = 'Manual recipients';
  }
  
  // Build recipients array
  let recipients = [];
  
  if (mode === 'dm') {
    // DM mode: use audience users and manual recipients (individual users)
    recipients = [...audienceUsers];
    
    // Add manual recipients
    for (const manualRecipient of manualRecipients) {
      if (typeof manualRecipient === 'string') {
        // String: username or user ID
        recipients.push({
          id: manualRecipient,
          username: manualRecipient.startsWith('@') ? manualRecipient.slice(1) : manualRecipient,
          firstName: '',
          lastName: '',
          fullName: manualRecipient
        });
      } else if (typeof manualRecipient === 'object' && manualRecipient.id) {
        // Object: user object with peer metadata
        recipients.push(manualRecipient);
      }
    }
  } else if (mode === 'chat') {
    // Chat mode: use source channels from audience (deduplicated)
    const channelPeers = new Map();
    
    for (const user of audienceUsers) {
      if (user.sourceChannel && user.sourceChannel.peer) {
        const channelId = user.sourceChannel.peer.id;
        if (!channelPeers.has(channelId)) {
          channelPeers.set(channelId, {
            id: channelId,
            title: user.sourceChannel.title || 'Unknown',
            username: user.sourceChannel.username,
            peer: user.sourceChannel.peer
          });
        }
      }
    }
    
    recipients = Array.from(channelPeers.values());
    
    // Add manual recipients (should be channel identifiers)
    for (const manualRecipient of manualRecipients) {
      if (typeof manualRecipient === 'string') {
        // String: channel username or ID
        recipients.push({
          id: manualRecipient,
          username: manualRecipient.startsWith('@') ? manualRecipient.slice(1) : manualRecipient,
          title: manualRecipient
        });
      } else if (typeof manualRecipient === 'object' && manualRecipient.id) {
        // Object: channel object with peer metadata
        recipients.push(manualRecipient);
      }
    }
    
    logger.info('[BROADCAST] Chat mode: deduplicated source channels', {
      uniqueChannels: recipients.length
    });
  }
  
  // Apply maxRecipients limit
  if (maxRecipients && maxRecipients > 0 && recipients.length > maxRecipients) {
    recipients = recipients.slice(0, maxRecipients);
    logger.info('[BROADCAST] Applied recipient limit', {
      original: recipients.length,
      limited: maxRecipients
    });
  }
  
  const total = recipients.length;
  let successCount = 0;
  let failedCount = 0;
  const deliveryLog = [];
  
  logger.info('[BROADCAST] Starting message delivery', {
    total,
    mode,
    delaySeconds
  });
  
  manager.setStatus(task.id, 'running', {
    progress: 0,
    current: 0,
    total,
    success: 0,
    failed: 0,
    message: 'Starting broadcast...'
  });
  
  // Send messages sequentially with delay
  for (let i = 0; i < total; i++) {
    const recipient = recipients[i];
    const startTime = Date.now();
    let resolvedPeer = null;
    let deliveryStatus = 'pending';
    let errorMessage = null;
    
    try {
      // Resolve peer based on mode
      if (mode === 'dm') {
        // DM mode: resolve user peer
        resolvedPeer = await resolvePeerFromUser(tg, recipient);
        
        // Substitute {name} tokens in message
        const recipientName = recipient.fullName || 
                             recipient.firstName || 
                             recipient.username || 
                             recipient.id || 
                             'User';
        const personalizedMessage = message.replace(/\{name\}/g, recipientName);
        
        // Send message with optional image
        await sendMediaMessage(resolvedPeer, personalizedMessage, imageBuffer);
        
        logger.info('[BROADCAST] Message sent to user', {
          userId: recipient.id,
          username: recipient.username,
          name: recipientName
        });
      } else {
        // Chat mode: resolve channel peer
        if (recipient.peer) {
          resolvedPeer = peerToInputPeer(recipient.peer);
        } else if (recipient.username) {
          resolvedPeer = await resolvePeerFromUsername(tg, recipient.username);
        } else {
          throw new Error('No peer metadata or username available for channel');
        }
        
        // Send message without name substitution
        await sendMediaMessage(resolvedPeer, message, imageBuffer);
        
        logger.info('[BROADCAST] Message sent to channel', {
          channelId: recipient.id,
          title: recipient.title
        });
      }
      
      successCount++;
      deliveryStatus = 'success';
      
    } catch (e) {
      failedCount++;
      deliveryStatus = 'failed';
      errorMessage = String(e?.message || e);
      
      logger.warn('[BROADCAST] Message delivery failed', {
        recipient: recipient.id || recipient.username,
        mode,
        error: errorMessage
      });
    }
    
    const endTime = Date.now();
    
    // Log delivery attempt
    deliveryLog.push({
      recipient: {
        id: recipient.id,
        username: recipient.username,
        name: mode === 'dm' ? (recipient.fullName || recipient.firstName) : recipient.title
      },
      status: deliveryStatus,
      error: errorMessage,
      timestamp: new Date().toISOString(),
      duration: endTime - startTime
    });
    
    // Update progress
    const progress = Math.floor(((i + 1) / total) * 100);
    manager.setStatus(task.id, 'running', {
      progress,
      current: i + 1,
      total,
      success: successCount,
      failed: failedCount,
      message: `Sent ${i + 1}/${total} messages (${successCount} success, ${failedCount} failed)`
    });
    
    // Rate limiting delay (except for last message)
    if (i < total - 1) {
      await sleep(delaySeconds * 1000);
    }
  }
  
  logger.info('[BROADCAST] Broadcast completed', {
    total,
    success: successCount,
    failed: failedCount
  });
  
  // Persist results to history file
  const normalizedHistoryId = providedHistoryId || generateBroadcastHistoryId(userId || 'unknown');
  const createdAt = historyCreatedAt || new Date().toISOString();
  const completedAt = new Date().toISOString();
  const summary = {
    total,
    success: successCount,
    failed: failedCount,
    successRate: total > 0 ? ((successCount / total) * 100).toFixed(2) + '%' : '0%'
  };
  const status = computeBroadcastStatus(summary);
  const messagePreview = buildMessagePreview(message);
  const historyData = {
    id: normalizedHistoryId,
    taskId: task.id,
    userId,
    audienceId: audienceId || null,
    audienceName: audienceName || (audienceId ? audienceId : 'Manual recipients'),
    mode,
    message,
    messagePreview,
    hasImage: !!imageBuffer,
    delaySeconds,
    maxRecipients,
    createdAt,
    completedAt,
    timestamp: createdAt,
    status,
    summary,
    deliveryLog
  };
  
  try {
    saveBroadcastHistory(historyData);
    logger.info('[BROADCAST] Results saved to history', {
      historyId: normalizedHistoryId,
      file: `broadcast_results_${normalizedHistoryId}.json`
    });
  } catch (e) {
    logger.error('[BROADCAST] Failed to save history', {
      error: String(e?.message || e)
    });
  }
  
  return {
    total,
    success: successCount,
    failed: failedCount,
    historyId: normalizedHistoryId
  };
});


