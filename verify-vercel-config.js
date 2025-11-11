#!/usr/bin/env node

/**
 * Vercel Configuration Verification Script
 * Validates that the project has no conflicting configuration files
 * and is ready for Vercel deployment
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const checks = {
  passed: [],
  failed: [],
  warnings: []
};

function checkFileExists(filePath, shouldExist = false) {
  const exists = fs.existsSync(filePath);
  return shouldExist ? exists : !exists;
}

function checkDirectoryExists(dirPath, shouldExist = false) {
  const exists = fs.existsSync(dirPath);
  return shouldExist ? exists : !exists;
}

// Check 1: vercel.json exists
console.log('🔍 Checking Vercel Configuration...\n');

if (checkFileExists(path.join(__dirname, 'vercel.json'), true)) {
  checks.passed.push('✅ vercel.json exists');
  
  // Validate JSON structure
  try {
    const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'vercel.json'), 'utf8'));
    if (config.version === 2) {
      checks.passed.push('✅ vercel.json is version 2 format');
    } else {
      checks.failed.push('❌ vercel.json should use version 2');
    }
    
    if (config.builds && config.builds.length > 0) {
      checks.passed.push('✅ vercel.json has builds configuration');
    }
    
    if (config.routes && config.routes.length > 0) {
      checks.passed.push('✅ vercel.json has routes configuration');
    }
  } catch (e) {
    checks.failed.push('❌ vercel.json is not valid JSON');
  }
} else {
  checks.failed.push('❌ vercel.json not found');
}

// Check 2: No conflicting now.json
if (checkFileExists(path.join(__dirname, 'now.json'))) {
  checks.passed.push('✅ now.json does not exist (good - no legacy config)');
} else {
  checks.warnings.push('⚠️  now.json not found (expected - legacy file)');
}

// Check 3: No conflicting .now directory
if (checkDirectoryExists(path.join(__dirname, '.now'))) {
  checks.passed.push('✅ .now directory does not exist (good - no legacy config)');
} else {
  checks.warnings.push('⚠️  .now directory not found (expected - legacy)');
}

// Check 4: No .nowignore
if (checkFileExists(path.join(__dirname, '.nowignore'))) {
  checks.passed.push('✅ .nowignore does not exist (good - no legacy config)');
} else {
  checks.warnings.push('⚠️  .nowignore not found (expected - legacy file)');
}

// Check 5: api/index.js exists (required for Vercel)
if (checkFileExists(path.join(__dirname, 'api/index.js'), true)) {
  checks.passed.push('✅ api/index.js exists (Vercel handler entry point)');
} else {
  checks.failed.push('❌ api/index.js not found - required for Vercel deployment');
}

// Check 6: server/index.js exists
if (checkFileExists(path.join(__dirname, 'server/index.js'), true)) {
  checks.passed.push('✅ server/index.js exists (Express application)');
} else {
  checks.failed.push('❌ server/index.js not found');
}

// Check 7: Environment variables check
const codeFiles = [
  ...getFiles(path.join(__dirname, 'src'), ['.js', '.ts', '.tsx']),
  ...getFiles(path.join(__dirname, 'server'), ['.js', '.ts', '.tsx']),
  ...getFiles(path.join(__dirname, 'api'), ['.js', '.ts', '.tsx'])
];

let hasNowEnvVars = false;
for (const file of codeFiles) {
  const content = fs.readFileSync(file, 'utf8');
  if (/NOW_[A-Z_]+/g.test(content)) {
    hasNowEnvVars = true;
    break;
  }
}

if (!hasNowEnvVars) {
  checks.passed.push('✅ No NOW_ prefixed environment variables found');
} else {
  checks.failed.push('❌ Found NOW_ prefixed environment variables (should use VERCEL_ or custom names)');
}

// Check 8: .gitignore has .vercel
const gitignorePath = path.join(__dirname, '.gitignore');
if (fs.existsSync(gitignorePath)) {
  const gitignore = fs.readFileSync(gitignorePath, 'utf8');
  if (gitignore.includes('.vercel')) {
    checks.passed.push('✅ .gitignore properly ignores .vercel directory');
  } else {
    checks.warnings.push('⚠️  .gitignore does not ignore .vercel (consider adding it)');
  }
}

// Check 9: No duplicate .vercelignore
if (checkFileExists(path.join(__dirname, '.vercelignore'))) {
  checks.passed.push('✅ .vercelignore does not exist (good - no duplicate ignore files)');
} else {
  checks.warnings.push('⚠️  .vercelignore not found (expected - not needed)');
}

// Print results
console.log('\n' + '='.repeat(60));
console.log('VERCEL CONFIGURATION VERIFICATION RESULTS');
console.log('='.repeat(60) + '\n');

console.log('PASSED CHECKS:');
checks.passed.forEach(check => console.log('  ' + check));

if (checks.warnings.length > 0) {
  console.log('\nWARNINGS:');
  checks.warnings.forEach(check => console.log('  ' + check));
}

if (checks.failed.length > 0) {
  console.log('\nFAILED CHECKS:');
  checks.failed.forEach(check => console.log('  ' + check));
}

console.log('\n' + '='.repeat(60));

if (checks.failed.length === 0) {
  console.log('✅ VERCEL CONFIGURATION IS CLEAN - Ready for deployment!');
  console.log('='.repeat(60) + '\n');
  process.exit(0);
} else {
  console.log('❌ VERCEL CONFIGURATION HAS ISSUES - Please fix the above');
  console.log('='.repeat(60) + '\n');
  process.exit(1);
}

// Helper function to get files recursively
function getFiles(dir, extensions = []) {
  const files = [];
  if (!fs.existsSync(dir)) return files;
  
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        files.push(...getFiles(fullPath, extensions));
      } else if (entry.isFile() && (extensions.length === 0 || extensions.some(ext => entry.name.endsWith(ext)))) {
        files.push(fullPath);
      }
    }
  } catch (e) {
    // Silently skip directories we can't read
  }
  
  return files;
}
