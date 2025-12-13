# SPX Database - Quick Reference

## Common Operations Cheat Sheet

### Initialization

```python
from spx_database import SPXDatabase

# Create/connect to database
db = SPXDatabase("spx_options.db")

# Or use as context manager (auto-closes)
with SPXDatabase("spx_options.db") as db:
    # ... operations
```

---

## Hourly Polling Script Pattern

```python
# 1. Fetch data from API
api_data = fetch_unified_snapshot(tickers)

# 2. Transform to snapshot format
snapshots = []
for contract in api_data:
    snapshot = {
        'captured_at': datetime.now().isoformat(),
        'captured_date': date.today().isoformat(),
        'ticker': contract['ticker'],
        'expiration': contract['details']['expiration_date'],
        'strike': contract['details']['strike_price'],
        'contract_type': contract['details']['contract_type'],
        'spot_price': contract['underlying_asset']['value'],
        'moneyness': contract['details']['strike_price'] / contract['underlying_asset']['value'],
        'dte': calculate_dte(contract['details']['expiration_date']),
        'volume_cumulative': contract['session']['volume'] or 0,
        'open_interest': contract['open_interest'],
        'close_price': contract['session']['close'],
        'high_price': contract['session']['high'],
        'low_price': contract['session']['low'],
        'vwap': contract['session'].get('vwap'),
        'transactions': contract['session'].get('transactions'),
        'delta': contract['greeks'].get('delta'),
        'gamma': contract['greeks'].get('gamma'),
        'theta': contract['greeks'].get('theta'),
        'vega': contract['greeks'].get('vega'),
        'implied_vol': contract.get('implied_volatility'),
        'market_status': contract.get('market_status'),
        'timeframe': contract.get('timeframe')
    }
    snapshots.append(snapshot)

# 3. Insert batch (volume deltas calculated automatically)
db.insert_intraday_batch(snapshots)
```

---

## EOD Consolidation Script Pattern

```python
from datetime import date, timedelta

# Run after market close (e.g., 4:30 PM ET)
today = date.today().isoformat()

# 1. Consolidate today's data
count = db.consolidate_day_to_history(today)
print(f"Consolidated {count} contracts")

# 2. Cleanup old intraday data (keep 3 days)
deleted_intraday = db.cleanup_old_intraday_data(days_to_keep=3)
print(f"Deleted {deleted_intraday} old intraday records")

# 3. Cleanup old daily history (keep 60 days)
deleted_daily = db.cleanup_old_daily_history(days_to_keep=60)
print(f"Deleted {deleted_daily} old daily records")

# 4. Optional: optimize database
db.vacuum()
```

---

## Anomaly Detection Query Pattern

```python
# Get current snapshot
current = {
    'ticker': 'O:SPX251219P05000000',
    'strike': 5000,
    'moneyness': 0.732,
    'dte': 16,
    'volume': 4700,
    'close_price': 3.92
}

# Query historical data for comparison
history = db.get_historical_for_comparison(
    moneyness=current['moneyness'],
    dte=current['dte'],
    lookback_days=60,
    moneyness_tolerance=0.02,  # ±2%
    dte_tolerance=5             # ±5 days
)

# Calculate statistics
volumes = [h['volume'] for h in history if h['volume'] is not None]

if len(volumes) > 0:
    avg_volume = sum(volumes) / len(volumes)
    volumes_sorted = sorted(volumes)
    p90_volume = volumes_sorted[int(len(volumes) * 0.9)]
    
    # Dormancy check
    days_since_activity = 0
    for h in history:
        if h['volume'] > 0:
            break
        days_since_activity += 1
    
    # Score components
    score = 0
    triggers = {}
    
    # 1. Dormant activation
    if current['volume'] > 0 and days_since_activity > 5:
        score += 1
        triggers['dormant_activation'] = days_since_activity
    
    # 2. Volume percentile
    if current['volume'] > p90_volume:
        percentile_score = min(current['volume'] / p90_volume, 1.0)
        score += percentile_score
        triggers['volume_percentile'] = 90 + (percentile_score * 10)
    
    # 3. Premium threshold
    premium_notional = current['volume'] * current['close_price'] * 100
    if premium_notional > 500000:  # $500k
        score += min(premium_notional / 1000000, 1.0)
        triggers['premium_notional'] = premium_notional
    
    # Generate alert if threshold exceeded
    if score > 2.5:
        alert = {
            'triggered_at': datetime.now().isoformat(),
            'ticker': current['ticker'],
            'expiration': '2025-12-19',
            'strike': current['strike'],
            'contract_type': 'put',
            'moneyness': current['moneyness'],
            'dte': current['dte'],
            'score': score,
            'volume_current': current['volume'],
            'volume_historical_avg': avg_volume,
            'volume_historical_p90': p90_volume,
            'premium_notional': premium_notional,
            'trigger_reasons': triggers
        }
        db.insert_alert(alert)
```

---

## Dashboard Queries

### Recent Alerts
```python
# Get last 50 alerts
alerts = db.get_recent_alerts(limit=50)

# Get unacknowledged alerts only
alerts = db.get_recent_alerts(limit=50, unacknowledged_only=True)
```

### Contract History
```python
# Get 60-day history for specific contract
history = db.get_ticker_history('O:SPX251219P05000000', lookback_days=60)

# Extract volume time series
dates = [h['trade_date'] for h in history]
volumes = [h['volume'] for h in history]
```

### Current Day Activity
```python
# Get all snapshots from today
today = date.today().isoformat()

cursor = db.conn.execute("""
    SELECT ticker, strike, volume_cumulative, volume_delta, captured_at
    FROM intraday_snapshots
    WHERE captured_date = ?
    ORDER BY volume_delta DESC
    LIMIT 20
""", (today,))

top_volume_increases = [dict(row) for row in cursor.fetchall()]
```

### Database Health Check
```python
# Get statistics
stats = db.get_daily_history_stats()
print(f"Trading days in database: {stats['trading_days']}")
print(f"Date range: {stats['earliest_date']} to {stats['latest_date']}")

# Check size
size_mb = db.get_database_size() / (1024 * 1024)
print(f"Database size: {size_mb:.2f} MB")

# Check record counts
cursor = db.conn.execute("""
    SELECT 
        (SELECT COUNT(*) FROM intraday_snapshots) as intraday_count,
        (SELECT COUNT(*) FROM daily_history) as daily_count,
        (SELECT COUNT(*) FROM alerts) as alert_count
""")
counts = dict(cursor.fetchone())
print(f"Intraday: {counts['intraday_count']:,}")
print(f"Daily: {counts['daily_count']:,}")
print(f"Alerts: {counts['alert_count']:,}")
```

---

## Error Handling Pattern

```python
from spx_database import SPXDatabase
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

try:
    with SPXDatabase("spx_options.db") as db:
        # ... operations
        db.insert_intraday_batch(snapshots)
        
except sqlite3.Error as e:
    logger.error(f"Database error: {e}")
    # Handle error (retry, alert, etc.)
    
except Exception as e:
    logger.error(f"Unexpected error: {e}")
    raise
```

---

## Testing Queries

### Check Volume Delta Calculation
```python
# Insert first snapshot
snap1 = {..., 'volume_cumulative': 100}
db.insert_intraday_snapshot(snap1)

# Insert second snapshot (same ticker, same day)
snap2 = {..., 'volume_cumulative': 150}
db.insert_intraday_snapshot(snap2)

# Verify delta
latest = db.get_latest_intraday_snapshot(ticker, date)
assert latest['volume_delta'] == 50  # Should be 150 - 100
```

### Verify Historical Query Performance
```python
import time

start = time.time()
history = db.get_historical_for_comparison(
    moneyness=0.85,
    dte=30,
    lookback_days=60
)
elapsed = time.time() - start

print(f"Query returned {len(history)} records in {elapsed*1000:.2f}ms")
# Should be <10ms with proper indexes
```

---

## Backup & Restore

### Backup
```bash
# Simple file copy (safe with WAL mode)
cp spx_options.db spx_options_backup_$(date +%Y%m%d).db

# Or use SQLite backup command
sqlite3 spx_options.db ".backup spx_options_backup.db"
```

### Restore
```bash
cp spx_options_backup.db spx_options.db
```

### Export to CSV
```python
import csv

cursor = db.conn.execute("SELECT * FROM daily_history")
rows = cursor.fetchall()

with open('daily_history.csv', 'w', newline='') as f:
    writer = csv.writer(f)
    writer.writerow([description[0] for description in cursor.description])
    writer.writerows(rows)
```

---

## Cron Job Setup

### Hourly Polling (Every hour during market hours)
```cron
# Run at :30 past the hour, 9 AM - 4 PM ET (adjust for timezone)
30 9-16 * * 1-5 /usr/bin/python3 /path/to/poll_script.py >> /var/log/spx_poll.log 2>&1
```

### EOD Consolidation (Once daily after market close)
```cron
# Run at 5:00 PM ET
0 17 * * 1-5 /usr/bin/python3 /path/to/eod_script.py >> /var/log/spx_eod.log 2>&1
```

---

## Performance Tips

1. **Use batch inserts** for multiple contracts
2. **Query by indexed columns** (moneyness, dte, trade_date)
3. **Vacuum monthly** to reclaim space and optimize
4. **Monitor database size** — should stay under 50MB
5. **Close connections** when done (or use context manager)

---

## Troubleshooting

### "Database is locked" error
- Check for other processes using the database
- Ensure only one writer at a time
- WAL mode helps but doesn't eliminate locks entirely

### Slow queries
- Run `.explain query plan SELECT ...` in sqlite3
- Verify indexes exist: `.indexes intraday_snapshots`
- Consider VACUUM if database is fragmented

### Unexpected volume deltas
- Check captured_date consistency
- Verify time ordering (captured_at)
- Review volume_cumulative values in intraday table
