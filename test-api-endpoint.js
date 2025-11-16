#!/usr/bin/env node

/**
 * Test script to verify API endpoints work correctly
 * Simulates actual HTTP requests to the Express app
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

console.log('🧪 Testing API Endpoints...\n');

async function testAPIEndpoint() {
  try {
    // Set production environment
    process.env.NODE_ENV = 'production';
    
    // Import the Express app directly from server
    const serverModule = await import('./server/index.js');
    const app = serverModule.default || serverModule;
    
    console.log('1️⃣ Starting test server...');
    
    // Start server on a test port
    const testPort = 5555;
    const server = app.listen(testPort);
    
    console.log(`   ✅ Test server started on port ${testPort}\n`);
    
    const baseUrl = `http://localhost:${testPort}`;
    const makeGetRequest = (urlPath) => new Promise((resolve, reject) => {
      const req = http.get(`${baseUrl}${urlPath}`, (res) => {
        res.setEncoding('utf8');
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve({
          status: res.statusCode,
          data,
          headers: res.headers
        }));
      });
      req.on('error', reject);
    });
    
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
    
    const createdFiles = [];
    try {
      console.log('5️⃣ Preparing sample broadcast history files...');
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.dirname(__filename);
      const dataDir = path.join(__dirname, 'server', 'data');
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      const testUserId = 'test-user-history';
      const otherUserId = 'other-user-history';
      const now = Date.now();
      const historyId = `broadcast_${now}_${testUserId}`;
      const otherHistoryId = `broadcast_${now + 1}_${otherUserId}`;
      const createdAt = new Date(now).toISOString();
      const otherCreatedAt = new Date(now + 1000).toISOString();

      const testHistoryRecord = {
        id: historyId,
        taskId: 'task-test',
        userId: testUserId,
        audienceId: 'audience_test',
        audienceName: 'Audience Test',
        mode: 'dm',
        message: 'Hello broadcast recipient!',
        messagePreview: 'Hello broadcast recipient!',
        hasImage: false,
        delaySeconds: 2,
        maxRecipients: null,
        createdAt,
        completedAt: createdAt,
        timestamp: createdAt,
        status: 'success',
        summary: {
          total: 2,
          success: 2,
          failed: 0,
          successRate: '100.00%'
        },
        deliveryLog: [
          {
            recipient: { id: 'user1', username: 'user1', name: 'User One' },
            status: 'success',
            error: '',
            timestamp: createdAt,
            duration: 1200
          },
          {
            recipient: { id: 'user2', username: 'user2', name: 'User Two' },
            status: 'success',
            error: '',
            timestamp: createdAt,
            duration: 900
          }
        ]
      };

      const otherHistoryRecord = {
        id: otherHistoryId,
        taskId: 'task-other',
        userId: otherUserId,
        audienceId: 'audience_other',
        audienceName: 'Other Audience',
        mode: 'dm',
        message: 'Another message',
        messagePreview: 'Another message',
        hasImage: false,
        delaySeconds: 2,
        maxRecipients: null,
        createdAt: otherCreatedAt,
        completedAt: otherCreatedAt,
        timestamp: otherCreatedAt,
        status: 'failed',
        summary: {
          total: 1,
          success: 0,
          failed: 1,
          successRate: '0.00%'
        },
        deliveryLog: [
          {
            recipient: { id: 'user3', username: 'user3', name: 'User Three' },
            status: 'failed',
            error: 'Flood wait',
            timestamp: otherCreatedAt,
            duration: 800
          }
        ]
      };

      const testHistoryPath = path.join(dataDir, `broadcast_results_${historyId}.json`);
      const otherHistoryPath = path.join(dataDir, `broadcast_results_${otherHistoryId}.json`);
      fs.writeFileSync(testHistoryPath, JSON.stringify(testHistoryRecord, null, 2), 'utf-8');
      fs.writeFileSync(otherHistoryPath, JSON.stringify(otherHistoryRecord, null, 2), 'utf-8');
      createdFiles.push(testHistoryPath, otherHistoryPath);

      console.log('   ✅ Sample history records created\n');

      console.log('6️⃣ Testing broadcast history list endpoint...');
      const listResponse = await makeGetRequest(`/api/telegram/broadcast-history?userId=${encodeURIComponent(testUserId)}`);
      if (listResponse.status !== 200) {
        throw new Error(`Broadcast history list failed with status ${listResponse.status}`);
      }
      const listData = JSON.parse(listResponse.data);
      if (!Array.isArray(listData.results)) {
        throw new Error('Broadcast history list did not return results array');
      }
      const expectedRecord = listData.results.find((item) => item.id === historyId);
      if (!expectedRecord) {
        throw new Error('Broadcast history list is missing expected record');
      }
      if (expectedRecord.status !== 'success' || expectedRecord.total !== 2 || expectedRecord.success !== 2 || expectedRecord.failed !== 0) {
        throw new Error('Broadcast history list returned incorrect summary data');
      }
      if (expectedRecord.messagePreview !== testHistoryRecord.messagePreview) {
        throw new Error('Broadcast history list returned incorrect message preview');
      }
      if (expectedRecord.audienceName !== testHistoryRecord.audienceName) {
        throw new Error('Broadcast history list returned incorrect audience name');
      }
      if (listData.results.some((item) => item.id === otherHistoryId)) {
        throw new Error('Broadcast history list leaked records from other users');
      }
      const filteredResponse = await makeGetRequest(`/api/telegram/broadcast-history?userId=${encodeURIComponent(testUserId)}&status=failed`);
      const filteredData = JSON.parse(filteredResponse.data);
      if (filteredResponse.status !== 200 || !Array.isArray(filteredData.results) || filteredData.results.some((item) => item.id === historyId)) {
        throw new Error('Broadcast history status filter failed to exclude records');
      }
      console.log('   ✅ Broadcast history list endpoint returned expected results\n');

      console.log('7️⃣ Testing broadcast history detail endpoint...');
      const detailResponse = await makeGetRequest(`/api/telegram/broadcast-history/${historyId}?userId=${encodeURIComponent(testUserId)}`);
      if (detailResponse.status !== 200) {
        throw new Error(`Broadcast history detail failed with status ${detailResponse.status}`);
      }
      const detailData = JSON.parse(detailResponse.data);
      if (detailData.id !== historyId || !Array.isArray(detailData.deliveryLog) || detailData.deliveryLog.length !== 2) {
        throw new Error('Broadcast history detail returned incorrect payload');
      }
      if (detailData.message !== testHistoryRecord.message) {
        throw new Error('Broadcast history detail did not return full message');
      }
      const unauthorizedDetail = await makeGetRequest(`/api/telegram/broadcast-history/${historyId}?userId=${encodeURIComponent(otherUserId)}`);
      if (unauthorizedDetail.status !== 404) {
        throw new Error('Broadcast history detail did not return 404 for unauthorized user');
      }
      console.log('   ✅ Broadcast history detail endpoint returned expected record\n');

      console.log('8️⃣ Testing broadcast history download endpoint...');
      const downloadResponse = await makeGetRequest(`/api/telegram/broadcast-history/${historyId}/download?userId=${encodeURIComponent(testUserId)}`);
      if (downloadResponse.status !== 200) {
        throw new Error(`Broadcast history download failed with status ${downloadResponse.status}`);
      }
      const csvHeaders = downloadResponse.headers || {};
      if (!String(csvHeaders['content-type'] || '').includes('text/csv')) {
        throw new Error('Broadcast history download did not return CSV content-type');
      }
      if (!String(csvHeaders['content-disposition'] || '').includes('.csv')) {
        throw new Error('Broadcast history download missing filename disposition');
      }
      const csvBody = downloadResponse.data;
      if (!csvBody || csvBody.charCodeAt(0) !== 0xfeff) {
        throw new Error('Broadcast history download is missing UTF-8 BOM');
      }
      if (!csvBody.includes('User One') || !csvBody.includes('User Two')) {
        throw new Error('Broadcast history download CSV missing expected recipients');
      }
      console.log('   ✅ Broadcast history download endpoint returned CSV with BOM\n');

      console.log('9️⃣ Testing broadcast history error handling...');
      const missingDownload = await makeGetRequest(`/api/telegram/broadcast-history/missing-id/download?userId=${encodeURIComponent(testUserId)}`);
      if (missingDownload.status !== 404) {
        throw new Error('Broadcast history download did not return 404 for missing record');
      }
      console.log('   ✅ Broadcast history endpoints handle missing/unauthorized requests\n');
    } finally {
      for (const filePath of createdFiles) {
        try {
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        } catch (cleanupError) {
          console.warn('   ⚠️ Failed to clean up test file:', filePath, cleanupError.message);
        }
      }
    }
    
    // Close server
    server.close();
    
    console.log('✅ All API endpoint tests passed!\n');
    console.log('📝 Summary:');
    console.log('   - Health check endpoint works');
    console.log('   - Auth endpoint is registered and accessible');
    console.log('   - 404 handler returns JSON (not HTML)');
    console.log('   - Broadcast history endpoints (list/detail/download) work as expected\n');
    
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
