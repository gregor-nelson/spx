# Handover Prompt for Next Claude Code Session

Copy and paste this entire prompt to start the next session:

---

## Context

I'm building an SPX OTM put volume anomaly detection system to monitor for unusual institutional hedging activity. This is an early-warning system for potential market stress events.

**Current Status:** Data collection and basic anomaly detection are operational. A simple web dashboard exists. Now I need to expand coverage and build out the frontend.

## Important Instructions

**Before writing code:**
1. Read the documentation files listed below
2. Discuss approach with me for significant changes
3. Ask clarifying questions about requirements

I prefer thoughtful, well-considered solutions. Simple and maintainable over complex.

## Files to Read First

1. `SESSION_SUMMARY_20251203_V2.md` - What was built in the most recent session (detection + dashboard)
2. `SESSION_HANDOVER.md` - Original project requirements and architecture
3. `spx_poller.py` - Current polling + detection implementation
4. `server.py` - Flask API server
5. `index.html` - Current frontend
6. `Database/spx_database.py` - Database module

## What's Been Built

### Data Collection
- `spx_poller.py` - Hourly polling (80-95% moneyness, 20-45 DTE, single monthly expiration)
- `spx_eod.py` - End-of-day consolidation
- SQLite database with intraday_snapshots, daily_history, alerts tables

### Anomaly Detection (integrated into poller)
- Time-aligned day-over-day volume comparison
- Three flag types: delta, multiplier, dormancy
- Configurable thresholds at top of script
- Console logging (database storage toggleable)

### Web Dashboard
- `server.py` - Flask API endpoints
- `index.html` - Single-page dashboard with tabs (Latest Poll, Intraday, Daily, Alerts)
- Dark theme, auto-refresh

## Priority Tasks for This Session

### 1. Multi-Expiration Support (HIGH PRIORITY)

**Current limitation:** Poller only fetches a single monthly expiration in the 20-45 DTE window.

**Goal:** Fetch ALL expirations (including SPXW weeklies) within a configurable DTE range (e.g., 7-30 or 10-40 DTE) to capture complete volume landscape.

**Considerations:**
- Option Chain API returns contracts for a single expiration per call
- Need to discover available expirations first, then loop
- More contracts = more API calls (batch limit 250 per request)
- Database schema already supports multiple expirations

**Questions to discuss:**
- What DTE range makes sense? (7-30? 10-40?)
- Should we limit to N nearest expirations to control API usage?
- How to handle the increased data volume in the frontend?

### 2. Frontend Expansion (MEDIUM PRIORITY)

**Current state:** Basic tabular view of data.

**Goals:**
- Volume heatmap visualization (strike × expiration grid)
- Historical volume charts
- Better alert display with drill-down
- Filtering (by expiration, strike range, flags)
- Mobile-responsive improvements

**Considerations:**
- Keep it simple - single HTML file is fine for now
- Could add Chart.js or similar lightweight library
- Consider what views are most useful for spotting anomalies

### 3. Mobile Notifications (MEDIUM PRIORITY)

**Current state:** Alerts logged to console, storage toggleable but not connected to notifications.

**Goal:** Push alerts to mobile device via Pushover or Telegram.

**Architecture:**
- New module: `notifier.py`
- Called after alerts are generated in poller
- Should be toggleable and rate-limited
- Store delivery status in alerts table

**User preference:** Pushover is simpler, Telegram is free. Either works.

### 4. Detection Robustness (LOWER PRIORITY)

**Current thresholds:**
```python
VOLUME_FLOOR = 100
PREMIUM_FLOOR = 100_000
DELTA_THRESHOLD = 200
DORMANCY_THRESHOLD = 100
MULTIPLIER_THRESHOLD = 5
```

**After more data accumulates:**
- Add percentile-based scoring
- OI surge detection (EOD only)
- Rolling max breach (multi-day)
- Weighted composite scores

## Technical Notes

### API Endpoints
- Option Chain: `GET /v3/snapshot/options/SPX` - Discovery (no greeks)
- Unified Snapshot: `GET /v3/snapshot?ticker.any_of=...` - Detail with greeks (max 250 tickers)

### Environment
- Windows development, Linux VPS production
- Python 3.x
- API: Polygon.io (Massive) - 15-min delayed data
- Dependencies: requests, flask, python-dotenv

### Running the System
```bash
# Start dashboard
python server.py
# Open http://localhost:5000

# Run poller manually
python spx_poller.py

# EOD consolidation
python spx_eod.py
```

## Questions for Discussion

1. **DTE range for multi-expiration:** What range captures the relevant vol landscape without excessive data? I'm thinking 10-40 DTE.

2. **Frontend priority:** Should we focus on heatmap visualization first, or notification integration first?

3. **Notification service:** Pushover ($5 one-time) or Telegram (free, slightly more setup)?

4. **Data retention:** With multi-expiration, data volume increases. Keep current retention (3 days intraday, 60 days daily) or adjust?

## Start Here

Please begin by reading the files listed above, then let's discuss the multi-expiration implementation approach. I'd like to understand:
- How you'd modify the poller to fetch multiple expirations
- Impact on API usage and performance
- Any schema changes needed

---

**End of Handover Prompt**
