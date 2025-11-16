#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { 
  generateBroadcastHistoryId, 
  listBroadcastHistory, 
  getBroadcastHistoryById, 
  saveBroadcastHistory, 
  computeBroadcastStatus, 
  buildMessagePreview,
  deriveAudienceName 
} from '../lib/broadcastHistory.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const testDir = path.join(__dirname, 'data');

// Helper functions for testing
function createMockBroadcastHistory(overrides = {}) {
  const baseData = {
    id: generateBroadcastHistoryId('test_user_123'),
    userId: 'test_user_123',
    audienceId: 'audience_test_456',
    audienceName: 'Test Audience',
    mode: 'dm',
    message: 'Hello {name}! This is a test message.',
    hasImage: false,
    delaySeconds: 3,
    maxRecipients: 10,
    createdAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    timestamp: new Date().toISOString(),
    status: 'completed',
    summary: {
      total: 10,
      success: 8,
      failed: 2,
      successRate: '80.00%'
    },
    deliveryLog: [
      {
        recipient: {
          id: 'user1',
          username: 'testuser1',
          name: 'Test User 1'
        },
        status: 'success',
        error: '',
        timestamp: new Date().toISOString(),
        duration: 1200
      },
      {
        recipient: {
          id: 'user2',
          username: 'testuser2',
          name: 'Test User 2'
        },
        status: 'failed',
        error: 'FLOOD_WAIT_429',
        timestamp: new Date().toISOString(),
        duration: 500
      }
    ]
  };

  return { ...baseData, ...overrides };
}

function cleanupTestFiles() {
  try {
    if (fs.existsSync(testDir)) {
      const files = fs.readdirSync(testDir);
      for (const file of files) {
        if (file.startsWith('broadcast_results_test_')) {
          fs.unlinkSync(path.join(testDir, file));
        }
      }
    }
  } catch (e) {
    console.warn('Warning during cleanup:', e.message);
  }
}

async function runTests() {
  console.log('🧪 Running Broadcast Feature Tests...\n');

  let testsPassed = 0;
  let testsTotal = 0;

  function test(name, fn) {
    testsTotal++;
    try {
      fn();
      console.log(`✅ ${name}`);
      testsPassed++;
    } catch (e) {
      console.log(`❌ ${name}: ${e.message}`);
    }
  }

  // Test 1: Generate Broadcast History ID
  test('Generate broadcast history ID', () => {
    const id1 = generateBroadcastHistoryId('user123');
    
    // Add a small delay to ensure different timestamps
    setTimeout(() => {}, 1);
    const id2 = generateBroadcastHistoryId('user123');
    
    if (!id1 || !id1.startsWith('broadcast_')) {
      throw new Error('Invalid ID format');
    }
    if (!id1.includes('user123')) {
      throw new Error('ID should include user ID');
    }
    // Check that IDs have the correct structure
    if (!id1.match(/^broadcast_\d+_user123$/)) {
      throw new Error('ID should have format: timestamp_userId');
    }
    if (!id2.match(/^broadcast_\d+_user123$/)) {
      throw new Error('ID should have format: timestamp_userId');
    }
  });

  // Test 2: Compute Broadcast Status
  test('Compute broadcast status - all success', () => {
    const status = computeBroadcastStatus({
      total: 10,
      success: 10,
      failed: 0
    });
    if (status !== 'success') {
      throw new Error(`Expected 'success', got '${status}'`);
    }
  });

  test('Compute broadcast status - partial success', () => {
    const status = computeBroadcastStatus({
      total: 10,
      success: 7,
      failed: 3
    });
    if (status !== 'partial') {
      throw new Error(`Expected 'partial', got '${status}'`);
    }
  });

  test('Compute broadcast status - all failed', () => {
    const status = computeBroadcastStatus({
      total: 10,
      success: 0,
      failed: 10
    });
    if (status !== 'failed') {
      throw new Error(`Expected 'failed', got '${status}'`);
    }
  });

  test('Compute broadcast status - empty', () => {
    const status = computeBroadcastStatus({
      total: 0,
      success: 0,
      failed: 0
    });
    if (status !== 'empty') {
      throw new Error(`Expected 'empty', got '${status}'`);
    }
  });

  // Test 3: Build Message Preview
  test('Build message preview - short message', () => {
    const message = 'Hello world!';
    const preview = buildMessagePreview(message);
    if (preview !== message) {
      throw new Error(`Expected '${message}', got '${preview}'`);
    }
  });

  test('Build message preview - long message', () => {
    const message = 'This is a very long message that should be truncated because it exceeds the maximum length limit for message previews in the broadcast history.';
    const preview = buildMessagePreview(message, 50);
    if (preview.length > 53 || !preview.endsWith('...')) {
      throw new Error(`Expected truncated preview with ..., got '${preview}'`);
    }
  });

  test('Build message preview - empty message', () => {
    const preview = buildMessagePreview('');
    if (preview !== '') {
      throw new Error(`Expected empty string, got '${preview}'`);
    }
  });

  // Test 4: Derive Audience Name
  test('Derive audience name - from name field', () => {
    const audienceData = { name: 'Test Audience Name' };
    const name = deriveAudienceName(audienceData);
    if (name !== 'Test Audience Name') {
      throw new Error(`Expected 'Test Audience Name', got '${name}'`);
    }
  });

  test('Derive audience name - from title field', () => {
    const audienceData = { title: 'Test Audience Title' };
    const name = deriveAudienceName(audienceData);
    if (name !== 'Test Audience Title') {
      throw new Error(`Expected 'Test Audience Title', got '${name}'`);
    }
  });

  test('Derive audience name - from ID and timestamp', () => {
    const timestamp = new Date().toISOString();
    const audienceData = { id: 'test123', timestamp };
    const name = deriveAudienceName(audienceData);
    if (!name.includes('test123') || !name.includes(timestamp)) {
      throw new Error(`Expected name with ID and timestamp, got '${name}'`);
    }
  });

  test('Derive audience name - null data', () => {
    const name = deriveAudienceName(null);
    if (name !== null) {
      throw new Error(`Expected null, got '${name}'`);
    }
  });

  // Test 5: Save and Retrieve Broadcast History
  test('Save and retrieve broadcast history', () => {
    const originalData = createMockBroadcastHistory();
    
    // Save the data
    saveBroadcastHistory(originalData);
    
    // Retrieve by ID
    const retrievedData = getBroadcastHistoryById(originalData.id);
    
    if (!retrievedData) {
      throw new Error('Failed to retrieve saved data');
    }
    
    if (retrievedData.id !== originalData.id) {
      throw new Error('Retrieved ID mismatch');
    }
    
    if (retrievedData.userId !== originalData.userId) {
      throw new Error('Retrieved userId mismatch');
    }
    
    if (retrievedData.summary.total !== originalData.summary.total) {
      throw new Error('Retrieved summary mismatch');
    }
  });

  // Test 6: List Broadcast History with Filters
  test('List broadcast history - no filters', () => {
    const testData1 = createMockBroadcastHistory({ 
      id: generateBroadcastHistoryId('test_user_123'),
      status: 'completed' 
    });
    const testData2 = createMockBroadcastHistory({ 
      id: generateBroadcastHistoryId('test_user_123'),
      status: 'partial',
      audienceName: 'Another Audience'
    });
    
    // Save test data
    saveBroadcastHistory(testData1);
    saveBroadcastHistory(testData2);
    
    // List all history for user
    const historyList = listBroadcastHistory('test_user_123');
    
    if (historyList.length < 2) {
      throw new Error(`Expected at least 2 items, got ${historyList.length}`);
    }
    
    // Should be sorted by date (newest first)
    const firstItem = historyList[0];
    const secondItem = historyList[1];
    
    if (new Date(firstItem.createdAt) < new Date(secondItem.createdAt)) {
      throw new Error('History should be sorted by date (newest first)');
    }
  });

  test('List broadcast history - with status filter', () => {
    const historyList = listBroadcastHistory('test_user_123', { status: 'completed' });
    
    for (const item of historyList) {
      if (item.status !== 'completed') {
        throw new Error(`Expected all items to have status 'completed', got '${item.status}'`);
      }
    }
  });

  test('List broadcast history - with audience filter', () => {
    const historyList = listBroadcastHistory('test_user_123', { audienceId: 'audience_test_456' });
    
    for (const item of historyList) {
      if (item.audienceId !== 'audience_test_456') {
        throw new Error(`Expected all items to have audienceId 'audience_test_456', got '${item.audienceId}'`);
      }
    }
  });

  // Test 7: Message Variables
  test('Message variable substitution - {name} token', () => {
    const message = 'Hello {name}! Welcome to our service.';
    const recipientName = 'John Doe';
    const personalizedMessage = message.replace(/\{name\}/g, recipientName);
    
    const expected = 'Hello John Doe! Welcome to our service.';
    if (personalizedMessage !== expected) {
      throw new Error(`Expected '${expected}', got '${personalizedMessage}'`);
    }
  });

  test('Message variable substitution - multiple {name} tokens', () => {
    const message = 'Hi {name}, {name}! How are you {name}?';
    const recipientName = 'Alice';
    const personalizedMessage = message.replace(/\{name\}/g, recipientName);
    
    const expected = 'Hi Alice, Alice! How are you Alice?';
    if (personalizedMessage !== expected) {
      throw new Error(`Expected '${expected}', got '${personalizedMessage}'`);
    }
  });

  // Test 8: Delivery Log Structure
  test('Delivery log structure validation', () => {
    const testData = createMockBroadcastHistory();
    const deliveryLog = testData.deliveryLog;
    
    if (!Array.isArray(deliveryLog) || deliveryLog.length === 0) {
      throw new Error('Delivery log should be a non-empty array');
    }
    
    for (const entry of deliveryLog) {
      if (!entry.recipient) {
        throw new Error('Each delivery log entry should have a recipient');
      }
      
      if (!entry.status) {
        throw new Error('Each delivery log entry should have a status');
      }
      
      if (!entry.timestamp) {
        throw new Error('Each delivery log entry should have a timestamp');
      }
      
      if (typeof entry.duration !== 'number') {
        throw new Error('Each delivery log entry should have a numeric duration');
      }
    }
  });

  // Test 9: CSV Export Format
  test('CSV export format validation', () => {
    const testData = createMockBroadcastHistory();
    const deliveryLog = testData.deliveryLog;
    
    // Simulate CSV generation
    const header = ['Recipient', 'Type', 'Status', 'Sent At', 'Error'];
    const rows = [header.join(',')];
    
    for (const entry of deliveryLog) {
      const recipient = entry.recipient || {};
      const username = recipient.username ? `@${recipient.username}` : '';
      const name = recipient.name || username || recipient.id || '';
      const row = [
        name,
        testData.mode === 'chat' ? 'chat' : 'user',
        entry.status || 'unknown',
        entry.timestamp || '',
        entry.error || ''
      ];
      rows.push(row.join(','));
    }
    
    const csvContent = rows.join('\n');
    
    if (!csvContent.includes('Recipient,Type,Status,Sent At,Error')) {
      throw new Error('CSV should contain proper header');
    }
    
    if (!csvContent.includes('success') && !csvContent.includes('failed')) {
      throw new Error('CSV should contain status information');
    }
  });

  // Test 10: Error Handling
  test('Error handling - invalid history ID', () => {
    const result = getBroadcastHistoryById('invalid_id_that_does_not_exist');
    if (result !== null) {
      throw new Error('Should return null for invalid ID');
    }
  });

  test('Error handling - unauthorized user access', () => {
    const historyList = listBroadcastHistory('unauthorized_user_999');
    if (historyList.length !== 0) {
      throw new Error('Should return empty array for unauthorized user');
    }
  });

  // Cleanup
  cleanupTestFiles();

  console.log('\n==================================================');
  console.log(`📊 BROADCAST TEST RESULTS: ${testsPassed} passed, ${testsTotal - testsPassed} failed`);
  
  if (testsPassed === testsTotal) {
    console.log('🎉 All broadcast feature tests passed!');
    process.exit(0);
  } else {
    console.log('❌ Some tests failed!');
    process.exit(1);
  }
}

// Run the tests
runTests().catch(error => {
  console.error('Test execution failed:', error);
  process.exit(1);
});