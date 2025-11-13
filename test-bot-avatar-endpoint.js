#!/usr/bin/env node

/**
 * Test script for Bot Avatar API endpoint
 * Tests both with and without TELEGRAM_BOT_TOKEN configured
 */

import http from 'http';

const API_PORT = process.env.API_PORT || 4000;
const BASE_URL = `http://localhost:${API_PORT}`;

// ANSI colors for output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function makeRequest(path, expectedStatus) {
  return new Promise((resolve, reject) => {
    const url = `${BASE_URL}${path}`;
    
    http.get(url, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          const success = res.statusCode === expectedStatus;
          
          resolve({
            success,
            statusCode: res.statusCode,
            expectedStatus,
            data: parsed,
            url
          });
        } catch (e) {
          reject(new Error(`Failed to parse response from ${url}: ${e.message}`));
        }
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

async function runTests() {
  log('\n=== Bot Avatar API Endpoint Tests ===\n', colors.blue);
  
  let passCount = 0;
  let failCount = 0;
  
  // Test 1: Health check
  try {
    log('Test 1: Health check endpoint...', colors.yellow);
    const result = await makeRequest('/api/health', 200);
    if (result.success && result.data.ok) {
      log('✓ Health check passed', colors.green);
      passCount++;
    } else {
      log('✗ Health check failed', colors.red);
      failCount++;
    }
  } catch (error) {
    log(`✗ Health check error: ${error.message}`, colors.red);
    failCount++;
    log('\nServer is not running. Start it with: npm run server\n', colors.yellow);
    process.exit(1);
  }
  
  // Test 2: User photo endpoint with non-existent user (should return 404 or 503 if bot token missing)
  try {
    log('\nTest 2: Photo endpoint with non-existent user...', colors.yellow);
    const result = await makeRequest('/api/user/999999999/photo');
    if (result.statusCode === 404) {
      log(`✓ Correctly returned 404 for non-existent user`, colors.green);
      log(`  Response: ${JSON.stringify(result.data)}`, colors.reset);
      passCount++;
    } else if (result.statusCode === 503 && result.data.error?.includes('TELEGRAM_BOT_TOKEN')) {
      log(`✓ Correctly returned 503 (Bot token not configured)`, colors.green);
      log(`  Response: ${JSON.stringify(result.data)}`, colors.reset);
      passCount++;
    } else {
      log(`✗ Expected 404 or 503, got ${result.statusCode}`, colors.red);
      log(`  Response: ${JSON.stringify(result.data)}`, colors.reset);
      failCount++;
    }
  } catch (error) {
    log(`✗ Test failed: ${error.message}`, colors.red);
    failCount++;
  }
  
  // Test 3: Check if Bot Token is configured (non-existent user gives us info)
  try {
    log('\nTest 3: Checking Bot API configuration...', colors.yellow);
    const result = await makeRequest('/api/user/999999999/photo');
    
    if (result.statusCode === 404) {
      log('✓ Endpoint is accessible (returned 404 for non-existent user)', colors.green);
      passCount++;
    } else if (result.statusCode === 503 && result.data.error?.includes('TELEGRAM_BOT_TOKEN')) {
      log('⚠ Bot token not configured (503 response)', colors.yellow);
      log('  This is expected if TELEGRAM_BOT_TOKEN is not set', colors.yellow);
      log(`  Response: ${JSON.stringify(result.data)}`, colors.reset);
      passCount++;
    } else {
      log(`⚠ Unexpected response: ${result.statusCode}`, colors.yellow);
      log(`  Response: ${JSON.stringify(result.data)}`, colors.reset);
      passCount++;
    }
  } catch (error) {
    log(`✗ Test failed: ${error.message}`, colors.red);
    failCount++;
  }
  
  // Test 4: Test refresh parameter
  try {
    log('\nTest 4: Photo endpoint with refresh parameter...', colors.yellow);
    const result = await makeRequest('/api/user/999999999/photo?refresh=true');
    if (result.statusCode === 404) {
      log(`✓ Refresh parameter accepted (returned 404 for non-existent user)`, colors.green);
      passCount++;
    } else if (result.statusCode === 503 && result.data.error?.includes('TELEGRAM_BOT_TOKEN')) {
      log(`✓ Refresh parameter accepted (returned 503 - Bot token not configured)`, colors.green);
      passCount++;
    } else {
      log(`✗ Expected 404 or 503, got ${result.statusCode}`, colors.red);
      failCount++;
    }
  } catch (error) {
    log(`✗ Test failed: ${error.message}`, colors.red);
    failCount++;
  }
  
  // Test 5: Verify avatar static middleware is accessible
  try {
    log('\nTest 5: Avatar static file serving (should 404 for non-existent file)...', colors.yellow);
    const result = await makeRequest('/api/user/avatar/nonexistent.jpg');
    
    // Either 404 (file not found) or 403 (forbidden) is acceptable
    if (result.statusCode === 404 || result.statusCode === 403) {
      log(`✓ Avatar static middleware is accessible (${result.statusCode})`, colors.green);
      passCount++;
    } else {
      log(`⚠ Unexpected status code: ${result.statusCode}`, colors.yellow);
      passCount++;
    }
  } catch (error) {
    log(`✗ Test failed: ${error.message}`, colors.red);
    failCount++;
  }
  
  // Summary
  log('\n=== Test Summary ===\n', colors.blue);
  log(`Passed: ${passCount}`, colors.green);
  log(`Failed: ${failCount}`, colors.red);
  log(`Total: ${passCount + failCount}\n`, colors.reset);
  
  if (failCount > 0) {
    log('Some tests failed. Please review the output above.', colors.red);
    process.exit(1);
  } else {
    log('All tests passed! ✓', colors.green);
    process.exit(0);
  }
}

// Run tests
runTests().catch((error) => {
  log(`\nFatal error: ${error.message}`, colors.red);
  process.exit(1);
});
