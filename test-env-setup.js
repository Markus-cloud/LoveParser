#!/usr/bin/env node
/**
 * Test script to verify environment variable setup
 * Run with: node test-env-setup.js
 */

import dotenv from 'dotenv';

// Load .env.local (takes precedence)
dotenv.config({ path: '.env.local' });
// Load .env (fallback)
dotenv.config();

console.log('🔍 Testing Environment Variable Setup...\n');

const requiredVars = {
  'API_PORT': process.env.API_PORT,
  'TELEGRAM_API_ID': process.env.TELEGRAM_API_ID,
  'TELEGRAM_API_HASH': process.env.TELEGRAM_API_HASH,
};

const optionalVars = {
  'TELEGRAM_BOT_TOKEN': process.env.TELEGRAM_BOT_TOKEN,
  'NODE_ENV': process.env.NODE_ENV,
};

let hasErrors = false;

console.log('📋 Required Variables:');
for (const [key, value] of Object.entries(requiredVars)) {
  if (value) {
    // Mask sensitive values
    const masked = key.includes('HASH') || key.includes('TOKEN') 
      ? `${value.substring(0, 8)}...` 
      : value;
    console.log(`  ✅ ${key}: ${masked}`);
  } else {
    console.log(`  ❌ ${key}: NOT SET`);
    hasErrors = true;
  }
}

console.log('\n📋 Optional Variables:');
for (const [key, value] of Object.entries(optionalVars)) {
  if (value) {
    const masked = key.includes('TOKEN') 
      ? `${value.substring(0, 8)}...` 
      : value;
    console.log(`  ✅ ${key}: ${masked}`);
  } else {
    console.log(`  ⚠️  ${key}: not set (optional)`);
  }
}

console.log('\n' + '='.repeat(50));

if (hasErrors) {
  console.log('❌ FAILED: Required variables are missing!');
  console.log('\n📝 To fix:');
  console.log('  1. Copy .env.local.example to .env.local');
  console.log('  2. Fill in your Telegram API credentials');
  console.log('  3. Get credentials from: https://my.telegram.org/apps');
  process.exit(1);
} else {
  console.log('✅ SUCCESS: All required variables are set!');
  console.log('\n🚀 You can now start the server with: npm run server');
  process.exit(0);
}
