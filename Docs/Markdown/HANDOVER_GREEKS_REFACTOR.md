# SPX Options Monitor - Greeks Component Refactor Handover

## Important: Read Before Coding

**DO NOT jump straight into implementation.** First:
1. Read this entire document to understand the current state
2. Review the key files listed below
3. Understand the extraction scope
4. Ask clarifying questions if anything is unclear

---

## Project Context

SPX Options Monitor is a trading dashboard for SPX options data, styled to match IBKR's (Interactive Brokers) dark theme. The frontend uses vanilla JavaScript with Plotly for charts.

### Recent Work Completed (December 4, 2025)
- Hover-reveal sidebar toggle (both left sidebar and right detail panel)
- Greeks tab with sortable table showing all Greeks per contract
- 2D IV Smile chart (lines by expiration)
- 3D Volatility Surface with Raw IV / Z-Score toggle
- Z-Score mode highlights anomalies (±2σ from mean)

---

## Current Problem

The `dashboard.js` file has grown large (~1810 lines). The Greeks tab functionality should be extracted into a separate component file for better maintainability.

---

## Key Files

| File | Purpose | Lines |
|------|---------|-------|
| `static/js/dashboard.js` | Main dashboard logic, charts, tabs | ~1810 |
| `static/css/styles.css` | All CSS including Greeks-specific styles | ~1750 |
| `static/index.html` | Layout, sidebar with Greeks tab button | ~170 |
| `src/server.py` | Flask API (no changes needed) | ~500 |

---

## Task: Extract Greeks Component

### Target Structure
```
static/
├── js/
│   ├── dashboard.js          # Main dashboard (reduced)
│   └── components/
│       └── greeks.js         # Greeks tab logic (new)
├── css/
│   └── styles.css
└── index.html                # Add script tag for greeks.js
```

### Code to Extract from dashboard.js

The following functions and state should move to `greeks.js` (approximately lines 1281-1806):

**State Variables:**
```javascript
let greeksSortField = 'strike';
let greeksSortAsc = true;
let volSurfaceMode = 'raw';
```

**Functions to Extract:**
1. `setVolSurfaceMode(mode)` - Toggle between Raw IV and Z-Score
2. `setGreeksSort(field)` - Table column sorting
3. `renderGreeksTab()` - Main tab HTML structure
4. `renderGreeksTable(rows)` - Sortable Greeks table
5. `renderGreeksCharts()` - Calls both chart functions
6. `renderIVSmileChart()` - 2D IV smile by expiration
7. `renderVolSurfaceChart()` - 3D vol surface with Z-score support

### Dependencies These Functions Need

From `dashboard.js`, the Greeks functions depend on:
- `data.enriched` - The enriched options data object
- `selectedExpiration` - Current expiration filter value
- `theme` - Color theme object for Plotly
- `plotlyLayout` - Base Plotly layout config
- `plotlyConfig` - Base Plotly config
- `formatShortDate(dateStr)` - Date formatting helper
- `formatNumber(n)` - Number formatting helper
- `formatMoney(n)` - Currency formatting helper

### Integration Points

**In dashboard.js `renderTab()` function (~line 442):**
```javascript
case 'greeks':
    content.innerHTML = renderGreeksTab();
    renderGreeksCharts();
    break;
```

This should still work after extraction - just ensure functions are globally accessible or properly imported.

---

## Component Pattern to Follow

Since this is vanilla JS (no build system), use a simple pattern:

**Option A: Global Functions (Simplest)**
```javascript
// greeks.js - Functions are global, just like dashboard.js
let greeksSortField = 'strike';
// ... etc
```

**Option B: Namespace Object**
```javascript
// greeks.js
const GreeksComponent = {
    sortField: 'strike',
    sortAsc: true,
    surfaceMode: 'raw',

    setSurfaceMode(mode) { ... },
    render() { ... },
    // etc
};
```

Recommend **Option A** for consistency with existing code, unless user prefers otherwise.

---

## CSS Already in Place

The following CSS classes are already defined in `styles.css` and should continue to work:

- `.greeks-chart-row` - Two-column grid for charts
- `.chart-header` - Header with title and toggle
- `.chart-title` - Chart title styling
- `.surface-mode-toggle` - Raw IV / Z-Score toggle buttons
- `.sortable` - Sortable table header styling
- `.sort-active` - Active sort column highlight

---

## HTML Changes Needed

Add the new script to `index.html` before `dashboard.js`:

```html
<script src="/js/components/greeks.js"></script>
<script src="/js/dashboard.js"></script>
```

---

## Testing Checklist

After refactoring, verify:

- [ ] Greeks tab loads without console errors
- [ ] IV Smile chart renders with multiple expiration lines
- [ ] 3D Vol Surface renders and is interactive (rotate/zoom)
- [ ] Raw IV / Z-Score toggle works
- [ ] Z-Score mode shows amplified peaks/troughs
- [ ] Greeks table renders with all columns
- [ ] Table sorting works (click headers)
- [ ] Expiration filter affects Greeks tab data
- [ ] No regressions in other tabs (Charts, Latest, etc.)

---

## File Locations for Reference

**Greeks state and functions in dashboard.js:**
- State variables: ~line 1285-1290
- `setVolSurfaceMode`: ~line 1292-1301
- `setGreeksSort`: ~line 1303-1311
- `renderGreeksTab`: ~line 1313-1361
- `renderGreeksTable`: ~line 1363-1416
- `renderGreeksCharts`: ~line 1418-1422
- `renderIVSmileChart`: ~line 1424-1573
- `renderVolSurfaceChart`: ~line 1575-1806

**CSS for Greeks in styles.css:**
- `.greeks-chart-row`: ~line 1373-1385
- `.chart-header`, `.chart-title`: ~line 1387-1399
- `.surface-mode-toggle`: ~line 1401-1435
- `.sortable` table headers: ~line 1548-1563

---

## Commands

```bash
# Run the server
python src/server.py

# View the app
# Open http://localhost:5000 in browser
# Click "Greeks" tab to test
```

---

## Questions to Consider

1. **Global vs Namespace**: Should extracted code use global functions (match existing pattern) or a namespace object (cleaner encapsulation)?

2. **Shared utilities**: Should `formatShortDate`, `formatNumber`, `formatMoney` also be extracted to a `utils.js` file?

3. **Theme/config sharing**: How should `theme`, `plotlyLayout`, `plotlyConfig` be shared? Keep in dashboard.js and reference globally, or extract to a `config.js`?

---

## Success Criteria

- [ ] `greeks.js` contains all Greeks-specific logic
- [ ] `dashboard.js` reduced by ~500 lines
- [ ] No functional changes - everything works as before
- [ ] Clean separation of concerns
- [ ] Code loads in correct order (dependencies before dependents)
