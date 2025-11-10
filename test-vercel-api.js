#!/usr/bin/env node

/**
 * Test script to verify Vercel API configuration
 * Tests that the API handler can be imported and routes are properly configured
 */

console.log('🧪 Testing Vercel API Configuration...\n');

async function testAPIHandler() {
  console.log('1️⃣ Testing API handler import...');
  
  try {
    // Set NODE_ENV to production to simulate Vercel environment
    process.env.NODE_ENV = 'production';
    
    const apiModule = await import('./api/index.js');
    const app = apiModule.default;
    
    if (typeof app !== 'function') {
      throw new Error(`Expected function, got ${typeof app}`);
    }
    
    console.log('   ✅ API handler imported successfully\n');
    
    // Test that the app has routes configured
    console.log('2️⃣ Testing Express app configuration...');
    
    if (!app._router) {
      throw new Error('Express app has no router configured');
    }
    
    // Get all registered routes
    const routes = [];
    app._router.stack.forEach(layer => {
      if (layer.route) {
        const path = layer.route.path;
        const methods = Object.keys(layer.route.methods).join(',').toUpperCase();
        routes.push(`${methods} ${path}`);
      } else if (layer.name === 'router') {
        // This is a router middleware (like our API routers)
        const routerPath = layer.regexp.toString();
        routes.push(`ROUTER ${routerPath}`);
      }
    });
    
    console.log('   Registered routes:');
    routes.forEach(route => console.log(`   - ${route}`));
    console.log('   ✅ Express app configured with routes\n');
    
    console.log('3️⃣ Checking critical routes...');
    
    // Check if API routes are registered
    const hasApiRoutes = routes.some(r => r.includes('/api'));
    if (!hasApiRoutes) {
      throw new Error('No /api routes found');
    }
    
    console.log('   ✅ API routes found\n');
    
    console.log('4️⃣ Testing route registration details...');
    
    // Import the routers to check their routes
    const telegramModule = await import('./server/routes/telegram.js');
    const telegramRouter = telegramModule.telegramRouter;
    
    const telegramRoutes = [];
    if (telegramRouter && telegramRouter.stack) {
      telegramRouter.stack.forEach(layer => {
        if (layer.route) {
          const path = layer.route.path;
          const methods = Object.keys(layer.route.methods).join(',').toUpperCase();
          telegramRoutes.push(`${methods} ${path}`);
        }
      });
    }
    
    console.log('   Telegram router routes:');
    telegramRoutes.forEach(route => console.log(`   - ${route}`));
    
    // Check for the critical auth route
    const hasAuthSendCode = telegramRoutes.some(r => r.includes('/auth/send-code'));
    if (!hasAuthSendCode) {
      throw new Error('Critical route /auth/send-code not found in telegram router');
    }
    
    console.log('   ✅ Critical auth routes found\n');
    
    console.log('✅ All Vercel API tests passed!\n');
    console.log('📝 Summary:');
    console.log('   - API handler can be imported as a module');
    console.log('   - Express app is properly configured');
    console.log('   - API routes are registered');
    console.log('   - Critical auth endpoint (/auth/send-code) is available');
    console.log('   - Ready for Vercel deployment\n');
    
    return true;
  } catch (error) {
    console.error('   ❌ Test failed:', error.message);
    console.error('\nError details:', error);
    return false;
  }
}

// Run tests
testAPIHandler()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
