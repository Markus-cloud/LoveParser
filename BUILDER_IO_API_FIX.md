# Builder.io API URL Resolution Fix

## Problem
When running LoveParser in builder.io (HTTPS environment), the app threw "net::ERR_TIMED_OUT" errors because it tried to fetch from `https://efd864b…-1bf014b….projects.builder.codes:8080/` instead of using the correct relative API path `/api`.

## Root Cause
Multiple components in the codebase were making direct `fetch()` calls with `import.meta.env.VITE_API_URL || '/api'` instead of using the centralized `apiFetch()` function. This caused inconsistent URL resolution behavior, particularly in production environments like builder.io where the app runs over HTTPS.

## Solution Implemented

### 1. Centralized API URL Resolution
Updated `src/lib/api.ts` to use environment-aware URL resolution:

```typescript
// In production/builder.io, always use relative '/api' to avoid port issues
// In development, use VITE_API_URL if set, otherwise default to '/api'
const API_BASE_URL = import.meta.env.PROD 
  ? '/api' 
  : (import.meta.env.VITE_API_URL || '/api');
```

### 2. Replaced Direct Fetch Calls
Replaced all direct `fetch()` calls with the centralized functions:

#### AuthContext.tsx
- Replaced direct fetch calls with `apiFetch()` for authentication status checking and user login
- Fixed nested try-catch block structure

#### Login.tsx
- Replaced direct fetch calls with `apiFetch()` for sending codes and signing in
- Added proper TypeScript types for API responses
- Enhanced error handling for 2FA password requirements

#### Audience.tsx & Parsing.tsx
- Created new `apiDownload()` function for file downloads
- Replaced direct fetch calls with `apiDownload()` for CSV/ZIP downloads
- Updated EventSource URL construction for SSE to use environment-aware resolution

### 3. New apiDownload Function
Added a new centralized download function in `api.ts`:

```typescript
export async function apiDownload(path: string, userId?: string): Promise<void> {
  // Uses same environment-aware URL resolution as apiFetch
  // Handles blob responses and automatic file downloads
  // Extracts filename from Content-Disposition headers
}
```

## Files Modified

1. **src/lib/api.ts**
   - Enhanced API_BASE_URL resolution logic
   - Added apiDownload function
   - Updated useApi hook to include download method

2. **src/context/AuthContext.tsx**
   - Replaced direct fetch calls with apiFetch
   - Fixed nested try-catch structure
   - Added proper error handling

3. **src/pages/Login.tsx**
   - Replaced direct fetch calls with apiFetch
   - Added proper TypeScript types
   - Enhanced 2FA password handling

4. **src/pages/Audience.tsx**
   - Replaced direct fetch calls with apiDownload
   - Updated SSE EventSource URL construction

5. **src/pages/Parsing.tsx**
   - Replaced direct fetch calls with apiDownload

## Environment-Specific Behavior

### Development (npm run dev)
- Uses VITE_API_URL if set, otherwise defaults to '/api'
- Vite proxy handles forwarding to localhost:4000
- Full debugging and hot reload support

### Production (builder.io)
- Always uses relative '/api' path
- Prevents absolute URL construction with port numbers
- Works correctly with HTTPS and domain-based routing

### Build Process
- All API calls resolve to relative paths in production builds
- No hardcoded ports or absolute URLs in bundled code
- Consistent behavior across different deployment environments

## Testing

### Build Verification
```bash
npm run build  # ✅ Successful
npm run lint   # ✅ No errors (only fast refresh warnings)
```

### Local Development
```bash
npm run dev:all  # ✅ Works with Vite proxy to localhost:4000
npm run server   # ✅ Backend runs on port 4000
```

## Benefits

1. **Consistent URL Resolution**: All API calls now use the same environment-aware logic
2. **Production Safety**: No hardcoded ports or absolute URLs in production builds
3. **Builder.io Compatibility**: Proper relative path handling for HTTPS deployment
4. **Maintainability**: Centralized API logic reduces code duplication
5. **Type Safety**: Better TypeScript types for API responses
6. **Error Handling**: Improved error handling for authentication flows

## Future Considerations

- The environment detection logic can be extended for other deployment targets
- The apiDownload function can be enhanced with progress reporting for large files
- Consider adding request/response interceptors for logging and debugging
- The SSE EventSource construction could also be centralized if more components use it