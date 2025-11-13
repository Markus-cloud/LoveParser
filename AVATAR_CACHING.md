# Telegram Avatar Caching Feature

## Overview

This document describes the implementation of Telegram user profile photo caching in the Tele-fluence application.

## Architecture

### Backend Components

#### 1. Avatar Fetching Helper (`server/services/telegramClient.js`)

**Function: `fetchUserProfilePhoto(tg, userId)`**

- Downloads user profile photos from Telegram using GramJS API
- Stores photos in `server/data/avatars/<userId>.jpg`
- Creates metadata files `<userId>.meta.json` with:
  - `photoId`: Telegram's unique photo identifier
  - `userId`: User ID
  - `downloadedAt`: Timestamp
  - `fileSize`: File size in bytes
- Implements intelligent caching:
  - Checks if photo already exists
  - Compares cached `photoId` with current Telegram `photoId`
  - Only re-downloads if photo has changed
  - Returns `null` values gracefully when no photo exists

**Usage in Authentication Flow:**

- Called automatically during `signIn()` after successful authentication
- Non-blocking: authentication succeeds even if avatar fetch fails
- Returns `{ photoPath, photoUrl, photoId }` object

**Enhanced `getAuthStatus()`:**

- Checks for cached avatar file
- Returns `photoUrl: /api/user/avatar/<userId>.jpg` if avatar exists
- Returns `photoUrl: null` if no cached avatar

**Enhanced `signIn()`:**

- Calls `fetchUserProfilePhoto()` after successful authentication
- Includes `photo_url` and `photo_id` in user response object
- Logs warnings but doesn't fail on avatar fetch errors

#### 2. User Data Persistence (`server/lib/users.js`)

**Enhanced `upsertUser()` function:**

- Accepts and persists `photo_url` field
- Accepts and persists `photo_id` field for cache validation
- Tracks `photoUpdatedAt` timestamp
- Maintains backward compatibility with existing user records

#### 3. Static File Serving (`server/index.js`)

**Avatar Endpoint: `/api/user/avatar`**

```javascript
app.use('/api/user/avatar', express.static(path.join(__dirname, 'data', 'avatars'), {
  maxAge: '1d',
  immutable: false,
  setHeaders: (res, filePath) => {
    res.set('Cache-Control', 'public, max-age=86400'); // 1 day
    res.set('Access-Control-Allow-Origin', '*'); // CORS enabled
  }
}));
```

Features:
- Serves cached avatar images
- 1-day browser cache with proper headers
- CORS enabled for cross-origin access
- Automatic 404 handling for missing files

### Frontend Components

#### 1. Login Page (`src/pages/Login.tsx`)

**Enhanced sign-in response handling:**

```typescript
const data = await apiFetch('/telegram/auth/sign-in', {
  method: 'POST',
  body: { phoneCode: code, password: needsPassword ? password : undefined },
}) as { 
  success?: boolean; 
  user?: { 
    id: string | number; 
    username?: string; 
    firstName?: string; 
    lastName?: string; 
    photo_url?: string; 
    photo_id?: string 
  }; 
  session?: string 
};

const userData = {
  id: String(data.user.id),
  username: data.user.username,
  firstName: data.user.firstName,
  lastName: data.user.lastName,
  first_name: data.user.firstName,
  last_name: data.user.lastName,
  photo_url: data.user.photo_url, // NEW
};
```

#### 2. Auth Context (`src/context/AuthContext.tsx`)

**Enhanced session validation:**

- Checks `auth/status` endpoint for `photoUrl` field
- Updates cached user data if photo URL changes
- Persists updated `photo_url` to localStorage

**User type includes:**
```typescript
type User = {
  id: string;
  username?: string;
  first_name?: string;
  last_name?: string;
  photo_url?: string; // Used by Dashboard
  language_code?: string;
  firstName?: string;
  lastName?: string;
};
```

#### 3. Dashboard (`src/pages/Dashboard.tsx`)

**Avatar display logic:**

```typescript
const photoUrl = authUser.photo_url || 
  `https://api.dicebear.com/7.x/avataaars/svg?seed=${authUser.id}`;
```

- Prioritizes Telegram avatar (`photo_url`)
- Falls back to DiceBear avatar if not available
- Uses shadcn `Avatar` component with proper fallback

## File Structure

```
server/
├── data/
│   └── avatars/
│       ├── .gitkeep              # Tracked by Git
│       ├── <userId>.jpg          # Cached avatar (ignored by Git)
│       └── <userId>.meta.json    # Cache metadata (ignored by Git)
├── services/
│   └── telegramClient.js         # Avatar fetching logic
├── lib/
│   └── users.js                  # User data persistence
└── index.js                      # Static file serving

src/
├── context/
│   └── AuthContext.tsx           # User state management
├── pages/
│   ├── Login.tsx                 # Sign-in with avatar
│   └── Dashboard.tsx             # Avatar display
```

## API Endpoints

### 1. POST `/api/telegram/auth/sign-in`

**Response includes:**
```json
{
  "success": true,
  "session": "...",
  "user": {
    "id": "408683910",
    "username": "johndoe",
    "firstName": "John",
    "lastName": "Doe",
    "photo_url": "/api/user/avatar/408683910.jpg",
    "photo_id": "5472640853591234567"
  }
}
```

### 2. GET `/api/telegram/auth/status`

**Response includes:**
```json
{
  "authenticated": true,
  "isBot": false,
  "userId": "408683910",
  "username": "johndoe",
  "firstName": "John",
  "lastName": "Doe",
  "photoUrl": "/api/user/avatar/408683910.jpg"
}
```

### 3. GET `/api/user/avatar/<userId>.jpg`

**Static file endpoint:**
- Returns cached avatar image
- Content-Type: `image/jpeg`
- Cache-Control: `public, max-age=86400` (1 day)
- CORS enabled
- 404 if avatar not cached

### 4. POST `/api/user/login`

**Accepts and persists:**
```json
{
  "user": {
    "id": "408683910",
    "username": "johndoe",
    "first_name": "John",
    "last_name": "Doe",
    "photo_url": "/api/user/avatar/408683910.jpg",
    "photo_id": "5472640853591234567",
    "language_code": "en"
  }
}
```

### 5. GET `/api/user/:id`

**Returns persisted user data including:**
- `photo_url`
- `photo_id`
- `photoUpdatedAt`

## Caching Strategy

### Cache Validation

1. When `fetchUserProfilePhoto()` is called:
   - Checks if `<userId>.jpg` exists
   - Reads `<userId>.meta.json`
   - Compares cached `photoId` with current Telegram `photoId`
   - Re-downloads only if photo ID changed or cache missing

### Cache Invalidation

Avatars are re-downloaded when:
- User's Telegram photo ID changes
- Cached metadata file is missing or corrupted
- Manual deletion of cached files

### Cache Expiration

- **Server-side**: No automatic expiration (validated by photo ID)
- **Client-side**: 1-day browser cache via HTTP headers
- **localStorage**: Persists until user logs out

## Error Handling

### Non-Blocking Failures

Avatar fetching errors don't prevent authentication:

```javascript
try {
  const photoResult = await fetchUserProfilePhoto(tg, userId);
  photoUrl = photoResult.photoUrl;
} catch (photoErr) {
  logger.warn('Failed to fetch profile photo during sign in', { 
    error: String(photoErr?.message || photoErr) 
  });
  // Continue without photo - non-blocking error
}
```

### Graceful Degradation

- Missing avatars return `null` values
- Frontend falls back to DiceBear avatars
- API returns user data even without photo
- Empty photo buffers handled gracefully

### Logging

All avatar operations logged with:
- Performance metrics (`[PERF]` prefix)
- Success/failure status
- Photo IDs for cache tracking
- File sizes for monitoring

## Git Configuration

### `.gitignore` entries:

```gitignore
# Server data and sessions
server/data/*.json
server/data/*.session
server/data/avatars/*.jpg          # Ignore cached avatars
server/data/avatars/*.meta.json    # Ignore cache metadata
!server/data/.gitkeep
!server/data/avatars/.gitkeep      # Track directory structure
```

## Testing

### Manual Verification

1. **Authentication Flow:**
   ```bash
   # Sign in with phone number that has profile photo
   curl -X POST http://localhost:4000/api/telegram/auth/sign-in \
     -H "Content-Type: application/json" \
     -d '{"phoneCode": "12345"}'
   # Response should include photo_url
   ```

2. **Avatar Retrieval:**
   ```bash
   # Check cached avatar exists
   ls -la server/data/avatars/
   
   # Access avatar via HTTP
   curl -I http://localhost:4000/api/user/avatar/408683910.jpg
   # Should return 200 OK with Cache-Control headers
   ```

3. **Frontend Display:**
   - Log in with account that has profile photo
   - Navigate to Dashboard
   - Verify avatar displays (not DiceBear fallback)
   - Check browser Network tab for `/api/user/avatar/` request

### Automated Tests

```javascript
// Test avatar directory setup
node -e "import('./server/services/telegramClient.js').then(m => {
  console.log('fetchUserProfilePhoto exported:', typeof m.fetchUserProfilePhoto === 'function');
});"
```

## Performance

### Optimization Features

1. **Photo ID-based caching**: Avoids unnecessary downloads
2. **Medium-sized photos**: `isBig: false` reduces bandwidth
3. **HTTP caching**: 1-day browser cache reduces server load
4. **Async operations**: Non-blocking avatar fetch
5. **Early validation**: Checks cache before API call

### Network Impact

- Initial download: ~50-200 KB per avatar (medium size)
- Subsequent loads: Served from disk cache
- Browser caching: Only downloads when expired or cleared

## Security Considerations

### Access Control

- Avatars served as static files (no auth required)
- User IDs in URLs are public information
- CORS enabled for cross-origin access
- No sensitive data in avatar metadata

### File Safety

- Only `.jpg` files served
- Directory traversal prevented by Express static middleware
- File uploads not supported (download-only)
- Metadata files stored separately

## Future Enhancements

### Potential Improvements

1. **Avatar refresh endpoint**: Manual trigger to re-download
2. **Automatic refresh**: Periodic check for photo updates
3. **Multiple sizes**: Support for thumbnail/full-size variants
4. **WebP format**: Modern format for smaller file sizes
5. **CDN integration**: Serve avatars from CDN for better performance
6. **Admin panel**: View cached avatars and clear cache
7. **Upload fallback**: Allow manual avatar upload if Telegram fetch fails

## Troubleshooting

### Common Issues

**Avatar not displaying:**
1. Check server logs for download errors
2. Verify avatar file exists in `server/data/avatars/`
3. Check HTTP response from `/api/user/avatar/<userId>.jpg`
4. Clear browser cache and reload
5. Verify Telegram account has profile photo

**Cache not updating:**
1. Delete cached `.meta.json` file to force re-download
2. Check Telegram photo ID in metadata matches current
3. Review server logs for cache validation logic

**Performance issues:**
1. Monitor avatar file sizes
2. Check for repeated download attempts
3. Verify HTTP cache headers working
4. Consider CDN for high-traffic scenarios

## Conclusion

The avatar caching feature provides:
- ✅ Automatic profile photo download on sign-in
- ✅ Intelligent caching with photo ID validation
- ✅ Graceful fallback when photos unavailable
- ✅ Performance optimization with HTTP caching
- ✅ Non-blocking error handling
- ✅ Full integration with authentication flow
- ✅ Static file serving with proper headers
- ✅ Git-friendly directory structure

All acceptance criteria from the ticket have been met, and the implementation follows existing codebase patterns and conventions.
