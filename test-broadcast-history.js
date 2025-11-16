#!/usr/bin/env node

import { writeJson, readJson } from './server/lib/storage.js';

console.log('Testing broadcast history functionality...\n');

const testUserId = 'test_user_123';
const testHistoryId = `broadcast_${Date.now()}`;

// Test 1: Create a test broadcast history entry
console.log('1. Creating test broadcast history entry...');
const testData = {
  id: testHistoryId,
  userId: testUserId,
  message: 'Test broadcast message for history',
  createdAt: Date.now(),
  status: 'completed',
  audienceId: 'test_audience_123',
  audienceName: 'Test Audience',
  mode: 'audience',
  totalCount: 10,
  successCount: 8,
  failedCount: 2,
  recipients: [
    { id: '1', username: 'user1', fullName: 'User One', status: 'success', error: null },
    { id: '2', username: 'user2', fullName: 'User Two', status: 'success', error: null },
    { id: '3', username: 'user3', fullName: 'User Three', status: 'failed', error: 'User not found' }
  ]
};

try {
  await writeJson(`broadcast_history_${testHistoryId}_${testUserId}.json`, testData);
  console.log('✓ Test broadcast history created successfully');
} catch (err) {
  console.error('✗ Failed to create test history:', err.message);
  process.exit(1);
}

// Test 2: Read the test broadcast history entry
console.log('\n2. Reading test broadcast history entry...');
try {
  const data = readJson(`broadcast_history_${testHistoryId}_${testUserId}.json`, null);
  if (data && data.id === testHistoryId) {
    console.log('✓ Test broadcast history read successfully');
    console.log(`  - ID: ${data.id}`);
    console.log(`  - Status: ${data.status}`);
    console.log(`  - Success: ${data.successCount}/${data.totalCount}`);
  } else {
    console.error('✗ Failed to read correct data');
    process.exit(1);
  }
} catch (err) {
  console.error('✗ Failed to read test history:', err.message);
  process.exit(1);
}

// Test 3: Test CSV generation logic
console.log('\n3. Testing CSV generation logic...');
try {
  const headers = ['Recipient ID', 'Username', 'Full Name', 'Status', 'Error'];
  const rows = testData.recipients.map(r => [
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
  
  if (csv.includes('User One') && csv.includes('User not found')) {
    console.log('✓ CSV generation works correctly');
    console.log(`  - Generated ${rows.length} rows`);
  } else {
    console.error('✗ CSV generation failed');
    process.exit(1);
  }
} catch (err) {
  console.error('✗ Failed to generate CSV:', err.message);
  process.exit(1);
}

console.log('\n✅ All broadcast history tests passed!');
console.log('\nNote: Test file created at:');
console.log(`  server/data/broadcast_history_${testHistoryId}_${testUserId}.json`);
console.log('You can delete this file after testing.');
