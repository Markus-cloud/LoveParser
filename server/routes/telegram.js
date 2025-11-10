import { Router } from 'express';
import { taskManager } from '../lib/taskManager.js';
import { searchDialogs, searchChannels, sendMessage, getParticipantsWithActivity, sendCode, signIn, getAuthStatus, clearSession } from '../services/telegramClient.js';
import { writeJson, readJson } from '../lib/storage.js';
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

// Authentication endpoints
telegramRouter.post('/auth/send-code', async (req, res) => {
  const { phoneNumber } = req.body || {};
  if (!phoneNumber) {
    return res.status(400).json({ error: 'phoneNumber required' });
  }
  try {
    const result = await sendCode(phoneNumber);
    res.json(result);
  } catch (e) {
    logger.error('send-code failed', { error: String(e?.message || e) });
    res.status(500).json({ error: String(e?.message || e) });
  }
});

telegramRouter.post('/auth/sign-in', async (req, res) => {
  const { phoneCode, password } = req.body || {};
  if (!phoneCode) {
    return res.status(400).json({ error: 'phoneCode required' });
  }
  try {
    const result = await signIn(phoneCode, password);
    res.json(result);
  } catch (e) {
    logger.error('sign-in failed', { error: String(e?.message || e) });
    res.status(500).json({ error: String(e?.message || e) });
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
  const { query = '', minMembers = 0, maxMembers = Infinity, limit = 100, userId, channelTypes } = req.body || {};
  
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  try {
    const min = Number(minMembers) || 0;
    const max = Number(maxMembers) || Infinity;
    const searchLimit = Math.min(Number(limit) || 100, 200);
    
    // Устанавливаем фильтры по типам каналов (по умолчанию все включены)
    const filters = channelTypes || {
      megagroup: true,
      discussion: true,
      broadcast: true,
      basic: true,
      other: false
    };
    
    const channels = await searchChannels(query, min, max, searchLimit, filters);
    
    // Сохраняем результаты для пользователя с обогащенной структурой
    const resultsId = `parsing_${Date.now()}_${userId}`;
    
    // Extract keywords from query (split by spaces, remove empty strings)
    const keywords = query.trim() ? query.trim().split(/\s+/).filter(k => k.length > 0) : [];
    
    const resultsData = {
      id: resultsId,
      userId: userId,
      query: query,
      keywords: keywords,
      searchFilters: {
        minMembers: min,
        maxMembers: max === Infinity ? null : max,
        limit: searchLimit,
        channelTypes: filters
      },
      channels: channels,
      timestamp: new Date().toISOString(),
      count: channels.length,
      version: '2.0', // Version for backward compatibility
      enriched: true // Flag to indicate enriched data
    };
    
    writeJson(`parsing_results_${resultsId}.json`, resultsData);
    
    res.json({ 
      results: channels,
      resultsId: resultsId,
      count: channels.length
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
                return 'Обсуждения в каналах';
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
                return 'Обсуждения в каналах';
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
          return 'Обсуждения в каналах';
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
          return 'Обсуждения в каналах';
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
          
          const name = `Активная аудитория ${dateStr} ${timeStr}`;
          
          allResults.push({
            id: resultsData.id,
            name: name,
            date: dateStr,
            count: resultsData.count || 0,
            timestamp: resultsData.timestamp,
            chatId: resultsData.chatId
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
    const csvHeader = `ID${delimiter}Username${delimiter}Имя${delimiter}Фамилия\n`;
    const csvRows = users.map(u => {
      const id = (u.id || '').replace(/"/g, '""');
      const username = (u.username || '').replace(/"/g, '""');
      const firstName = (u.firstName || '').replace(/"/g, '""');
      const lastName = (u.lastName || '').replace(/"/g, '""');
      return `${id}${delimiter}${username}${delimiter}${firstName}${delimiter}${lastName}`;
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
          const csvHeader = `ID${delimiter}Username${delimiter}Имя${delimiter}Фамилия\n`;
          const csvRows = users.map(u => {
            const id = (u.id || '').replace(/"/g, '""');
            const username = (u.username || '').replace(/"/g, '""');
            const firstName = (u.firstName || '').replace(/"/g, '""');
            const lastName = (u.lastName || '').replace(/"/g, '""');
            return `${id}${delimiter}${username}${delimiter}${firstName}${delimiter}${lastName}`;
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
  const { chatId, lastDays = 30, userId, criteria = {}, minActivity = 0 } = req.body || {};
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  if (!chatId) return res.status(400).json({ error: 'chatId required' });

  const task = taskManager.enqueue('parse_audience', { 
    chatId, 
    lastDays: Number(lastDays), 
    userId,
    criteria,
    minActivity: Number(minActivity) || 0
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

// Register workers
taskManager.attachWorker('parse_audience', async (task, manager) => {
  const { chatId, lastDays, criteria = {}, minActivity = 0, userId } = task.payload;
  manager.setStatus(task.id, 'running', { progress: 0, message: 'Resolving chat...' });
  try {
    const { all, active } = await getParticipantsWithActivity(chatId, lastDays, 200, 800, criteria, minActivity);
    manager.setStatus(task.id, 'running', { progress: 70, current: active.length, total: all.length, message: 'Saving users...' });
    
    // Сохраняем результаты аудитории
    const resultsId = `audience_${Date.now()}_${userId}`;
    const resultsData = {
      id: resultsId,
      userId: userId,
      chatId: chatId,
      lastDays: lastDays,
      criteria: criteria,
      minActivity: minActivity,
      users: active.map((u) => {
        const userId = u.id?.value || u.id;
        const userIdString = typeof userId === 'bigint' ? String(userId) : String(userId);
        return { 
          id: userIdString, 
          username: u.username || null, 
          firstName: u.firstName || null, 
          lastName: u.lastName || null 
        };
      }),
      timestamp: new Date().toISOString(),
      count: active.length,
      total: all.length
    };
    
    writeJson(`audience_results_${resultsId}.json`, resultsData);
    manager.setProgress(task.id, 100, { current: active.length, total: all.length, message: 'Done' });
    return { chatId, total: all.length, active: active.length, resultsId };
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


