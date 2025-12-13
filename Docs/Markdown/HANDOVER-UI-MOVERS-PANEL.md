# SPX Options Monitor - Movers Panel Redesign Handover

## Date: December 4, 2025

---

## IMPORTANT: Design Discussion First

**DO NOT jump into code immediately.** The user wants to discuss layout approaches and design decisions before any implementation. Start by reviewing the current state, then brainstorm options with the user.

---

## Context

Two previous sessions completed:
1. Project cleanup and initial UI redesign (dark theme, 3-column layout)
2. TWS-style refinement with Phosphor icons, collapsible sidebar, top toolbar

The user now wants to refine the **right "Top Movers" panel** further. The current implementation needs work on:
- Making it collapsible (like the left sidebar)
- Improving visual clarity and professional appearance
- Better iconography (current rocket icon doesn't fit design language)
- Maximum information density without clutter

---

## Current State

### What Works Well
- Left sidebar collapses to icons-only (44px) with edge toggle button
- Keyboard shortcut (Ctrl+B) for sidebar toggle
- localStorage persistence for collapsed state
- TWS blue-gray color palette throughout
- Phosphor icons integrated via CDN

### What Needs Improvement (Right Panel)
1. **Not collapsible** - user wants same pattern as left sidebar
2. **Icon mismatch** - `rocket-launch` icon doesn't fit TWS aesthetic
3. **Card layout** - still feels cluttered despite recent compacting
4. **Professional feel** - needs to look more like brokerage terminal

---

## Current Right Panel Structure

```
┌─────────────────────────┐
│ 🚀 Top Movers    [1H][EOD]│  <- Header (rocket doesn't fit)
├─────────────────────────┤
│ [📊 Vol] [%] [$]        │  <- Sort controls
├─────────────────────────┤
│ ┌─────────────────────┐ │
│ │ 6050  12-06 · 2d  D │ │  <- Mover card
│ │ 📊 1,234  📈+50  %+15│ │
│ │ 💲 $1.2M (+50K)     │ │
│ └─────────────────────┘ │
│ ┌─────────────────────┐ │
│ │ ...more cards...    │ │
│ └─────────────────────┘ │
└─────────────────────────┘
```

### Current CSS Variables
```css
--detail-width: 220px;      /* Recently reduced from 280px */
--sidebar-collapsed: 44px;  /* Left sidebar collapsed width */
```

### Current Panel Width: 220px

---

## Design Questions to Discuss

### 1. Collapse Behavior
- **Option A:** Collapse to thin strip (like left sidebar, ~44px) with expand button
- **Option B:** Collapse completely (0px), toggle via toolbar button
- **Option C:** Slide-out drawer that overlays content when opened
- Should collapsed state show any summary info (e.g., "3 alerts")?

### 2. Panel Header
- What icon replaces rocket? Options:
  - `ph-lightning` (activity/movement)
  - `ph-fire` (hot/trending)
  - `ph-arrow-fat-lines-up` (movers)
  - `ph-pulse` (market pulse)
  - `ph-activity` (activity)
  - No icon, just text "MOVERS" in uppercase
- Should header be more minimal/toolbar-like?

### 3. Card Layout Alternatives

**Option A: Ultra-compact single row per item**
```
6050 12/06  +1,234 (+15%)  $1.2M  [D]
```

**Option B: Two-row with visual hierarchy**
```
6050  DEC-06  2d                 [D][M]
Vol 1,234 → +50  |  $1.2M (+50K)
```

**Option C: Mini-chart sparkline style**
```
6050  ████████░░  +15%  $1.2M
```

**Option D: Table/grid layout instead of cards**
```
Strike  Exp     Δ Vol    %     $
6050    12/06   +1,234  +15%  1.2M
6025    12/06   +890    +12%  800K
```

### 4. Information Priority
What's most important to see at a glance?
- Strike price (always)
- Expiration/DTE
- Volume delta (absolute change)
- Percent change
- Notional value
- Flags (delta/dormancy/multiplier)
- Current volume (total)

Should any be hidden by default / shown on hover?

### 5. Visual Style
- Cards with borders vs. borderless rows?
- Alternating row backgrounds (zebra) vs. uniform?
- Separator lines vs. spacing only?
- How prominent should flags be?

### 6. Interaction
- Click on mover item - what happens? (filter charts? show detail?)
- Hover effects?
- Right-click context menu?

---

## Technical Reference

### Files to Modify
```
static/
├── index.html          <- Panel HTML structure
├── css/styles.css      <- Panel styling, collapse states
└── js/dashboard.js     <- Toggle function, render function
```

### Existing Collapse Pattern (Left Sidebar)
```javascript
// JS toggle function
function toggleSidebar() {
    sidebarCollapsed = !sidebarCollapsed;
    localStorage.setItem('sidebarCollapsed', sidebarCollapsed);
    applySidebarState();
}

// CSS class toggle
.terminal.sidebar-collapsed {
    grid-template-columns: var(--sidebar-collapsed) 1fr var(--detail-width);
}
```

### Current Mover Render Function
Located in `dashboard.js` around line 400: `renderMoversPanel()`

### Phosphor Icons CDN
Already loaded: `https://unpkg.com/@phosphor-icons/web`
Browse icons: https://phosphoricons.com/

---

## Design Language Reference (TWS Style)

### Color Palette (Already Implemented)
```css
--bg-darkest:    #1a1f2e    /* Darkest background */
--bg-primary:    #1e2130    /* Primary panels */
--bg-secondary:  #252a3d    /* Secondary panels */
--bg-tertiary:   #2a3042    /* Cards, inputs */
--border-color:  #3a4057    /* Subtle borders */
--text-primary:  #e8eaf0    /* Primary text */
--text-secondary:#8b92a5    /* Secondary text */
--text-muted:    #6b7280    /* Muted text */
--accent-blue:   #3b7ddd
--accent-green:  #26a65b
--accent-red:    #c0392b
--accent-orange: #d68910
```

### TWS Characteristics
- Extremely flat (2px border-radius max)
- Dense information display
- Minimal decorative elements
- Toolbar/status-bar aesthetic
- Subtle borders, not heavy shadows
- Monospace for numbers
- Uppercase labels, small font sizes

---

## Running the Dashboard

```bash
cd C:\Users\gregor\Downloads\Dev\Python\SPX
python src/server.py
# Open http://localhost:5000
```

---

## Session Flow Recommendation

1. **Review current state** (5 min)
   - Open dashboard in browser
   - Note what feels off about the movers panel

2. **Discuss design options** (10-15 min)
   - Go through questions above
   - Sketch out preferred approach
   - Agree on specific changes

3. **Implementation** (after agreement)
   - Add collapse functionality
   - Refine card/row layout
   - Update iconography
   - Test and iterate

---

## Success Criteria

- [ ] Right panel can be collapsed/expanded
- [ ] Toggle follows same pattern as left sidebar
- [ ] Collapsed state persists in localStorage
- [ ] Header icon fits TWS design language
- [ ] Card/row layout is cleaner and more scannable
- [ ] Professional brokerage terminal aesthetic
- [ ] All existing functionality preserved

---

## Notes

- User is design-conscious; discuss before implementing
- Focus on information density AND clarity
- TWS/Bloomberg terminal aesthetic is the goal
- Phosphor icons are available - choose appropriate ones
- Consider keyboard shortcut for right panel toggle

---

**End of Handover**
