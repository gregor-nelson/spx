# SPX Options Monitor - Sidebar & Greeks Tab Handover (December 4, 2025)

## Important: Read Before Coding

**DO NOT jump straight into implementation.** First:
1. Read this entire document to understand the current state
2. Run the server (`python src/server.py`) and explore the UI
3. Review the key files listed below
4. Ask clarifying questions if anything is unclear

---

## Project Context

SPX Options Monitor is a trading dashboard for SPX options data, styled to match IBKR's (Interactive Brokers) dark theme. The frontend uses vanilla JavaScript with Plotly for charts.

### Recent Work Completed
- Full IBKR dark theme CSS alignment
- Plotly chart refinements (colorscales, grids, hover states)
- Added crosshairs, range slider, ATM reference lines
- Heatmap axis formatting (short dates, tick limiting)
- Modebar enabled on bar charts

---

## Key Files

| File | Purpose |
|------|---------|
| `static/js/dashboard.js` | All chart rendering, UI logic, tab switching |
| `static/css/styles.css` | CSS variables, component styles, layout |
| `static/index.html` | Layout structure, sidebar, main content |
| `src/server.py` | Flask server with API endpoints |

---

## Task 1: Sidebar Toggle Improvement

### Current State
The sidebar has a toggle button that collapses/expands it. However:

**Issues to investigate:**
1. Toggle button position - currently uses `position: absolute` with `right: 0; transform: translate(50%, -50%)` which may not be ideal
2. The toggle sits on top of the sidebar border and may overlap content
3. When collapsed, the sidebar shows only icons - verify this works correctly
4. The detail panel (right side) has a similar toggle - ensure consistency

**Current CSS (styles.css ~line 419-447):**
```css
.sidebar-toggle {
    position: absolute;
    right: 0;
    top: 50%;
    transform: translate(50%, -50%);
    width: 18px;
    height: 40px;
    /* ... */
}
```

**Current JS (dashboard.js ~line 145-167):**
```javascript
function toggleSidebar() {
    sidebarCollapsed = !sidebarCollapsed;
    localStorage.setItem('sidebarCollapsed', sidebarCollapsed);
    applySidebarState();
}
```

### Suggested Improvements to Consider
- Move toggle to a more intuitive position (e.g., bottom of sidebar, or integrated into the sidebar header)
- Add smooth transition animation
- Consider a hover-reveal pattern (toggle only visible on sidebar hover)
- Ensure keyboard shortcut (Ctrl+B) is discoverable
- Match IBKR's panel toggle behavior if reference available

---

## Task 2: Greeks Data Tab

### Current State
The sidebar has navigation tabs for: Charts, Latest, Intraday, Daily, Alerts

The database stores Greeks data for each option contract including:
- `delta` - Option delta
- `gamma` - Option gamma
- `theta` - Option theta
- `vega` - Option vega
- `implied_vol` - Implied volatility
- `close_price` - Option price

### Data Source
The enriched endpoint (`/api/intraday/latest/enriched`) already returns some Greeks:
```javascript
// Fields available per contract:
{
    strike: 6000,
    expiration: "2025-12-06",
    dte: 2,
    delta: 0.4521,
    implied_vol: 0.1823,
    close_price: 12.50,
    // ... other fields
}
```

**Check the database schema** in `src/server.py` or any migration files to confirm all available Greek fields.

### Implementation Considerations

1. **New Tab in Sidebar**
   - Add "Greeks" tab to the nav-tabs section in `index.html`
   - Use consistent icon (Phosphor Icons are used: `ph ph-*`)
   - Suggested icon: `ph-chart-line-up` or `ph-function`

2. **Tab Content Options**
   To discuss with user:
   - **Table view**: Sortable table showing all Greeks per strike/expiry
   - **Heatmap view**: Greeks surface (e.g., delta by strike/expiration)
   - **Smile/Skew chart**: IV by strike for selected expiration
   - **Combined view**: Multiple visualizations

3. **Data Fetching**
   - May need new API endpoint if current enriched data lacks full Greeks
   - Check what `/api/intraday/latest` vs `/api/intraday/latest/enriched` returns
   - Consider if Greeks need separate endpoint for performance

4. **UI Patterns to Follow**
   Look at existing tab implementations in `dashboard.js`:
   ```javascript
   function showTab(tab) {
       currentTab = tab;
       // ... tab switching logic
   }

   function renderTab() {
       switch (currentTab) {
           case 'charts':
               content.innerHTML = renderCharts();
               break;
           // ... other cases
       }
   }
   ```

---

## Current Tab Structure

```javascript
// dashboard.js line ~258-269
let currentTab = 'charts';

// Tab rendering switch (~line 430-450)
switch (currentTab) {
    case 'charts':
        content.innerHTML = renderCharts();
        renderPlotlyCharts();
        break;
    case 'latest':
        content.innerHTML = renderSnapshotTable(data.latest, true);
        break;
    case 'intraday':
        content.innerHTML = renderSnapshotTable(data.intraday, true);
        break;
    case 'daily':
        content.innerHTML = renderDailyTable(data.daily);
        break;
    case 'alerts':
        content.innerHTML = renderAlertsTable(data.alerts);
        break;
}
```

---

## Theme Reference

All styling should use CSS variables from `styles.css`:
```css
--bg-body: hsla(240, 17%, 10%, 1.0);
--bg-secondary: hsla(221, 22%, 17%, 1.0);
--border-color: hsla(240, 7%, 30%, 1.0);
--font-color: hsla(0, 0%, 84%, 1.0);
--primary: hsla(355, 85%, 46%, 1.0);  /* IBKR Red */
--text-muted: hsla(208, 7%, 46%, 1.0);
```

Plotly charts use the `theme` object in `dashboard.js` which mirrors these values.

---

## Commands

```bash
# Run the server
python src/server.py

# View the app
# Open http://localhost:5000 in browser

# Key files to review first
static/index.html      # Sidebar HTML structure
static/css/styles.css  # Sidebar CSS (~line 400-650)
static/js/dashboard.js # Tab logic, data fetching
```

---

## Questions to Clarify Before Implementation

1. **Sidebar Toggle**:
   - Where should the toggle ideally be positioned?
   - Should it be always visible or hover-reveal?
   - Any specific IBKR reference for panel toggles?

2. **Greeks Tab**:
   - What visualization format is preferred? (table, heatmap, charts, or combo)
   - Should it show all expirations or have an expiration filter?
   - Are there specific Greeks that are most important to display prominently?
   - Should the Greeks tab integrate with the existing expiration filter in the sidebar?

3. **Data**:
   - Confirm which Greek fields are available in the database
   - Is the current `/api/intraday/latest/enriched` endpoint sufficient or do we need a new endpoint?

---

## Success Criteria

### Sidebar Toggle
- [ ] Toggle is positioned intuitively and doesn't overlap content
- [ ] Smooth animation on collapse/expand
- [ ] Works correctly on different screen sizes
- [ ] Consistent with detail panel toggle on the right

### Greeks Tab
- [ ] New tab appears in sidebar navigation
- [ ] Greeks data displays correctly (format TBD based on user preference)
- [ ] Styled consistently with existing tabs
- [ ] Respects expiration filter if applicable
- [ ] Responsive behavior when panels collapse

---

## File Structure Reference

```
SPX/
├── src/
│   └── server.py          # Flask server, API endpoints
├── static/
│   ├── css/
│   │   ├── styles.css     # Main stylesheet
│   │   └── ikbr.scss      # IBKR reference (read-only)
│   ├── js/
│   │   └── dashboard.js   # All frontend logic
│   └── index.html         # Main HTML template
└── HANDOVER_SIDEBAR_GREEKS.md  # This file
```
