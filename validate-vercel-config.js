#!/usr/bin/env node

/**
 * Validate Vercel Configuration
 * Checks for conflicts between builds and functions properties
 */

import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('🔍 Validating Vercel Configuration...\n');

// Check if vercel.json exists
const vercelJsonPath = join(__dirname, 'vercel.json');
if (!existsSync(vercelJsonPath)) {
  console.error('❌ vercel.json not found');
  process.exit(1);
}

// Read and parse vercel.json
let config;
try {
  const content = readFileSync(vercelJsonPath, 'utf-8');
  config = JSON.parse(content);
  console.log('✅ vercel.json is valid JSON');
} catch (error) {
  console.error('❌ Failed to parse vercel.json:', error.message);
  process.exit(1);
}

// Check for the conflict
const hasBuilds = 'builds' in config;
const hasFunctions = 'functions' in config;

console.log('\n📋 Configuration Properties:');
console.log(`   - version: ${config.version || 'not specified'}`);
console.log(`   - builds: ${hasBuilds ? '❌ PRESENT (LEGACY)' : '✅ not present'}`);
console.log(`   - functions: ${hasFunctions ? '✅ present' : '⚠️  not present'}`);
console.log(`   - buildCommand: ${config.buildCommand ? '✅ ' + config.buildCommand : '⚠️  not specified'}`);
console.log(`   - outputDirectory: ${config.outputDirectory ? '✅ ' + config.outputDirectory : '⚠️  not specified'}`);

// Check for routes vs rewrites
const hasRoutes = 'routes' in config;
const hasRewrites = 'rewrites' in config;
console.log(`   - routes: ${hasRoutes ? '⚠️  PRESENT (LEGACY)' : '✅ not present'}`);
console.log(`   - rewrites: ${hasRewrites ? '✅ present' : '⚠️  not present'}`);

console.log('\n🔍 Conflict Detection:');

let hasErrors = false;

// Check for builds + functions conflict
if (hasBuilds && hasFunctions) {
  console.error('❌ CONFLICT: Both `builds` and `functions` properties are present');
  console.error('   This will cause deployment to fail');
  console.error('   Remove the `builds` property to use modern configuration');
  hasErrors = true;
} else if (hasBuilds) {
  console.warn('⚠️  WARNING: Using legacy `builds` property');
  console.warn('   Consider migrating to modern `functions` configuration');
} else if (hasFunctions) {
  console.log('✅ Using modern `functions` property (no conflict)');
} else {
  console.warn('⚠️  Neither `builds` nor `functions` specified');
  console.warn('   Vercel will use automatic detection');
}

// Check for routes + rewrites (not a hard conflict, but best practice)
if (hasRoutes && hasRewrites) {
  console.warn('⚠️  WARNING: Both `routes` and `rewrites` are present');
  console.warn('   Consider using only `rewrites` (modern approach)');
} else if (hasRoutes) {
  console.warn('⚠️  Using legacy `routes` property');
  console.warn('   Consider migrating to `rewrites` for better clarity');
}

// Check that api/index.js exists
const apiIndexPath = join(__dirname, 'api', 'index.js');
if (!existsSync(apiIndexPath)) {
  console.error('❌ api/index.js not found');
  console.error('   Serverless function entry point is missing');
  hasErrors = true;
} else {
  console.log('✅ api/index.js exists (serverless function entry point)');
}

// Check that dist directory will be created by build
if (config.outputDirectory === 'dist') {
  console.log('✅ outputDirectory configured as "dist"');
}

// Check function configuration
if (hasFunctions && config.functions['api/index.js']) {
  console.log('\n📦 Function Configuration:');
  console.log(`   - api/index.js:`);
  const funcConfig = config.functions['api/index.js'];
  if (funcConfig.maxDuration) {
    console.log(`     • maxDuration: ${funcConfig.maxDuration}s`);
  }
  if (funcConfig.memory) {
    console.log(`     • memory: ${funcConfig.memory}MB`);
  }
  if (funcConfig.runtime) {
    console.log(`     • runtime: ${funcConfig.runtime}`);
  }
}

// Summary
console.log('\n' + '='.repeat(60));
if (hasErrors) {
  console.error('❌ VALIDATION FAILED - Configuration has errors');
  console.error('   Please fix the issues above before deploying');
  process.exit(1);
} else {
  console.log('✅ VALIDATION PASSED - Configuration is ready for deployment');
  console.log('\n💡 To deploy:');
  console.log('   - Run: vercel (for preview)');
  console.log('   - Run: vercel --prod (for production)');
}
console.log('='.repeat(60));
