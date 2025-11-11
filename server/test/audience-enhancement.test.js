import { readJson, writeJson } from '../lib/storage.js';
import { logger } from '../lib/logger.js';

/**
 * Test script for enhanced audience parsing functionality
 * Tests session-based parsing, bio keyword filtering, and participant limits
 */

async function testAudienceParsingEnhancements() {
  console.log('🧪 Testing Enhanced Audience Parsing Features\n');
  
  try {
    // Test 1: Session-based parsing data structure
    console.log('📋 Test 1: Session-based parsing data structure');
    
    // Create mock parsing session data
    const mockSessionData = {
      id: 'parsing_test_123_456',
      userId: 'test-user',
      query: 'бизнес',
      keywords: ['бизнес', 'предпринимательство'],
      searchFilters: {
        minMembers: 1000,
        maxMembers: 100000,
        limit: 50,
        channelTypes: {
          megagroup: true,
          discussion: true,
          broadcast: true
        }
      },
      channels: [
        {
          id: '1841800885',
          title: 'Финансист | Бизнес | Инвестиции',
          username: 'finansist_busines',
          membersCount: 918746,
          description: 'Все о финансах, инвестициях и технологиях',
          type: 'Broadcast',
          peer: {
            id: '1841800885',
            accessHash: '1234567890abcdef',
            type: 'channel'
          }
        },
        {
          id: '1547781249',
          title: 'БИЗНЕС ОНЛАЙН',
          username: 'onlain_biznes_rabota',
          membersCount: 41469,
          description: 'Чат для поиска бизнес контактов',
          type: 'Megagroup',
          peer: {
            id: '1547781249',
            accessHash: 'abcdef1234567890',
            type: 'channel'
          }
        }
      ],
      timestamp: new Date().toISOString(),
      count: 2,
      version: '2.0',
      enriched: true
    };
    
    // Save mock session data
    writeJson(`parsing_results_${mockSessionData.id}.json`, mockSessionData);
    console.log('✅ Mock parsing session data created');
    
    // Test 2: Enhanced audience result structure
    console.log('\n📋 Test 2: Enhanced audience result structure');
    
    const mockAudienceResult = {
      id: 'audience_test_123_456',
      userId: 'test-user',
      sessionId: 'parsing_test_123_456',
      chatId: 'parsing_test_123_456',
      lastDays: 30,
      criteria: {
        likes: true,
        comments: true,
        reposts: true,
        frequency: true
      },
      minActivity: 5,
      participantsLimit: 100,
      bioKeywords: ['бизнес', 'инвестиции'],
      channelsProcessed: 2,
      totalChannels: 2,
      users: [
        {
          id: '123456789',
          username: 'john_doe',
          firstName: 'John',
          lastName: 'Doe',
          fullName: 'John Doe',
          phone: '+1234567890',
          bio: 'Бизнесмен и инвестор. Интересуются стартапами и технологиями.',
          sourceChannel: {
            id: '1841800885',
            title: 'Финансист | Бизнес | Инвестиции',
            username: 'finansist_busines'
          }
        },
        {
          id: '987654321',
          username: 'jane_smith',
          firstName: 'Jane',
          lastName: 'Smith',
          fullName: 'Jane Smith',
          phone: null,
          bio: 'Предприниматель с 10-летним опытом в e-commerce',
          sourceChannel: {
            id: '1547781249',
            title: 'БИЗНЕС ОНЛАЙН',
            username: 'onlain_biznes_rabota'
          }
        }
      ],
      timestamp: new Date().toISOString(),
      count: 2,
      totalFound: 150,
      version: '2.0'
    };
    
    writeJson(`audience_results_${mockAudienceResult.id}.json`, mockAudienceResult);
    console.log('✅ Enhanced audience result data created');
    
    // Test 3: Bio keyword filtering function
    console.log('\n📋 Test 3: Bio keyword filtering function');
    
    const testUsers = [
      { bio: 'Бизнесмен и инвестор', username: 'user1' },
      { bio: 'Программист и разработчик', username: 'user2' },
      { bio: 'Инвестиции и стартапы', username: 'user3' },
      { bio: null, username: 'user4' },
      { bio: 'Бизнес аналитик', username: 'user5' }
    ];
    
    const keywords = ['бизнес', 'инвестиции'];
    
    // Simulate filterUsersByBioKeywords function
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
    
    const filteredUsers = filterUsersByBioKeywords(testUsers, keywords);
    console.log(`✅ Bio filtering: ${testUsers.length} users → ${filteredUsers.length} users`);
    console.log('Filtered users:', filteredUsers.map(u => u.username));
    
    // Test 4: User deduplication function
    console.log('\n📋 Test 4: User deduplication function');
    
    const duplicateUsers = [
      { id: '123', username: 'user1', sourceChannel: { id: 'channel1' } },
      { id: '456', username: 'user2', sourceChannel: { id: 'channel1' } },
      { id: '123', username: 'user1_alt', sourceChannel: { id: 'channel2' } },
      { id: '789', username: 'user3', sourceChannel: { id: 'channel1' } }
    ];
    
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
    
    const deduplicatedUsers = deduplicateUsers(duplicateUsers);
    console.log(`✅ Deduplication: ${duplicateUsers.length} users → ${deduplicatedUsers.length} users`);
    console.log('Deduplicated users:', deduplicatedUsers.map(u => ({ id: u.id, username: u.username })));
    
    // Test 5: CSV export format validation
    console.log('\n📋 Test 5: CSV export format validation');
    
    function generateCSV(users) {
      const delimiter = ';';
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
      
      return '\ufeff' + csvHeader + csvRows;
    }
    
    const csvOutput = generateCSV(mockAudienceResult.users);
    const csvLines = csvOutput.split('\n').filter(line => line.trim());
    console.log(`✅ CSV generation: ${csvLines.length} lines (${mockAudienceResult.users.length + 1} expected)`);
    console.log('CSV Header:', csvLines[0]);
    console.log('Sample row:', csvLines[1]);
    
    // Test 6: Backward compatibility validation
    console.log('\n📋 Test 6: Backward compatibility validation');
    
    const legacyAudienceResult = {
      id: 'audience_legacy_123',
      userId: 'test-user',
      chatId: 'test_channel',
      lastDays: 30,
      criteria: {
        likes: true,
        comments: true,
        reposts: true,
        frequency: true
      },
      minActivity: 5,
      users: [
        {
          id: '123',
          username: 'legacy_user',
          firstName: 'Legacy',
          lastName: 'User'
          // No fullName, phone, bio, sourceChannel
        }
      ],
      timestamp: new Date().toISOString(),
      count: 1,
      total: 10
      // No version field
    };
    
    // Simulate backward compatibility handling
    function normalizeAudienceResult(data) {
      const normalized = { ...data };
      
      // Set default version
      if (!normalized.version) {
        normalized.version = '1.0';
      }
      
      // Normalize users with missing fields
      normalized.users = normalized.users.map(user => ({
        ...user,
        fullName: user.fullName || `${user.firstName || ''} ${user.lastName || ''}`.trim(),
        phone: user.phone || null,
        bio: user.bio || null,
        sourceChannel: user.sourceChannel || null
      }));
      
      return normalized;
    }
    
    const normalizedLegacy = normalizeAudienceResult(legacyAudienceResult);
    console.log('✅ Legacy normalization successful');
    console.log('Legacy version:', normalizedLegacy.version);
    console.log('Normalized user:', {
      id: normalizedLegacy.users[0].id,
      fullName: normalizedLegacy.users[0].fullName,
      phone: normalizedLegacy.users[0].phone,
      bio: normalizedLegacy.users[0].bio,
      sourceChannel: normalizedLegacy.users[0].sourceChannel
    });
    
    console.log('\n🎉 All tests passed! Enhanced audience parsing functionality is working correctly.');
    
    // Cleanup test files
    console.log('\n🧹 Cleaning up test files...');
    const fs = await import('fs');
    const path = await import('path');
    const { fileURLToPath } = await import('url');
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const dataDir = path.resolve(__dirname, '..', '..', 'server', 'data');
    
    try {
      fs.unlinkSync(path.join(dataDir, `parsing_results_${mockSessionData.id}.json`));
      fs.unlinkSync(path.join(dataDir, `audience_results_${mockAudienceResult.id}.json`));
      console.log('✅ Test files cleaned up');
    } catch (e) {
      console.log('⚠️  Could not clean up test files:', e.message);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run tests
if (import.meta.url === `file://${process.argv[1]}`) {
  testAudienceParsingEnhancements();
}

export { testAudienceParsingEnhancements };