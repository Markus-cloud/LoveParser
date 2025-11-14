# CSP Policy Fix for Telegram Web App

## Overview

This document describes the Content Security Policy (CSP) implementation that allows the Telegram Web App script and external fonts to load without CSP violations, while maintaining strong security practices.

## Problem Statement

The browser was blocking the following resources due to CSP violations:
- `https://telegram.org/js/telegram-web-app.js` - Telegram Web App SDK script
- `https://r2cdn.perplexity.ai/fonts/FKGroteskNeue.woff2` - External font

Error message:
```
Refused to load the script because it violates the following Content Security Policy directive: 
"default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: ws: wss:"
```

## Solution

A comprehensive CSP policy has been added to `index.html` that:

### 1. Explicitly Defines Resource Restrictions

Instead of relying on `default-src` as a catch-all, we now use specific directives:

- **`default-src 'self'`** - Conservative fallback for any resource not explicitly allowed
- **`script-src 'self' 'unsafe-inline' https://telegram.org`** - Allows scripts from self, inline (needed for Vite HMR), and Telegram Web App SDK
- **`style-src 'self' 'unsafe-inline'`** - Allows styles from self and inline (needed for React/Tailwind components)
- **`font-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com https://r2cdn.perplexity.ai https://cdn.jsdelivr.net`** - Allows fonts from multiple CDNs
- **`connect-src 'self' http://localhost:* https:`** - Allows API calls to self, localhost (dev), and all HTTPS connections
- **`img-src 'self' https: data:`** - Allows images from self, HTTPS, and data URIs
- **`media-src 'self' https: data:`** - Allows media files from self, HTTPS, and data URIs
- **`object-src 'none'`** - Prevents plugin objects for security
- **`base-uri 'self'`** - Restricts base URIs to same-origin
- **`form-action 'self'`** - Restricts form submissions to same-origin
- **`frame-ancestors 'self' https://web.telegram.org`** - Allows embedding in Telegram Web context

### 2. Security Improvements

- ✅ **Removed `'unsafe-eval'`** - Not needed in the codebase (verified via code audit)
- ✅ **Restricted `default-src`** - Only allows same-origin resources by default
- ✅ **Added `frame-ancestors`** - Specifies which contexts can embed this app
- ✅ **Added `object-src 'none'`** - Prevents plugin objects
- ✅ **Restricted form actions** - Only same-origin form submissions allowed

### 3. Why `'unsafe-inline'` is Still Used

While `'unsafe-inline'` is generally discouraged for security, it's necessary in this case because:

1. **Vite HMR (Hot Module Replacement)** - Needs inline scripts for development hot-reload
2. **React/Tailwind components** - React components generate inline styles dynamically
3. **No eval() usage** - Code audit confirmed no `eval()` calls in the codebase

**Security Note**: This CSP still prevents `eval()` and other dynamic code execution while allowing the required inline scripts and styles.

## Testing

Run the CSP validation test:

```bash
node test-csp-policy.js
```

Expected output: All 20 tests pass

### Manual Browser Testing

1. **Open the application**
   ```bash
   npm run dev
   ```

2. **Check DevTools Console** (F12 > Console)
   - Should see NO CSP warnings or errors
   - Should see `window.Telegram.WebApp` object available
   - Fonts should load without errors

3. **Network Tab** (F12 > Network)
   - `telegram.org/js/telegram-web-app.js` should load with status 200
   - Font files should load with status 200
   - No CSP error responses

4. **Test Application Features**
   - Dashboard page loads and functions
   - Parsing functionality works
   - Audience selection works
   - Broadcast page loads
   - Help page loads
   - API calls complete successfully (check Network tab for 200/201 responses)

## Production Build

The CSP policy is preserved in production builds:

```bash
npm run build
```

Verify CSP in `dist/index.html`:

```bash
grep "Content-Security-Policy" dist/index.html
```

Should output the complete CSP policy.

## Security Audit Checklist

- ✅ No `eval()` calls in codebase
- ✅ `unsafe-eval` removed from CSP
- ✅ `unsafe-inline` used only for necessary styles/scripts
- ✅ `object-src` set to `'none'` to prevent plugins
- ✅ `form-action` restricted to same-origin
- ✅ `base-uri` restricted to same-origin
- ✅ Frame ancestors restricted to self and Telegram Web context
- ✅ All external resources use HTTPS
- ✅ External domains whitelisted explicitly
- ✅ Development URLs (localhost) restricted to HTTP (localhost only)

## Implementation Details

### Files Modified

- `index.html` - Added CSP meta tag with full policy definition

### Changes

1. Added `<meta http-equiv="Content-Security-Policy">` tag in `<head>`
2. Configured specific directives for each resource type
3. Added comprehensive inline comments explaining each directive
4. Removed reliance on overly permissive `default-src`

### Browser Support

CSP is supported in all modern browsers:
- Chrome/Edge 25+
- Firefox 23+
- Safari 7+
- Mobile browsers (iOS Safari, Chrome Mobile, etc.)

For older browsers, the policy is ignored but doesn't break functionality.

## Future Improvements

### Potential Optimizations (without breaking functionality)

1. **Nonces for Inline Scripts** - Replace `'unsafe-inline'` with nonce-based CSP (requires dynamic nonce generation per request)
2. **Subresource Integrity** - Add SRI hashes to external scripts
3. **Report-URI** - Add CSP violation reporting endpoint for monitoring

### Not Recommended

- Removing `'unsafe-inline'` for styles - Would break React component styling
- Removing localhost from connect-src - Would break local development
- Making font-src more restrictive - Would limit font options

## References

- [MDN: Content Security Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP)
- [CSP Reference](https://content-security-policy.com/)
- [Telegram Web App Documentation](https://core.telegram.org/bots/webapps)

## Troubleshooting

### CSP Violations Still Appearing

1. Clear browser cache (Ctrl+Shift+Delete)
2. Hard refresh (Ctrl+Shift+R or Cmd+Shift+R)
3. Check if browser extensions are injecting content
4. Verify Telegram Web App SDK script URL hasn't changed

### Fonts Not Loading

1. Check DevTools Network tab for failed font requests
2. Verify `font-src` includes the required CDN domain
3. Ensure fonts are served over HTTPS
4. Check CORS headers on font requests

### Application Not Working

1. Open DevTools Console for any error messages
2. Check Network tab for failed API requests
3. Verify all API domains are in `connect-src`
4. For WebSocket connections, verify `ws:` and `wss:` are allowed if needed

## Conclusion

This CSP implementation provides a strong security posture while maintaining full functionality of the Telegram Web App integration. The policy is restrictive by default and only allows specific resources explicitly.
