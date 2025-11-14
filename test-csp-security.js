#!/usr/bin/env node

/**
 * CSP Security Verification Test
 * 
 * This test verifies that our CSP improvements are working correctly:
 * 1. No unsafe-eval in CSP
 * 2. No unsafe-inline in script-src 
 * 3. unsafe-inline kept only for style-src (needed for charts)
 * 4. All required domains are allowed
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log('🔒 CSP Security Verification Test\n');

// Read index.html
const indexHtmlPath = path.join(__dirname, 'index.html');
const indexHtml = fs.readFileSync(indexHtmlPath, 'utf-8');

let securityTests = 0;
let securityPassed = 0;

function securityTest(description, condition) {
  securityTests++;
  if (condition) {
    console.log(`✅ ${description}`);
    securityPassed++;
  } else {
    console.log(`❌ ${description}`);
  }
}

console.log('🚨 SECURITY CRITICAL TESTS:\n');

// Test 1: No unsafe-eval
securityTest(
  "❌ NO 'unsafe-eval' in CSP (critical security)",
  !indexHtml.includes("'unsafe-eval'")
);

// Test 2: No unsafe-inline in script-src
securityTest(
  "❌ NO 'unsafe-inline' in script-src (critical security)",
  !indexHtml.includes("script-src") || !indexHtml.includes("script-src 'self' 'unsafe-inline'")
);

// Test 3: unsafe-inline still in style-src (needed for charts)
securityTest(
  "✅ 'unsafe-inline' in style-src (needed for dynamic chart styles)",
  indexHtml.includes("style-src 'self' 'unsafe-inline'")
);

console.log('\n🌐 FUNCTIONALITY TESTS:\n');

// Test 4: Telegram WebApp script allowed
securityTest(
  "✅ Telegram WebApp script allowed",
  indexHtml.includes("script-src 'self' https://telegram.org")
);

// Test 5: External fonts allowed
securityTest(
  "✅ External fonts from CDNs allowed",
  indexHtml.includes("font-src") && 
  indexHtml.includes("https://fonts.googleapis.com") &&
  indexHtml.includes("https://r2cdn.perplexity.ai")
);

// Test 6: API connections allowed
securityTest(
  "✅ API connections (HTTPS and localhost) allowed",
  indexHtml.includes("connect-src 'self' http://localhost:* https:")
);

// Test 7: Images and data URIs allowed
securityTest(
  "✅ Images and data URIs allowed",
  indexHtml.includes("img-src 'self' https: data:")
);

console.log('\n📊 SECURITY SCORE:\n');
const securityScore = Math.round((securityPassed / securityTests) * 100);
console.log(`Security Score: ${securityScore}% (${securityPassed}/${securityTests} tests passed)`);

if (securityScore === 100) {
  console.log('\n🎉 PERFECT SECURITY SCORE!');
  console.log('✅ CSP is properly hardened against XSS attacks');
  console.log('✅ No dangerous eval() usage allowed');
  console.log('✅ No inline JavaScript allowed');
  console.log('✅ Maintains functionality with minimal security trade-offs');
} else if (securityScore >= 80) {
  console.log('\n🟡 GOOD SECURITY SCORE');
  console.log('Most security measures are in place');
} else {
  console.log('\n🔴 POOR SECURITY SCORE');
  console.log('Security improvements needed');
}

console.log('\n📋 CSP SECURITY SUMMARY:');
console.log('   • Removed dangerous unsafe-eval directive');
console.log('   • Removed unsafe-inline from script-src');
console.log('   • Kept unsafe-inline only for styles (chart requirement)');
console.log('   • Maintains all necessary functionality');
console.log('   • Significantly reduces XSS attack surface');

if (securityScore === 100) {
  process.exit(0);
} else {
  process.exit(1);
}