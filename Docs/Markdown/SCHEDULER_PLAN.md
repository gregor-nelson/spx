# SPX Scheduler Implementation Plan

## Overview

Create a unified, long-running `spx_scheduler.py` that:
1. Polls at configurable intervals during market hours
2. Runs EOD consolidation after market close
3. Handles weekends, holidays, and early close days
4. Accounts for 15-minute data delay

---

## Configuration Block

```python
# =============================================================================
# SCHEDULER CONFIGURATION
# =============================================================================

# Polling
POLL_INTERVAL_MINUTES = 30       # How often to poll during market hours
FIRST_POLL_DELAY_MINUTES = 15    # Minutes after open for first poll (data delay)

# Market Hours (Eastern Time) - Normal days
MARKET_OPEN_ET = "09:30"
MARKET_CLOSE_ET = "16:00"
EARLY_CLOSE_ET = "13:00"         # For early close days

# EOD Processing
EOD_DELAY_MINUTES = 20           # Wait after close for final data to settle
                                 # (15-min delay + 5-min buffer)

# Retry/Recovery
MAX_POLL_RETRIES = 3
RETRY_DELAY_SECONDS = 60
POLL_TIMEOUT_SECONDS = 120

# Logging
LOG_LEVEL = "INFO"
LOG_TO_FILE = True
LOG_DIR = "logs"
```

---

## Market Calendar

### Full Closure Days (2025-2027)

```python
MARKET_HOLIDAYS = {
    # 2025
    "2025-01-01",  # New Year's Day
    "2025-01-20",  # MLK Day
    "2025-02-17",  # Washington's Birthday
    "2025-04-18",  # Good Friday
    "2025-05-26",  # Memorial Day
    "2025-06-19",  # Juneteenth
    "2025-07-04",  # Independence Day
    "2025-09-01",  # Labor Day
    "2025-11-27",  # Thanksgiving
    "2025-12-25",  # Christmas

    # 2026
    "2026-01-01",  # New Year's Day
    "2026-01-19",  # MLK Day
    "2026-02-16",  # Washington's Birthday
    "2026-04-03",  # Good Friday
    "2026-05-25",  # Memorial Day
    "2026-06-19",  # Juneteenth
    "2026-07-03",  # Independence Day (observed)
    "2026-09-07",  # Labor Day
    "2026-11-26",  # Thanksgiving
    "2026-12-25",  # Christmas

    # 2027
    "2027-01-01",  # New Year's Day
    "2027-01-18",  # MLK Day
    "2027-02-15",  # Washington's Birthday
    "2027-03-26",  # Good Friday
    "2027-05-31",  # Memorial Day
    "2027-06-18",  # Juneteenth (observed)
    "2027-07-05",  # Independence Day (observed)
    "2027-09-06",  # Labor Day
    "2027-11-25",  # Thanksgiving
    "2027-12-24",  # Christmas (observed)
}
```

### Early Close Days (1:00 PM ET)

```python
EARLY_CLOSE_DAYS = {
    # 2025
    "2025-07-03",   # Day before Independence Day
    "2025-11-28",   # Day after Thanksgiving
    "2025-12-24",   # Christmas Eve

    # 2026
    "2026-11-27",   # Day after Thanksgiving
    "2026-12-24",   # Christmas Eve

    # 2027
    "2027-11-26",   # Day after Thanksgiving
    # Note: 2027-12-24 is a full holiday (Christmas observed)
}
```

---

## State Machine

```
States:
  INITIALIZING     - Startup, validate config, check imports
  HOLIDAY          - Full market holiday, sleep until next day
  WEEKEND          - Saturday/Sunday
  WAITING_FOR_OPEN - Before market open on a trading day
  MARKET_OPEN      - Polling active
  EOD_PENDING      - Market closed, waiting for data delay before EOD
  EOD_RUNNING      - Running consolidation
  MARKET_CLOSED    - After EOD, waiting for next trading day
```

### State Transitions

```
INITIALIZING
    │
    ├─► is_weekend() ─────────────────► WEEKEND
    ├─► is_holiday() ─────────────────► HOLIDAY
    ├─► before_market_open() ─────────► WAITING_FOR_OPEN
    ├─► during_market_hours() ────────► MARKET_OPEN
    ├─► after_close_before_eod() ─────► EOD_PENDING
    └─► after_eod_complete() ─────────► MARKET_CLOSED

WEEKEND
    └─► Monday arrives ───────────────► WAITING_FOR_OPEN (or HOLIDAY)

HOLIDAY
    └─► Next day arrives ─────────────► WAITING_FOR_OPEN (or WEEKEND)

WAITING_FOR_OPEN
    └─► Market opens + delay ─────────► MARKET_OPEN

MARKET_OPEN
    ├─► Poll interval elapsed ────────► (run poll, stay in MARKET_OPEN)
    └─► Market close time ────────────► EOD_PENDING

EOD_PENDING
    └─► EOD delay elapsed ────────────► EOD_RUNNING

EOD_RUNNING
    └─► Consolidation complete ───────► MARKET_CLOSED

MARKET_CLOSED
    └─► Midnight ─────────────────────► WAITING_FOR_OPEN (or WEEKEND/HOLIDAY)
```

---

## Core Functions

### 1. Time Utilities

```python
from zoneinfo import ZoneInfo
from datetime import datetime, date, time, timedelta

ET = ZoneInfo("America/New_York")

def now_et() -> datetime:
    """Current time in Eastern timezone."""
    return datetime.now(ET)

def today_et() -> date:
    """Current date in Eastern timezone."""
    return now_et().date()

def is_weekend(d: date = None) -> bool:
    """Check if date is Saturday (5) or Sunday (6)."""
    d = d or today_et()
    return d.weekday() >= 5

def is_holiday(d: date = None) -> bool:
    """Check if date is a market holiday."""
    d = d or today_et()
    return d.isoformat() in MARKET_HOLIDAYS

def is_early_close(d: date = None) -> bool:
    """Check if date is an early close day."""
    d = d or today_et()
    return d.isoformat() in EARLY_CLOSE_DAYS

def is_trading_day(d: date = None) -> bool:
    """Check if date is a regular trading day."""
    return not is_weekend(d) and not is_holiday(d)

def get_market_close_time(d: date = None) -> time:
    """Get market close time for given date."""
    if is_early_close(d):
        return time(13, 0)  # 1:00 PM
    return time(16, 0)      # 4:00 PM

def next_trading_day(d: date = None) -> date:
    """Find the next trading day after given date."""
    d = d or today_et()
    candidate = d + timedelta(days=1)
    while not is_trading_day(candidate):
        candidate += timedelta(days=1)
    return candidate
```

### 2. Scheduling Logic

```python
def get_next_poll_time(last_poll: datetime, close_time: time) -> datetime:
    """
    Calculate next poll time based on interval.
    Returns None if next poll would be after market close.
    """
    next_poll = last_poll + timedelta(minutes=POLL_INTERVAL_MINUTES)

    # Don't schedule poll after market close
    close_dt = datetime.combine(today_et(), close_time, tzinfo=ET)
    if next_poll >= close_dt:
        return None

    return next_poll

def get_first_poll_time(d: date = None) -> datetime:
    """Get first poll time for a trading day (open + delay)."""
    d = d or today_et()
    open_time = time(9, 30)
    first_poll = datetime.combine(d, open_time, tzinfo=ET)
    return first_poll + timedelta(minutes=FIRST_POLL_DELAY_MINUTES)

def get_eod_time(d: date = None) -> datetime:
    """Get EOD consolidation time (close + delay for data to settle)."""
    d = d or today_et()
    close_time = get_market_close_time(d)
    close_dt = datetime.combine(d, close_time, tzinfo=ET)
    return close_dt + timedelta(minutes=EOD_DELAY_MINUTES)
```

### 3. Poll Execution with Retry

```python
def run_poll_with_retry() -> tuple[int, str | None]:
    """
    Execute poll with retry logic.
    Returns (contracts_stored, error_message).
    """
    from spx_poller import poll_spx_options

    last_error = None
    for attempt in range(1, MAX_POLL_RETRIES + 1):
        try:
            count, error = poll_spx_options()
            if error is None:
                return (count, None)
            last_error = error
            log(f"Poll attempt {attempt} failed: {error}")
        except Exception as e:
            last_error = str(e)
            log(f"Poll attempt {attempt} exception: {e}")

        if attempt < MAX_POLL_RETRIES:
            log(f"Retrying in {RETRY_DELAY_SECONDS}s...")
            time.sleep(RETRY_DELAY_SECONDS)

    return (0, f"All {MAX_POLL_RETRIES} attempts failed. Last error: {last_error}")
```

### 4. EOD Execution

```python
def run_eod() -> dict:
    """
    Execute EOD consolidation.
    Returns stats dict.
    """
    from spx_eod import run_eod_consolidation

    trade_date = today_et().isoformat()
    try:
        stats = run_eod_consolidation(trade_date)
        return stats
    except Exception as e:
        return {'errors': [str(e)], 'consolidated': 0}
```

---

## Main Loop Structure

```python
def main():
    """Main scheduler loop."""
    log_banner("SPX Options Scheduler Starting")
    log(f"Poll interval: {POLL_INTERVAL_MINUTES} minutes")
    log(f"Data delay: {FIRST_POLL_DELAY_MINUTES} minutes")

    state = determine_initial_state()
    poll_count_today = 0
    last_poll_time = None
    eod_completed_today = False

    while True:
        try:
            now = now_et()
            today = today_et()

            # Reset daily counters at midnight
            if last_poll_time and last_poll_time.date() != today:
                poll_count_today = 0
                eod_completed_today = False
                last_poll_time = None

            # State machine
            if state == "WEEKEND":
                state = handle_weekend(now, today)

            elif state == "HOLIDAY":
                state = handle_holiday(now, today)

            elif state == "WAITING_FOR_OPEN":
                state = handle_waiting_for_open(now, today)

            elif state == "MARKET_OPEN":
                state, poll_count_today, last_poll_time = handle_market_open(
                    now, today, poll_count_today, last_poll_time
                )

            elif state == "EOD_PENDING":
                state = handle_eod_pending(now, today)

            elif state == "EOD_RUNNING":
                state, eod_completed_today = handle_eod_running(today)

            elif state == "MARKET_CLOSED":
                state = handle_market_closed(now, today)

            # Small sleep to prevent busy-waiting
            time.sleep(1)

        except KeyboardInterrupt:
            log("Shutdown requested")
            break
        except Exception as e:
            log(f"Unexpected error in main loop: {e}")
            log("Continuing in 60 seconds...")
            time.sleep(60)
```

---

## State Handlers

### WEEKEND

```python
def handle_weekend(now: datetime, today: date) -> str:
    next_day = next_trading_day(today)
    wake_time = datetime.combine(next_day, time(9, 0), tzinfo=ET)
    sleep_seconds = (wake_time - now).total_seconds()

    log(f"Weekend. Next trading day: {next_day}")
    log(f"Sleeping until {wake_time.strftime('%Y-%m-%d %H:%M')} ET")

    # Sleep in chunks to allow for graceful shutdown
    sleep_with_interrupt(sleep_seconds)

    return determine_initial_state()
```

### WAITING_FOR_OPEN

```python
def handle_waiting_for_open(now: datetime, today: date) -> str:
    first_poll = get_first_poll_time(today)

    if now >= first_poll:
        log("Market open + data delay elapsed. Starting polling.")
        return "MARKET_OPEN"

    sleep_seconds = min((first_poll - now).total_seconds(), 60)
    log(f"Waiting for first poll at {first_poll.strftime('%H:%M')} ET")
    time.sleep(sleep_seconds)

    return "WAITING_FOR_OPEN"
```

### MARKET_OPEN

```python
def handle_market_open(now, today, poll_count, last_poll) -> tuple:
    close_time = get_market_close_time(today)
    close_dt = datetime.combine(today, close_time, tzinfo=ET)

    # Check if market has closed
    if now >= close_dt:
        log(f"Market closed at {close_time}. Transitioning to EOD_PENDING.")
        return ("EOD_PENDING", poll_count, last_poll)

    # Determine if it's time to poll
    should_poll = False
    if last_poll is None:
        # First poll of the day
        should_poll = True
    else:
        next_poll = get_next_poll_time(last_poll, close_time)
        if next_poll and now >= next_poll:
            should_poll = True

    if should_poll:
        poll_count += 1
        log(f"Running poll #{poll_count}...")

        count, error = run_poll_with_retry()

        if error:
            log(f"[ERROR] Poll failed: {error}")
        else:
            log(f"[OK] Stored {count} contracts")

        last_poll = now_et()  # Update after poll completes

        # Log next action
        next_poll = get_next_poll_time(last_poll, close_time)
        if next_poll:
            log(f"Next poll at {next_poll.strftime('%H:%M')} ET")
        else:
            log(f"No more polls today. Market closes at {close_time}")
    else:
        # Sleep until next action
        next_poll = get_next_poll_time(last_poll, close_time)
        if next_poll:
            sleep_seconds = min((next_poll - now).total_seconds(), 60)
            time.sleep(sleep_seconds)

    return ("MARKET_OPEN", poll_count, last_poll)
```

### EOD_PENDING

```python
def handle_eod_pending(now: datetime, today: date) -> str:
    eod_time = get_eod_time(today)

    if now >= eod_time:
        log("Data delay elapsed. Starting EOD consolidation.")
        return "EOD_RUNNING"

    remaining = (eod_time - now).total_seconds()
    log(f"EOD pending. Running at {eod_time.strftime('%H:%M')} ET ({remaining/60:.0f} min)")
    time.sleep(min(remaining, 60))

    return "EOD_PENDING"
```

### EOD_RUNNING

```python
def handle_eod_running(today: date) -> tuple:
    log("Running EOD consolidation...")

    stats = run_eod()

    if stats.get('errors'):
        log(f"[ERROR] EOD failed: {stats['errors']}")
    else:
        log(f"[OK] Consolidated {stats['consolidated']} contracts")
        log(f"     Cleaned {stats['intraday_cleaned']} intraday, {stats['daily_cleaned']} daily")

    return ("MARKET_CLOSED", True)
```

### MARKET_CLOSED

```python
def handle_market_closed(now: datetime, today: date) -> str:
    next_day = next_trading_day(today)
    wake_time = datetime.combine(next_day, time(9, 0), tzinfo=ET)

    log(f"Market closed. Next trading day: {next_day}")
    log(f"Sleeping until {wake_time.strftime('%Y-%m-%d %H:%M')} ET")

    sleep_with_interrupt((wake_time - now).total_seconds())

    return determine_initial_state()
```

---

## Logging

```python
import logging
from pathlib import Path

def setup_logging():
    """Configure dual logging to console and file."""
    log_format = "%(asctime)s [%(levelname)s] %(message)s"
    date_format = "%Y-%m-%d %H:%M:%S"

    # Create logs directory
    if LOG_TO_FILE:
        Path(LOG_DIR).mkdir(exist_ok=True)
        log_file = Path(LOG_DIR) / f"scheduler_{today_et().isoformat()}.log"

    # Root logger
    logger = logging.getLogger()
    logger.setLevel(getattr(logging, LOG_LEVEL))

    # Console handler
    console = logging.StreamHandler()
    console.setFormatter(logging.Formatter(log_format, date_format))
    logger.addHandler(console)

    # File handler (daily rotation)
    if LOG_TO_FILE:
        file_handler = logging.FileHandler(log_file)
        file_handler.setFormatter(logging.Formatter(log_format, date_format))
        logger.addHandler(file_handler)

    return logger

def log(message: str, level: str = "INFO"):
    """Log a message."""
    getattr(logging, level.lower())(message)

def log_banner(title: str):
    """Log a banner for visibility."""
    log("=" * 70)
    log(title)
    log("=" * 70)
```

---

## Graceful Shutdown

```python
import signal

shutdown_requested = False

def signal_handler(signum, frame):
    global shutdown_requested
    log("Shutdown signal received")
    shutdown_requested = True

def sleep_with_interrupt(seconds: float):
    """Sleep that can be interrupted by shutdown signal."""
    global shutdown_requested
    end_time = time.time() + seconds

    while time.time() < end_time and not shutdown_requested:
        time.sleep(min(60, end_time - time.time()))

    if shutdown_requested:
        raise KeyboardInterrupt("Shutdown requested")

# In main():
signal.signal(signal.SIGTERM, signal_handler)
signal.signal(signal.SIGINT, signal_handler)
```

---

## File Structure

```
SPX/
├── spx_scheduler.py      # NEW: Unified scheduler
├── spx_poller.py         # Existing (imported by scheduler)
├── spx_eod.py            # Existing (imported by scheduler)
├── server.py             # Dashboard (run separately)
├── logs/
│   └── scheduler_2025-12-04.log
└── Database/
    └── spx_database.py
```

---

## Running the Scheduler

### Development/Testing
```bash
python spx_scheduler.py
```

### Production (systemd)
```ini
# /etc/systemd/system/spx-scheduler.service
[Unit]
Description=SPX Options Scheduler
After=network.target

[Service]
Type=simple
User=spx
WorkingDirectory=/opt/spx
ExecStart=/opt/spx/venv/bin/python spx_scheduler.py
Restart=always
RestartSec=60
Environment=POLYGON_API_KEY=your_key_here

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable spx-scheduler
sudo systemctl start spx-scheduler
sudo journalctl -u spx-scheduler -f  # View logs
```

---

## Console Output Example

```
======================================================================
SPX Options Scheduler Starting
======================================================================
2025-12-04 09:15:00 [INFO] Poll interval: 30 minutes
2025-12-04 09:15:00 [INFO] Data delay: 15 minutes
2025-12-04 09:15:00 [INFO] State: WAITING_FOR_OPEN
2025-12-04 09:15:00 [INFO] Waiting for first poll at 09:45 ET

2025-12-04 09:45:00 [INFO] Market open + data delay elapsed. Starting polling.
2025-12-04 09:45:00 [INFO] Running poll #1...
2025-12-04 09:45:05 [INFO] [OK] Stored 146 contracts
2025-12-04 09:45:05 [INFO] [DETECTION] 2 anomalies detected
2025-12-04 09:45:05 [INFO] Next poll at 10:15 ET

2025-12-04 10:15:00 [INFO] Running poll #2...
2025-12-04 10:15:04 [INFO] [OK] Stored 146 contracts
2025-12-04 10:15:04 [INFO] Next poll at 10:45 ET

... (polls continue every 30 min) ...

2025-12-04 15:45:00 [INFO] Running poll #13...
2025-12-04 15:45:03 [INFO] [OK] Stored 146 contracts
2025-12-04 15:45:03 [INFO] No more polls today. Market closes at 16:00

2025-12-04 16:00:00 [INFO] Market closed at 16:00. Transitioning to EOD_PENDING.
2025-12-04 16:00:00 [INFO] EOD pending. Running at 16:20 ET (20 min)

2025-12-04 16:20:00 [INFO] Data delay elapsed. Starting EOD consolidation.
2025-12-04 16:20:00 [INFO] Running EOD consolidation...
2025-12-04 16:20:01 [INFO] [OK] Consolidated 146 contracts
2025-12-04 16:20:01 [INFO]      Cleaned 0 intraday, 0 daily

2025-12-04 16:20:01 [INFO] Market closed. Next trading day: 2025-12-05
2025-12-04 16:20:01 [INFO] Sleeping until 2025-12-05 09:00 ET
```

---

## Implementation Checklist

- [ ] Create `spx_scheduler.py` with configuration block
- [ ] Add market calendar (holidays + early close days)
- [ ] Implement time utilities (zoneinfo-based)
- [ ] Implement state machine with all handlers
- [ ] Add retry logic for polls
- [ ] Set up logging (console + file)
- [ ] Add graceful shutdown handling
- [ ] Test state transitions manually
- [ ] Create systemd service file (optional)
- [ ] Update documentation

---

## Future Enhancements (Not This Session)

1. **Fallback comparison logic** - Improve yesterday volume lookup
2. **Health check endpoint** - HTTP endpoint for monitoring
3. **Notification integration** - Pushover alerts on anomalies
4. **Auto-recovery** - Detect missed EOD and run retroactively
