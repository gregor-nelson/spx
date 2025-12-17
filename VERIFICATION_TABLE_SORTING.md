# Table Sorting Implementation - Verification Document

## Overview
This document provides verification criteria for the table sorting feature added to `TablesComponent` in the SPX Options Monitor application.

## Files Modified

| File | Changes |
|------|---------|
| `static/js/components/tables.js` | Added sorting state, column definitions, sort logic, and sortable headers |
| `static/js/app.js` | Added `attachSortHandlers()` calls after table renders (lines 242, 246, 250, 254) |
| `static/css/styles.css` | Added `.sorted` class styling (lines 680-683) |

---

## Code Review Checklist

### 1. Sort State Management (`tables.js:7-24`)

```javascript
sortState: {
    snapshot: { column: null, direction: 'desc' },
    daily: { column: null, direction: 'desc' },
    alerts: { column: null, direction: 'desc' }
},
currentData: {
    snapshot: [],
    daily: [],
    alerts: []
},
currentOptions: {
    snapshot: { showExpiration: false }
}
```

**Verify:**
- [ ] State is isolated per table type (snapshot, daily, alerts)
- [ ] Default direction is `'desc'` (descending) for all tables
- [ ] `currentData` stores references to enable re-sorting without re-fetching
- [ ] `currentOptions` preserves render options for snapshot table

**Potential Issues:**
- [ ] Check if storing `currentData` as reference (not copy) causes mutation issues
- [ ] Verify state persists correctly when switching tabs

---

### 2. Column Definitions (`tables.js:29-64`)

**Snapshot columns:**
```javascript
{ key: 'volume', label: 'Vol', type: 'volume', class: 'number' },
{ key: 'volume_pct_change', label: 'Vol Chg', type: 'volChange', class: 'number' },
{ key: 'notional', label: 'Notional', type: 'notional', class: 'number' },
```

**Verify:**
- [ ] All column keys match actual data properties in the row objects
- [ ] Special types (`volume`, `volChange`, `notional`) have corresponding handlers in `getSortValue()`
- [ ] `type: 'none'` correctly excludes Flags column from sorting
- [ ] `conditional: 'showExpiration'` works for optional Exp column

**Data Property Mapping to Verify:**
| Column Key | Actual Row Property | Notes |
|------------|---------------------|-------|
| `captured_at` | `row.captured_at` | Timestamp string |
| `strike` | `row.strike` | Number |
| `moneyness` | `row.moneyness` | Number (decimal) |
| `dte` | `row.dte` | Number |
| `volume` | `row.volume_today` OR `row.volume_cumulative` | Special handling |
| `volume_pct_change` | `row.volume_pct_change_hour` OR `row.volume_pct_change_eod` | Suffix-based |
| `open_interest` | `row.open_interest` | Number |
| `close_price` | `row.close_price` | Number |
| `notional` | Computed: `volume * close_price * 100` | Special handling |
| `delta` | `row.delta` | Number |
| `implied_vol` | `row.implied_vol` | Number (decimal) |

---

### 3. Sort Value Extraction (`tables.js:70-108`)

**Verify each case:**

```javascript
case 'volChange':
    value = row['volume_pct_change' + suffix];
    if (value === null || value === undefined) {
        value = row.volume_pct_change;
    }
    return value || 0;
```

- [ ] `volChange`: Correctly uses suffix (`_hour` or `_eod`) based on `MoversComponent.comparisonMode`
- [ ] `volume`: Falls back from `volume_today` to `volume_cumulative`
- [ ] `notional`: Computes correctly with `* 100` multiplier
- [ ] `time/date/datetime`: Handles invalid dates (returns 0)
- [ ] `number`: Returns `-Infinity` for null/undefined (pushes to end when sorting)
- [ ] `string`: Returns empty string for null/undefined

**Edge Cases to Test:**
- [ ] Row with `null` values for numeric fields
- [ ] Row with `undefined` values
- [ ] Row with `0` values (should sort correctly, not treated as falsy)
- [ ] Empty string dates
- [ ] Invalid date strings

---

### 4. Sort Algorithm (`tables.js:113-135`)

```javascript
sortRows(rows, tableType, suffix = '_hour') {
    const state = this.sortState[tableType];
    if (!state.column) return rows;

    const sorted = [...rows].sort((a, b) => {
        // ...
        return state.direction === 'asc' ? comparison : -comparison;
    });
    return sorted;
}
```

**Verify:**
- [ ] Creates new array with spread (`[...rows]`) - doesn't mutate original
- [ ] Returns original array unchanged if no sort column selected
- [ ] String comparison uses `localeCompare()` for proper alphabetical sorting
- [ ] Direction multiplier is correct (`asc` = normal, `desc` = reversed)

**Performance Concerns:**
- [ ] Large datasets: Consider if 1000+ rows cause noticeable lag
- [ ] Re-sorting on every render vs. caching sorted results
- [ ] Multiple rapid clicks - any debounce needed?

---

### 5. Click Handler Attachment (`tables.js:185-191`)

```javascript
attachSortHandlers(tableType) {
    document.querySelectorAll(`th[data-sort]`).forEach(th => {
        th.addEventListener('click', () => {
            const columnKey = th.dataset.sort;
            this.handleSort(tableType, columnKey);
        });
    });
}
```

**Verify:**
- [ ] Selector `th[data-sort]` only matches sortable columns
- [ ] Event listener correctly captures `tableType` in closure
- [ ] No duplicate event listeners on re-render (old elements replaced via `outerHTML`)

**Potential Issues:**
- [ ] Memory leaks if elements not properly replaced
- [ ] Event delegation might be more robust than direct attachment

---

### 6. Re-render Logic (`tables.js:159-180`)

```javascript
reRenderTable(tableType) {
    const container = document.querySelector('.table-container');
    if (!container) return;

    if (html) {
        container.outerHTML = html;
        this.attachSortHandlers(tableType);
    }
}
```

**Verify:**
- [ ] `querySelector('.table-container')` finds the correct element
- [ ] `outerHTML` replacement removes old element and event listeners
- [ ] New handlers attached after DOM update

**Potential Issues:**
- [ ] If multiple `.table-container` elements exist, wrong one might be selected
- [ ] Consider using `data-table-type` attribute for more specific selection

---

### 7. Header Rendering (`tables.js:197-217`)

```javascript
renderHeader(column, tableType, showExpiration = true) {
    // ...
    let classes = [];
    if (column.class) classes.push(column.class);
    if (sortClass.trim()) classes.push(sortClass.trim());
    if (sortable.trim()) classes.push(sortable.trim());
    const finalClass = classes.length ? ` class="${classes.join(' ')}"` : '';

    return `<th${finalClass}${dataSort}>${column.label}${isSorted ? (state.direction === 'asc' ? ' ▲' : ' ▼') : ''}</th>`;
}
```

**Verify:**
- [ ] Classes build correctly without extra spaces
- [ ] Sort indicator (▲/▼) displays for active column only
- [ ] `data-sort` attribute only added for sortable columns
- [ ] Conditional columns (Exp) properly excluded when `showExpiration=false`

**Code Quality:**
- [ ] Lines 207 has unused variable `classAttr` - should be removed
- [ ] `sortClass.trim()` and `sortable.trim()` called on strings that already have leading space - verify no double spaces

---

### 8. CSS Styling (`styles.css:669-687`)

```css
th.sortable {
    cursor: pointer;
    transition: color 0.15s ease;
    user-select: none;
}

th.sortable:hover {
    color: var(--text-secondary);
    background: var(--hover);
}

th.sortable.sorted {
    color: var(--accent);
    background: rgba(59, 130, 246, 0.1);
}
```

**Verify:**
- [ ] `user-select: none` prevents text selection on click
- [ ] Hover state is visually distinct
- [ ] Sorted state uses accent color consistently with app theme
- [ ] Transition is smooth (0.15s)

---

## Functional Test Cases

### Basic Sorting
| Test | Steps | Expected Result |
|------|-------|-----------------|
| Sort descending | Click "Vol Chg" header | Rows sorted by vol change %, highest first, ▼ indicator shown |
| Sort ascending | Click "Vol Chg" header again | Rows sorted by vol change %, lowest first, ▲ indicator shown |
| Change column | Click "Strike" header | Rows sorted by strike descending, indicator moves to Strike |
| Numeric sort | Sort by "OI" | Numbers sorted numerically, not alphabetically |
| Date sort | Sort by "Time" | Rows sorted by timestamp |

### Edge Cases
| Test | Steps | Expected Result |
|------|-------|-----------------|
| Empty table | Render table with empty array | "No data available" message, no errors |
| Null values | Sort column with some null values | Nulls sorted to end (for desc) or beginning (for asc) |
| Zero values | Sort with rows containing 0 | Zeros sorted correctly between negative and positive |
| Rapid clicks | Click header rapidly 10 times | No errors, final state is consistent |
| Tab switch | Sort, switch tab, return | Sort state preserved for that table |

### Vol Change % Specific
| Test | Steps | Expected Result |
|------|-------|-----------------|
| Hour mode | Set comparison to "hour", sort Vol Chg | Uses `volume_pct_change_hour` values |
| EOD mode | Set comparison to "eod", sort Vol Chg | Uses `volume_pct_change_eod` values |
| Mixed nulls | Rows with some missing pct values | Falls back gracefully, no NaN in sort |

---

## Performance Verification

### Benchmarks to Run
```javascript
// Add to console for testing
console.time('sort');
TablesComponent.handleSort('snapshot', 'volume_pct_change');
console.timeEnd('sort');
```

| Dataset Size | Acceptable Time |
|--------------|-----------------|
| 100 rows | < 10ms |
| 500 rows | < 50ms |
| 1000 rows | < 100ms |

### Memory Check
- [ ] After 20 sort operations, memory usage stable (no leaks)
- [ ] Event listeners count doesn't grow on re-renders

---

## Suggested Improvements

### High Priority
1. **Specific container selector**: Change `querySelector('.table-container')` to `querySelector('.table-container[data-table-type="${tableType}"]')` for robustness
2. **Remove unused variable**: Delete `classAttr` on line 207
3. **Zero handling in getSortValue**: `return value || 0` treats `0` as falsy - change to `return value ?? 0` for number types

### Medium Priority
4. **Event delegation**: Consider attaching single listener to `<thead>` instead of each `<th>`
5. **Sort stability**: Use stable sort for equal values (maintain original order)
6. **Debounce rapid clicks**: Add 50ms debounce to prevent unnecessary re-renders

### Low Priority
7. **Keyboard accessibility**: Add `tabindex` and `Enter` key support for headers
8. **ARIA attributes**: Add `aria-sort="ascending|descending|none"` for screen readers
9. **Sort persistence**: Store sort state in localStorage to persist across page reloads

---

## Security Considerations

- [ ] No user input is directly inserted into HTML (column definitions are hardcoded)
- [ ] Data values are rendered through existing sanitization (Utils.formatNumber, etc.)
- [ ] No XSS vectors identified in sort logic

---

## Rollback Plan

If issues found, revert these changes:
1. `git checkout HEAD~1 -- static/js/components/tables.js`
2. `git checkout HEAD~1 -- static/js/app.js`
3. `git checkout HEAD~1 -- static/css/styles.css`

---

## Sign-off

| Reviewer | Date | Status |
|----------|------|--------|
| ___________ | ______ | ☐ Approved / ☐ Changes Requested |

### Notes:
_Add review notes here_
