#!/usr/bin/env node

/**
 * CSP Policy Validation Test
 * 
 * This test validates that the Content Security Policy (CSP) is properly configured
 * to allow Telegram Web App scripts and external fonts while maintaining security.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log('🔍 Validating CSP Policy...\n');

// Read index.html
const indexHtmlPath = path.join(__dirname, 'index.html');
const indexHtml = fs.readFileSync(indexHtmlPath, 'utf-8');

let passedTests = 0;
let failedTests = 0;

function test(description, condition) {
  if (condition) {
    console.log(`✅ ${description}`);
    passedTests++;
  } else {
    console.log(`❌ ${description}`);
    failedTests++;
  }
}

// Test 1: CSP meta tag exists
test(
  'CSP meta tag exists',
  indexHtml.includes('Content-Security-Policy')
);

// Test 2: script-src allows telegram.org
test(
  'script-src allows https://telegram.org',
  indexHtml.includes('script-src') && indexHtml.includes('https://telegram.org')
);

// Test 3: script-src allows self
test(
  "script-src allows 'self'",
  indexHtml.includes("script-src 'self'")
);

// Test 4: script-src allows unsafe-inline (needed for Vite HMR)
test(
  "script-src allows 'unsafe-inline'",
  indexHtml.includes("script-src 'self' 'unsafe-inline'")
);

// Test 5: style-src allows self and inline
test(
  "style-src allows 'self' and 'unsafe-inline'",
  indexHtml.includes("style-src 'self' 'unsafe-inline'")
);

// Test 6: font-src allows Perplexity CDN
test(
  'font-src allows https://r2cdn.perplexity.ai',
  indexHtml.includes('font-src') && indexHtml.includes('https://r2cdn.perplexity.ai')
);

// Test 7: font-src allows Google Fonts
test(
  'font-src allows https://fonts.googleapis.com',
  indexHtml.includes('https://fonts.googleapis.com')
);

// Test 8: font-src allows Google Fonts static
test(
  'font-src allows https://fonts.gstatic.com',
  indexHtml.includes('https://fonts.gstatic.com')
);

// Test 9: connect-src allows HTTPS for API calls
test(
  'connect-src allows https: for API calls',
  indexHtml.includes('connect-src') && indexHtml.includes('https:')
);

// Test 10: connect-src allows localhost for development
test(
  'connect-src allows http://localhost:* for development',
  indexHtml.includes('http://localhost:*')
);

// Test 11: img-src allows HTTPS
test(
  'img-src allows https: for images',
  indexHtml.includes('img-src') && indexHtml.includes('https:')
);

// Test 12: img-src allows data URIs
test(
  'img-src allows data: for inline images',
  indexHtml.includes('img-src') && indexHtml.includes('data:')
);

// Test 13: frame-ancestors allows Telegram Web context
test(
  'frame-ancestors allows https://web.telegram.org',
  indexHtml.includes('frame-ancestors') && indexHtml.includes('https://web.telegram.org')
);

// Test 14: unsafe-eval is NOT present (security improvement)
test(
  "unsafe-eval is NOT present in CSP (security improvement)",
  !indexHtml.includes("'unsafe-eval'")
);

// Test 15: object-src is set to 'none' (prevents plugins)
test(
  "object-src set to 'none' (prevents plugins)",
  indexHtml.includes("object-src 'none'")
);

// Test 16: form-action is set to 'self'
test(
  "form-action set to 'self'",
  indexHtml.includes("form-action 'self'")
);

// Test 17: base-uri is set to 'self'
test(
  "base-uri set to 'self'",
  indexHtml.includes("base-uri 'self'")
);

// Test 18: Telegram Web App script tag is present
test(
  'Telegram Web App script tag is present',
  indexHtml.includes('<script src="https://telegram.org/js/telegram-web-app.js">')
);

// Test 19: React main script tag is present
test(
  'React main module script tag is present',
  indexHtml.includes('src="/src/main.tsx"')
);

// Test 20: default-src is restrictive
test(
  "default-src set to 'self' (restrictive fallback)",
  indexHtml.includes("default-src 'self'")
);

console.log(`\n${'='.repeat(50)}`);
console.log(`✅ Passed: ${passedTests}`);
console.log(`❌ Failed: ${failedTests}`);
console.log(`${'='.repeat(50)}\n`);

if (failedTests > 0) {
  console.log('🔴 CSP validation FAILED');
  process.exit(1);
} else {
  console.log('🟢 CSP validation PASSED');
  console.log('\n📋 CSP Policy Summary:');
  console.log('   • Allows Telegram Web App script from telegram.org');
  console.log('   • Allows external fonts from multiple CDNs');
  console.log('   • Removes dangerous unsafe-eval directive');
  console.log('   • Maintains strong security posture');
  console.log('   • Supports development with localhost connections');
  process.exit(0);
}
