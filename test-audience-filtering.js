/**
 * Test script for audience filtering (closed profiles and bots)
 * Tests the new filterClosedProfiles() and filterBots() functions
 */

console.log('🧪 Testing Audience Filtering Functions\n');

// Mock filtering functions (same as in telegram.js)
function filterClosedProfiles(users) {
  return users.filter(user => {
    const username = user.username;
    return username && typeof username === 'string' && username.trim() !== '';
  });
}

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

// Test data
const testUsers = [
  { id: '1', username: 'john_doe', firstName: 'John', bio: 'Regular user' },
  { id: '2', username: null, firstName: 'Jane', bio: 'Closed profile' },
  { id: '3', username: '', firstName: 'Bob', bio: 'Empty username' },
  { id: '4', username: 'test_bot', firstName: 'Test', bio: 'Bot account' },
  { id: '5', username: 'mybot', firstName: 'My', bio: 'Another bot' },
  { id: '6', username: 'normal_user', firstName: 'Normal', bio: 'Normal user', bot: false },
  { id: '7', username: 'service_bot', firstName: 'Service', bio: 'Service bot', bot: true },
  { id: '8', username: 'alice', firstName: 'Alice', bio: 'Regular user' },
  { id: '9', username: '   ', firstName: 'Whitespace', bio: 'Whitespace username' },
  { id: '10', username: 'BotMaster', firstName: 'Bot Master', bio: 'User with bot in name (should NOT be filtered)' },
  { id: '11', username: 'chatbot', firstName: 'Chat', bio: 'Username ends with bot' },
];

console.log('📋 Test 1: Filter closed profiles (users without username)');
console.log(`Total users: ${testUsers.length}`);

const withUsername = filterClosedProfiles(testUsers);
console.log(`After filtering: ${withUsername.length} users`);
console.log(`Filtered out: ${testUsers.length - withUsername.length} users`);
console.log('Remaining users:', withUsername.map(u => `${u.username} (${u.firstName})`));

console.log('\n📋 Test 2: Filter bots');
console.log(`Total users with username: ${withUsername.length}`);

const nonBots = filterBots(withUsername);
console.log(`After filtering: ${nonBots.length} users`);
console.log(`Filtered out: ${withUsername.length - nonBots.length} bots`);
console.log('Remaining users:', nonBots.map(u => `${u.username} (${u.firstName})`));

console.log('\n📋 Test 3: Combined filtering (closed profiles + bots)');
const filteredUsers = filterBots(filterClosedProfiles(testUsers));
console.log(`Total users: ${testUsers.length}`);
console.log(`After all filters: ${filteredUsers.length} users`);
console.log(`Total filtered out: ${testUsers.length - filteredUsers.length} users`);
console.log('Final users:', filteredUsers.map(u => `${u.username} (${u.firstName})`));

// Validate expected results
console.log('\n✅ Validation:');

const expectedFiltered = ['john_doe', 'normal_user', 'alice', 'BotMaster'];
const actualFiltered = filteredUsers.map(u => u.username);

const missingUsers = expectedFiltered.filter(u => !actualFiltered.includes(u));
const unexpectedUsers = actualFiltered.filter(u => !expectedFiltered.includes(u));

if (missingUsers.length === 0 && unexpectedUsers.length === 0) {
  console.log('✅ All tests passed! Filtering works correctly.');
  console.log(`✅ ${filteredUsers.length} users remain after filtering (expected: ${expectedFiltered.length})`);
} else {
  console.error('❌ Tests failed!');
  if (missingUsers.length > 0) {
    console.error('Missing users:', missingUsers);
  }
  if (unexpectedUsers.length > 0) {
    console.error('Unexpected users:', unexpectedUsers);
  }
  process.exit(1);
}

console.log('\n📊 Filtering Summary:');
console.log(`- Closed profiles filtered: ${testUsers.length - withUsername.length}`);
console.log(`- Bots filtered: ${withUsername.length - nonBots.length}`);
console.log(`- Total filtered: ${testUsers.length - filteredUsers.length}`);
console.log(`- Remaining users: ${filteredUsers.length}`);
console.log(`- Filtering rate: ${Math.round((testUsers.length - filteredUsers.length) / testUsers.length * 100)}%`);

console.log('\n🎉 Audience filtering test completed successfully!');
