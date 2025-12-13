# SPX OTM Put Volume Anomaly Detection System - Session Handover

## Project Status: Database Foundation Complete, Ready for Integration Script

---

## Executive Summary

**Goal:** Build a system that monitors SPX deep OTM put volume to detect unusual institutional hedging activity that might precede market stress events.

**Current Phase:** Database backend is complete and tested. Next step is building the integration script that fetches API data and stores it in the database.

**User Environment:** 
- Bare metal Linux VPS
- Python 3.x
- Massive (formerly Polygon.io) API subscription ($79/month, 15-min delayed data)
- Comfortable with Python, prefers simple/maintainable solutions

---

## What Has Been Built

### 1. Database Layer (COMPLETE ✓)

**File:** `spx_database.py`

**Features:**
- Three-table architecture: `intraday_snapshots` (3-day retention), `daily_history` (60-day rolling), `alerts` (indefinite)
- Automatic volume delta calculation (compares current poll to previous poll same day)
- Batch insert support (~50 contracts in single transaction)
- Idempotent inserts via UNIQUE constraint + INSERT OR REPLACE
- Historical comparison queries optimized with composite indexes
- EOD consolidation (last poll of day → daily_history)
- Calendar-based cleanup (not row-based)

**Key Design Decisions:**
- **Moneyness bucketing** (±2% tolerance) groups similar risk profiles regardless of absolute SPX level
- **DTE bucketing** (±5 days) captures similar theta decay patterns
- **Volume delta** stored alongside cumulative volume for flexibility
- **SQLite with WAL mode** for simplicity and portability
- **Two-function architecture:** Hourly polling (intraday) + EOD consolidation (daily_history)

**Documentation:**
- `DATABASE_DESIGN.md` - Detailed rationale for all decisions
- `DATABASE_QUICKREF.md` - Copy-paste patterns for common operations
- `IDEMPOTENCY_UPDATE.md` - Why/how duplicate polls are handled
- `test_idempotency.py` - Proves idempotency works correctly

### 2. API Testing (COMPLETE ✓)

**Files:** `spx_snapshot_test.py`, `spx_unified_test.py`

**Key Findings:**
- **Option Chain endpoint** (`/v3/snapshot/options/SPX`) - Good for discovery but NO greeks
- **Unified Snapshot endpoint** (`/v3/snapshot`) - Has greeks, IV, SPX spot price ← USE THIS
- Greeks available for 99.2% of contracts (only ultra-deep OTM lack them)
- SPX spot price in `underlying_asset.value` field
- Delta values present for all contracts in target range (80-95% moneyness)

**Critical Discovery:** Must use Unified Snapshot endpoint, not Option Chain endpoint.

**Workflow:**
1. Use Option Chain to discover available strikes
2. Build ticker list (e.g., `['O:SPX251219P05000000', 'O:SPX251219P05100000']`)
3. Fetch via Unified Snapshot (limit: 250 tickers per call)
4. Parse response into database format

**Test Results (Dec 19, 2025 expiration):**
- 250 contracts returned
- SPX @ $6,829.37
- Total volume: 23,923 contracts
- Total OI: 2,034,453 contracts
- 59 contracts in target range (80-95% moneyness)

### 3. Expiration Logic (COMPLETE ✓)

**Function:** `get_third_friday(year, month)` + `find_target_expiration()`

**Features:**
- Dynamically calculates 3rd Friday of any month (standard monthly expiration)
- Finds nearest monthly expiration in 20-45 DTE window
- Falls back to nearest if none in window
- No hardcoded dates - works for any year

**Currently configured:** Targets monthly expirations only (not SPXW weeklies)

---

## What Needs to Be Built

### PRIMARY OBJECTIVE: Integration Script

Build `spx_poller.py` that:

1. **Fetch Data from API**
   - Calculate target expiration (20-45 DTE)
   - Calculate target strikes (80-95% moneyness)
   - Build ticker list
   - Call Unified Snapshot endpoint
   - Handle API errors gracefully

2. **Transform API Response to Database Format**
   - Extract all required fields from nested JSON
   - Calculate derived fields (moneyness, DTE)
   - Handle NULL greeks gracefully
   - Format timestamps consistently

3. **Store in Database**
   - Use `db.insert_intraday_batch()`
   - Volume deltas calculated automatically
   - Log success/failure

4. **Run Hourly During Market Hours**
   - Designed to be called by cron
   - 9:30 AM - 4:00 PM ET (7 times per day)
   - Should complete in <10 seconds

### SECONDARY OBJECTIVE: EOD Script

Build `spx_eod.py` that:

1. **Consolidate Today's Data**
   - Call `db.consolidate_day_to_history(today)`
   - Moves last poll of each contract to daily_history

2. **Cleanup Old Data**
   - `db.cleanup_old_intraday_data(days_to_keep=3)`
   - `db.cleanup_old_daily_history(days_to_keep=60)`

3. **Run Once Daily After Market Close**
   - Cron at 4:30 PM ET or later
   - Should complete in <1 second

---

## Technical Specifications

### API Response Structure (Unified Snapshot)

**Endpoint:** `GET /v3/snapshot?ticker.any_of=O:SPX251219P05000000,O:SPX251219P05100000`

**Response Structure:**
```json
{
  "results": [
    {
      "ticker": "O:SPX251219P05000000",
      "details": {
        "strike_price": 5000,
        "expiration_date": "2025-12-19",
        "contract_type": "put"
      },
      "session": {
        "volume": 4583,
        "close": 3.92,
        "high": 4.05,
        "low": 3.85
      },
      "open_interest": 113591,
      "greeks": {
        "delta": -0.007019,
        "gamma": 0.00001,
        "theta": -0.15,
        "vega": 0.25
      },
      "implied_volatility": 0.35,
      "underlying_asset": {
        "value": 6829.37,
        "ticker": "I:SPX"
      },
      "market_status": "open",
      "timeframe": "DELAYED"
    }
  ]
}
```

### Database Snapshot Format

**Required fields for `db.insert_intraday_batch()`:**
```python
snapshot = {
    'captured_at': '2025-12-03T10:30:00',        # ISO timestamp
    'captured_date': '2025-12-03',               # Date only
    'ticker': 'O:SPX251219P05000000',
    'expiration': '2025-12-19',
    'strike': 5000.0,
    'contract_type': 'put',
    'spot_price': 6829.37,                       # from underlying_asset.value
    'moneyness': 0.732,                          # strike / spot_price
    'dte': 16,                                   # calculate from expiration
    'volume_cumulative': 4583,                   # from session.volume
    'open_interest': 113591,
    'close_price': 3.92,                         # from session.close
    'high_price': 4.05,
    'low_price': 3.85,
    'vwap': 4.13,                                # may be NULL
    'transactions': 127,                         # may be NULL
    'delta': -0.007019,                          # from greeks, may be NULL
    'gamma': 0.00001,
    'theta': -0.15,
    'vega': 0.25,
    'implied_vol': 0.35,                         # may be NULL
    'market_status': 'open',
    'timeframe': 'DELAYED'
}
```

**Note:** `volume_delta` is calculated automatically by database, don't include it.

### Target Strike Calculation

**Given:**
- SPX spot price: $6,829.37
- Moneyness range: 0.80 - 0.95 (5-20% OTM)

**Strikes to monitor:**
- Min: 6829 × 0.80 = 5,463
- Max: 6829 × 0.95 = 6,488

**Strategy:**
- Query Option Chain endpoint for all puts at target expiration
- Filter to strikes in range
- Build ticker list from filtered results
- Fetch details via Unified Snapshot

**Expected count:** ~50-100 contracts per expiration

---

## Implementation Patterns

### Hourly Polling Script Structure

```
PSEUDOCODE - for reference only

1. Get current timestamp
2. Find target expiration (20-45 DTE)
3. Discover available strikes via Option Chain endpoint
4. Get SPX spot price from first contract
5. Calculate moneyness range (80-95% of spot)
6. Filter strikes to target range
7. Build ticker list from filtered strikes
8. Fetch via Unified Snapshot (batch max 250)
9. Transform each contract to snapshot format
10. Insert batch to database
11. Log results
```

### EOD Script Structure

```
PSEUDOCODE - for reference only

1. Get today's date
2. Consolidate intraday → daily_history
3. Cleanup old intraday (>3 days)
4. Cleanup old daily history (>60 days)
5. Log results
```

---

## Error Handling Requirements

### API Errors
- Network timeout → Log and exit gracefully (cron will retry next hour)
- Rate limit → Unlikely with hourly polling, but log if it happens
- 4xx errors → Log API response for debugging
- Empty results → Log warning but don't crash

### Database Errors
- Locked database → Retry with exponential backoff (WAL mode should prevent this)
- Disk full → Log critical error
- Corrupt database → Exit with clear error message

### Data Quality
- Missing SPX spot price → Can't calculate moneyness, skip this poll
- Missing volume → Treat as 0
- Missing greeks → Store as NULL (expected for very deep OTM)

**Philosophy:** Prefer logging + graceful degradation over crashing. One failed poll isn't critical.

---

## Configuration Parameters

### Polling Schedule
- **Hours:** 9:30 AM - 4:00 PM ET (market hours)
- **Frequency:** Hourly (top of the hour)
- **Timezone:** America/New_York (handle EST/EDT automatically)

### Target Parameters
- **DTE window:** 20-45 days
- **Moneyness range:** 0.80-0.95 (5-20% OTM)
- **Contract type:** Puts only
- **Expiration type:** Monthly only (3rd Friday)

### Retention
- **Intraday snapshots:** 3 calendar days
- **Daily history:** 60 calendar days
- **Alerts:** Indefinite

### API
- **Base URL:** `https://api.polygon.io`
- **Auth:** Via `apiKey` query parameter
- **Rate limit:** Not a concern with hourly polling

---

## File Organization

### Existing Files (in project directory)
```
spx_database.py              - Database module (production ready)
spx_snapshot_test.py         - Option Chain endpoint test (reference)
spx_unified_test.py          - Unified Snapshot test (reference)
test_idempotency.py          - Database idempotency test
DATABASE_DESIGN.md           - Design rationale
DATABASE_QUICKREF.md         - Usage patterns
IDEMPOTENCY_UPDATE.md        - Duplicate poll handling
```

### Files to Create
```
spx_poller.py                - Hourly polling script (PRIORITY 1)
spx_eod.py                   - End-of-day consolidation (PRIORITY 2)
config.py                    - Configuration parameters (optional)
requirements.txt             - Python dependencies
```

---

## Python Dependencies

### Confirmed Required
- `requests` - API calls
- `sqlite3` - Database (built-in)
- `datetime` - Date/time handling (built-in)
- `json` - JSON parsing (built-in)
- `os` - Environment variables (built-in)

### User Has Installed
- `massive` - Official Polygon.io client (not used yet, but available)

### Recommendation
Start with raw `requests` library for clarity. Can refactor to `massive` client later if beneficial.

---

## Testing Strategy

### Unit Testing
- Test API response parsing with sample JSON
- Test strike filtering logic
- Test moneyness calculations
- Test DTE calculations
- Test timestamp formatting

### Integration Testing
- Run poller with test API key
- Verify data in database
- Run EOD script
- Verify consolidation worked
- Check cleanup functions

### Production Testing
- Run poller manually first (don't schedule cron yet)
- Verify no errors in logs
- Check database grows as expected
- Let run for 2-3 days before enabling anomaly detection

---

## Known Issues and Edge Cases

### Market Holidays
- No trading → API returns empty results
- EOD script should handle gracefully (no data to consolidate)
- Database cleanup still runs (calendar-based, not trading-day-based)

### Expiration Week
- Contracts expire → DTE window shifts to next month
- Poller should automatically switch to next monthly expiration
- No special handling needed (dynamic expiration logic handles this)

### Deep OTM Contracts
- May have NULL greeks (expected, not an error)
- May have zero volume (dormancy detection will flag this)
- Store as-is, don't filter out

### SPX Halts
- Rare, but possible during extreme volatility
- API may return stale data or errors
- Log and skip poll if SPX price unavailable

### Daylight Saving Time
- Market hours are in ET (America/New_York timezone)
- Python's timezone handling should manage automatically
- Test during DST transition if possible

---

## Performance Expectations

### Polling Script
- API call: ~500ms (network + API processing)
- Transform: <10ms (pure Python)
- Database insert: ~50ms (batch of 50 contracts)
- **Total runtime:** <2 seconds

### EOD Script
- Consolidation query: ~100ms (SELECT + INSERT)
- Cleanup queries: <10ms each
- **Total runtime:** <200ms

### Database Growth
- Intraday: ~1,500 rows (50 contracts × 7 polls × 3 days) = 500KB
- Daily: ~6,000 rows (100 contracts × 60 days) = 2MB
- **Total:** <10MB for working dataset

---

## Immediate Next Steps

### 1. Build `spx_poller.py`

**Key Functions Needed:**
- `fetch_option_chain(expiration)` → list of contracts
- `fetch_unified_snapshot(tickers)` → detailed data with greeks
- `transform_to_snapshot(api_response)` → database format
- `main()` → orchestrates the above

**Integration Points:**
- Use `find_target_expiration()` from test scripts
- Use `SPXDatabase` class from `spx_database.py`
- Use patterns from `spx_unified_test.py` for API calls

**Testing:**
- Start with `if __name__ == "__main__"` block
- Print to console before inserting to database
- Verify data looks correct
- Then enable database inserts

### 2. Build `spx_eod.py`

**Should be simple:**
```
PSEUDOCODE

from spx_database import SPXDatabase
from datetime import date

db = SPXDatabase()
today = date.today().isoformat()

count = db.consolidate_day_to_history(today)
print(f"Consolidated {count} contracts")

cleaned_intraday = db.cleanup_old_intraday_data()
cleaned_daily = db.cleanup_old_daily_history()
print(f"Cleaned {cleaned_intraday} intraday, {cleaned_daily} daily")

db.close()
```

### 3. Manual Testing
- Run `python3 spx_poller.py`
- Inspect database: `sqlite3 spx_options.db "SELECT * FROM intraday_snapshots"`
- Run again at same timestamp (test idempotency)
- Run `python3 spx_eod.py`
- Verify data moved to daily_history

### 4. Cron Setup (after testing)
```
30 9-16 * * 1-5  python3 /path/to/spx_poller.py >> /var/log/spx_poll.log 2>&1
0 17 * * 1-5     python3 /path/to/spx_eod.py >> /var/log/spx_eod.log 2>&1
```

---

## Deferred Features (Not Yet Implemented)

These are designed but not built yet:

1. **Anomaly Detection** - Composite scoring algorithm is designed but not coded
2. **Notification System** - Architecture decided (Pushover/Telegram) but not implemented  
3. **Dashboard** - Planned to use Streamlit but not started
4. **Alert Acknowledgement** - Database has fields but no UI

**Focus:** Get data collection working first. Anomaly detection is next after 60 days of data.

---

## Questions to Clarify with User

1. **API Key Location** - Should it be in environment variable, config file, or command-line arg?
2. **Logging** - Console output sufficient or need proper logging (Python logging module)?
3. **Weeklies** - Include SPXW weeklies in 20-45 DTE window or monthlies only?
4. **Timezone** - Confirm server is in ET or needs timezone conversion
5. **Multiple Expirations** - If two monthlies fall in DTE window, track both or just nearest?

---

## Success Criteria

**Poller working when:**
- Runs successfully via cron for 3 consecutive days
- Database has ~1,500 intraday records
- No errors in logs
- Volume deltas calculated correctly
- Idempotent (re-running doesn't create duplicates)

**EOD working when:**
- Daily history grows by ~100 records per day
- Intraday snapshots stay at ~1,500 (3-day rolling)
- Daily history stays at ~6,000 (60-day rolling)
- No orphaned data

**Ready for anomaly detection when:**
- 60+ days of data collected
- Can query historical comparison in <10ms
- Database size stable at <10MB

---

## Resources

### User's Original Handover Document
- See `SPX OTM Put Volume Anomaly Detection System — Handover Document v2` for full context
- Contains composite scoring algorithm design (not yet implemented)
- Has alert threshold tiers and notification message format

### API Documentation
- Unified Snapshot: Most critical endpoint, has all needed fields
- Option Chain: Secondary, for strike discovery only
- Both tested and confirmed working

### Database Module
- Read `DATABASE_QUICKREF.md` for usage patterns
- All functions documented with docstrings
- Example code in `spx_database.py` at bottom

---

## Communication with User

**User prefers:**
- Simple, maintainable solutions over complex ones
- Explanation of tradeoffs before implementation
- Step-by-step approach (get one thing working before moving to next)
- Documentation of decisions made

**User context:**
- Running on bare metal VPS (full control)
- Python experience (comfortable with code)
- Goal is personal use early-warning system, not production trading

---

## Final Notes

The hard work is done - database architecture is solid, API endpoints are confirmed, and idempotency is proven. The integration script is mostly "plumbing" - connecting pieces that already work.

The key challenge is **robust error handling** so the system runs unattended on cron. Log everything, fail gracefully, and don't corrupt the database.

Once data collection is stable for 60 days, the anomaly detection phase begins (that's where it gets interesting).

Good luck!

---

**Session Handover Complete**  
**Date:** 2025-12-03  
**From:** Claude (session ending)  
**To:** Claude (next session)  
**Status:** Database layer complete, integration script ready to build
