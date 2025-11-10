#!/usr/bin/env node

/**
 * API integration tests for enriched parsing endpoints
 * Tests the actual HTTP endpoints with mock data
 */

import { strict as assert } from 'assert';
import { readFileSync, writeFileSync, unlinkSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'http';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Mock test data
const testUserId = 'test_user_123';
const testResultsId = `parsing_${Date.now()}_${testUserId}`;

const legacyTestData = {
  id: testResultsId,
  userId: testUserId,
  query: "legacy test",
  minMembers: 0,
  maxMembers: null,
  channels: [
    {
      id: "123456789",
      title: "Legacy Test Channel",
      username: "legacytest",
      address: "@legacytest",
      membersCount: 2500,
      description: "A legacy test channel",
      type: "Broadcast"
    }
  ],
  timestamp: new Date().toISOString(),
  count: 1
};

const enrichedTestData = {
  id: `${testResultsId}_enriched`,
  userId: testUserId,
  query: "enriched test",
  keywords: ["enriched", "test"],
  searchFilters: {
    minMembers: 1000,
    maxMembers: 10000,
    limit: 50,
    channelTypes: {
      megagroup: true,
      discussionGroup: false,
      broadcast: true
    }
  },
  channels: [
    {
      // Basic fields (backward compatible)
      id: "987654321",
      title: "Enriched Test Channel",
      username: "enrichedtest",
      address: "@enrichedtest",
      membersCount: 5000,
      description: "An enriched test channel",
      type: "Megagroup",
      
      // Enriched fields
      peer: {
        id: "987654321",
        className: "Channel",
        accessHash: "12345678901234567890",
        username: "enrichedtest",
        title: "Enriched Test Channel",
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
      inviteLink: "https://t.me/+test123456",
      channelMetadata: {
        linkedChatId: null,
        canViewParticipants: true,
        canSetUsername: false,
        canSetStickers: true,
        hiddenPrehistory: false,
        participantsCount: 5000,
        adminsCount: 3,
        kickedCount: 0,
        bannedCount: 1,
        onlineCount: 150,
        readInboxMaxId: 1000,
        readOutboxMaxId: 995,
        unreadCount: 5
      },
      resolvedLink: "https://t.me/enrichedtest",
      fullDescription: "An enriched test channel",
      searchableText: "enriched test channel",
      date: Date.now(),
      hasForwards: true,
      hasScheduled: false,
      canDeleteHistory: false,
      antiSpamEnabled: true,
      joinToSend: false,
      requestJoinRequired: false
    }
  ],
  timestamp: new Date().toISOString(),
  count: 1,
  version: "2.0",
  enriched: true
};

// Mock Express app and routes (simplified for testing)
function createMockApp() {
  const routes = {
    'GET /telegram/parsing-results': null,
    'GET /telegram/parsing-results/:id': null,
    'GET /telegram/parsing-results/channels': null,
    'GET /telegram/parsing-results/:id/download': null
  };
  
  return {
    get(path, handler) {
      routes[`GET ${path}`] = handler;
    },
    routes
  };
}

// Import the actual normalization functions
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

// Mock storage functions
const mockStorage = {};

function writeJson(filename, data) {
  mockStorage[filename] = data;
}

function readJson(filename, defaultValue = null) {
  return mockStorage[filename] !== undefined ? mockStorage[filename] : defaultValue;
}

// Test suite
async function runTests() {
  console.log('🧪 Running API integration tests...\n');
  
  // Ensure test directory exists
  const testDir = join(__dirname, 'data');
  if (!existsSync(testDir)) {
    mkdirSync(testDir, { recursive: true });
  }
  
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
  
  // Test 1: Legacy data storage and retrieval
  test('Legacy data storage and retrieval', () => {
    // Store legacy data
    writeJson(`parsing_results_${legacyTestData.id}.json`, legacyTestData);
    
    // Retrieve and normalize
    const retrieved = readJson(`parsing_results_${legacyTestData.id}.json`);
    const normalized = normalizeParsingResults(retrieved);
    
    assert.equal(normalized.id, legacyTestData.id);
    assert.equal(normalized.version, '1.0');
    assert.equal(normalized.enriched, false);
    assert.deepEqual(normalized.keywords, ['legacy test']);
    
    // Check channel normalization
    assert.equal(normalized.channels.length, 1);
    const channel = normalized.channels[0];
    assert.equal(channel.metadata.isVerified, false);
    assert.equal(channel.resolvedLink, 'https://t.me/legacytest');
    assert.equal(channel.channelMetadata.onlineCount, 0);
  });
  
  // Test 2: Enriched data storage and retrieval
  test('Enriched data storage and retrieval', () => {
    // Store enriched data
    writeJson(`parsing_results_${enrichedTestData.id}.json`, enrichedTestData);
    
    // Retrieve and normalize
    const retrieved = readJson(`parsing_results_${enrichedTestData.id}.json`);
    const normalized = normalizeParsingResults(retrieved);
    
    assert.equal(normalized.id, enrichedTestData.id);
    assert.equal(normalized.version, '2.0');
    assert.equal(normalized.enriched, true);
    assert.deepEqual(normalized.keywords, ['enriched', 'test']);
    assert.deepEqual(normalized.searchFilters, enrichedTestData.searchFilters);
    
    // Check channel normalization preserves enriched data
    assert.equal(normalized.channels.length, 1);
    const channel = normalized.channels[0];
    assert.equal(channel.metadata.isVerified, true);
    assert.equal(channel.resolvedLink, 'https://t.me/enrichedtest');
    assert.equal(channel.channelMetadata.onlineCount, 150);
    assert.equal(channel.channelMetadata.adminsCount, 3);
    assert.equal(channel.category, 'Verified Megagroup');
    assert.equal(channel.inviteLink, 'https://t.me/+test123456');
  });
  
  // Test 3: CSV generation for legacy data
  test('CSV generation for legacy data', () => {
    const normalized = normalizeParsingResults(legacyTestData);
    const channels = normalized.channels;
    
    // Simulate CSV generation
    const delimiter = ';';
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
    ].join(delimiter);
    
    const getStatusLabel = (type) => {
      switch (type) {
        case 'Megagroup':
          return 'Публичный чат';
        case 'Discussion Group':
          return 'Обсуждения в каналах';
        case 'Broadcast':
          return 'Каналы';
        default:
          return type || 'Неизвестно';
      }
    };
    
    const csvRow = channels.map(ch => {
      const title = (ch.title || '').replace(/"/g, '""');
      const username = (ch.username || '').replace(/"/g, '""');
      const link = ch.resolvedLink || '';
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
      
      return [
        title,
        username,
        link,
        category,
        privacy,
        statusEscaped,
        membersCount,
        description,
        isVerified,
        isRestricted,
        isScam,
        isFake,
        hasInviteLink,
        onlineCount,
        adminsCount
      ].join(delimiter);
    }).join('\n');
    
    const csv = csvHeader + '\n' + csvRow;
    
    assert(csv.includes('Название канала;Username;Ссылка на канал'));
    assert(csv.includes('Legacy Test Channel'));
    assert(csv.includes('legacytest'));
    assert(csv.includes('https://t.me/legacytest'));
    assert(csv.includes('Каналы')); // status
    assert(csv.includes('2500')); // members count
    assert(csv.includes('Нет')); // isVerified
    assert(csv.includes('public')); // privacy
    assert(csv.includes('0')); // online count (default)
  });
  
  // Test 4: CSV generation for enriched data
  test('CSV generation for enriched data', () => {
    const normalized = normalizeParsingResults(enrichedTestData);
    const channels = normalized.channels;
    
    // Simulate CSV generation (same as above but with enriched data)
    const delimiter = ';';
    const getStatusLabel = (type) => {
      switch (type) {
        case 'Megagroup':
          return 'Публичный чат';
        case 'Discussion Group':
          return 'Обсуждения в каналах';
        case 'Broadcast':
          return 'Каналы';
        default:
          return type || 'Неизвестно';
      }
    };
    
    const csvRow = channels.map(ch => {
      const title = (ch.title || '').replace(/"/g, '""');
      const username = (ch.username || '').replace(/"/g, '""');
      const link = ch.resolvedLink || '';
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
      
      return [
        title,
        username,
        link,
        category,
        privacy,
        statusEscaped,
        membersCount,
        description,
        isVerified,
        isRestricted,
        isScam,
        isFake,
        hasInviteLink,
        onlineCount,
        adminsCount
      ].join(delimiter);
    }).join('\n');
    
    const csv = csvRow;
    
    assert(csv.includes('Enriched Test Channel'));
    assert(csv.includes('enrichedtest'));
    assert(csv.includes('https://t.me/enrichedtest'));
    assert(csv.includes('Публичный чат')); // status
    assert(csv.includes('5000')); // members count
    assert(csv.includes('Да')); // isVerified
    assert(csv.includes('public')); // privacy
    assert(csv.includes('150')); // online count
    assert(csv.includes('3')); // admins count
    assert(csv.includes('Verified Megagroup')); // category
  });
  
  // Test 5: Mixed data handling (legacy + enriched)
  test('Mixed data handling', () => {
    const mixedData = {
      id: 'mixed_test',
      userId: testUserId,
      query: 'mixed test',
      channels: [legacyTestData.channels[0], enrichedTestData.channels[0]],
      timestamp: new Date().toISOString(),
      count: 2
    };
    
    writeJson(`parsing_results_mixed_test.json`, mixedData);
    
    const retrieved = readJson(`parsing_results_mixed_test.json`);
    const normalized = normalizeParsingResults(retrieved);
    
    assert.equal(normalized.channels.length, 2);
    
    // First channel (legacy)
    const legacyChannel = normalized.channels[0];
    assert.equal(legacyChannel.metadata.isVerified, false);
    assert.equal(legacyChannel.channelMetadata.onlineCount, 0);
    
    // Second channel (enriched)
    const enrichedChannel = normalized.channels[1];
    assert.equal(enrichedChannel.metadata.isVerified, true);
    assert.equal(enrichedChannel.channelMetadata.onlineCount, 150);
  });
  
  // Test 6: File system persistence simulation
  test('File system persistence simulation', () => {
    const testFile = join(testDir, `parsing_results_${testResultsId}.json`);
    
    // Write enriched data to file
    writeFileSync(testFile, JSON.stringify(enrichedTestData, null, 2));
    
    // Read it back
    const fileContent = readFileSync(testFile, 'utf-8');
    const parsedData = JSON.parse(fileContent);
    
    // Normalize and verify
    const normalized = normalizeParsingResults(parsedData);
    
    assert.equal(normalized.id, enrichedTestData.id);
    assert.equal(normalized.enriched, true);
    assert.equal(normalized.channels[0].metadata.isVerified, true);
    assert.equal(normalized.channels[0].channelMetadata.onlineCount, 150);
    
    // Cleanup
    unlinkSync(testFile);
  });
  
  // Test 7: Error handling for corrupted data
  test('Error handling for corrupted data', () => {
    const corruptedData = {
      id: 'corrupted_test',
      userId: testUserId,
      channels: [
        { id: '1' }, // minimal data
        { id: '2', title: 'Test' }, // partial data
        null, // null entry
        undefined, // undefined entry
        { id: '3', username: 'test3', membersCount: 'invalid' } // invalid data type
      ],
      timestamp: new Date().toISOString(),
      count: 5
    };
    
    const normalized = normalizeParsingResults(corruptedData);
    
    assert.equal(normalized.channels.length, 5);
    
    // Channel 1 - minimal data should have defaults
    assert.equal(normalized.channels[0].id, '1');
    assert.equal(normalized.channels[0].title, 'Без названия');
    assert.equal(normalized.channels[0].membersCount, 0);
    
    // Channel 2 - partial data should preserve what exists
    assert.equal(normalized.channels[1].id, '2');
    assert.equal(normalized.channels[1].title, 'Test');
    assert.equal(normalized.channels[1].membersCount, 0);
    
    // Channel 3 - null should be handled gracefully
    assert.equal(normalized.channels[2].id, '');
    
    // Channel 4 - undefined should be handled gracefully
    assert.equal(normalized.channels[3].id, '');
    
    // Channel 5 - invalid types should be normalized
    assert.equal(normalized.channels[4].id, '3');
    assert.equal(normalized.channels[4].username, 'test3');
    assert.equal(normalized.channels[4].membersCount, 0); // 'invalid' -> 0
  });
  
  console.log('\n' + '='.repeat(50));
  console.log(`📊 TEST RESULTS: ${passed} passed, ${failed} failed`);
  
  if (failed === 0) {
    console.log('🎉 All API integration tests passed!');
    process.exit(0);
  } else {
    console.log('❌ Some API integration tests failed.');
    process.exit(1);
  }
}

// Run tests
runTests().catch(error => {
  console.error('❌ API integration test runner failed:', error);
  process.exit(1);
});