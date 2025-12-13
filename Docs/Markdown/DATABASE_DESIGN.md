# SPX Database Architecture - Design Decisions

## Schema Overview

### Three-Table Architecture

```
intraday_snapshots (working data, 3-day retention)
        ↓
    EOD consolidation
        ↓
daily_history (reference baseline, 60-day retention)
        ↓
    Anomaly detection queries
        ↓
alerts (audit trail, indefinite retention)
```

---

## Table Design Rationale

### intraday_snapshots

**Purpose:** Capture every hourly poll for volume delta calculation and real-time monitoring.

**Key Design Decisions:**

1. **Captured_at as TEXT (ISO format)** — SQLite doesn't have native datetime, TEXT with ISO format sorts correctly and is human-readable
2. **Captured_date separate from captured_at** — Enables fast grouping by trading day
3. **Volume_cumulative + volume_delta** — Store both for flexibility (can recalculate deltas, but having them pre-computed speeds up queries)
4. **Ticker as primary identifier** — Full ticker string (O:SPX251219P05000000) is unique and contains all metadata
5. **No UNIQUE constraint** — Allow duplicate captures (e.g., if job runs twice), handled at application level

**Why 3-day retention?**
- Enough for debugging ("what happened Tuesday afternoon?")
- Minimal storage overhead
- Can recreate daily_history if needed

**Index strategy:**
```sql
idx_intraday_lookup: (ticker, captured_date, captured_at)
  → Fast lookup of previous poll for delta calculation
  → Covers ORDER BY captured_at DESC queries

idx_intraday_cleanup: (captured_date)
  → Fast deletion of old records
```

---

### daily_history

**Purpose:** Canonical daily record for each contract. The reference dataset for anomaly detection.

**Key Design Decisions:**

1. **UNIQUE(trade_date, ticker)** — One record per contract per day, INSERT OR REPLACE for idempotency
2. **Spot_close instead of intraday spot** — Use market close SPX price for consistent moneyness
3. **Moneyness stored, not calculated** — Pre-compute for fast bucketing queries
4. **Separate from intraday** — Keeps historical queries clean and fast

**Why 60-day retention?**
- Sufficient for percentile rankings (statistical significance)
- Captures seasonal patterns (monthly expiration cycles)
- Small enough to keep queries fast (<10k rows per moneyness bucket)

**Index strategy:**
```sql
idx_daily_moneyness: (moneyness, dte, trade_date)
  → CRITICAL for anomaly detection
  → Enables fast "find similar contracts" queries
  → Composite index covers WHERE + ORDER BY

idx_daily_ticker: (ticker, trade_date)
  → Fast lookup for specific contract history
  → Useful for OI change tracking

idx_daily_cleanup: (trade_date)
  → Fast rolling window deletion
```

**Query Pattern:**
```sql
-- Anomaly detection lookup (sub-millisecond with proper index)
SELECT * FROM daily_history
WHERE moneyness BETWEEN 0.80 AND 0.84   -- ±2% bucket
  AND dte BETWEEN 11 AND 21             -- ±5 days
  AND trade_date >= '2025-10-04'        -- Last 60 days
ORDER BY trade_date DESC
```

This returns ~20-50 rows typically, which the anomaly scorer processes.

---

### alerts

**Purpose:** Audit trail of triggered anomalies. Indefinite retention for pattern analysis.

**Key Design Decisions:**

1. **Store both score and components** — Can retroactively adjust thresholds
2. **JSON trigger_reasons** — Flexible schema for explaining why alert fired
3. **Acknowledged flag** — Workflow management
4. **No foreign key constraints** — Historical records persist even after source data is cleaned up

**Index strategy:**
```sql
idx_alerts_time: (triggered_at DESC)
  → Fast retrieval of recent alerts
  → Dashboard queries
```

---

## Key Patterns

### 1. Volume Delta Calculation

**Why not a database trigger?**
- Python calculates it during insert for clarity
- Easier to debug
- No performance difference (single SELECT per insert)

**Implementation:**
```python
def _calculate_volume_delta(ticker, date, current_volume):
    previous = SELECT volume_cumulative 
               FROM intraday_snapshots
               WHERE ticker = ? AND captured_date = ?
               ORDER BY captured_at DESC
               LIMIT 1
    
    return current_volume - previous if previous else current_volume
```

**Cost:** One index-backed SELECT per contract per poll
- ~50 contracts × 7 polls/day = 350 queries
- With idx_intraday_lookup, each query is <1ms
- Total overhead: <1 second per day

---

### 2. EOD Consolidation

**Strategy:** Last-poll-wins

```sql
WITH last_snapshot AS (
    SELECT ticker, MAX(captured_at) as max_time
    FROM intraday_snapshots
    WHERE captured_date = '2025-12-03'
    GROUP BY ticker
)
SELECT s.*
FROM intraday_snapshots s
INNER JOIN last_snapshot ls ON s.ticker = ls.ticker 
                            AND s.captured_at = ls.max_time
```

**Why last poll instead of average?**
- Last poll = market close data (most relevant)
- OI is only meaningful at market close
- Simpler than aggregation logic
- Matches industry convention

**Alternatives considered:**
- Average volume across day → Misleading (cumulative, not additive)
- Max volume → Same as last poll
- VWAP for price → Could be useful, but complicates logic

---

### 3. Historical Comparison Query

**Moneyness bucketing:**
```
Current moneyness: 0.822
Tolerance: ±0.02
Query range: 0.802 to 0.842
```

**Why ±2%?**
- Tight enough to be meaningful (similar risk profile)
- Loose enough to get sufficient data (20-50 records typical)
- Can be adjusted based on data density

**DTE bucketing:**
```
Current DTE: 16
Tolerance: ±5 days
Query range: 11 to 21 days
```

**Why ±5 days?**
- Theta decay patterns similar within this window
- Captures weekly expiration equivalents
- Enough data for percentile calculations

**Performance:**
- With composite index, this query is <5ms
- Returns ~30 rows on average
- Anomaly scorer processes these in-memory

---

### 4. Batch Inserts

**Pattern:**
```python
snapshots = []  # Collect all contracts from API
for contract in api_response:
    snapshots.append(transform_to_snapshot(contract))

db.insert_intraday_batch(snapshots)  # Single transaction
```

**Why batch vs. individual?**
- ~50 contracts per poll
- Batch: 1 transaction, ~50ms total
- Individual: 50 transactions, ~500ms total (10× slower)
- SQLite WAL mode handles this well

**Transaction safety:**
- Either all 50 insert or none (atomicity)
- No partial data corruption
- Rollback on error

---

## Cleanup Strategy

### Calendar-based vs Row-based

**Calendar-based (CHOSEN):**
```sql
DELETE FROM intraday_snapshots 
WHERE captured_date < date('now', '-3 days')
```

**Pros:**
- Simple logic
- Predictable behavior
- Handles weekends/holidays correctly
- Fast with indexed cleanup

**Cons:**
- If no trading on weekend, effectively keeps 5 calendar days

**Row-based (REJECTED):**
```sql
DELETE FROM intraday_snapshots
WHERE id NOT IN (
    SELECT id FROM intraday_snapshots 
    ORDER BY captured_at DESC 
    LIMIT 3000
)
```

**Pros:**
- Exact retention (3000 rows)

**Cons:**
- More complex
- Slower (subquery)
- Unpredictable time window
- Doesn't align with "trading day" concept

---

## Performance Considerations

### SQLite Optimizations

```python
PRAGMA journal_mode=WAL        # Write-Ahead Logging
PRAGMA synchronous=NORMAL      # Faster writes (safe for this use case)
PRAGMA cache_size=-64000       # 64MB cache
PRAGMA temp_store=MEMORY       # Temp tables in RAM
```

**Expected Performance:**
- Insert batch (50 contracts): ~50ms
- Anomaly query (60-day history): <5ms
- EOD consolidation: ~100ms
- Cleanup: <10ms

**Storage Growth:**
- Intraday: ~500 rows/day × 3 days = 1,500 rows (~500KB)
- Daily: ~100 contracts/day × 60 days = 6,000 rows (~2MB)
- Alerts: Variable, ~10-50/day (~500KB/month)
- **Total expected: <10MB for working dataset**

---

## Alternative Approaches Considered

### 1. Single Table (REJECTED)
```
All snapshots in one table with type='intraday' or 'daily'
```
**Why rejected:**
- Mixes working data with reference data
- Slower queries (must filter by type)
- Complicates index strategy
- No clear retention boundaries

### 2. Separate Tables per Expiration (REJECTED)
```
spx_dec2025, spx_jan2026, etc.
```
**Why rejected:**
- Schema proliferation
- Hard to query across expirations
- Cleanup complexity
- Doesn't match access patterns

### 3. Time-Series Database (REJECTED)
```
InfluxDB, TimescaleDB, etc.
```
**Why rejected:**
- Overkill for this scale
- Adds deployment complexity
- SQLite is sufficient (single file, zero config)
- We're not doing high-frequency tick data

### 4. Postgres (REJECTED)
**Why rejected:**
- Requires server setup
- Overkill for <10MB dataset
- SQLite is portable (single file backup)
- User's VPS may not have Postgres

---

## Future Optimizations

If dataset grows beyond expectations:

1. **Partition daily_history by year** (when >1M rows)
2. **Add materialized views** for common aggregations
3. **Move to Postgres** if concurrent writes needed
4. **Add Redis cache** for hot queries

For now, SQLite handles this workload easily.

---

## Testing the Schema

Run the included example:
```bash
python3 spx_database.py
```

This demonstrates:
- Volume delta calculation
- Batch inserts
- Historical queries
- EOD consolidation
- Alert storage
- Database statistics
