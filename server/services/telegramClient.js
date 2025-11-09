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

export async function searchChannels(query, minMembers = 0, maxMembers = Infinity, limit = 100, channelTypes = { megagroup: true, discussionGroup: true, broadcast: true }) {
  const tg = await ensureClient();
  
  try {
    // Поиск через contacts.Search
    const result = await tg.invoke(
      new Api.contacts.Search({ q: query, limit: Math.min(limit * 2, 200) })
    );
    
    const channels = [];
    const chats = result.chats || [];
    
    // Фильтруем только каналы и получаем полную информацию
    for (const chat of chats) {
      try {
        // Проверяем, что это канал
        if (chat.className === 'Channel' || chat.className === 'Chat') {
          let fullInfo = null;
          let participantsCount = 0;
          let username = null;
          
          try {
            // Получаем полную информацию о канале
            if (chat.className === 'Channel') {
              const fullChannel = await tg.invoke(
                new Api.channels.GetFullChannel({ channel: chat })
              );
              fullInfo = fullChannel.fullChat;
              const participantsCountValue = fullInfo?.participantsCount?.value || fullInfo?.participantsCount || 0;
              participantsCount = typeof participantsCountValue === 'bigint' ? Number(participantsCountValue) : Number(participantsCountValue);
              username = chat.username || null;
            } else if (chat.className === 'Chat') {
              const chatId = chat.id?.value || chat.id;
              const chatIdString = typeof chatId === 'bigint' ? String(chatId) : String(chatId);
              const fullChat = await tg.invoke(
                new Api.messages.GetFullChat({ chatId: Number(chatIdString) })
              );
              fullInfo = fullChat.fullChat;
              participantsCount = fullInfo?.participants?.length || 0;
            }
          } catch (e) {
            // Если не удалось получить полную информацию, используем базовые данные
            const participantsCountValue = chat.participantsCount?.value || chat.participantsCount || 0;
            participantsCount = typeof participantsCountValue === 'bigint' ? Number(participantsCountValue) : Number(participantsCountValue);
            username = chat.username || null;
            const chatId = chat.id?.value || chat.id;
            const chatIdString = typeof chatId === 'bigint' ? String(chatId) : String(chatId);
            logger.warn('Could not get full channel info', { error: String(e?.message || e), chatId: chatIdString });
          }
          
          // Фильтруем по количеству участников
          const meetsMinFilter = participantsCount >= minMembers;
          const meetsMaxFilter = maxMembers === Infinity || participantsCount <= maxMembers;
          
          if (meetsMinFilter && meetsMaxFilter) {
            const title = chat.title || 'Без названия';
            const description = fullInfo?.about || '';
            
            // Проверяем, содержит ли название или описание ключевые слова
            const searchLower = query.toLowerCase();
            const titleLower = title.toLowerCase();
            const descLower = description.toLowerCase();
            
            if (titleLower.includes(searchLower) || descLower.includes(searchLower) || !query.trim()) {
              // Преобразуем BigInt в строку для сериализации JSON
              const chatId = chat.id?.value || chat.id;
              const chatIdString = typeof chatId === 'bigint' ? String(chatId) : String(chatId);
              const membersCountNumber = typeof participantsCount === 'bigint' ? Number(participantsCount) : Number(participantsCount);
              
              // Определяем тип канала
              let channelType = chat.className;
              if (chat.className === 'Channel') {
                // Проверяем свойства канала (broadcast и megagroup могут быть булевыми свойствами)
                const isMegagroup = chat.megagroup === true || (chat.flags && (chat.flags & 0x00000001) !== 0);
                const isBroadcast = chat.broadcast === true || (chat.flags && (chat.flags & 0x00000002) !== 0);
                
                if (isMegagroup) {
                  channelType = 'Megagroup';
                } else if (isBroadcast) {
                  channelType = 'Broadcast';
                } else {
                  channelType = 'Channel';
                }
              } else if (chat.className === 'Chat') {
                channelType = 'Discussion Group';
              }
              
              // Применяем фильтры по типам каналов
              let shouldInclude = false;
              if (channelType === 'Megagroup' && channelTypes.megagroup) {
                shouldInclude = true;
              } else if (channelType === 'Discussion Group' && channelTypes.discussionGroup) {
                shouldInclude = true;
              } else if (channelType === 'Broadcast' && channelTypes.broadcast) {
                shouldInclude = true;
              } else if (channelType !== 'Megagroup' && channelType !== 'Discussion Group' && channelType !== 'Broadcast') {
                // Если тип не определен, включаем по умолчанию
                shouldInclude = true;
              }
              
              if (shouldInclude) {
                // Determine if channel is private (no username) and verified
                const isPrivate = !username;
                const isVerified = chat.verified || false;
                
                // Generate invite link if available
                let inviteLink = null;
                if (fullInfo?.exportedInvite) {
                  inviteLink = fullInfo.exportedInvite.link;
                }
                
                channels.push({
                  id: chatIdString,
                  title: title,
                  username: username,
                  address: username ? `@${username}` : `tg://resolve?domain=${chatIdString}`,
                  membersCount: membersCountNumber,
                  description: description,
                  type: channelType,
                  peer: chatIdString,
                  isPrivate: isPrivate,
                  isVerified: isVerified,
                  inviteLink: inviteLink
                });
              }
            }
            
            // Ограничиваем количество результатов
            if (channels.length >= limit) break;
          }
          
          // Небольшая задержка для избежания flood limit
          await sleep(100);
        }
      } catch (e) {
        const chatId = chat.id?.value || chat.id;
        const chatIdString = typeof chatId === 'bigint' ? String(chatId) : String(chatId);
        logger.warn('Error processing channel', { error: String(e?.message || e), chatId: chatIdString });
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
  
  // resolve entity
  let entity;
  try {
    entity = await tg.getEntity(chat);
    const entityId = entity?.id?.value || entity?.id;
    const entityIdString = typeof entityId === 'bigint' ? String(entityId) : (entityId ? String(entityId) : null);
    logger.info('Entity resolved', { 
      entityType: entity?.className,
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


