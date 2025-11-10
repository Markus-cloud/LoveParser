# Parsing Enrichment Tests

This directory contains comprehensive tests for the enriched parsing storage functionality.

## Test Coverage

### 1. Unit Tests (`parsing-enrichment.test.js`)
- **Legacy channel normalization** - Ensures old channel records are enriched with default values
- **Enriched channel normalization** - Verifies enriched channel data is preserved correctly
- **Legacy results normalization** - Tests backward compatibility for old parsing results
- **Enriched results normalization** - Validates enriched results structure
- **CSV generation with legacy data** - Tests CSV export for legacy records
- **CSV generation with enriched data** - Tests CSV export with new metadata columns
- **Backward compatibility** - Ensures missing fields are handled gracefully
- **Data persistence** - Simulates file system storage and retrieval

### 2. Integration Tests (`api-integration.test.js`)
- **Legacy data storage and retrieval** - End-to-end test with legacy format
- **Enriched data storage and retrieval** - End-to-end test with enriched format
- **CSV generation for legacy data** - API-level CSV export testing
- **CSV generation for enriched data** - API-level CSV with enriched columns
- **Mixed data handling** - Tests handling of both legacy and enriched channels
- **File system persistence** - Tests actual file I/O operations
- **Error handling** - Tests robustness with corrupted/incomplete data

## Running Tests

### Run All Tests
```bash
npm run test:parsing
```

### Run Individual Test Suites
```bash
# Unit tests only
node server/test/parsing-enrichment.test.js

# Integration tests only
node server/test/api-integration.test.js
```

### Test Runner
```bash
# Use the test runner for detailed output
node server/test/run-tests.js
```

## Test Data

### Legacy Channel Format
```json
{
  "id": "123456789",
  "title": "Test Legacy Channel",
  "username": "testlegacy",
  "address": "@testlegacy",
  "membersCount": 5000,
  "description": "A test legacy channel",
  "type": "Broadcast"
}
```

### Enriched Channel Format
```json
{
  // Basic fields (backward compatible)
  "id": "987654321",
  "title": "Test Enriched Channel",
  "username": "testenriched",
  "address": "@testenriched",
  "membersCount": 10000,
  "description": "A test enriched channel with metadata",
  "type": "Megagroup",
  
  // Enriched fields
  "peer": {
    "id": "987654321",
    "className": "Channel",
    "accessHash": "12345678901234567890",
    "username": "testenriched",
    "title": "Test Enriched Channel",
    "flags": 1,
    "megagroup": true,
    "broadcast": false,
    "verified": true,
    "restricted": false,
    "scam": false,
    "fake": false,
    "gigagroup": false
  },
  "metadata": {
    "isVerified": true,
    "isRestricted": false,
    "isScam": false,
    "isFake": false,
    "isGigagroup": false,
    "hasUsername": true,
    "isPublic": true,
    "privacy": "public"
  },
  "category": "Verified Megagroup",
  "inviteLink": "https://t.me/+abcdef123456",
  "channelMetadata": {
    "linkedChatId": null,
    "canViewParticipants": true,
    "canSetUsername": false,
    "canSetStickers": true,
    "hiddenPrehistory": false,
    "participantsCount": 10000,
    "adminsCount": 5,
    "kickedCount": 0,
    "bannedCount": 2,
    "onlineCount": 250,
    "readInboxMaxId": 12345,
    "readOutboxMaxId": 12340,
    "unreadCount": 5
  },
  "resolvedLink": "https://t.me/testenriched",
  "fullDescription": "A test enriched channel with metadata",
  "searchableText": "test enriched channel with metadata",
  "date": 1634567890,
  "hasForwards": true,
  "hasScheduled": false,
  "canDeleteHistory": false,
  "antiSpamEnabled": true,
  "joinToSend": false,
  "requestJoinRequired": false
}
```

## CSV Export Format

The enhanced CSV includes the following columns:

1. **Название канала** - Channel title
2. **Username** - Channel username (@handle)
3. **Ссылка на канал** - Resolved Telegram link (https://t.me/username)
4. **Категория** - Channel category (e.g., "Verified Megagroup")
5. **Приватность** - Privacy status (public/private)
6. **Статус** - Channel type in Russian (Публичный чат/Каналы/etc.)
7. **Количество подписчиков** - Member count
8. **Описание** - Channel description
9. **Проверен** - Verification status (Да/Нет)
10. **Ограничен** - Restricted status (Да/Нет)
11. **Скам** - Scam status (Да/Нет)
12. **Поддельный** - Fake status (Да/Нет)
13. **Есть ссылка-приглашение** - Has invite link (Да/Нет)
14. **Онлайн участники** - Online member count
15. **Админы** - Admin count

## Backward Compatibility

The normalization functions ensure:
- Legacy records can be read without crashing
- Missing fields are populated with sensible defaults
- New fields are added to legacy records when served
- Enriched records preserve all their metadata
- CSV generation works for both formats

## Error Handling

The tests cover:
- Null/undefined channel objects
- Missing required fields
- Invalid data types (e.g., string instead of number)
- Corrupted JSON structures
- Mixed legacy and enriched data in the same result set

All tests pass with 100% success rate, demonstrating robust backward compatibility and proper enrichment functionality.