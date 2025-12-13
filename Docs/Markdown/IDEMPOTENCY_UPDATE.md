# Idempotency Implementation - Database Update

## Problem Identified

**User's concern:** "For a given expiration (e.g., Dec 19), we poll the same contracts multiple times throughout the day. What happens if the polling script runs twice at the same timestamp?"

### Original Behavior (Problems)

```
10:30 AM (1st run): INSERT O:SPX251219P05000000, volume=4583
10:30 AM (2nd run): INSERT O:SPX251219P05000000, volume=4583  ← DUPLICATE ROW
```

**Issues:**
- ❌ Duplicate rows created
- ❌ Wasted storage
- ❌ Volume delta confusion
- ❌ Dashboard shows duplicate entries
- ❌ No way to distinguish accidental re-runs from intentional updates

---

## Solution: Idempotent Inserts

### Changes Made

#### 1. Added UNIQUE Constraint

```sql
CREATE TABLE intraday_snapshots (
    ...
    UNIQUE(ticker, captured_date, captured_at)  -- ← NEW
)
```

**What this does:**
- Prevents duplicate records at same ticker + date + timestamp
- Enforces "one poll per contract per timestamp" rule

#### 2. Changed INSERT to INSERT OR REPLACE

**Before:**
```python
cursor = self.conn.execute("INSERT INTO intraday_snapshots ...")
```

**After:**
```python
cursor = self.conn.execute("INSERT OR REPLACE INTO intraday_snapshots ...")
```

**What this does:**
- If record exists at same timestamp → REPLACE it
- If record doesn't exist → INSERT it
- Idempotent: running twice produces same result

#### 3. Updated Volume Delta Calculation

**Before:**
```python
def _calculate_volume_delta(ticker, captured_date, current_volume):
    # Find most recent poll
    SELECT volume_cumulative FROM intraday_snapshots
    WHERE ticker = ? AND captured_date = ?
    ORDER BY captured_at DESC LIMIT 1
```

**After:**
```python
def _calculate_volume_delta(ticker, captured_date, current_volume, current_captured_at):
    # Find most recent poll BEFORE current timestamp
    SELECT volume_cumulative FROM intraday_snapshots
    WHERE ticker = ? AND captured_date = ? AND captured_at < ?
    ORDER BY captured_at DESC LIMIT 1
```

**Why this matters:**
When replacing a record at 10:30 AM, we need to compare against the 9:30 AM poll (previous), not the 10:30 AM poll we're about to replace.

---

## New Behavior (Correct)

### Scenario 1: Duplicate Poll at Same Timestamp

```
10:30 AM (1st run): INSERT volume=4583  ✓
10:30 AM (2nd run): REPLACE volume=4583  ✓ (no duplicate)

Result: 1 record at 10:30 AM
```

### Scenario 2: API Data Updated Between Calls

```
10:30:00 AM: INSERT volume=4583  ✓
10:30:15 AM: REPLACE volume=4600  ✓ (API returned updated data)

Result: 1 record at 10:30 AM with volume=4600 (latest data)
```

### Scenario 3: Normal Hourly Progression

```
10:30 AM: INSERT volume=4583, delta=4583 (first poll of day)
11:30 AM: INSERT volume=4700, delta=117  (4700 - 4583)
12:30 PM: INSERT volume=4850, delta=150  (4850 - 4700)

Result: 3 records (different timestamps, all correct)
```

### Scenario 4: Re-run After Network Error

```
10:30 AM: INSERT volume=4583  ✓
11:30 AM: FAILED (network timeout)
11:30 AM: RETRY → INSERT volume=4700, delta=117  ✓

Result: 2 records (retry succeeded, no duplicate)
```

---

## Testing

Run the idempotency test:

```bash
python3 test_idempotency.py
```

**Test Coverage:**
1. Duplicate poll at same timestamp → No duplicate created
2. Data updated between duplicate polls → Latest data wins
3. Volume delta calculated correctly → Compares to previous poll
4. Batch inserts idempotent → All contracts handled correctly

**Expected Output:**
```
Idempotency Test - Duplicate Poll Protection
======================================================================
1. First poll at 10:30 AM:
   Records in database: 1
   
2. Second poll at 10:30 AM (duplicate timestamp):
   Records in database: 1
   ✓ No duplicate created! (count is still 1)
   ✓ Data refreshed with latest API values
   
3. Third poll at 11:30 AM (new timestamp):
   Records in database: 2
   ✓ New record created (count is now 2)
   ✓ Delta = 100 (4700 - 4600)
   
...
CONCLUSION:
  ✓ Duplicate polls at same timestamp are handled gracefully
  ✓ Later data REPLACES earlier data (no duplicates)
  ✓ Volume deltas calculated correctly
  ✓ System is idempotent - safe to re-run polling script
```

---

## Practical Benefits

### 1. Cron Job Safety

If cron schedules overlap or system load causes delays:

```cron
# This is now safe even if job runs longer than expected
30 * * * * /usr/bin/python3 /path/to/poll_script.py
```

Old behavior: Could create duplicates if 10:30 job runs late into 11:30 window  
**New behavior:** Later data replaces earlier data, no duplicates

### 2. Manual Testing

During development/debugging:

```bash
# Run poll script multiple times for testing
python3 poll_script.py  # First run
python3 poll_script.py  # Accidental second run - NO PROBLEM
```

Old behavior: Would create duplicate data  
**New behavior:** Second run is harmless (replaces first)

### 3. Data Quality

If API returns updated data within same minute:

```
10:30:00: API returns volume=4583
10:30:45: API returns volume=4600 (more trades reported)
```

Old behavior: Both values stored as separate records  
**New behavior:** Latest value overwrites earlier value (more accurate)

### 4. Error Recovery

If polling fails mid-batch:

```python
try:
    snapshots = fetch_api_data()  # Gets 50 contracts
    db.insert_intraday_batch(snapshots)  # Fails after 25
except:
    # Retry entire batch - no problem!
    db.insert_intraday_batch(snapshots)  # Overwrites 25, adds remaining 25
```

Old behavior: First 25 would be duplicated  
**New behavior:** Retry is safe, no duplicates

---

## Technical Details

### UNIQUE Constraint Behavior

```sql
-- This is the effective unique key:
UNIQUE(ticker, captured_date, captured_at)

-- Examples:
('O:SPX251219P05000000', '2025-12-03', '2025-12-03T10:30:00')  ✓ Unique
('O:SPX251219P05000000', '2025-12-03', '2025-12-03T11:30:00')  ✓ Different time
('O:SPX251219P05100000', '2025-12-03', '2025-12-03T10:30:00')  ✓ Different ticker
('O:SPX251219P05000000', '2025-12-03', '2025-12-03T10:30:00')  ✗ DUPLICATE → REPLACE
```

### INSERT OR REPLACE Semantics

**SQLite behavior:**
1. Check if UNIQUE constraint would be violated
2. If yes: DELETE old row, INSERT new row (atomic)
3. If no: INSERT new row normally

**Important:** This is different from UPDATE:
- INSERT OR REPLACE: Resets all columns to new values
- UPDATE: Only changes specified columns

For our use case, REPLACE is correct because we want to refresh ALL data (volume, OI, price, greeks, etc.)

### Volume Delta Edge Cases

**Edge case 1:** First poll of the day
```python
current_captured_at = '2025-12-03T09:30:00'
# Query: WHERE captured_at < '2025-12-03T09:30:00'
# Result: No previous poll found
# Delta: current_volume (entire day's volume so far)
```

**Edge case 2:** Replacing a poll
```python
current_captured_at = '2025-12-03T10:30:00'
# Query: WHERE captured_at < '2025-12-03T10:30:00'
# Result: Finds 09:30:00 poll (excludes the 10:30 we're replacing)
# Delta: current_volume - previous_volume
```

**Edge case 3:** Multiple replacements
```python
# 10:30:00: INSERT volume=100, delta=100
# 10:30:15: REPLACE volume=110, delta=110 (still compared to 09:30)
# 10:30:30: REPLACE volume=120, delta=120 (still compared to 09:30)
# Final state: 1 record at 10:30:00 with volume=120, delta=120
```

---

## Migration from Old Database

If you have an existing database without the UNIQUE constraint:

### Option 1: Start Fresh (Recommended)
```bash
mv spx_options.db spx_options_old.db
# New script will create fresh database with UNIQUE constraint
```

### Option 2: Migrate Existing Data
```sql
-- 1. Create new table with UNIQUE constraint
CREATE TABLE intraday_snapshots_new (
    ... 
    UNIQUE(ticker, captured_date, captured_at)
);

-- 2. Copy deduplicated data
INSERT INTO intraday_snapshots_new
SELECT DISTINCT ticker, captured_date, captured_at, ...
FROM intraday_snapshots
GROUP BY ticker, captured_date, captured_at
HAVING rowid = MAX(rowid);  -- Keep latest if duplicates exist

-- 3. Rename tables
DROP TABLE intraday_snapshots;
ALTER TABLE intraday_snapshots_new RENAME TO intraday_snapshots;
```

**Easier approach:** Just start fresh. You only lose 3 days of intraday data, and daily_history isn't affected.

---

## Summary

**What changed:**
- ✅ Added UNIQUE(ticker, captured_date, captured_at)
- ✅ Changed INSERT to INSERT OR REPLACE
- ✅ Updated volume delta to exclude current timestamp

**Benefits:**
- ✅ Idempotent polling (safe to re-run)
- ✅ No duplicate records
- ✅ Latest data always wins
- ✅ Volume deltas calculated correctly
- ✅ Cron job safe
- ✅ Error recovery friendly

**Breaking changes:**
- None for new installations
- Existing databases need migration or fresh start

**Performance impact:**
- Minimal (UNIQUE constraint adds tiny index overhead)
- No change to query performance
- Slightly faster on re-runs (REPLACE vs INSERT + duplicate)

---

## Questions?

**Q: What if I want to track every API response, including duplicates?**  
A: Add a separate `api_log` table without UNIQUE constraint for audit trail.

**Q: What if captured_at has sub-second precision?**  
A: Works fine. '2025-12-03T10:30:00.123' ≠ '2025-12-03T10:30:00.456'

**Q: What about daily_history table?**  
A: Already had UNIQUE(trade_date, ticker) and INSERT OR REPLACE. No changes needed.

**Q: Can I have different data for same ticker at same timestamp?**  
A: No, that's the point. Same timestamp = same data (latest wins).
