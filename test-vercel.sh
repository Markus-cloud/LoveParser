#!/bin/bash

# Test script for Vercel deployment
echo "🔍 Testing Vercel deployment configuration..."

# Check if vercel.json exists
if [ ! -f "vercel.json" ]; then
    echo "❌ vercel.json not found"
    exit 1
else
    echo "✅ vercel.json found"
fi

# Check if server/index.js exports app
if grep -q "export default app" server/index.js; then
    echo "✅ Server exports app for Vercel"
else
    echo "❌ Server doesn't export app"
    exit 1
fi

# Check if package.json has correct type
if grep -q '"type": "module"' package.json; then
    echo "✅ Package.json has ES modules type"
else
    echo "❌ Package.json missing ES modules type"
    exit 1
fi

# Check API routes
if [ -f "server/routes/telegram.js" ]; then
    echo "✅ Telegram routes found"
    if grep -q "/auth/send-code" server/routes/telegram.js; then
        echo "✅ Auth endpoint exists"
    else
        echo "❌ Auth endpoint missing"
        exit 1
    fi
else
    echo "❌ Telegram routes not found"
    exit 1
fi

# Check environment example
if [ -f ".env.example" ]; then
    echo "✅ Environment example found"
else
    echo "❌ Environment example missing"
    exit 1
fi

echo "🎉 All checks passed! Ready for Vercel deployment."
echo ""
echo "📋 Next steps:"
echo "1. Set TELEGRAM_API_ID and TELEGRAM_API_HASH in Vercel Environment Variables"
echo "2. Push to GitHub"
echo "3. Import repository in Vercel"
echo "4. Deploy!"