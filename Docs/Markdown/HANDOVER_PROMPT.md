# SPX Options Monitoring System - Handover Prompt

Copy everything below this line into a new Claude Code session:

---

## Context

I'm building an SPX OTM put volume anomaly detection system to monitor for unusual institutional hedging activity. This is an early-warning system for potential market stress events.

**Current Status:** Core system is functional - scheduler, poller, detection, API, and dashboard all working. Now focusing on production readiness and UI polish.

## Important Instructions

**Before writing code:**
1. Read the documentation file listed below
2. Discuss your proposed approach with me
3. Ask clarifying questions about requirements

I prefer thoughtful, well-considered solutions. Simple and maintainable over complex.

## File to Read First

`Docs/SESSION_SUMMARY_20251204_V3.md` - Complete system state and next steps

## What's Been Built

### Backend (Complete)
- `spx_scheduler.py` - Unified long-running scheduler (15-min polls, auto-EOD)
- `spx_poller.py` - Polling + anomaly detection with fallback comparison logic
- `spx_eod.py` - EOD consolidation
- `server.py` - Flask API with enriched endpoint
- `Database/spx_database.py` - SQLite database module

### Frontend (Working, Needs Polish)
- `index.html` - Single file with embedded CSS (~200 lines) and JS (~400 lines)
- Plotly charts, Top Movers, color-coded visualizations
- Dark theme, auto-refresh, expiration filtering

## Priority Tasks for This Session

### 1. Project Cleanup (Production Readiness)

Reorganize for clear separation of concerns:

```
Current:                          Target:
SPX/                              SPX/
├── spx_scheduler.py              ├── src/
├── spx_poller.py                 │   ├── scheduler.py
├── spx_eod.py                    │   ├── poller.py
├── server.py                     │   ├── eod.py
├── index.html                    │   ├── server.py
├── Database/                     │   └── database.py
│   └── spx_database.py           ├── static/
└── Docs/                         │   ├── css/styles.css
                                  │   ├── js/dashboard.js
                                  │   └── index.html
                                  ├── logs/
                                  ├── data/
                                  ├── config/
                                  ├── docs/
                                  └── requirements.txt
```

### 2. Frontend CSS Extraction

Move all CSS from `index.html` to `static/css/styles.css`:
- Extract `<style>` content
- Organize with clear sections
- Update Flask to serve static files

### 3. Frontend UI Refinement

Make it look more professional - similar to broker desktop client widgets:
- Tighter, more compact layout
- Professional color scheme
- Better typography (monospace for numbers)
- Card-based layout with subtle shadows
- Compact data presentation

**Reference Style:** Bloomberg Terminal / Thinkorswim / Interactive Brokers TWS

## Technical Context

- **Python:** 3.9+ (uses zoneinfo)
- **Platform:** Windows (dev), Debian Linux (prod)
- **API:** Polygon.io - 15-min delayed data
- **Database:** SQLite

## Running the System

```bash
# Dashboard
python server.py
# Open http://localhost:5000

# Scheduler (continuous)
python spx_scheduler.py
```

## Questions to Discuss

1. **Config approach:** Single `settings.py` or environment-based?
2. **CSS approach:** Plain CSS with variables, or introduce Tailwind?
3. **Build process:** Keep simple (no build) or add bundling?

---

**End of Handover Prompt**
