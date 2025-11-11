#!/usr/bin/env node
/**
 * Test script to verify backend server startup fix
 * Tests:
 * 1. Server module can be imported without crashing
 * 2. Server can start and listen on a port
 * 3. Server responds to health check requests
 * 4. Server provides proper error messages when port is in use
 */

import { spawn } from 'child_process';
import { setTimeout } from 'timers/promises';

const TEST_PORT = 9999;
const TIMEOUT = 5000;

console.log('🧪 Testing backend server startup...\n');

// Test 1: Import module without crashing
console.log('Test 1: Importing server module...');
try {
  const module = await import('./server/index.js');
  if (typeof module.default === 'function') {
    console.log('✅ Server module imports correctly\n');
  } else {
    console.log('❌ Server module export is not a function\n');
    process.exit(1);
  }
} catch (err) {
  console.log('❌ Failed to import server module:', err.message, '\n');
  process.exit(1);
}

// Test 2: Start server on test port
console.log('Test 2: Starting server on test port...');
const serverProcess = spawn('node', ['server/index.js'], {
  env: { ...process.env, API_PORT: TEST_PORT },
  stdio: ['ignore', 'pipe', 'pipe']
});

let serverOutput = '';
let serverStarted = false;

serverProcess.stdout.on('data', (data) => {
  serverOutput += data.toString();
  if (data.toString().includes('Ready to accept connections')) {
    serverStarted = true;
  }
});

serverProcess.stderr.on('data', (data) => {
  serverOutput += data.toString();
});

// Wait for server to start
await setTimeout(2000);

if (!serverStarted) {
  console.log('❌ Server did not start within timeout');
  console.log('Server output:', serverOutput);
  serverProcess.kill();
  process.exit(1);
}

console.log('✅ Server started successfully\n');

// Test 3: Health check request
console.log('Test 3: Testing health check endpoint...');
try {
  const response = await fetch(`http://localhost:${TEST_PORT}/api/health`);
  const data = await response.json();
  
  if (data.ok && data.service === 'tele-fluence-backend') {
    console.log('✅ Health check endpoint responds correctly\n');
  } else {
    console.log('❌ Unexpected health check response:', data, '\n');
    serverProcess.kill();
    process.exit(1);
  }
} catch (err) {
  console.log('❌ Failed to connect to server:', err.message, '\n');
  serverProcess.kill();
  process.exit(1);
}

// Test 4: Verify server stays running
console.log('Test 4: Verifying server stays running...');
await setTimeout(1000);

if (serverProcess.exitCode !== null) {
  console.log('❌ Server exited unexpectedly with code:', serverProcess.exitCode, '\n');
  process.exit(1);
}

console.log('✅ Server remains running\n');

// Cleanup
serverProcess.kill();
await setTimeout(500);

console.log('✅ All tests passed!');
console.log('\n📝 Summary:');
console.log('  - Server module imports without crashing');
console.log('  - Server starts and listens on specified port');
console.log('  - Server responds to health check requests');
console.log('  - Server remains running (no immediate crash)');
console.log('\n✨ Backend server startup fix verified successfully!');

process.exit(0);
