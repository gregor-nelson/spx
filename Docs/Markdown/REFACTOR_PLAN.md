# SPX Dashboard Refactoring Plan

## Overview

Refactor `dashboard.js` (1813 lines) into a modular architecture with clear separation of concerns.

---

## Target File Structure

```
static/js/
├── config.js              # ~190 lines - Theme, Plotly configuration
├── utils.js               # ~40 lines  - Formatting utilities
├── app.js                 # ~350 lines - Core state, data loading, orchestration
└── components/
    ├── charts.js          # ~480 lines - Charts tab (heatmaps, bar charts, time series)
    ├── greeks.js          # ~530 lines - Greeks tab (IV smile, vol surface, table)
    ├── tables.js          # ~160 lines - Table rendering (Latest, Intraday, Daily, Alerts)
    └── movers.js          # ~120 lines - Right panel movers list
```

**Total: ~1870 lines** (slight increase due to module boilerplate, but much better organized)

---

## File-by-File Specification

### 1. `config.js` (~190 lines)

**Purpose**: Shared theme colors and Plotly configuration objects.

**Exports**: `Config` namespace object

```javascript
const Config = {
    theme: { ... },        // Lines 6-51 from dashboard.js
    plotlyLayout: { ... }, // Lines 54-179 from dashboard.js
    plotlyConfig: { ... }  // Lines 181-184 from dashboard.js
};
```

**Source lines from dashboard.js**: 1-184

**Dependencies**: None (loaded first)

**Used by**: All components, App

---

### 2. `utils.js` (~40 lines)

**Purpose**: Shared formatting utilities.

**Exports**: `Utils` namespace object

```javascript
const Utils = {
    formatShortDate(dateStr),  // Lines 1106-1119
    formatNumber(n),           // Lines 1121-1124
    formatMoney(n),            // Lines 1126-1129
    formatPercent(n)           // Lines 1131-1134
};
```

**Source lines from dashboard.js**: 1105-1134

**Dependencies**: None

**Used by**: All components, App

---

### 3. `components/tables.js` (~160 lines)

**Purpose**: Render data tables for Latest, Intraday, Daily, and Alerts tabs.

**Exports**: `TablesComponent` namespace object

```javascript
const TablesComponent = {
    // Renders snapshot table (used by Latest & Intraday tabs)
    // @param rows - Array of snapshot data
    // @param showExpiration - Boolean to show expiration column
    renderSnapshot(rows, showExpiration = false),  // Lines 1136-1187

    // Renders daily historical table
    // @param rows - Array of daily data
    renderDaily(rows),  // Lines 1189-1233

    // Renders alerts table
    // @param rows - Array of alert data
    renderAlerts(rows)  // Lines 1235-1279
};
```

**Source lines from dashboard.js**: 1136-1279

**Dependencies**: `Utils.formatNumber`, `Utils.formatMoney`, `Utils.formatPercent`

**Used by**: `App.renderTab()`

---

### 4. `components/movers.js` (~120 lines)

**Purpose**: Render the right-side movers panel.

**Exports**: `MoversComponent` namespace object

```javascript
const MoversComponent = {
    // State
    sortBy: 'volume',        // 'volume', 'oi', 'delta', 'notional'
    comparisonMode: 'hour',  // 'hour' or 'eod'

    // Set comparison mode (1H vs EOD)
    setComparisonMode(mode),  // Lines 511-523

    // Set sort field
    setSortBy(type),  // Lines 525-534

    // Render movers panel
    // Accesses App.data.enriched
    render()  // Lines 536-640
};
```

**Source lines from dashboard.js**: 304-305, 511-640

**Dependencies**: `App.data.enriched`, `Config.theme`

**Used by**: `App.loadData()`, HTML onclick handlers

**HTML onclick bindings**:
- `setComparisonMode('hour')` / `setComparisonMode('eod')`
- `setSortBy('volume')` / `setSortBy('oi')` / `setSortBy('delta')` / `setSortBy('notional')`

---

### 5. `components/charts.js` (~480 lines)

**Purpose**: Charts tab with heatmaps, bar charts, and time series.

**Exports**: `ChartsComponent` namespace object

```javascript
const ChartsComponent = {
    // Returns HTML structure for charts tab
    // Accesses App.data.enriched.meta, App.selectedExpiration
    render(),  // Lines 469-509

    // Renders all Plotly charts
    // Accesses App.data.enriched, App.data.latest, App.data.intraday
    renderPlotlyCharts(),  // Lines 642-815

    // Individual chart renderers (called by renderPlotlyCharts)
    renderHeatmap(),           // Lines 817-920
    renderChangeHeatmap(),     // Lines 922-1035
    renderVolumeTimeSeries()   // Lines 1037-1103
};
```

**Source lines from dashboard.js**: 469-509, 642-1103

**Dependencies**:
- `App.data.enriched`, `App.data.latest`, `App.data.intraday`
- `App.selectedExpiration`
- `MoversComponent.comparisonMode`
- `Config.theme`, `Config.plotlyLayout`, `Config.plotlyConfig`
- `Utils.formatShortDate`

**Used by**: `App.renderTab()`

---

### 6. `components/greeks.js` (~530 lines)

**Purpose**: Greeks tab with IV smile chart, 3D volatility surface, and Greeks table.

**Exports**: `GreeksComponent` namespace object

```javascript
const GreeksComponent = {
    // State
    sortField: 'strike',
    sortAsc: true,
    surfaceMode: 'raw',  // 'raw' or 'zscore'

    // Toggle vol surface mode
    setVolSurfaceMode(mode),  // Lines 1292-1301

    // Toggle table sort
    setGreeksSort(field),  // Lines 1303-1311

    // Returns HTML structure for Greeks tab
    render(),  // Lines 1313-1361

    // Renders Greeks data table
    // @param rows - Enriched data array
    renderTable(rows),  // Lines 1364-1438

    // Renders both charts
    renderCharts(),  // Lines 1440-1443

    // Individual chart renderers
    renderIVSmileChart(),    // Lines 1445-1573
    renderVolSurfaceChart()  // Lines 1575-1806
};
```

**Source lines from dashboard.js**: 1281-1806

**Dependencies**:
- `App.data.enriched`, `App.selectedExpiration`
- `Config.theme`, `Config.plotlyLayout`, `Config.plotlyConfig`
- `Utils.formatShortDate`, `Utils.formatNumber`, `Utils.formatMoney`

**Used by**: `App.renderTab()`

**HTML onclick bindings**:
- `setVolSurfaceMode('raw')` / `setVolSurfaceMode('zscore')`
- `setGreeksSort('strike')` / `setGreeksSort('delta')` / etc.

---

### 7. `app.js` (~350 lines)

**Purpose**: Core application state, data loading, UI orchestration.

**Exports**: `App` namespace object + global helper functions for HTML onclick

```javascript
const App = {
    // ===================
    // STATE
    // ===================
    currentTab: 'charts',
    selectedExpiration: '',
    cachedStats: null,

    data: {
        enriched: { data: [], meta: {} },
        latest: [],
        intraday: [],
        daily: [],
        alerts: [],
        expirations: { intraday: [], daily: [] }
    },

    // Sidebar state
    sidebarCollapsed: false,
    detailCollapsed: false,

    // ===================
    // INITIALIZATION
    // ===================
    init(),  // DOMContentLoaded setup (lines 241-246, 249-260)

    // ===================
    // SIDEBAR/PANEL UI
    // ===================
    toggleSidebar(),        // Lines 189-193
    applySidebarState(),    // Lines 195-211
    toggleDetailPanel(),    // Lines 216-220
    applyDetailPanelState(), // Lines 222-238

    // ===================
    // TOOLBAR
    // ===================
    updateToolbarTime(),    // Lines 262-272
    updateToolbarStats(meta, stats),  // Lines 274-300

    // ===================
    // DATA LOADING
    // ===================
    fetchJSON(url),         // Lines 315-318
    loadExpirations(),      // Lines 320-327
    updateExpirationDropdown(), // Lines 329-348
    onExpirationChange(),   // Lines 350-353
    loadStats(),            // Lines 357-374
    loadData(),             // Lines 376-419
    loadAll(),              // Lines 421-429

    // ===================
    // TAB NAVIGATION
    // ===================
    showTab(tab),           // Lines 431-439

    // Renders current tab content
    // Delegates to appropriate component
    renderTab()             // Lines 442-467
};

// ===================
// GLOBAL HELPERS (for HTML onclick)
// ===================
// These wrap App/Component methods for HTML onclick handlers

function toggleSidebar() { App.toggleSidebar(); }
function toggleDetailPanel() { App.toggleDetailPanel(); }
function showTab(tab) { App.showTab(tab); }
function loadAll() { App.loadAll(); }
function onExpirationChange() { App.onExpirationChange(); }

function setComparisonMode(mode) { MoversComponent.setComparisonMode(mode); }
function setSortBy(type) { MoversComponent.setSortBy(type); }

function setVolSurfaceMode(mode) { GreeksComponent.setVolSurfaceMode(mode); }
function setGreeksSort(field) { GreeksComponent.setGreeksSort(field); }
```

**Source lines from dashboard.js**: 186-429, 431-467, 1808-1812

**Dependencies**: All components, Config, Utils

---

## Function Migration Map

| Original Function | Original Lines | Destination | New Call Pattern |
|-------------------|----------------|-------------|------------------|
| `theme` | 6-51 | `config.js` | `Config.theme` |
| `plotlyLayout` | 54-179 | `config.js` | `Config.plotlyLayout` |
| `plotlyConfig` | 181-184 | `config.js` | `Config.plotlyConfig` |
| `toggleSidebar` | 189-193 | `app.js` | `App.toggleSidebar()` / `toggleSidebar()` |
| `applySidebarState` | 195-211 | `app.js` | `App.applySidebarState()` |
| `toggleDetailPanel` | 216-220 | `app.js` | `App.toggleDetailPanel()` / `toggleDetailPanel()` |
| `applyDetailPanelState` | 222-238 | `app.js` | `App.applyDetailPanelState()` |
| `updateToolbarTime` | 262-272 | `app.js` | `App.updateToolbarTime()` |
| `updateToolbarStats` | 274-300 | `app.js` | `App.updateToolbarStats()` |
| `fetchJSON` | 315-318 | `app.js` | `App.fetchJSON()` |
| `loadExpirations` | 320-327 | `app.js` | `App.loadExpirations()` |
| `updateExpirationDropdown` | 329-348 | `app.js` | `App.updateExpirationDropdown()` |
| `onExpirationChange` | 350-353 | `app.js` | `App.onExpirationChange()` / `onExpirationChange()` |
| `loadStats` | 357-374 | `app.js` | `App.loadStats()` |
| `loadData` | 376-419 | `app.js` | `App.loadData()` |
| `loadAll` | 421-429 | `app.js` | `App.loadAll()` / `loadAll()` |
| `showTab` | 431-439 | `app.js` | `App.showTab()` / `showTab()` |
| `renderTab` | 442-467 | `app.js` | `App.renderTab()` |
| `renderCharts` | 469-509 | `charts.js` | `ChartsComponent.render()` |
| `setComparisonMode` | 511-523 | `movers.js` | `MoversComponent.setComparisonMode()` |
| `setSortBy` | 525-534 | `movers.js` | `MoversComponent.setSortBy()` |
| `renderMoversPanel` | 536-640 | `movers.js` | `MoversComponent.render()` |
| `renderPlotlyCharts` | 642-815 | `charts.js` | `ChartsComponent.renderPlotlyCharts()` |
| `renderHeatmap` | 817-920 | `charts.js` | `ChartsComponent.renderHeatmap()` |
| `renderChangeHeatmap` | 922-1035 | `charts.js` | `ChartsComponent.renderChangeHeatmap()` |
| `renderVolumeTimeSeries` | 1037-1103 | `charts.js` | `ChartsComponent.renderVolumeTimeSeries()` |
| `formatShortDate` | 1106-1119 | `utils.js` | `Utils.formatShortDate()` |
| `formatNumber` | 1121-1124 | `utils.js` | `Utils.formatNumber()` |
| `formatMoney` | 1126-1129 | `utils.js` | `Utils.formatMoney()` |
| `formatPercent` | 1131-1134 | `utils.js` | `Utils.formatPercent()` |
| `renderSnapshotTable` | 1136-1187 | `tables.js` | `TablesComponent.renderSnapshot()` |
| `renderDailyTable` | 1189-1233 | `tables.js` | `TablesComponent.renderDaily()` |
| `renderAlertsTable` | 1235-1279 | `tables.js` | `TablesComponent.renderAlerts()` |
| `greeksSortField` | 1286 | `greeks.js` | `GreeksComponent.sortField` |
| `greeksSortAsc` | 1287 | `greeks.js` | `GreeksComponent.sortAsc` |
| `volSurfaceMode` | 1290 | `greeks.js` | `GreeksComponent.surfaceMode` |
| `setVolSurfaceMode` | 1292-1301 | `greeks.js` | `GreeksComponent.setVolSurfaceMode()` |
| `setGreeksSort` | 1303-1311 | `greeks.js` | `GreeksComponent.setGreeksSort()` |
| `renderGreeksTab` | 1313-1361 | `greeks.js` | `GreeksComponent.render()` |
| `renderGreeksTable` | 1364-1438 | `greeks.js` | `GreeksComponent.renderTable()` |
| `renderGreeksCharts` | 1440-1443 | `greeks.js` | `GreeksComponent.renderCharts()` |
| `renderIVSmileChart` | 1445-1573 | `greeks.js` | `GreeksComponent.renderIVSmileChart()` |
| `renderVolSurfaceChart` | 1575-1806 | `greeks.js` | `GreeksComponent.renderVolSurfaceChart()` |

---

## State Migration Map

| State Variable | Original Line | Destination | New Access Pattern |
|----------------|---------------|-------------|-------------------|
| `sidebarCollapsed` | 187 | `app.js` | `App.sidebarCollapsed` |
| `detailCollapsed` | 214 | `app.js` | `App.detailCollapsed` |
| `currentTab` | 302 | `app.js` | `App.currentTab` |
| `selectedExpiration` | 303 | `app.js` | `App.selectedExpiration` |
| `moversSortBy` | 304 | `movers.js` | `MoversComponent.sortBy` |
| `comparisonMode` | 305 | `movers.js` | `MoversComponent.comparisonMode` |
| `data` | 306-313 | `app.js` | `App.data` |
| `cachedStats` | 355 | `app.js` | `App.cachedStats` |
| `greeksSortField` | 1286 | `greeks.js` | `GreeksComponent.sortField` |
| `greeksSortAsc` | 1287 | `greeks.js` | `GreeksComponent.sortAsc` |
| `volSurfaceMode` | 1290 | `greeks.js` | `GreeksComponent.surfaceMode` |

---

## HTML onclick Handlers

These functions are called directly from HTML and must remain globally accessible:

| HTML Element | onclick Handler | Implementation |
|--------------|-----------------|----------------|
| Sidebar toggle button | `toggleSidebar()` | Global wrapper → `App.toggleSidebar()` |
| Detail panel toggle | `toggleDetailPanel()` | Global wrapper → `App.toggleDetailPanel()` |
| Nav tabs | `showTab('charts')` etc. | Global wrapper → `App.showTab()` |
| Refresh buttons | `loadAll()` | Global wrapper → `App.loadAll()` |
| Expiration dropdown | `onExpirationChange()` | Global wrapper → `App.onExpirationChange()` |
| Comparison toggle (1H/EOD) | `setComparisonMode('hour')` | Global wrapper → `MoversComponent.setComparisonMode()` |
| Sort buttons | `setSortBy('volume')` | Global wrapper → `MoversComponent.setSortBy()` |
| Surface mode toggle | `setVolSurfaceMode('raw')` | Global wrapper → `GreeksComponent.setVolSurfaceMode()` |
| Greeks table headers | `setGreeksSort('strike')` | Global wrapper → `GreeksComponent.setGreeksSort()` |

---

## Cross-Component Dependencies

```
┌─────────────────────────────────────────────────────────────────┐
│                          index.html                              │
│  (onclick handlers call global wrapper functions)                │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                           app.js                                 │
│  - Owns: data, currentTab, selectedExpiration, sidebar state    │
│  - Orchestrates: tab rendering, data loading                     │
│  - Delegates to: ChartsComponent, GreeksComponent, etc.         │
└─────────────────────────────────────────────────────────────────┘
           │              │              │              │
           ▼              ▼              ▼              ▼
    ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐
    │ charts.js│   │ greeks.js│   │ tables.js│   │ movers.js│
    │          │   │          │   │          │   │          │
    │ Reads:   │   │ Reads:   │   │ Reads:   │   │ Reads:   │
    │ App.data │   │ App.data │   │ (params) │   │ App.data │
    │ Config.* │   │ Config.* │   │ Utils.*  │   │ Config.* │
    │ Utils.*  │   │ Utils.*  │   │          │   │          │
    │ Movers.* │   │ App.sel* │   │          │   │          │
    └──────────┘   └──────────┘   └──────────┘   └──────────┘
           │              │              │              │
           └──────────────┴──────────────┴──────────────┘
                                │
                                ▼
                    ┌─────────────────────┐
                    │  config.js utils.js │
                    │  (no dependencies)  │
                    └─────────────────────┘
```

---

## Updated index.html Script Tags

```html
<!-- Shared (no dependencies) -->
<script src="/js/config.js"></script>
<script src="/js/utils.js"></script>

<!-- Components (depend on Config, Utils) -->
<script src="/js/components/tables.js"></script>
<script src="/js/components/movers.js"></script>
<script src="/js/components/charts.js"></script>
<script src="/js/components/greeks.js"></script>

<!-- App (depends on all above, provides global wrappers) -->
<script src="/js/app.js"></script>
```

---

## Implementation Phases

### Phase 1: Foundation (config.js, utils.js)
1. Create `static/js/config.js` with Config namespace
2. Create `static/js/utils.js` with Utils namespace
3. Update `index.html` to load these first
4. Update `dashboard.js` to use `Config.*` and `Utils.*`
5. **Test**: All existing functionality works

### Phase 2: Tables Component
1. Create `static/js/components/tables.js` with TablesComponent
2. Update `index.html` to load it
3. Update `dashboard.js` to use `TablesComponent.*`
4. Remove table functions from `dashboard.js`
5. **Test**: Latest, Intraday, Daily, Alerts tabs render correctly

### Phase 3: Movers Component
1. Create `static/js/components/movers.js` with MoversComponent
2. Move `moversSortBy`, `comparisonMode` state
3. Move `setComparisonMode`, `setSortBy`, `renderMoversPanel`
4. Update `dashboard.js` to use `MoversComponent.*`
5. **Test**: Movers panel renders, sort/comparison toggles work

### Phase 4: Charts Component
1. Create `static/js/components/charts.js` with ChartsComponent
2. Move chart rendering functions
3. Update to use `MoversComponent.comparisonMode`
4. Update `dashboard.js` to use `ChartsComponent.*`
5. **Test**: Charts tab renders all charts correctly

### Phase 5: Greeks Component
1. Create `static/js/components/greeks.js` with GreeksComponent
2. Move all Greeks state and functions
3. Update `dashboard.js` to use `GreeksComponent.*`
4. **Test**: Greeks tab, IV smile, vol surface, table all work

### Phase 6: Finalize App
1. Rename `dashboard.js` to `app.js`
2. Restructure as App namespace
3. Add global wrapper functions for HTML onclick
4. Remove all component code (should only have ~350 lines left)
5. **Test**: Full application test

---

## Testing Checklist

### After Each Phase
- [ ] No console errors on page load
- [ ] No console errors when switching tabs
- [ ] All onclick handlers respond

### Full Test (After Phase 6)
- [ ] **Sidebar**: Toggle works, state persists in localStorage
- [ ] **Detail Panel**: Toggle works, state persists
- [ ] **Keyboard shortcuts**: Ctrl+B, Ctrl+] work
- [ ] **Toolbar**: SPX price, contracts, flagged, polls, alerts update
- [ ] **Expiration dropdown**: Populates, filtering works
- [ ] **Charts tab**:
  - [ ] Meta bar shows correct info
  - [ ] Volume heatmap renders
  - [ ] Volume by Strike bar chart renders with ATM line
  - [ ] OI by Strike bar chart renders
  - [ ] Change heatmap renders
  - [ ] Volume time series renders with range slider
- [ ] **Greeks tab**:
  - [ ] Meta bar shows correct info
  - [ ] IV Smile chart renders with multiple expiration lines
  - [ ] Vol Surface 3D chart renders and is interactive
  - [ ] Raw IV / Z-Score toggle works
  - [ ] Greeks table renders with all columns
  - [ ] Table sorting works (all columns)
- [ ] **Latest tab**: Table renders with all columns
- [ ] **Intraday tab**: Table renders
- [ ] **History tab**: Daily table renders
- [ ] **Alerts tab**: Alerts table renders with flags
- [ ] **Movers panel**:
  - [ ] 1H / EOD toggle works
  - [ ] Vol / OI / Δ / $ sort buttons work
  - [ ] Top 10 movers display correctly
- [ ] **Auto-refresh**: Data updates every 60 seconds
- [ ] **Responsive**: Panels collapse correctly at breakpoints

---

## Rollback Plan

Keep `dashboard.js.backup` until refactor is complete and tested.

```bash
# Before starting
cp static/js/dashboard.js static/js/dashboard.js.backup

# If refactor fails
cp static/js/dashboard.js.backup static/js/dashboard.js
# Remove new files
rm static/js/config.js static/js/utils.js static/js/app.js
rm -rf static/js/components/
# Revert index.html script tags
```

---

## Approval Checklist

Before implementation, confirm:

- [ ] File structure approved
- [ ] Namespace pattern (Config, Utils, App, *Component) approved
- [ ] Global wrapper functions for HTML onclick approved
- [ ] Phase-by-phase approach approved
- [ ] Ready to proceed with Phase 1

---

*Plan created: 2025-12-04*
*Target completion: Full refactor in 6 phases*
