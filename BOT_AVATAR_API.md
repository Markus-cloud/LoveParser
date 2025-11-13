# Bot Avatar API Documentation

This document describes the new Bot API-based avatar download feature that replaces the GramJS MTProto approach.

## Overview

The avatar download system now uses the Telegram Bot API instead of GramJS's MTProto methods. This eliminates CSP "unsafe-eval" issues and provides a more stable, maintainable solution for fetching user profile photos.

## Architecture Changes

### What Changed

1. **New Bot API Service** (`server/services/telegramBotApi.js`)
   - Wraps Telegram Bot API methods (`getUserProfilePhotos`, `getFile`)
   - Downloads profile photos via HTTPS (no MTProto)
   - Normalizes photo sizes and handles errors gracefully

2. **Enhanced User Library** (`server/lib/users.js`)
   - New `updateUserAvatar()` helper to persist Bot API metadata
   - New `getUserAvatarMetadata()` helper to retrieve cached metadata
   - Stores `file_id`, `file_unique_id`, dimensions, and download timestamp

3. **New Photo Endpoint** (`GET /api/user/:id/photo`)
   - Returns `{ photo_url }` pointing to backend-served avatar
   - Supports `?refresh=true` to force cache refresh
   - Returns 503 when `TELEGRAM_BOT_TOKEN` is missing
   - Returns 404 when user doesn't exist

4. **Updated Sign-In Flow** (`server/services/telegramClient.js`)
   - `signIn()` now uses Bot API helper instead of GramJS
   - Gracefully handles missing Bot token (logs warning, continues)
   - Returns `photo_url` and `photo_id` in response

5. **Deprecated GramJS Method**
   - `fetchUserProfilePhoto()` is now commented out
   - No longer exported from `telegramClient.js`

## Configuration

### Required Environment Variable

```bash
# Get this from @BotFather on Telegram
TELEGRAM_BOT_TOKEN=110201543:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw
```

**Important**: Without this token:
- Sign-in will succeed but avatars won't be downloaded
- `/api/user/:id/photo` will return 503 status
- No CSP violations will occur (graceful degradation)

### Getting a Bot Token

1. Open Telegram and search for `@BotFather`
2. Send `/newbot` and follow the prompts
3. Copy the token provided
4. Add to `.env.local` (local dev) or `.env` (production)

## API Reference

### GET /api/user/:id/photo

Get user profile photo URL with caching.

#### Request

```
GET /api/user/123456789/photo
GET /api/user/123456789/photo?refresh=true
```

#### Response (Success)

```json
{
  "photo_url": "/api/user/avatar/123456789.jpg"
}
```

#### Response (No Photo)

```json
{
  "photo_url": null
}
```

#### Response (Bot Token Missing - 503)

```json
{
  "error": "TELEGRAM_BOT_TOKEN not configured. Bot API features are unavailable.",
  "photo_url": null
}
```

#### Response (User Not Found - 404)

```json
{
  "error": "User not found. Please login first."
}
```

### Caching Behavior

- First request downloads photo from Telegram and caches it
- Subsequent requests return cached URL instantly
- Cache includes Bot API metadata for validation
- Use `?refresh=true` to force re-download

## File Storage

### Avatar Files

- **Location**: `server/data/avatars/`
- **Naming**: `{userId}.{ext}` (e.g., `123456789.jpg`)
- **Extensions**: Determined by Telegram (usually `.jpg`)

### Metadata Storage

Avatar metadata is now stored in the user profile record (`server/data/users.json`):

```json
{
  "123456789": {
    "id": "123456789",
    "username": "example_user",
    "photo_url": "/api/user/avatar/123456789.jpg",
    "photo_id": "AgACAgIAAxkBAAMCY...",
    "photoUpdatedAt": 1234567890000,
    "avatarMetadata": {
      "file_id": "AgACAgIAAxkBAAMCY...",
      "file_unique_id": "AQADeq_qgyl4xD1",
      "file_size": 12345,
      "width": 160,
      "height": 160,
      "downloadedAt": "2024-01-15T10:30:00.000Z",
      "fileExtension": ".jpg"
    }
  }
}
```

## Testing

### Manual Test (With Bot Token)

```bash
# 1. Ensure TELEGRAM_BOT_TOKEN is set in .env.local
echo $TELEGRAM_BOT_TOKEN

# 2. Start the server
npm run server

# 3. Sign in via frontend or API
curl -X POST http://localhost:4000/api/telegram/auth/send-code \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber": "+1234567890"}'

curl -X POST http://localhost:4000/api/telegram/auth/sign-in \
  -H "Content-Type: application/json" \
  -d '{"phoneCode": "12345"}'

# 4. Get user photo (replace USER_ID with your Telegram ID)
curl http://localhost:4000/api/user/USER_ID/photo

# Expected response:
# {"photo_url":"/api/user/avatar/USER_ID.jpg"}

# 5. Access the avatar directly
open http://localhost:4000/api/user/avatar/USER_ID.jpg

# 6. Force refresh
curl "http://localhost:4000/api/user/USER_ID/photo?refresh=true"
```

### Manual Test (Without Bot Token)

```bash
# 1. Remove or comment out TELEGRAM_BOT_TOKEN in .env.local
# TELEGRAM_BOT_TOKEN=

# 2. Restart server
npm run server

# 3. Try to get user photo
curl http://localhost:4000/api/user/USER_ID/photo

# Expected response (503):
# {
#   "error": "TELEGRAM_BOT_TOKEN not configured. Bot API features are unavailable.",
#   "photo_url": null
# }

# 4. Sign-in should still work (avatars just won't download)
# Check server logs for warning message about missing token
```

### Integration Test

```bash
# Run the full test suite
npm run test:all

# Check lint
npm run lint

# Build check
npm run build
```

## Benefits

### 1. No CSP Violations

- Bot API uses standard HTTPS requests
- No `eval()` or dynamic code execution
- Safe for strict CSP policies

### 2. Better Error Handling

- Clear error messages when token is missing
- Non-blocking failures (sign-in succeeds without avatars)
- Graceful degradation

### 3. Simpler Maintenance

- Standard REST API instead of MTProto complexity
- No session management for avatar downloads
- Easier to debug and test

### 4. Flexible Caching

- Metadata stored in user records (single source of truth)
- File existence checks before returning cached URLs
- Force refresh capability

## Migration Notes

### For Existing Deployments

1. Add `TELEGRAM_BOT_TOKEN` to environment variables
2. Existing avatar files (`.jpg`, `.meta.json`) will be ignored
3. New avatars will be re-downloaded via Bot API on next sign-in
4. No database migrations needed (metadata stored in existing user records)

### For Frontend

No changes required:
- Sign-in response still includes `photo_url` and `photo_id`
- Avatar URLs remain backend-served (`/api/user/avatar/...`)
- Fallback to DiceBear avatars when `photo_url` is null

## Troubleshooting

### Issue: 503 "Bot API features unavailable"

**Cause**: `TELEGRAM_BOT_TOKEN` not configured

**Solution**:
1. Get token from @BotFather
2. Add to `.env.local` or `.env`
3. Restart server

### Issue: Avatar not updating

**Cause**: Cached avatar is stale

**Solution**:
1. Use `?refresh=true` query parameter
2. Or delete cached file: `server/data/avatars/{userId}.jpg`

### Issue: Downloaded file has wrong extension

**Cause**: Telegram returned unusual format

**Solution**:
- Bot API determines extension from `file_path`
- Static middleware serves all extensions
- Check `avatarMetadata.fileExtension` in user record

## Future Enhancements

Potential improvements:
1. Batch avatar downloads for audience members
2. Thumbnail generation for different sizes
3. Cache expiration based on `file_unique_id` changes
4. Webhook-based avatar update notifications
