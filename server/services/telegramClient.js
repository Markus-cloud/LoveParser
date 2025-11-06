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

export async function getClient() {
  if (client) return client;
  if (connecting) return connecting;

  const { apiId, apiHash, session, botToken } = loadSettings();
  if (!apiId || !apiHash) {
    throw new Error('Telegram settings missing: TELEGRAM_API_ID and TELEGRAM_API_HASH');
  }

  const initialSession = new StringSession(session || '');
  const tg = new TelegramClient(initialSession, apiId, apiHash, { connectionRetries: 5 });

  connecting = (async () => {
    try {
      await tg.connect();
      // validate by calling a lightweight method
      try {
        await tg.getMe();
        logger.info('Telegram connected with existing session');
      } catch (e) {
        logger.warn('Existing session invalid, attempting re-login');
        if (botToken) {
          await tg.start({ botAuthToken: botToken });
        } else {
          // Attempt to authorize as is; without phone/code we cannot proceed further
          throw new Error('No TELEGRAM_SESSION or TELEGRAM_BOT_TOKEN available for auto login');
        }
      }
      const exported = tg.session.save();
      saveSettings({ session: exported });
      client = tg;
      connecting = null;
      return client;
    } catch (err) {
      connecting = null;
      logger.error('Telegram connect failed', { error: String(err?.message || err) });
      throw err;
    }
  })();

  return connecting;
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
  return chats.map((c) => ({ id: c.id?.value || c.id, title: c.title || `${c.firstName || ''} ${c.lastName || ''}`.trim(), type: c.className }));
}

export async function getParticipantsWithActivity(chat, lastDays = 30, chunk = 200, throttleMs = 700) {
  const tg = await ensureClient();
  // resolve entity
  const entity = await tg.getEntity(chat);
  let offset = 0;
  const totalUsers = [];
  const activeUserIds = new Set();
  const since = Date.now() - lastDays * 24 * 60 * 60 * 1000;

  // collect participants paginated
  while (true) {
    try {
      const res = await tg.invoke(new Api.channels.GetParticipants({
        channel: entity,
        filter: new Api.ChannelParticipantsRecent({}),
        offset,
        limit: chunk,
        hash: 0,
      }));
      const users = res.users || [];
      totalUsers.push(...users);
      offset += users.length;
      if (users.length < chunk) break;
      await sleep(throttleMs);
    } catch (e) {
      logger.warn('GetParticipants error, breaking', { error: String(e?.message || e) });
      break;
    }
  }

  // Iterate over recent messages to detect activity
  try {
    let addOffset = 0;
    const addChunk = 100;
    while (true) {
      const history = await tg.invoke(new Api.messages.GetHistory({ peer: entity, offsetId: 0, offsetDate: 0, addOffset, limit: addChunk, maxId: 0, minId: 0, hash: 0 }));
      const messages = history.messages || [];
      if (!messages.length) break;
      for (const m of messages) {
        const dateMs = (m.date?.getTime && m.date.getTime()) || (m.date ? Number(m.date) * 1000 : 0);
        if (dateMs >= since && m.fromId && m.fromId.userId) {
          activeUserIds.add(String(m.fromId.userId.value || m.fromId.userId));
        } else if (dateMs < since) {
          // assuming history is descending, we can stop early
          break;
        }
      }
      addOffset += messages.length;
      if (messages.length < addChunk) break;
      await sleep(throttleMs);
    }
  } catch (e) {
    logger.warn('GetHistory error, continuing with participants only', { error: String(e?.message || e) });
  }

  const activeUsers = totalUsers.filter((u) => activeUserIds.has(String(u.id?.value || u.id)));
  return { all: totalUsers, active: activeUsers };
}

export async function sendMessage(peerId, message) {
  const tg = await ensureClient();
  await tg.sendMessage(peerId, { message });
  return { ok: true };
}


