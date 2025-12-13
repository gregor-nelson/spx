# SPX Options Monitor - Dynamic Chart Layout Handover

## Date: December 4, 2025

---

## Feature Request

Implement dynamic chart column layout based on right panel (Movers) state:

- **Movers panel OPEN** → Charts stack in **single column** (more vertical space per chart)
- **Movers panel CLOSED** → Charts display in **two columns** (utilize full width)

This maximizes visual real estate - when the user wants to focus on charts, collapsing the movers panel should automatically give them a wider, more detailed view.

---

## Current State

### What Was Just Completed
1. Right panel now collapses to 24px strip (like left sidebar)
2. Toggle via edge button or **Ctrl+]** keyboard shortcut
3. State persists in localStorage (`detailCollapsed`)
4. New table-based movers layout with dynamic columns
5. Sort options: Vol, OI, Δ, $

### Current Chart Grid (static 2-column)
```css
.chart-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin-bottom: 10px;
}
```

### Current Layout When Movers Open
```
┌──────────┬──────────┬─────────┐
│ Sidebar  │  Chart   │ Chart   │  Movers  │
│          ├──────────┼─────────┤  Panel   │
│          │  Chart   │ Chart   │  (220px) │
│          ├──────────┴─────────┤          │
│          │     Timeline       │          │
└──────────┴────────────────────┴──────────┘
```

### Desired Layout When Movers Collapsed
```
┌──────────┬────────────────────────────┬──┐
│ Sidebar  │   Chart      │    Chart    │▶ │
│          ├─────────────┼─────────────┤  │
│          │   Chart      │    Chart    │  │
│          ├─────────────┴─────────────┤  │
│          │         Timeline           │  │
└──────────┴────────────────────────────┴──┘
```
(Charts get more horizontal space)

### Desired Layout When Movers Open
```
┌──────────┬──────────────────┬─────────┐
│ Sidebar  │      Chart       │ Movers  │
│          ├──────────────────┤ Panel   │
│          │      Chart       │ (220px) │
│          ├──────────────────┤         │
│          │      Chart       │         │
│          ├──────────────────┤         │
│          │      Chart       │         │
│          ├──────────────────┤         │
│          │    Timeline      │         │
└──────────┴──────────────────┴─────────┘
```
(Charts stack vertically for readability alongside movers)

---

## Implementation Approach

### Option A: CSS-Only (Recommended)
Use the existing `.detail-collapsed` class on `.terminal` to toggle chart grid:

```css
/* Default: single column when movers panel is open */
.chart-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 10px;
}

/* Two columns when movers panel is collapsed */
.terminal.detail-collapsed .chart-grid {
    grid-template-columns: 1fr 1fr;
}
```

### Option B: JavaScript Toggle
Add class toggle in `applyDetailPanelState()`:

```javascript
function applyDetailPanelState() {
    const terminal = document.getElementById('terminal');
    // ... existing code ...

    // Update chart layout
    document.querySelectorAll('.chart-grid').forEach(grid => {
        grid.classList.toggle('two-column', detailCollapsed);
    });
}
```

### Recommendation
**Option A** is cleaner - pure CSS, no JS changes needed. The `.detail-collapsed` class is already being toggled on the `.terminal` element.

---

## Files to Modify

### `static/css/styles.css`

Location: Around line 714 (Chart Containers section)

```css
/* Current */
.chart-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin-bottom: 10px;
}

/* Change to */
.chart-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 10px;
    margin-bottom: 10px;
}

.terminal.detail-collapsed .chart-grid {
    grid-template-columns: 1fr 1fr;
}
```

### Consider Chart Heights
When stacking single-column, charts may need height adjustment:

```css
/* Taller charts when single column */
.chart-grid .chart-container > div {
    height: 280px;  /* Slightly shorter when stacked */
}

.terminal.detail-collapsed .chart-grid .chart-container > div {
    height: 320px;  /* Current height when side-by-side */
}
```

### Plotly Resize
The `applyDetailPanelState()` function already triggers a resize event:
```javascript
setTimeout(() => {
    window.dispatchEvent(new Event('resize'));
}, 200);
```
This should handle Plotly chart resizing automatically.

---

## Current Chart Structure (for reference)

From `dashboard.js` `renderCharts()` function:

```html
<div class="chart-grid">
    <div class="chart-container">
        <div id="volumeByStrikeChart" style="height: 320px;"></div>
    </div>
    <div class="chart-container">
        <div id="oiByStrikeChart" style="height: 320px;"></div>
    </div>
</div>
<div class="chart-grid">
    <div class="chart-container">
        <div id="heatmapChart" style="height: 320px;"></div>
    </div>
    <div class="chart-container">
        <div id="changeHeatmapChart" style="height: 320px;"></div>
    </div>
</div>
<div class="chart-container chart-full">
    <div id="volumeTimeChart" style="height: 260px;"></div>
</div>
```

Note: The timeline chart already uses `.chart-full` which spans full width.

---

## Testing Checklist

- [ ] Charts show single column when movers panel is open
- [ ] Charts switch to two columns when movers panel collapses
- [ ] Transition is smooth (CSS transition on grid-template-columns)
- [ ] Plotly charts resize correctly after toggle
- [ ] Works with left sidebar in both states (expanded/collapsed)
- [ ] Responsive breakpoints still work correctly
- [ ] Chart heights are appropriate for each layout

---

## Responsive Considerations

Current breakpoints hide the detail panel at smaller viewports. Ensure the chart layout logic doesn't conflict:

```css
@media (max-width: 1000px) {
    .detail-panel {
        display: none;
    }
    /* Charts should be 2-column here since panel is hidden */
    .chart-grid {
        grid-template-columns: 1fr 1fr;
    }
}

@media (max-width: 768px) {
    .chart-grid {
        grid-template-columns: 1fr;  /* Single column on mobile */
    }
}
```

---

## Running the Dashboard

```bash
cd C:\Users\gregor\Downloads\Dev\Python\SPX
python src/server.py
# Open http://localhost:5000
```

---

## Key Files Reference

| File | Purpose |
|------|---------|
| `static/css/styles.css` | Chart grid styling (~line 714) |
| `static/js/dashboard.js` | `renderCharts()` (~line 326), `applyDetailPanelState()` (~line 89) |
| `static/index.html` | Main layout structure |

---

## Session Variables

```javascript
// Current state tracking (in dashboard.js)
let detailCollapsed = localStorage.getItem('detailCollapsed') === 'true';
```

CSS class applied to terminal:
- `.detail-collapsed` - when right panel is collapsed

---

## Success Criteria

- [ ] Single column charts when movers panel open (default)
- [ ] Two column charts when movers panel collapsed
- [ ] Smooth transition animation
- [ ] Plotly charts resize properly
- [ ] No layout jank or overflow issues

---

## Optional Enhancements

1. **Add CSS transition** for smooth grid change:
   ```css
   .chart-grid {
       transition: grid-template-columns 0.15s ease;
   }
   ```

2. **Adjust chart heights** dynamically based on layout

3. **Consider the timeline chart** - should it also change behavior?

---

**End of Handover**
