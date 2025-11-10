import dotenv from 'dotenv';
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { Api } from 'telegram/tl/index.js';
import { readJson, writeJson } from '../lib/storage.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger, sleep } from '../lib/logger.js';

dotenv.config();

const SETTINGS_FILE = 'settings.json';
const SESSION_FILE = 'session.json';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadSettings() {
  const fileSettings = readJson(SETTINGS_FILE, {});
  return {
    apiId: Number(process.env.TELEGRAM_API_ID) || fileSettings.apiId,
    apiHash: process.env.TELEGRAM_API_HASH || fileSettings.apiHash,
    // botToken НЕ используется - только user account авторизация через номер телефона
    // botToken оставлен только для совместимости с файлом настроек
    botToken: process.env.TELEGRAM_BOT_TOKEN || fileSettings.botToken,
    session: process.env.TELEGRAM_SESSION || fileSettings.session || readJson(SESSION_FILE, {})?.session,
  };
}

export function saveSettings({ apiId, apiHash, session }) {
  const current = readJson(SETTINGS_FILE, {});
  const merged = {
    ...current,
    ...(apiId !== undefined ? { apiId: Number(apiId) } : {}),
    ...(apiHash !== undefined ? { apiHash } : {}),
    ...(session !== undefined ? { session } : {}),
  };
  writeJson(SETTINGS_FILE, merged);
  if (session) writeJson(SESSION_FILE, { session });
  return merged;
}

let client = null;
let connecting = null;
let authState = null; // Хранит состояние авторизации (phoneCodeHash)

// Проверка и валидация сессии (без подключения)
async function validateSession(session) {
  if (!session || session.trim() === '') {
    return { valid: false, reason: 'No session found' };
  }

  const { apiId, apiHash } = loadSettings();
  if (!apiId || !apiHash) {
    return { valid: false, reason: 'API credentials missing' };
  }

  const initialSession = new StringSession(session);
  const tg = new TelegramClient(initialSession, apiId, apiHash, { connectionRetries: 1 });
  
  try {
    await tg.connect();
    const me = await tg.getMe();
    await tg.disconnect();
    
    if (me.bot) {
      return { valid: false, reason: 'Bot account detected', isBot: true };
    }
    
    return { valid: true, user: me };
  } catch (e) {
    try {
      await tg.disconnect();
    } catch {
      // Игнорируем ошибки отключения
    }
    return { valid: false, reason: String(e?.message || e) };
  }
}

export async function getClient() {
  if (client) return client;
  if (connecting) return connecting;

  const { apiId, apiHash, session } = loadSettings();
  if (!apiId || !apiHash) {
    throw new Error('Telegram settings missing: TELEGRAM_API_ID and TELEGRAM_API_HASH');
  }

  // Если нет сессии, выбрасываем ошибку сразу
  if (!session || session.trim() === '') {
    throw new Error('No user session found. Please authenticate with phone number first');
  }

  // Быстрая проверка сессии перед подключением
  const validation = await validateSession(session);
  if (!validation.valid) {
    if (validation.isBot) {
      logger.warn('Bot session detected, clearing it');
      clearSession();
    }
    throw new Error(validation.reason === 'Bot account detected' 
      ? 'Bot account detected. Please authenticate with phone number (user account)'
      : 'Session expired or invalid. Please authenticate with phone number');
  }

  const initialSession = new StringSession(session);
  const tg = new TelegramClient(initialSession, apiId, apiHash, { connectionRetries: 5 });

  connecting = (async () => {
    try {
      await tg.connect();
      
      // Финальная проверка после подключения
      const me = await tg.getMe();
      
      if (me.bot) {
        logger.error('Connected as bot account. User account required for contacts.Search');
        await tg.disconnect();
        clearSession();
        throw new Error('Bot account detected. Please authenticate with phone number (user account)');
      }
      
      // Сессия валидна - обновляем её на случай изменений
      const exported = tg.session.save();
      if (exported !== session) {
        saveSettings({ session: exported });
        logger.info('Session updated');
      }
      
      const userId = me.id?.value || me.id;
      const userIdString = typeof userId === 'bigint' ? String(userId) : String(userId);
      logger.info('Telegram connected with existing user session', { 
        userId: userIdString, 
        username: me.username,
        firstName: me.firstName 
      });
      
      client = tg;
      connecting = null;
      return client;
    } catch (err) {
      connecting = null;
      // Если ошибка не связана с ботом, очищаем сессию
      if (!err.message?.includes('Bot account')) {
        logger.warn('Connection failed, clearing session', { error: String(err?.message || err) });
        clearSession();
      }
      logger.error('Telegram connect failed', { error: String(err?.message || err) });
      throw err;
    }
  })();

  return connecting;
}

// Инициализация клиента для авторизации (без проверки сессии)
export async function getAuthClient() {
  const { apiId, apiHash } = loadSettings();
  if (!apiId || !apiHash) {
    throw new Error('Telegram settings missing: TELEGRAM_API_ID and TELEGRAM_API_HASH');
  }

  // ВАЖНО: Создаем клиент с ПУСТОЙ сессией для user account авторизации
  // НЕ используем botToken или старую сессию
  // Явно указываем, что это USER account, НЕ bot
  const tg = new TelegramClient(
    new StringSession(''), // Пустая сессия - гарантия user account авторизации
    Number(apiId), 
    String(apiHash), 
    { 
      connectionRetries: 5,
      // Явно указываем, что это НЕ бот - это USER account
      deviceModel: 'Tele-fluence User Client',
      appVersion: '1.0.0',
      langCode: 'en',
      systemVersion: '1.0.0',
      // ВАЖНО: НЕ передаем botToken - это user account авторизация
      // GramJS должен использовать только apiId и apiHash
    }
  );
  
  await tg.connect();
  
  // Проверяем, что клиент не авторизован как бот
  // Для неавторизованного клиента getMe() выбросит ошибку - это нормально
  try {
    const me = await tg.getMe();
    // Если клиент уже авторизован (что не должно быть для нового клиента), проверяем тип
    if (me && me.bot) {
      logger.error('Client initialized as bot, disconnecting');
      await tg.disconnect();
      throw new Error('Client was initialized as bot. Please clear session and try again.');
    }
    // Если клиент авторизован как user - это тоже проблема, т.к. мы создали новый клиент
    logger.warn('Client is already authorized, this should not happen for new auth client');
  } catch (e) {
    // Для неавторизованного клиента getMe() выбросит ошибку - это ожидаемо
    // Проверяем, что это не ошибка о боте
    const errorMsg = e.message || String(e);
    if (errorMsg.includes('bot') || errorMsg.includes('Bot')) {
      await tg.disconnect().catch(() => {});
      throw new Error('Client was initialized as bot. Please clear session and try again.');
    }
    // Другие ошибки (например, "not authorized") - это нормально для нового клиента
  }
  
  return tg;
}

// Отправка кода на номер телефона
export async function sendCode(phoneNumber) {
  // Очищаем предыдущее состояние, если есть
  if (authState?.client) {
    try {
      await authState.client.disconnect();
    } catch (e) {
      // Игнорируем ошибки отключения
    }
  }
  
  // ВАЖНО: Перед авторизацией убеждаемся, что нет активных bot-сессий
  // Очищаем глобальный клиент, если он существует
  if (client) {
    try {
      await client.disconnect();
    } catch (e) {
      // Игнорируем ошибки
    }
    client = null;
  }
  
  const tg = await getAuthClient();
  try {
    // Используем прямой API вызов для отправки кода
    // Это гарантирует правильную работу без botToken
    const { apiId, apiHash } = loadSettings();
    const result = await tg.invoke(
      new Api.auth.SendCode({
        apiId: Number(apiId),
        apiHash: String(apiHash),
        phoneNumber: phoneNumber,
        settings: new Api.CodeSettings({}),
      })
    );
    
    authState = {
      phoneNumber,
      phoneCodeHash: result.phoneCodeHash,
      client: tg
    };
    
    const maskedPhone = phoneNumber.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2');
    logger.info('Code sent to phone', { phoneNumber: maskedPhone });
    
    return { 
      phoneCodeHash: result.phoneCodeHash,
      phoneRegistered: result.phoneRegistered || false
    };
  } catch (e) {
    logger.error('Send code failed', { error: String(e?.message || e) });
    try {
      await tg.disconnect();
    } catch (disconnectErr) {
      // Игнорируем ошибки отключения
    }
    authState = null;
    throw e;
  }
}

// Ввод кода и завершение авторизации
export async function signIn(phoneCode, password) {
  if (!authState) {
    throw new Error('No auth state. Please send code first');
  }

  const { phoneNumber, phoneCodeHash, client: tg } = authState;
  
  // ВАЖНО: Проверяем, что клиент не авторизован как бот
  // Это дополнительная защита от использования bot-сессии
  // Для неавторизованного клиента getMe() выбросит ошибку - это нормально
  try {
    const me = await tg.getMe();
    if (me && me.bot) {
      logger.error('Auth client is bot, cannot proceed with user sign in');
      throw new Error('Client is initialized as bot. Please clear session and try again.');
    }
  } catch (e) {
    // Для неавторизованного клиента getMe() выбросит ошибку - это ожидаемо
    // Проверяем, что это не ошибка о боте
    const errorMsg = e.message || String(e);
    if (errorMsg.includes('bot') || errorMsg.includes('Bot')) {
      throw new Error('Client is initialized as bot. Please clear session and try again.');
    }
    // Другие ошибки (например, "not authorized") - это нормально для неавторизованного клиента
  }
  
  try {
    // Используем прямой API вызов для user account авторизации
    // Это гарантирует, что botToken НЕ используется
    let authResult;
    
    try {
      // Сначала пытаемся войти с кодом
      authResult = await tg.invoke(
        new Api.auth.SignIn({
          phoneNumber: phoneNumber,
          phoneCodeHash: phoneCodeHash,
          phoneCode: phoneCode,
        })
      );
    } catch (e) {
      // Если требуется пароль 2FA
      const errorMsg = e.errorMessage || e.message || String(e);
      if (errorMsg.includes('SESSION_PASSWORD_NEEDED') || errorMsg.includes('PASSWORD') || errorMsg.includes('password')) {
        if (!password) {
          throw new Error('Password required for 2FA');
        }
        
        // Получаем информацию о пароле
        const passwordInfo = await tg.invoke(new Api.account.GetPassword());
        
        // Проверяем пароль
        const { computeCheck } = await import('telegram/Password.js');
        const passwordCheck = await computeCheck(passwordInfo, password);
        
        // Используем CheckPassword для завершения авторизации
        authResult = await tg.invoke(
          new Api.auth.CheckPassword({
            password: passwordCheck,
          })
        );
      } else {
        throw e;
      }
    }

    // Проверяем результат авторизации
    if (authResult.className !== 'auth.Authorization') {
      throw new Error(`Unexpected auth result: ${authResult.className}`);
    }

    const user = authResult.user;
    
    // Сохраняем сессию для автоматической авторизации при следующих запусках
    const exported = tg.session.save();
    saveSettings({ session: exported });
    
    // Также сохраняем в отдельный файл для надежности
    writeJson(SESSION_FILE, { session: exported });
    
    logger.info('Session saved for automatic authentication');
    
    // Очищаем состояние авторизации
    authState = null;
    
    // Обновляем глобальный клиент
    client = tg;
    connecting = null;
    
    // Преобразуем BigInt в строку для сериализации JSON
    const userId = user.id?.value || user.id;
    const userIdString = typeof userId === 'bigint' ? String(userId) : String(userId);
    const isBot = user.bot || false;
    
    if (isBot) {
      logger.error('Signed in as bot account. User account required');
      throw new Error('Bot account detected. Please use phone number authentication for user account');
    }
    
    logger.info('User signed in successfully', { userId: userIdString, username: user.username });
    
    return { 
      success: true, 
      session: exported,
      user: {
        id: userIdString,
        username: user.username || null,
        firstName: user.firstName || null,
        lastName: user.lastName || null
      }
    };
  } catch (e) {
    logger.error('Sign in failed', { error: String(e?.message || e) });
    // НЕ очищаем authState при ошибке, чтобы пользователь мог попробовать снова
    // authState будет очищен только при успешной авторизации или при новой отправке кода
    throw e;
  }
}

// Очистка сессии (для повторной авторизации)
export function clearSession() {
  // Отключаем клиент, если он существует
  if (client) {
    client.disconnect().catch(() => {});
    client = null;
  }
  
  connecting = null;
  authState = null;
  
  // Очищаем сессии в файлах
  saveSettings({ session: '' });
  writeJson(SESSION_FILE, { session: '' });
  
  logger.info('Session cleared (including any bot sessions)');
  return { success: true };
}

// Проверка статуса авторизации
export async function getAuthStatus() {
  try {
    const tg = await getClient();
    const me = await tg.getMe();
    // Преобразуем BigInt в строку для сериализации JSON
    const userId = me.id?.value || me.id;
    const userIdString = typeof userId === 'bigint' ? String(userId) : String(userId);
    
    return {
      authenticated: true,
      isBot: me.bot || false,
      userId: userIdString,
      username: me.username || null,
      firstName: me.firstName || null,
      lastName: me.lastName || null
    };
  } catch (e) {
    return {
      authenticated: false,
      error: String(e?.message || e)
    };
  }
}

// Convert peer metadata to GramJS InputPeer
function peerToInputPeer(peer) {
  if (!peer || !peer.id) {
    throw new Error('Invalid peer: missing id');
  }
  
  const peerId = typeof peer.id === 'bigint' ? peer.id : BigInt(peer.id);
  const accessHash = typeof peer.accessHash === 'bigint' ? peer.accessHash : BigInt(peer.accessHash || 0);
  
  if (peer.type === 'Channel') {
    return new Api.InputPeerChannel({
      channelId: peerId,
      accessHash: accessHash
    });
  } else if (peer.type === 'Chat') {
    return new Api.InputPeerChat({
      chatId: peerId
    });
  } else {
    throw new Error(`Unknown peer type: ${peer.type}`);
  }
}

export async function ensureClient() {
  return getClient();
}

export async function searchDialogs(query, limit = 20) {
  const tg = await ensureClient();
  const result = await tg.invoke(
    new Api.contacts.Search({ q: query, limit })
  );
  const chats = [...(result.chats || []), ...(result.users || [])];
  return chats.map((c) => {
    const chatId = c.id?.value || c.id;
    const chatIdString = typeof chatId === 'bigint' ? String(chatId) : String(chatId);
    return { 
      id: chatIdString, 
      title: c.title || `${c.firstName || ''} ${c.lastName || ''}`.trim(), 
      type: c.className 
    };
  });
}

/**
 * Determines the canonical category of a chat based on GramJS flags
 */
function determineChannelCategory(chat) {
  if (chat.className === 'Chat') {
    // Regular chat groups
    return 'basic';
  }
  
  if (chat.className === 'Channel') {
    // Check if this is a discussion group (has linkedChatId)
    if (chat.linkedChatId || (chat.flags && (chat.flags & 0x00400000) !== 0)) {
      return 'discussion';
    }
    
    // Check if gigagroup
    if (chat.gigagroup === true || (chat.flags && (chat.flags & 0x00008000) !== 0)) {
      return 'megagroup';
    }
    
    // Check if megagroup
    if (chat.megagroup === true || (chat.flags && (chat.flags & 0x00000001) !== 0)) {
      return 'megagroup';
    }
    
    // Check if broadcast
    if (chat.broadcast === true || (chat.flags && (chat.flags & 0x00000002) !== 0)) {
      return 'broadcast';
    }
  }
  
  return 'other';
}

/**
 * Tokenizes and normalizes search query into keywords
 */
function tokenizeQuery(query) {
  if (!query || !query.trim()) {
    return [];
  }
  
  // Split by comma, newline, or multiple spaces
  return query
    .split(/[,\n]+/)
    .flatMap(part => part.split(/\s{2,}/).map(token => token.trim()))
    .filter(token => token.length > 0);
}

/**
 * Extracts or resolves proper InputPeer and captures accessHash
 */
async function resolveInputPeerAndHash(tg, chat) {
  try {
    // Try to get the input entity for this chat
    const inputEntity = await tg.getInputEntity(chat);
    
    // Extract ID and accessHash from the resolved entity
    let chatId = chat.id?.value || chat.id;
    chatId = typeof chatId === 'bigint' ? String(chatId.value || chatId) : String(chatId);
    
    let accessHash = null;
    let type = 'unknown';
    
    if (inputEntity.className === 'InputChannel') {
      accessHash = String(inputEntity.accessHash?.value || inputEntity.accessHash || 0);
      type = 'channel';
    } else if (inputEntity.className === 'InputPeerChannel') {
      accessHash = String(inputEntity.accessHash?.value || inputEntity.accessHash || 0);
      type = 'channel';
    } else if (inputEntity.className === 'InputChat') {
      type = 'chat';
    } else if (inputEntity.className === 'InputPeerChat') {
      type = 'chat';
    }
    
    return {
      id: chatId,
      accessHash: accessHash,
      type: type,
      inputEntity: inputEntity
    };
  } catch (e) {
    // Fallback: extract what we can from the chat object
    let chatId = chat.id?.value || chat.id;
    chatId = typeof chatId === 'bigint' ? String(chatId.value || chatId) : String(chatId);
    
    const accessHash = String(chat.accessHash?.value || chat.accessHash || 0);
    const type = chat.className === 'Channel' ? 'channel' : 'chat';
    
    return {
      id: chatId,
      accessHash: accessHash,
      type: type,
      inputEntity: chat
    };
  }
}

/**
 * Fetches full chat information including metadata
 */
async function fetchFullChatInfo(tg, chat, peerInfo) {
  const result = {
    description: '',
    membersCount: 0,
    verified: false,
    scam: false,
    username: null,
    inviteLink: null,
    onlineCount: 0
  };
  
  try {
    if (chat.className === 'Channel') {
      const fullChannel = await tg.invoke(
        new Api.channels.GetFullChannel({ channel: peerInfo.inputEntity })
      );
      
      const fullChat = fullChannel.fullChat;
      result.description = fullChat?.about || '';
      
      const countValue = fullChat?.participantsCount?.value || fullChat?.participantsCount || 0;
      result.membersCount = typeof countValue === 'bigint' ? Number(countValue) : Number(countValue);
      
      result.verified = fullChat?.verified || false;
      result.scam = fullChat?.scam || false;
      result.onlineCount = fullChat?.onlineMemberCount?.value || fullChat?.onlineMemberCount || 0;
      
      // Try to get exported invite link
      if (fullChannel.exportedInvite) {
        result.inviteLink = fullChannel.exportedInvite.link || null;
      }
    } else if (chat.className === 'Chat') {
      const fullChat = await tg.invoke(
        new Api.messages.GetFullChat({ chatId: Number(peerInfo.id) })
      );
      
      const chatData = fullChat.fullChat;
      result.description = chatData?.about || '';
      result.membersCount = chatData?.participants?.length || 0;
      result.verified = false;
      result.scam = false;
    }
  } catch (e) {
    const errorMsg = String(e?.message || e);
    // Graceful fallback for FLOOD or PRIVATE errors
    if (!errorMsg.includes('FLOOD') && !errorMsg.includes('PRIVATE')) {
      logger.warn('Could not fetch full chat info', { 
        error: errorMsg, 
        chatId: peerInfo.id 
      });
    }
    
    // Use basic chat data as fallback
    const countValue = chat.participantsCount?.value || chat.participantsCount || 0;
    result.membersCount = typeof countValue === 'bigint' ? Number(countValue) : Number(countValue);
  }
  
  return result;
}

/**
 * Generates normalized link for a chat
 */
function generateNormalizedLink(chat, peerInfo) {
  // For public entities with username, return https://t.me/<username>
  if (chat.username) {
    return {
      link: `https://t.me/${chat.username}`,
      isPrivate: false
    };
  }
  
  // For private entities, return null for link and surface the numeric id separately
  return {
    link: null,
    isPrivate: true
  };
}

export async function searchChannels(query, minMembers = 0, maxMembers = Infinity, limit = 100, channelTypes = { megagroup: true, discussion: true, broadcast: true, basic: true, other: false }) {
  const tg = await ensureClient();
  
  try {
    // Tokenize the query into individual keywords
    const tokens = tokenizeQuery(query);
    const allChats = new Map(); // Map to deduplicate by chat ID
    const maxRequestsPerToken = 2; // Respect rate limits
    let totalRequests = 0;
    
    // Execute search per token
    for (const token of tokens) {
      if (totalRequests >= maxRequestsPerToken * Math.min(tokens.length, 5)) {
        // Cap total requests to respect Telegram rate limits
        logger.warn('Reached request limit, stopping searches', { 
          token, 
          totalRequests 
        });
        break;
      }
      
      try {
        const searchLimit = Math.min(limit * 2, 200);
        const result = await tg.invoke(
          new Api.contacts.Search({ q: token, limit: searchLimit })
        );
        
        totalRequests += 1;
        
        const chats = result.chats || [];
        
        // Collect and deduplicate results
        for (const chat of chats) {
          if (chat.className === 'Channel' || chat.className === 'Chat') {
            const chatId = typeof chat.id === 'bigint' ? String(chat.id.value || chat.id) : String(chat.id?.value || chat.id);
            
            if (!allChats.has(chatId)) {
              allChats.set(chatId, chat);
            }
          }
        }
        
        // Small delay to avoid flood limits
        await sleep(100);
      } catch (e) {
        const errorMsg = String(e?.message || e);
        // Gracefully fall back on FLOOD or PRIVATE errors
        if (errorMsg.includes('FLOOD')) {
          logger.warn('FLOOD error during search, backing off', { token });
          await sleep(500);
        } else if (errorMsg.includes('PRIVATE')) {
          logger.warn('PRIVATE error during search', { token });
        } else {
          logger.warn('Error searching for token', { token, error: errorMsg });
        }
      }
    }
    
    // Process collected chats
    const channels = [];
    
    for (const [chatId, chat] of allChats.entries()) {
      try {
        // Determine canonical category
        const category = determineChannelCategory(chat);
        
        // Strictly enforce category filters - if disabled, exclude
        if (!channelTypes[category]) {
          continue;
        }
        
        // Resolve peer info and access hash
        const peerInfo = await resolveInputPeerAndHash(tg, chat);
        
        // Fetch full chat information
        const fullInfo = await fetchFullChatInfo(tg, chat, peerInfo);
        
        // Apply member count filters
        const meetsMinFilter = fullInfo.membersCount >= minMembers;
        const meetsMaxFilter = maxMembers === Infinity || fullInfo.membersCount <= maxMembers;
        
        if (!meetsMinFilter || !meetsMaxFilter) {
          continue;
        }
        
        // Generate normalized link
        const { link, isPrivate } = generateNormalizedLink(chat, peerInfo);
        
        // Build result object with all required metadata
        channels.push({
          id: peerInfo.id,
          accessHash: peerInfo.accessHash,
          title: chat.title || 'Без названия',
          username: chat.username || null,
          link: link,
          isPrivate: isPrivate,
          membersCount: fullInfo.membersCount,
          onlineCount: fullInfo.onlineCount,
          description: fullInfo.description,
          category: category,
          verified: fullInfo.verified,
          scam: fullInfo.scam,
          peer: {
            id: peerInfo.id,
            accessHash: peerInfo.accessHash,
            type: peerInfo.type
          }
        });
        
        // Stop when we reach the limit
        if (channels.length >= limit) {
          break;
        }
        
        // Rate limiting
        await sleep(100);
      } catch (e) {
        logger.warn('Error processing chat', { 
          error: String(e?.message || e), 
          chatId 
        });
        continue;
      }
    }
    
    return channels;
  } catch (e) {
    logger.error('searchChannels failed', { error: String(e?.message || e) });
    throw e;
  }
}

export async function getParticipantsWithActivity(chat, lastDays = 30, chunk = 200, throttleMs = 700, criteria = {}, minActivity = 0) {
  const tg = await ensureClient();
  
  logger.info('getParticipantsWithActivity called', { 
    chat, 
    lastDays, 
    criteria, 
    minActivity 
  });
  
  // resolve entity - handle both string and peer object
  let entity;
  try {
    // If chat is a peer object with id/accessHash/type, convert to InputPeer
    if (typeof chat === 'object' && chat.id && chat.type) {
      try {
        entity = peerToInputPeer(chat);
        const entityId = chat.id;
        const entityIdString = typeof entityId === 'bigint' ? String(entityId) : String(entityId);
        logger.info('Entity created from peer object', { 
          entityType: chat.type,
          entityId: entityIdString
        });
      } catch (peerErr) {
        logger.warn('Failed to convert peer to InputPeer, trying getEntity', { error: String(peerErr?.message || peerErr) });
        // Fallback to getEntity
        entity = await tg.getEntity(chat.id);
      }
    } else {
      // Legacy: resolve string chat identifier
      entity = await tg.getEntity(chat);
    }
    
    const entityId = entity?.id?.value || entity?.id || (typeof chat === 'object' ? chat.id : null);
    const entityIdString = typeof entityId === 'bigint' ? String(entityId) : (entityId ? String(entityId) : null);
    logger.info('Entity resolved', { 
      entityType: entity?.className || (typeof chat === 'object' ? chat.type : 'unknown'),
      entityId: entityIdString
    });
  } catch (e) {
    logger.error('Failed to resolve entity', { 
      chat, 
      error: String(e?.message || e) 
    });
    throw e;
  }
  
  const activeUserActivity = new Map(); // userId -> { likes: 0, comments: 0, reposts: 0, messages: 0 }
  const activeUserIds = new Set(); // Set активных userId за период
  const since = Date.now() - lastDays * 24 * 60 * 60 * 1000;
  
  logger.info('Period calculated', {
    since: new Date(since).toISOString(),
    sinceTimestamp: since,
    lastDays
  });

  // Сначала анализируем сообщения за период, чтобы собрать активных пользователей
  // Это позволяет оптимизировать получение участников - получаем только тех, кто был активен
  try {
    let addOffset = 0;
    const addChunk = 100;
    let messagesProcessed = 0;
    let reachedPeriodBoundary = false;
    let totalMessagesFetched = 0;
    
    logger.info('Starting message analysis', { 
      chatId: chat, 
      lastDays, 
      since: new Date(since).toISOString(),
      sinceTimestamp: since 
    });
    
    while (true) {
      let history;
      try {
        history = await tg.invoke(new Api.messages.GetHistory({ 
          peer: entity, 
          offsetId: 0, 
          offsetDate: 0, // Не используем offsetDate для фильтрации, только для пагинации
          addOffset, 
          limit: addChunk, 
          maxId: 0, 
          minId: 0, 
          hash: 0 
        }));
      } catch (e) {
        logger.error('GetHistory API call failed', { 
          error: String(e?.message || e),
          addOffset,
          chat 
        });
        break;
      }
      
      const messages = history.messages || [];
      totalMessagesFetched += messages.length;
      
      if (!messages.length) {
        logger.info('No more messages to process', { 
          totalMessagesFetched,
          addOffset 
        });
        break;
      }
      
      // Логируем информацию о первой и последней датах в батче
      const firstMsg = messages[0];
      const lastMsg = messages[messages.length - 1];
      const firstDate = firstMsg ? ((firstMsg.date?.getTime && firstMsg.date.getTime()) || (firstMsg.date ? Number(firstMsg.date) * 1000 : 0)) : null;
      const lastDate = lastMsg ? ((lastMsg.date?.getTime && lastMsg.date.getTime()) || (lastMsg.date ? Number(lastMsg.date) * 1000 : 0)) : null;
      
      logger.info('Fetched messages batch', { 
        batchSize: messages.length, 
        totalFetched: totalMessagesFetched,
        addOffset,
        firstMessageDate: firstDate ? new Date(firstDate).toISOString() : null,
        lastMessageDate: lastDate ? new Date(lastDate).toISOString() : null,
        periodStart: new Date(since).toISOString()
      });
      
      for (const m of messages) {
        const dateMs = (m.date?.getTime && m.date.getTime()) || (m.date ? Number(m.date) * 1000 : 0);
        
        // Проверяем, что сообщение в пределах периода
        if (dateMs < since) {
          // Достигли границы периода, прерываем анализ сообщений
          // (сообщения отсортированы от новых к старым)
          logger.info('Reached period boundary', { 
            messageDate: new Date(dateMs).toISOString(),
            periodStart: new Date(since).toISOString(),
            messagesProcessed 
          });
          reachedPeriodBoundary = true;
          break;
        }
        
        messagesProcessed++;
        
        // Проверяем критерии активности
        const fromId = m.fromId;
        if (fromId && fromId.userId) {
          const userId = String(fromId.userId.value || fromId.userId);
          activeUserIds.add(userId); // Добавляем в Set активных
          const activity = activeUserActivity.get(userId) || { likes: 0, comments: 0, reposts: 0, messages: 0 };
          
          // Подсчитываем активность
          if (m.className === 'Message' || m.className === 'MessageService') {
            // Проверяем, является ли сообщение комментарием (reply)
            if (m.replyTo && m.replyTo.replyToMsgId) {
              if (criteria.comments !== false) {
                activity.comments++;
              }
            } else {
              if (criteria.frequency !== false) {
                activity.messages++;
              }
            }
            
            // Проверяем реакции (лайки)
            if (criteria.likes !== false && m.reactions) {
              const reactions = m.reactions?.results || [];
              reactions.forEach(reaction => {
                if (reaction.recentReactions) {
                  reaction.recentReactions.forEach(recent => {
                    const reactedUserId = String(recent.peerId?.userId?.value || recent.peerId?.userId);
                    activeUserIds.add(reactedUserId); // Добавляем пользователей, поставивших реакции
                    const reactedActivity = activeUserActivity.get(reactedUserId) || { likes: 0, comments: 0, reposts: 0, messages: 0 };
                    reactedActivity.likes++;
                    activeUserActivity.set(reactedUserId, reactedActivity);
                  });
                }
              });
            }
            
            // Проверяем репосты (forwarded messages)
            if (criteria.reposts !== false && m.fwdFrom) {
              const forwardedUserId = m.fwdFrom.fromId?.userId?.value || m.fwdFrom.fromId?.userId;
              if (forwardedUserId) {
                const forwardedUserIdStr = String(forwardedUserId);
                activeUserIds.add(forwardedUserIdStr); // Добавляем авторов репостов
                const forwardedActivity = activeUserActivity.get(forwardedUserIdStr) || { likes: 0, comments: 0, reposts: 0, messages: 0 };
                forwardedActivity.reposts++;
                activeUserActivity.set(forwardedUserIdStr, forwardedActivity);
              }
            }
            
            activeUserActivity.set(userId, activity);
          }
        }
      }
      
      if (reachedPeriodBoundary) break; // Прерываем, если достигли границы периода
      
      addOffset += messages.length;
      if (messages.length < addChunk) break;
      await sleep(throttleMs);
    }
    
    logger.info('Messages analyzed for period', { 
      messagesProcessed, 
      totalMessagesFetched,
      activeUsersCount: activeUserIds.size,
      periodDays: lastDays,
      reachedPeriodBoundary 
    });
  } catch (e) {
    logger.error('GetHistory error, will get all participants', { 
      error: String(e?.message || e),
      stack: e?.stack 
    });
  }

  // Теперь получаем участников, но только тех, кто был активен в период
  // Если активных пользователей нет, получаем всех участников (fallback)
  const totalUsers = [];
  const userIdsToFetch = activeUserIds.size > 0 ? activeUserIds : null;
  let offset = 0;
  let foundActiveUsers = 0;
  const maxParticipantsToCheck = activeUserIds.size > 0 ? activeUserIds.size * 2 : Infinity; // Ограничиваем поиск
  
  while (true) {
    try {
      // Если мы уже нашли всех активных пользователей, прерываем цикл
      if (userIdsToFetch && foundActiveUsers >= activeUserIds.size) {
        logger.info('Found all active users, stopping participant fetch', { 
          found: foundActiveUsers, 
          total: activeUserIds.size 
        });
        break;
      }
      
      // Если проверили достаточно участников, прерываем
      if (offset >= maxParticipantsToCheck) {
        logger.info('Reached max participants check limit', { 
          offset, 
          max: maxParticipantsToCheck,
          found: foundActiveUsers 
        });
        break;
      }
      
      const res = await tg.invoke(new Api.channels.GetParticipants({
        channel: entity,
        filter: new Api.ChannelParticipantsRecent({}),
        offset,
        limit: chunk,
        hash: 0,
      }));
      const users = res.users || [];
      
      if (userIdsToFetch) {
        // Фильтруем только активных пользователей
        const activeUsersInBatch = users.filter(u => {
          const userId = String(u.id?.value || u.id);
          return activeUserIds.has(userId);
        });
        totalUsers.push(...activeUsersInBatch);
        foundActiveUsers += activeUsersInBatch.length;
      } else {
        // Fallback: если не было активных пользователей, получаем всех
        totalUsers.push(...users);
      }
      
      offset += users.length;
      if (users.length < chunk) break;
      await sleep(throttleMs);
    } catch (e) {
      logger.warn('GetParticipants error, breaking', { error: String(e?.message || e) });
      break;
    }
  }

  // Инициализируем активность для всех найденных пользователей
  totalUsers.forEach(u => {
    const userId = String(u.id?.value || u.id);
    if (!activeUserActivity.has(userId)) {
      activeUserActivity.set(userId, { likes: 0, comments: 0, reposts: 0, messages: 0 });
    }
  });


  // Фильтруем активных пользователей по критериям и минимальной активности
  const activeUsers = totalUsers.filter((u) => {
    const userId = String(u.id?.value || u.id);
    const activity = activeUserActivity.get(userId) || { likes: 0, comments: 0, reposts: 0, messages: 0 };
    
    // Подсчитываем общую активность в зависимости от включенных критериев
    let totalActivity = 0;
    if (criteria.likes !== false) totalActivity += activity.likes;
    if (criteria.comments !== false) totalActivity += activity.comments;
    if (criteria.reposts !== false) totalActivity += activity.reposts;
    if (criteria.frequency !== false) totalActivity += activity.messages;
    
    return totalActivity >= minActivity;
  });
  
  return { all: totalUsers, active: activeUsers };
}

export async function sendMessage(peerId, message) {
  const tg = await ensureClient();
  await tg.sendMessage(peerId, { message });
  return { ok: true };
}


