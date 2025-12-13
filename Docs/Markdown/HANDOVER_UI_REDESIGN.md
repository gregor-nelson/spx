# SPX Options Monitor - UI Redesign Handover (Continued)

## Date: December 4, 2025

---

## Context

A previous session completed project cleanup and an initial UI redesign. The user now wants further refinements to achieve a professional brokerage-style interface (TWS/Interactive Brokers).

**IMPORTANT: Brainstorm design approach with user before coding.**

---

## What Was Completed (Previous Session)

### Cleanup (Done)
- Removed: `Backend/`, `Frontend/`, `data/`, `__pycache__/`, `Tests/`
- Project is clean

### Initial UI Redesign (Done)
- 3-column layout: Sidebar (180px) | Main | Detail Panel (280px)
- Dark theme with muted colors (#080808 backgrounds)
- 13px base typography
- 4px border-radius
- Responsive breakpoints (collapses at 1100px, 600px)
- Plotly charts updated with darker theme

---

## What Needs To Be Done (This Session)

### 1. Collapsible Sidebar
**User Request:** Add a toggle to hide/show the left sidebar to maximize chart area.

Questions to discuss:
- Collapse to icons-only or fully hidden?
- Toggle button location: In sidebar header or in toolbar?
- Should right panel (movers) also be collapsible?
- Persist preference in localStorage?

### 2. TWS-Style Design Refinement
**User Request:** Make it look like it belongs in TWS (Interactive Brokers Trader Workstation) or similar professional brokerage apps.

The current design is "too web app" - needs to be more utilitarian/professional.

---

## TWS Design Language Reference

### Visual Characteristics
- **Blue-gray palette** (not pure black)
- **Extremely flat** - zero or minimal border-radius (0-2px)
- **No decorative elements** - purely functional
- **Dense information display**
- **Toolbar-style headers** with icon buttons
- **Status bar aesthetic** for market data

### TWS Color Palette (Approximate)
```
Backgrounds:
  --bg-darkest:    #1a1f2e
  --bg-dark:       #1e2130
  --bg-medium:     #252a3d
  --bg-light:      #2a3042
  --bg-lighter:    #323850

Borders:
  --border-subtle: #3a4057
  --border-visible:#454d66

Text:
  --text-primary:  #e8eaf0
  --text-secondary:#8b92a5
  --text-muted:    #6b7280

Accents:
  --accent-blue:   #3b7ddd
  --accent-green:  #26a65b
  --accent-red:    #c0392b
  --accent-orange: #d68910
```

### TWS Layout Pattern
```
+----------------------------------------------------------+
| [=] APP TITLE    | SPX: 6050 | Contracts: 45 |   12:34  [R]|  <- Toolbar
+------+-------------------------------------------+--------+
|      |                                           |        |
| Nav  |         Main Content Area                 | Side   |
|      |         (Charts / Tables)                 | Panel  |
|      |                                           |        |
+------+-------------------------------------------+--------+
```

### TWS Component Styles
- **Tabs:** Rectangular, no rounded corners, background highlight for active
- **Buttons:** Flat, minimal hover effects
- **Tables:** Subtle row separators, no zebra stripes
- **Inputs:** Simple bordered rectangles
- **Icons:** Minimal, often unicode or simple SVG

---

## Brainstorming Questions

### Layout
1. Sidebar collapse: Icons-only, or fully hidden?
2. Right movers panel: Also collapsible, or always visible?
3. Add a bottom status bar?
4. Minimum supported viewport width?

### Visual Style
5. Border-radius: 0px (fully flat) or 2px (subtle rounding)?
6. Use borders between sections, or just background colors?
7. Chart titles: Inside chart, or as separate header bars?

### Header/Toolbar
8. What info belongs in the toolbar? (SPX price, time, contract count, etc.)
9. Icon style: Unicode characters, or add an icon library?

### Interaction
10. Keyboard shortcut for sidebar toggle?
11. Resizable panels (drag to resize)?
12. Remember layout preferences in localStorage?

---

## Current File State

### `static/index.html`
```
Current structure:
- .terminal (3-col grid)
  - .sidebar (left nav)
  - .main-content (center)
  - .detail-panel (right movers)
```

### `static/css/styles.css`
```
Key CSS variables:
--bg-primary: #080808
--bg-secondary: #0d0d0d
--bg-tertiary: #121212
--accent-blue: #3d8fd1
--accent-green: #3d9970
--accent-red: #c9444d
--radius: 4px
--sidebar-width: 180px
--detail-width: 280px
```

### `static/js/dashboard.js`
- Theme colors object matching CSS
- Plotly config with dark theme
- Tab switching, data loading, chart rendering
- Top movers panel rendering

---

## Project Structure

```
SPX/
├── src/
│   ├── __init__.py
│   ├── database.py
│   ├── poller.py
│   ├── eod.py
│   ├── scheduler.py
│   └── server.py
├── static/
│   ├── index.html          <- Update for collapsible sidebar
│   ├── css/styles.css      <- Update to TWS palette/style
│   └── js/dashboard.js     <- Add toggle functionality
├── Docs/
├── logs/
├── .env
├── requirements.txt
└── spx_options.db
```

---

## Running the Dashboard

```bash
python src/server.py
# Open http://localhost:5000
```

---

## Recommended Session Flow

1. **Brainstorm (10-15 min)**
   - Go through questions above with user
   - Agree on specific design direction

2. **Define design tokens**
   - Update CSS variables to TWS palette
   - Set border-radius, spacing values

3. **Implement sidebar toggle**
   - Add toggle button to HTML
   - CSS for collapsed state
   - JS toggle function

4. **Refine theme**
   - Update colors throughout CSS
   - Flatten design (reduce/remove border-radius)
   - Update toolbar/header style

5. **Test and iterate**
   - Check responsiveness
   - Verify all functionality works

---

## Success Criteria

- [ ] Sidebar can be toggled hidden/visible
- [ ] Chart area maximizes when sidebar is hidden
- [ ] Blue-gray TWS-style color palette
- [ ] Flat design (0-2px border-radius)
- [ ] Toolbar-style header with market info
- [ ] Dense, professional appearance
- [ ] All existing functionality preserved

---

## Notes

- User prefers discussion before implementation
- Focus on professional brokerage aesthetic
- Prioritize data density and chart visibility
- Keep Plotly for charting (already configured)

---

**End of Handover**
