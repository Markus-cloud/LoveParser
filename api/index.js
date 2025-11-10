// Vercel serverless function handler for all /api/* routes
// This file proxies all API requests to the Express app

import app from '../server/index.js';

// Export the Express app as a Vercel serverless function
export default app;
