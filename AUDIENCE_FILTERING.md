# Audience Filtering Implementation

## Overview

This document describes the audience filtering implementation that excludes closed profiles and bots from audience search results. This feature ensures that audience results only contain reachable, non-bot users with valid usernames.

## Features

### 1. Closed Profile Filtering

**Problem**: Users without usernames (closed/private profiles) were being included in audience results, making them unreachable for public contact.

**Solution**: Implemented `filterClosedProfiles()` function that excludes users without valid usernames.

**Criteria**:
- User must have a `username` field
- Username must be a non-empty string
- Username must not be whitespace-only

**Examples of filtered profiles**:
- `username: null` - Filtered out
- `username: ""` - Filtered out
- `username: "   "` - Filtered out (whitespace only)
- `username: "john_doe"` - ✅ Kept

### 2. Bot Filtering

**Problem**: Bot accounts were being included in audience results, which are not suitable for most marketing/outreach purposes.

**Solution**: Implemented `filterBots()` function that excludes bot accounts using two detection methods.

**Detection Methods**:
1. **Bot Flag**: Check if `user.bot === true`
2. **Username Pattern**: Check if username ends with "bot" (case-insensitive)

**Examples**:
- `username: "mybot"` - Filtered out (ends with "bot")
- `username: "test_bot"` - Filtered out (ends with "bot")
- `username: "chatbot"` - Filtered out (ends with "bot")
- `username: "BotMaster"` - ✅ Kept (doesn't end with "bot")
- `bot: true` - Filtered out (bot flag)
- `bot: false` - ✅ Kept

### 3. Bio Field

**Status**: ✅ Already working correctly

The bio field is already being fetched and saved in audience results:
- Fetched via `users.GetFullUser()` API call in `enrichUsersWithFullProfile()`
- Extracted from `fullUser.fullUser?.about` field
- Saved in audience results JSON files
- Included in CSV exports with "Био" column
- May be empty if user has no bio set in their Telegram profile

## Implementation Details

### Filtering Functions

#### `filterClosedProfiles(users)`

```javascript
/**
 * Filters out closed/private profiles (users without username)
 * @param {Array} users - Array of user objects
 * @returns {Array} - Filtered array of users with usernames
 */
function filterClosedProfiles(users) {
  return users.filter(user => {
    const username = user.username;
    return username && typeof username === 'string' && username.trim() !== '';
  });
}
```

#### `filterBots(users)`

```javascript
/**
 * Filters out bots (username ending with "bot" or bot flag)
 * @param {Array} users - Array of user objects
 * @returns {Array} - Filtered array of non-bot users
 */
function filterBots(users) {
  return users.filter(user => {
    // Check bot flag if available
    if (user.bot === true) {
      return false;
    }
    
    // Check username ending with "bot"
    const username = user.username;
    if (username && typeof username === 'string') {
      const usernameLower = username.toLowerCase().trim();
      if (usernameLower.endsWith('bot')) {
        return false;
      }
    }
    
    return true;
  });
}
```

### Integration in Parse Audience Worker

The filtering is applied in the `parse_audience` worker in the following order:

1. **Get participants** from channels
2. **Add source channel metadata** to users
3. **Deduplicate** users by ID
4. **Apply participant limit**
5. **Enrich** with full profile data (bio, phone, fullName)
6. **Filter closed profiles** ← NEW
7. **Filter bots** ← NEW
8. **Filter by bio keywords** (if specified)
9. **Save results**

### Progress Tracking

The filtering steps are tracked in SSE updates:

```javascript
// Progress: 80% - Filtering closed profiles
manager.setStatus(task.id, 'running', { 
  progress: 80,
  message: 'Filtering closed profiles...'
});

// Progress: 82% - Filtering bots
manager.setStatus(task.id, 'running', { 
  progress: 82,
  message: 'Filtering bots...'
});
```

### Logging

Detailed logs show the impact of each filtering step:

```javascript
logger.info('Filtered closed profiles', { 
  before: enrichedUsers.length, 
  after: withUsernameUsers.length,
  filtered: enrichedUsers.length - withUsernameUsers.length
});

logger.info('Filtered bots', { 
  before: withUsernameUsers.length, 
  after: nonBotUsers.length,
  filtered: withUsernameUsers.length - nonBotUsers.length
});
```

## Testing

### Test Script

Run the test script to verify filtering logic:

```bash
node test-audience-filtering.js
```

### Test Results

Example test results:

```
Total users: 11
After all filters: 4 users
Total filtered out: 7 users

Filtering Summary:
- Closed profiles filtered: 3
- Bots filtered: 4
- Total filtered: 7
- Remaining users: 4
- Filtering rate: 64%
```

### Manual Testing

1. **Start audience search** with a parsing session or channel link
2. **Set participant limit** (required field)
3. **Optional**: Add bio keywords for additional filtering
4. **Monitor progress** in the UI - you'll see filtering steps
5. **Check results**:
   - All users should have valid usernames
   - No bot accounts should be present
   - Bio field should be populated (or null if user has no bio)
6. **Download CSV** and verify:
   - Username column is never empty
   - No usernames ending with "bot"
   - Bio column exists (may be empty for some users)

## Impact on Results

### Expected Behavior

- **Fewer results**: The filtering will reduce the number of users in results
- **Higher quality**: Results only include reachable, non-bot users
- **Accurate counts**: Progress tracking and final counts reflect filtered numbers

### Example Scenario

Before filtering:
- 1000 participants fetched
- 50 without username (closed profiles)
- 100 bots
- After filtering: **850 users**

## CSV Export Format

The CSV export includes all fields with proper headers:

```csv
ID;Username;Имя;Фамилия;Полное имя;Телефон;Био;Источник канал
123456789;john_doe;John;Doe;John Doe;+1234567890;Business owner and investor;Финансист | Бизнес (@finansist_busines)
```

## Backward Compatibility

- Existing audience results without these filters remain unchanged
- New results automatically include filtering
- CSV export format unchanged (bio column already existed)

## Performance Considerations

- Filtering is applied **after** enrichment to avoid wasting API calls
- Enrichment uses caching to minimize API requests
- Filtering is performed in-memory and is very fast
- No additional API calls required for filtering

## Configuration

No configuration needed - filtering is always applied:

- **Closed profiles**: Always filtered
- **Bots**: Always filtered
- **Bio keywords**: Optional (user-specified)

## Known Limitations

1. **Username pattern matching**: Only detects bots with username ending in "bot"
   - Some bots may not follow this pattern
   - Bot flag detection helps catch these cases

2. **Closed profiles**: Only detects profiles without username
   - Some profiles may have username but still be private
   - These will be included in results

3. **Bio availability**: Depends on user's Telegram profile
   - Not all users have bio set
   - Empty bio doesn't mean filtering failed

## Troubleshooting

### Issue: Too many users filtered out

**Possible causes**:
- Many users in channel have no username (common in private communities)
- Many bot accounts in channel
- Bio keyword filter too restrictive

**Solutions**:
- This is expected behavior
- Adjust participant limit to compensate
- Remove or adjust bio keywords
- Choose channels with more public profiles

### Issue: Bio column empty for all users

**Possible causes**:
- Telegram API rate limiting
- Users actually have no bio set
- API errors during enrichment

**Solutions**:
- Check server logs for API errors
- Verify users have bio set in Telegram
- Try with smaller participant limit
- Wait and retry if rate limited

## References

- Implementation: `server/routes/telegram.js` (lines 1387-1422, 1598-1653)
- Test script: `test-audience-filtering.js`
- Related functions:
  - `filterClosedProfiles()` - Filters users without username
  - `filterBots()` - Filters bot accounts
  - `enrichUsersWithFullProfile()` - Fetches bio and other profile data
  - `filterUsersByBioKeywords()` - Filters by bio keywords
