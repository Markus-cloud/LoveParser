# Audience Filtering - Quick Reference

## What Changed?

Audience search now automatically filters out:
1. **Closed profiles** - users without username (unreachable)
2. **Bots** - bot accounts (username ending with "bot" OR bot flag)

## How It Works

### Filtering Flow

```
Raw Users
    ↓
Deduplication
    ↓
Participant Limit
    ↓
Profile Enrichment (bio, phone, fullName)
    ↓
Filter Closed Profiles ← NEW
    ↓
Filter Bots ← NEW
    ↓
Bio Keyword Filter (if specified)
    ↓
Final Results
```

### Examples

**Filtered Out** ❌:
- `username: null` (closed profile)
- `username: ""` (empty)
- `username: "mybot"` (ends with "bot")
- `username: "test_bot"` (ends with "bot")
- `bot: true` (bot flag)

**Kept** ✅:
- `username: "john_doe"` (valid username, not bot)
- `username: "alice"` (valid username)
- `username: "BotMaster"` (doesn't end with "bot")

## What About Bio?

✅ **Bio already works!**
- Fetched during profile enrichment
- Saved in results JSON
- Included in CSV exports
- Empty if user has no bio in Telegram

## Testing

```bash
# Run filtering test
node test-audience-filtering.js

# Run all tests
npm run test:all

# Run checks
npm run check

# Build
npm run build
```

## Quick Test

1. Start audience search
2. Select parsing session or enter channel link
3. Set participant limit (required)
4. Click "Начать поиск"
5. Watch progress (you'll see filtering steps)
6. Download CSV
7. Verify:
   - All users have username
   - No bots in results
   - Bio column exists

## Expected Impact

- **Result count**: 15-30% lower (this is good!)
- **Quality**: Much higher (only reachable, non-bot users)
- **Performance**: No impact (filtering is fast)

## Files Changed

- `server/routes/telegram.js` - Main implementation
- `test-audience-filtering.js` - Test script
- `AUDIENCE_FILTERING.md` - Full docs
- `AUDIENCE_FILTERING_SUMMARY.md` - Detailed summary

## Questions?

See:
- `AUDIENCE_FILTERING.md` - Complete documentation
- `AUDIENCE_FILTERING_SUMMARY.md` - Implementation summary
- `test-audience-filtering.js` - Test examples
