# Parser UI Test Cases

This document outlines the test cases for the revised parser UI to verify all functionality works correctly after the refactoring.

## 1. Multi-Keyword Parsing Tests

### Test Case 1.1: Comma-Separated Keywords
**Input:** "технологии, бизнес, криптовалюты"
**Expected Result:** 
- 3 keyword chips displayed: "технологии", "бизнес", "криптовалюты"
- Helper text shows "Найдено 3 ключевых слова для поиска"
- All keywords are trimmed and deduplicated

### Test Case 1.2: Newline-Separated Keywords
**Input:** 
```
технологии
бизнес
криптовалюты
```
**Expected Result:** Same as Test Case 1.1

### Test Case 1.3: Mixed Separators
**Input:** "технологии, бизнес\nкриптовалюты, технологии"
**Expected Result:** 
- 3 keyword chips: "технологии", "бизнес", "криптовалюты"
- Duplicate "технологии" is removed

### Test Case 1.4: Whitespace Handling
**Input:** "  технологии  ,  бизнес  ,  криптовалюты  "
**Expected Result:** Keywords are properly trimmed

### Test Case 1.5: Empty/Whitespace Input
**Input:** "   " or ""
**Expected Result:** No keyword chips, helper text shows "Например: технологии, бизнес, криптовалюты"

### Test Case 1.6: Keyword Removal
**Actions:**
1. Enter "технологии, бизнес, криптовалюты"
2. Click X button on "бизнес" chip
**Expected Result:** 
- "бизнес" chip is removed
- Input updates to "технологии, криптовалюты"
- Helper text updates to "Найдено 2 ключевых слова для поиска"

## 2. Form Validation Tests

### Test Case 2.1: No Keywords, No Categories
**Input:** Empty keywords, all categories off
**Expected Result:** 
- "Начать парсинг" button disabled
- Tooltip shows "Добавьте ключевые слова"
- Inline validation message shown when hovering over category filters

### Test Case 2.2: Keywords Present, No Categories
**Input:** "технологии" entered, all categories off
**Expected Result:**
- Button disabled
- Tooltip shows "Выберите хотя бы одну категорию"
- Inline validation message: "Выберите хотя бы одну категорию для поиска"

### Test Case 2.3: No Keywords, Categories Present
**Input:** Empty keywords, some categories on
**Expected Result:**
- Button disabled
- Tooltip shows "Добавьте ключевые слова"

### Test Case 2.4: Valid Form
**Input:** "технологии" entered, at least one category on
**Expected Result:**
- Button enabled
- Tooltip shows "Начать поиск каналов"
- No validation errors

## 3. API Integration Tests

### Test Case 3.1: New API Structure
**Request:**
```json
{
  "keywords": ["технологии", "бизнес"],
  "filters": {
    "minMembers": 1000,
    "maxMembers": 100000,
    "channelTypes": {
      "megagroup": true,
      "discussionGroup": true,
      "broadcast": false
    }
  },
  "limits": {
    "limit": 100
  },
  "userId": "test123"
}
```
**Expected Result:** API processes request and returns results with enhanced metadata

### Test Case 3.2: Backward Compatibility
**Request:**
```json
{
  "query": "технологии",
  "minMembers": 1000,
  "maxMembers": 100000,
  "limit": 100,
  "userId": "test123",
  "channelTypes": {
    "megagroup": true,
    "discussionGroup": true,
    "broadcast": false
  }
}
```
**Expected Result:** API still processes old format correctly

## 4. Results Display Tests

### Test Case 4.1: Enhanced Channel Metadata
**Expected Columns:** Название канала, Адрес, Категория, Тип, Участников

### Test Case 4.2: Public Channel Display
**Expected Result:**
- Username shown as clickable link: "@channelname"
- External link icon displayed
- Link opens in new tab to https://t.me/channelname
- Type indicator shows "Публичный" with green dot

### Test Case 4.3: Private Channel Display
**Expected Result:**
- Shows "ID: 123456" or channel address
- Copy button displayed next to ID
- Clicking copy button copies ID to clipboard and shows toast
- Type indicator shows "Приватный" with orange dot

### Test Case 4.4: Category Badges
**Expected Results:**
- Публичный чат: Blue badge
- Обсуждения в каналах: Green badge  
- Каналы: Purple badge
- Unknown: Gray badge

### Test Case 4.5: Verified Channels
**Expected Result:** Blue checkmark badge displayed next to channel title

### Test Case 4.6: Results Header
**Expected Result:** Shows "Ключевые слова: технологии, бизнес" instead of "Запрос: ..."

## 5. Button Controls Tests

### Test Case 5.1: Download CSV Button
**Expected Result:** Downloads CSV with enhanced channel data including new metadata fields

### Test Case 5.2: Download All Button
**Expected Result:** Downloads ZIP with all results in CSV format

### Test Case 5.3: View/Hide Table Button
**Expected Result:** Toggles table visibility, shows loading spinner during fetch

## 6. Error Handling Tests

### Test Case 6.1: Network Error
**Scenario:** API call fails
**Expected Result:** Toast notification shows error message

### Test Case 6.2: Validation Error
**Scenario:** Invalid form submission
**Expected Result:** Inline validation messages prevent submission

### Test Case 6.3: Empty Results
**Scenario:** No channels found
**Expected Result:** Appropriate message displayed, no table shown

## 7. Accessibility Tests

### Test Case 7.1: Keyboard Navigation
**Expected Result:** All interactive elements accessible via keyboard

### Test Case 7.2: Screen Reader Support
**Expected Result:** All form elements have proper labels and descriptions

### Test Case 7.3: Color Contrast
**Expected Result:** All text meets WCAG contrast requirements

## Manual Testing Checklist

- [ ] Enter keywords via comma separation
- [ ] Enter keywords via newline separation  
- [ ] Remove individual keyword chips
- [ ] Test form validation with various combinations
- [ ] Verify button states and tooltips
- [ ] Test public vs private channel links
- [ ] Copy private channel IDs to clipboard
- [ ] Verify category badges display correctly
- [ ] Check verified channel badges
- [ ] Test CSV download functionality
- [ ] Test "Download All" functionality
- [ ] Verify responsive design on mobile
- [ ] Test error scenarios
- [ ] Verify accessibility features

## Automated Tests

The following automated tests are included in `test-parser-ui.js`:

1. Keyword tokenization logic
2. Form validation logic  
3. Channel data structure validation
4. API request structure validation

Run with: `node test-parser-ui.js`