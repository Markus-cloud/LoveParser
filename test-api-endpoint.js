#!/usr/bin/env node

/**
 * Test script to verify API endpoints work correctly
 * Simulates actual HTTP requests to the Express app
 */

import http from 'http';

console.log('🧪 Testing API Endpoints...\n');

async function testAPIEndpoint() {
  try {
    // Set production environment
    process.env.NODE_ENV = 'production';
    
    // Import the API handler
    const apiModule = await import('./api/index.js');
    const app = apiModule.default;
    
    console.log('1️⃣ Starting test server...');
    
    // Start server on a test port
    const testPort = 5555;
    const server = app.listen(testPort);
    
    console.log(`   ✅ Test server started on port ${testPort}\n`);
    
    // Test 1: Health check
    console.log('2️⃣ Testing /api/health endpoint...');
    
    const healthResponse = await new Promise((resolve, reject) => {
      const req = http.get(`http://localhost:${testPort}/api/health`, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve({ status: res.statusCode, data }));
      });
      req.on('error', reject);
    });
    
    if (healthResponse.status !== 200) {
      throw new Error(`Health check failed with status ${healthResponse.status}`);
    }
    
    const healthData = JSON.parse(healthResponse.data);
    if (!healthData.ok) {
      throw new Error('Health check returned ok: false');
    }
    
    console.log(`   ✅ Health check passed: ${healthResponse.data}\n`);
    
    // Test 2: Auth endpoint (without actual auth, just check route exists)
    console.log('3️⃣ Testing /api/telegram/auth/send-code route registration...');
    
    const authResponse = await new Promise((resolve, reject) => {
      const postData = JSON.stringify({ phoneNumber: '' });
      
      const options = {
        hostname: 'localhost',
        port: testPort,
        path: '/api/telegram/auth/send-code',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      };
      
      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve({ status: res.statusCode, data }));
      });
      
      req.on('error', reject);
      req.write(postData);
      req.end();
    });
    
    // We expect 400 (missing phone) or 500 (actual error), not 404
    if (authResponse.status === 404) {
      throw new Error('Auth endpoint returned 404 - route not found!');
    }
    
    console.log(`   ✅ Auth endpoint exists (status: ${authResponse.status})\n`);
    
    // Test 3: Non-existent route
    console.log('4️⃣ Testing 404 handler...');
    
    const notFoundResponse = await new Promise((resolve, reject) => {
      const req = http.get(`http://localhost:${testPort}/api/nonexistent`, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve({ status: res.statusCode, data }));
      });
      req.on('error', reject);
    });
    
    if (notFoundResponse.status !== 404) {
      throw new Error(`Expected 404, got ${notFoundResponse.status}`);
    }
    
    const notFoundData = JSON.parse(notFoundResponse.data);
    if (!notFoundData.error || !notFoundData.error.includes('not found')) {
      throw new Error('404 handler did not return expected JSON');
    }
    
    console.log(`   ✅ 404 handler works correctly\n`);
    
    // Close server
    server.close();
    
    console.log('✅ All API endpoint tests passed!\n');
    console.log('📝 Summary:');
    console.log('   - Health check endpoint works');
    console.log('   - Auth endpoint is registered and accessible');
    console.log('   - 404 handler returns JSON (not HTML)');
    console.log('   - Ready for Vercel deployment\n');
    
    return true;
  } catch (error) {
    console.error('   ❌ Test failed:', error.message);
    console.error('\nError details:', error);
    return false;
  }
}

// Run tests
testAPIEndpoint()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
