# Broadcast Worker Implementation

## Overview

This document describes the implementation of the long-running broadcast task with SSE progress tracking, rate limiting, and result persistence for the Telegram broadcast feature.

## Architecture

### Components

1. **API Endpoint**: `POST /telegram/broadcast` - Accepts broadcast parameters and enqueues task
2. **Worker**: `taskManager.attachWorker('broadcast')` - Executes broadcast with progress updates
3. **Helper Functions**: Peer resolution, media sending, username lookup
4. **Result Persistence**: JSON files with delivery logs and summary statistics

## API Endpoint

### Route
```
POST /api/telegram/broadcast
```

### Request Body
```typescript
{
  audienceId?: string,           // Load recipients from audience results
  mode: 'dm' | 'chat',          // DM to users or post to channels
  manualRecipients?: Array<string | object>, // Additional recipients
  message: string,               // Message text (supports {name} token in DM mode)
  imageBase64?: string,          // Optional base64-encoded image
  maxRecipients?: number,        // Limit number of recipients
  delaySeconds?: number,         // Delay between sends (default: 2, min: 1)
  userId: string                 // Required for authorization
}
```

### Validation

1. **Authorization**: `userId` required (401 if missing)
2. **Message**: Non-empty message required (400 if missing)
3. **Mode**: Must be "dm" or "chat" (400 if invalid)
4. **Recipients**: At least one of `audienceId` or `manualRecipients` required (400 if both missing)
5. **Delay**: Must be ≥1 second (400 if less)
6. **Rate Limit Warning**: Warns if delay <2 seconds (risk of Telegram rate limits)

### Response
```json
{
  "taskId": "uuid"
}
```

## Worker Implementation

### Flow

```
1. Load Parameters
   ↓
2. Decode Image Buffer (if provided)
   ↓
3. Load Audience (if audienceId provided)
   ↓
4. Build Recipients Array
   ├─ DM Mode: Users from audience + manual recipients
   └─ Chat Mode: Deduplicated source channels + manual recipients
   ↓
5. Apply Recipient Limit (if maxRecipients specified)
   ↓
6. Sequential Message Delivery
   ├─ Resolve Peer (with fallback strategies)
   ├─ Personalize Message (DM mode: substitute {name})
   ├─ Send Message (with optional image)
   ├─ Log Result (success/failure)
   ├─ Update Progress (SSE broadcast)
   └─ Apply Delay (rate limiting)
   ↓
7. Persist Results to JSON
   ↓
8. Return Summary
```

### Recipient Building

#### DM Mode
- Uses `audienceUsers` directly (individual users)
- Adds manual recipients parsed as:
  - Strings: Username or user ID → user object
  - Objects: User objects with peer metadata

#### Chat Mode
- Extracts unique `sourceChannel` peers from audience users
- Deduplicates by channel ID
- Adds manual recipients parsed as:
  - Strings: Channel username or ID → channel object
  - Objects: Channel objects with peer metadata

### Peer Resolution

Uses fallback strategies via helper functions:

1. **resolvePeerFromUser(tg, user)**:
   - Try peer metadata → `peerToInputPeer(user.peer)`
   - Try username → `resolvePeerFromUsername(tg, user.username)`
   - Try ID with access hash → `new Api.InputPeerUser(...)`
   - Try getInputEntity with ID → `tg.getInputEntity(BigInt(user.id))`
   - Throw error if all fail

2. **resolvePeerFromUsername(tg, username)**:
   - Cleans username (removes @)
   - Resolves via `tg.getInputEntity(username)`

### Name Substitution (DM Mode)

Replaces `{name}` tokens in message with recipient name:

```javascript
const recipientName = recipient.fullName || 
                     recipient.firstName || 
                     recipient.username || 
                     recipient.id || 
                     'User';
const personalizedMessage = message.replace(/\{name\}/g, recipientName);
```

### Media Attachment

Uses `sendMediaMessage()` helper:

1. Decode base64 to buffer: `Buffer.from(imageBase64, 'base64')`
2. Upload file: `tg.uploadFile({ file: imageBuffer, workers: 1 })`
3. Send message: `tg.sendMessage(peerId, { message, file: uploadedFile })`

### Progress Tracking

SSE updates sent via `manager.setStatus()`:

```javascript
{
  progress: number,      // 0-100
  current: number,       // Messages sent
  total: number,         // Total recipients
  success: number,       // Successful sends
  failed: number,        // Failed sends
  message: string        // Status description
}
```

**Updates:**
- Initial: 0% "Starting broadcast..."
- Per-send: X% "Sent X/Y messages (X success, X failed)"
- Final: 100% with result summary

### Error Handling

- Each send attempt wrapped in try-catch
- Failures logged but don't stop processing
- Error details captured in delivery log
- Failed sends increment `failedCount`
- Successful sends increment `successCount`

### Rate Limiting

- Configurable delay via `delaySeconds` parameter (default: 2s, min: 1s)
- Applied between sends: `await sleep(delaySeconds * 1000)`
- Skips delay after last message
- Warns if delay <2s (Telegram rate limit risk)

## Result Persistence

### File Format

**Filename**: `broadcast_results_<timestamp>_<userId>.json`

**Structure**:
```json
{
  "id": "broadcast_<timestamp>_<userId>",
  "taskId": "uuid",
  "userId": "string",
  "audienceId": "string|null",
  "mode": "dm|chat",
  "message": "preview (first 100 chars)...",
  "hasImage": boolean,
  "delaySeconds": number,
  "maxRecipients": number|null,
  "timestamp": "ISO-8601",
  "summary": {
    "total": number,
    "success": number,
    "failed": number,
    "successRate": "X.XX%"
  },
  "deliveryLog": [
    {
      "recipient": {
        "id": "string",
        "username": "string|null",
        "name": "string"
      },
      "status": "success|failed",
      "error": "string|null",
      "timestamp": "ISO-8601",
      "duration": number
    }
  ]
}
```

### Delivery Log

Each entry records:
- **recipient**: ID, username, name/title
- **status**: "success" or "failed"
- **error**: Error message if failed, null if success
- **timestamp**: ISO-8601 timestamp of attempt
- **duration**: Time taken in milliseconds

## Helper Functions

### telegramClient.js

#### sendMediaMessage(peerId, message, imageBuffer)
Sends text message with optional image attachment.

**Parameters:**
- `peerId`: Recipient peer (InputPeer, username, or ID)
- `message`: Message text
- `imageBuffer`: Optional image buffer (decoded from base64)

**Returns:** `{ ok: true }`

#### resolvePeerFromUser(tg, user)
Resolves InputPeer from user object with fallback strategies.

**Fallback Order:**
1. Peer metadata → `peerToInputPeer(user.peer)`
2. Username → `resolvePeerFromUsername(tg, user.username)`
3. ID + access hash → `new Api.InputPeerUser(...)`
4. ID lookup → `tg.getInputEntity(BigInt(user.id))`

**Throws:** Error if all strategies fail

#### resolvePeerFromUsername(tg, username)
Resolves InputPeer from username string.

**Parameters:**
- `tg`: Telegram client
- `username`: Username (with or without @)

**Returns:** InputPeer via `tg.getInputEntity()`

#### peerToInputPeer(peer)
Converts peer metadata to GramJS InputPeer (already supported User type).

**Peer Types:**
- `'Channel'` → `InputPeerChannel`
- `'Chat'` → `InputPeerChat`
- `'User'` → `InputPeerUser`

## Logging

All broadcast operations log with `[BROADCAST]` prefix:

- **Worker Start**: Parameters (taskId, audienceId, mode, recipients count, settings)
- **Image Decode**: Buffer size
- **Audience Loading**: File found, users count
- **Recipient Building**: Mode-specific details, deduplication results
- **Recipient Limit**: Original vs limited counts
- **Delivery Start**: Total, mode, delay
- **Message Sent**: Per-recipient success (userId/channelId, username, name)
- **Message Failed**: Per-recipient failure (recipient, mode, error)
- **Completion**: Total, success, failed counts
- **History Saved**: historyId, filename

## Testing

### Unit Tests

1. **Validation Logic**:
   - ✅ Missing userId → 401
   - ✅ Missing message → 400
   - ✅ Invalid mode → 400
   - ✅ No recipients → 400
   - ✅ Delay <1s → 400

2. **Name Substitution**:
   - ✅ `{name}` replaced with fullName
   - ✅ Fallback to firstName, username, id
   - ✅ Multiple tokens replaced

3. **Recipient Limit**:
   - ✅ Applies slice when maxRecipients specified
   - ✅ No limit when null/undefined

4. **Manual Recipient Parsing**:
   - ✅ String with @ → username
   - ✅ String without @ → username
   - ✅ Object with peer → preserved

5. **Image Decoding**:
   - ✅ Valid base64 → Buffer
   - ✅ Invalid base64 → Error logged, continues

### Integration Tests

1. **Endpoint Request**:
   - ✅ Valid request → Returns taskId
   - ✅ Invalid request → Returns error status

2. **Worker Execution**:
   - ✅ Worker starts and logs
   - ✅ Attempts to load audience
   - ✅ Builds recipients correctly
   - ✅ Handles client errors gracefully

## Example Usage

### DM with Audience and Image

```javascript
const response = await fetch('/api/telegram/broadcast', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    userId: '408683910',
    audienceId: 'audience_1762706577574_408683910',
    mode: 'dm',
    message: 'Hello {name}! Check out our new feature.',
    imageBase64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB...',
    maxRecipients: 100,
    delaySeconds: 2
  })
});

const { taskId } = await response.json();

// Track progress via SSE
const eventSource = new EventSource(`/api/tasks/${taskId}/stream`);
eventSource.onmessage = (event) => {
  const { progress, current, total, success, failed, status, result } = JSON.parse(event.data);
  console.log(`Progress: ${progress}% (${current}/${total}, ${success} success, ${failed} failed)`);
  
  if (status === 'completed') {
    console.log('Broadcast completed:', result);
    eventSource.close();
  }
};
```

### Chat Mode with Manual Recipients

```javascript
const response = await fetch('/api/telegram/broadcast', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    userId: '408683910',
    mode: 'chat',
    manualRecipients: [
      '@channel1',
      '@channel2',
      { id: '123', username: 'channel3', peer: { id: '123', accessHash: '456', type: 'Channel' } }
    ],
    message: 'Important announcement!',
    delaySeconds: 3
  })
});
```

## Performance Considerations

1. **Rate Limiting**: Minimum 2s delay recommended to avoid Telegram limits
2. **Sequential Processing**: Messages sent one-by-one (not parallel) for control
3. **Memory**: Delivery log grows with recipient count (store per-recipient details)
4. **Disk I/O**: Single write operation at end (result persistence)
5. **Progress Updates**: SSE broadcast after each send (can have multiple listeners)

## Error Handling

### Common Errors

1. **FLOOD_WAIT**: Telegram rate limit hit
   - Logged as failed delivery
   - Processing continues for other recipients
   - Consider increasing delay

2. **USER_PRIVACY_RESTRICTED**: User blocked bots/messages
   - Logged as failed delivery
   - Processing continues

3. **PEER_ID_INVALID**: Invalid peer resolution
   - Logged as failed delivery
   - Falls back through resolution strategies

4. **FILE_TOO_LARGE**: Image too big
   - Entire broadcast fails
   - Consider validating image size before upload

## Future Enhancements

1. **Retry Logic**: Automatic retry for FLOOD_WAIT errors
2. **Batch Progress**: Update progress every N sends instead of every send
3. **Image Validation**: Check image size before starting broadcast
4. **Resume Support**: Allow resuming failed broadcasts
5. **History API**: Endpoint to list/retrieve broadcast history
6. **Statistics Dashboard**: Frontend UI showing broadcast history and stats

## Acceptance Criteria

✅ **Sequential Delivery**: Messages sent one-by-one with configured delay  
✅ **Name Substitution**: {name} tokens replaced in DM mode  
✅ **Image Support**: Optional images sent via GramJS  
✅ **Progress Tracking**: SSE stream reports current/total/success/failed  
✅ **Result Persistence**: JSON history files with per-recipient details  
✅ **Error Handling**: Failures logged but don't stop processing  
