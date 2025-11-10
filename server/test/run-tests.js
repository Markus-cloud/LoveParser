#!/usr/bin/env node

/**
 * Test runner for parsing enrichment functionality
 * Runs all test suites and provides a summary
 */

import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('🧪 Running parsing enrichment test suite...\n');

const testFiles = [
  'parsing-enrichment.test.js',
  'api-integration.test.js'
];

let totalPassed = 0;
let totalFailed = 0;

for (const testFile of testFiles) {
  try {
    console.log(`📋 Running ${testFile}...`);
    const output = execSync(`node ${join(__dirname, testFile)}`, { 
      encoding: 'utf-8',
      stdio: 'pipe'
    });
    
    console.log(output);
    
    // Extract test results from output
    const passedMatch = output.match(/(\d+) passed/);
    const failedMatch = output.match(/(\d+) failed/);
    
    if (passedMatch) totalPassed += parseInt(passedMatch[1]);
    if (failedMatch) totalFailed += parseInt(failedMatch[1]);
    
  } catch (error) {
    console.log(`❌ ${testFile} failed to run:`);
    console.log(error.stdout || error.message);
    totalFailed++;
  }
  
  console.log(''); // Add spacing between tests
}

console.log('='.repeat(60));
console.log('📊 FINAL TEST SUMMARY');
console.log(`✅ Total passed: ${totalPassed}`);
console.log(`❌ Total failed: ${totalFailed}`);
console.log(`📈 Success rate: ${((totalPassed / (totalPassed + totalFailed)) * 100).toFixed(1)}%`);

if (totalFailed === 0) {
  console.log('\n🎉 All tests passed! Parsing enrichment functionality is working correctly.');
  process.exit(0);
} else {
  console.log('\n❌ Some tests failed. Please review the output above for details.');
  process.exit(1);
}