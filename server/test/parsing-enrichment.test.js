#!/usr/bin/env node

/**
 * Integration tests for enriched parsing storage functionality
 * Tests backward compatibility and new metadata persistence
 */

import { strict as assert } from 'assert';
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Mock data for testing
const legacyChannelData = {
  id: "123456789",
  title: "Test Legacy Channel",
  username: "testlegacy",
  address: "@testlegacy",
  membersCount: 5000,
  description: "A test legacy channel",
  type: "Broadcast"
};

const enrichedChannelData = {
  // Basic fields (backward compatible)
  id: "987654321",
  title: "Test Enriched Channel",
  username: "testenriched",
  address: "@testenriched",
  membersCount: 10000,
  description: "A test enriched channel with metadata",
  type: "Megagroup",
  
  // Enriched fields
  peer: {
    id: "987654321",
    className: "Channel",
    accessHash: "12345678901234567890",
    username: "testenriched",
    title: "Test Enriched Channel",
    flags: 1,
    megagroup: true,
    broadcast: false,
    verified: true,
    restricted: false,
    scam: false,
    fake: false,
    gigagroup: false
  },
  metadata: {
    isVerified: true,
    isRestricted: false,
    isScam: false,
    isFake: false,
    isGigagroup: false,
    hasUsername: true,
    isPublic: true,
    privacy: "public"
  },
  category: "Verified Megagroup",
  inviteLink: "https://t.me/+abcdef123456",
  channelMetadata: {
    linkedChatId: null,
    canViewParticipants: true,
    canSetUsername: false,
    canSetStickers: true,
    hiddenPrehistory: false,
    participantsCount: 10000,
    adminsCount: 5,
    kickedCount: 0,
    bannedCount: 2,
    onlineCount: 250,
    readInboxMaxId: 12345,
    readOutboxMaxId: 12340,
    unreadCount: 5
  },
  resolvedLink: "https://t.me/testenriched",
  fullDescription: "A test enriched channel with metadata",
  searchableText: "test enriched channel with metadata",
  date: 1634567890,
  hasForwards: true,
  hasScheduled: false,
  canDeleteHistory: false,
  antiSpamEnabled: true,
  joinToSend: false,
  requestJoinRequired: false
};

const legacyResultsData = {
  id: "parsing_1634567890123_408683910",
  userId: "408683910",
  query: "test",
  minMembers: 0,
  maxMembers: null,
  channels: [legacyChannelData],
  timestamp: "2023-10-18T12:34:56.789Z",
  count: 1
};

const enrichedResultsData = {
  id: "parsing_1634567890124_408683910",
  userId: "408683910",
  query: "enriched test",
  keywords: ["enriched", "test"],
  searchFilters: {
    minMembers: 1000,
    maxMembers: 50000,
    limit: 100,
    channelTypes: {
      megagroup: true,
      discussion: false,
      broadcast: true
    }
  },
  channels: [enrichedChannelData],
  timestamp: "2023-10-18T12:35:56.789Z",
  count: 1,
  version: "2.0",
  enriched: true
};

// Import the normalization functions (we'll need to extract them)
function normalizeChannelData(channel) {
  // If this is already an enriched record, return as-is with defaults for any missing fields
  if (channel.enriched || channel.peer || channel.metadata) {
    return {
      // Basic fields (always present)
      id: channel.id || '',
      title: channel.title || 'Без названия',
      username: channel.username || null,
      address: channel.address || (channel.username ? `@${channel.username}` : `tg://resolve?domain=${channel.id}`),
      membersCount: channel.membersCount || 0,
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
        participantsCount: channel.membersCount || 0,
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
    membersCount: channel.membersCount || 0,
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
        discussion: true,
        broadcast: true
      }
    },
    version: resultsData.version || '1.0',
    enriched: resultsData.enriched || false
  };
}

function generateCSV(channels) {
  const delimiter = ';';
  
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
  
  const getStatusLabel = (type) => {
    switch (type) {
      case 'Megagroup':
        return 'Публичный чат';
      case 'Discussion Group':
        return 'Каналы с комментариями';
      case 'Broadcast':
        return 'Каналы';
      default:
        return type || 'Неизвестно';
    }
  };
  
  const csvRows = channels.map(ch => {
    // Basic fields
    const title = (ch.title || '').replace(/"/g, '""');
    const username = (ch.username || '').replace(/"/g, '""');
    const link = ch.resolvedLink || '';
    const linkEscaped = link.replace(/"/g, '""');
    
    // Enriched fields
    const category = (ch.category || '').replace(/"/g, '""');
    const privacy = (ch.metadata?.privacy || '').replace(/"/g, '""');
    const status = getStatusLabel(ch.type);
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
  
  return csvHeader + csvRows;
}

// Test suite
async function runTests() {
  console.log('🧪 Running parsing enrichment tests...\n');
  
  let passed = 0;
  let failed = 0;
  
  function test(name, testFn) {
    try {
      testFn();
      console.log(`✅ ${name}`);
      passed++;
    } catch (error) {
      console.log(`❌ ${name}`);
      console.log(`   Error: ${error.message}`);
      failed++;
    }
  }
  
  // Test 1: Legacy channel normalization
  test('Legacy channel normalization', () => {
    const normalized = normalizeChannelData(legacyChannelData);
    
    assert.equal(normalized.id, legacyChannelData.id);
    assert.equal(normalized.title, legacyChannelData.title);
    assert.equal(normalized.username, legacyChannelData.username);
    assert.equal(normalized.membersCount, legacyChannelData.membersCount);
    assert.equal(normalized.type, legacyChannelData.type);
    
    // Should have enriched fields with defaults
    assert.equal(normalized.peer, null);
    assert.equal(normalized.metadata.isVerified, false);
    assert.equal(normalized.metadata.privacy, 'public');
    assert.equal(normalized.category, 'Broadcast');
    assert.equal(normalized.inviteLink, null);
    assert.equal(normalized.resolvedLink, 'https://t.me/testlegacy');
  });
  
  // Test 2: Enriched channel normalization
  test('Enriched channel normalization', () => {
    const normalized = normalizeChannelData(enrichedChannelData);
    
    assert.equal(normalized.id, enrichedChannelData.id);
    assert.equal(normalized.title, enrichedChannelData.title);
    assert.equal(normalized.username, enrichedChannelData.username);
    assert.equal(normalized.membersCount, enrichedChannelData.membersCount);
    assert.equal(normalized.type, enrichedChannelData.type);
    
    // Should preserve enriched fields
    assert.notEqual(normalized.peer, null);
    assert.equal(normalized.peer.className, 'Channel');
    assert.equal(normalized.metadata.isVerified, true);
    assert.equal(normalized.metadata.privacy, 'public');
    assert.equal(normalized.category, 'Verified Megagroup');
    assert.equal(normalized.inviteLink, 'https://t.me/+abcdef123456');
    assert.equal(normalized.channelMetadata.onlineCount, 250);
    assert.equal(normalized.channelMetadata.adminsCount, 5);
  });
  
  // Test 3: Legacy results normalization
  test('Legacy results normalization', () => {
    const normalized = normalizeParsingResults(legacyResultsData);
    
    assert.equal(normalized.id, legacyResultsData.id);
    assert.equal(normalized.userId, legacyResultsData.userId);
    assert.equal(normalized.query, legacyResultsData.query);
    assert.equal(normalized.count, legacyResultsData.count);
    
    // Should add missing fields with defaults
    assert.deepEqual(normalized.keywords, ['test']);
    assert.equal(normalized.version, '1.0');
    assert.equal(normalized.enriched, false);
    assert.notEqual(normalized.searchFilters, undefined);
    assert.equal(normalized.searchFilters.minMembers, 0);
    assert.equal(normalized.searchFilters.maxMembers, null);
    
    // Channels should be normalized
    assert.equal(normalized.channels.length, 1);
    assert.equal(normalized.channels[0].metadata.isVerified, false);
    assert.equal(normalized.channels[0].resolvedLink, 'https://t.me/testlegacy');
  });
  
  // Test 4: Enriched results normalization
  test('Enriched results normalization', () => {
    const normalized = normalizeParsingResults(enrichedResultsData);
    
    assert.equal(normalized.id, enrichedResultsData.id);
    assert.equal(normalized.userId, enrichedResultsData.userId);
    assert.equal(normalized.query, enrichedResultsData.query);
    assert.equal(normalized.count, enrichedResultsData.count);
    
    // Should preserve enriched fields
    assert.deepEqual(normalized.keywords, ['enriched', 'test']);
    assert.equal(normalized.version, '2.0');
    assert.equal(normalized.enriched, true);
    assert.deepEqual(normalized.searchFilters, enrichedResultsData.searchFilters);
    
    // Channels should be normalized
    assert.equal(normalized.channels.length, 1);
    assert.equal(normalized.channels[0].metadata.isVerified, true);
    assert.equal(normalized.channels[0].resolvedLink, 'https://t.me/testenriched');
  });
  
  // Test 5: CSV generation with legacy data
  test('CSV generation with legacy data', () => {
    const normalizedLegacy = normalizeChannelData(legacyChannelData);
    const csv = generateCSV([normalizedLegacy]);
    
    assert(csv.includes('Название канала;Username;Ссылка на канал'));
    assert(csv.includes('Test Legacy Channel'));
    assert(csv.includes('testlegacy'));
    assert(csv.includes('https://t.me/testlegacy'));
    assert(csv.includes('Каналы')); // status
    assert(csv.includes('5000')); // members count
    assert(csv.includes('Нет')); // isVerified
    assert(csv.includes('public')); // privacy
  });
  
  // Test 6: CSV generation with enriched data
  test('CSV generation with enriched data', () => {
    const normalizedEnriched = normalizeChannelData(enrichedChannelData);
    const csv = generateCSV([normalizedEnriched]);
    
    assert(csv.includes('Название канала;Username;Ссылка на канал'));
    assert(csv.includes('Test Enriched Channel'));
    assert(csv.includes('testenriched'));
    assert(csv.includes('https://t.me/testenriched'));
    assert(csv.includes('Публичный чат')); // status
    assert(csv.includes('10000')); // members count
    assert(csv.includes('Да')); // isVerified
    assert(csv.includes('250')); // online count
    assert(csv.includes('5')); // admins count
    assert(csv.includes('Verified Megagroup')); // category
  });
  
  // Test 7: Backward compatibility - missing fields
  test('Backward compatibility - missing fields', () => {
    const incompleteChannel = {
      id: "123",
      title: "Incomplete"
      // Missing most fields
    };
    
    const normalized = normalizeChannelData(incompleteChannel);
    
    assert.equal(normalized.id, "123");
    assert.equal(normalized.title, "Incomplete");
    assert.equal(normalized.username, null);
    assert.equal(normalized.membersCount, 0);
    assert.equal(normalized.description, '');
    assert.equal(normalized.type, 'Channel');
    
    // Should have safe defaults
    assert.equal(normalized.metadata.isVerified, false);
    assert.equal(normalized.metadata.privacy, 'private');
    assert.equal(normalized.resolvedLink, null);
    assert.equal(normalized.channelMetadata.onlineCount, 0);
  });
  
  // Test 8: Data persistence simulation
  test('Data persistence simulation', async () => {
    const testFile = join(__dirname, 'test-results.json');
    
    try {
      // Write enriched data
      writeFileSync(testFile, JSON.stringify(enrichedResultsData, null, 2));
      
      // Read it back
      const readData = JSON.parse(readFileSync(testFile, 'utf-8'));
      
      // Normalize and verify
      const normalized = normalizeParsingResults(readData);
      
      assert.equal(normalized.id, enrichedResultsData.id);
      assert.equal(normalized.enriched, true);
      assert.equal(normalized.channels[0].metadata.isVerified, true);
      assert.equal(normalized.channels[0].channelMetadata.onlineCount, 250);
      
    } finally {
      // Cleanup
      if (existsSync(testFile)) {
        unlinkSync(testFile);
      }
    }
  });
  
  console.log('\n' + '='.repeat(50));
  console.log(`📊 TEST RESULTS: ${passed} passed, ${failed} failed`);
  
  if (failed === 0) {
    console.log('🎉 All tests passed!');
    process.exit(0);
  } else {
    console.log('❌ Some tests failed.');
    process.exit(1);
  }
}

// Run the tests
runTests().catch(error => {
  console.error('❌ Test runner failed:', error);
  process.exit(1);
});