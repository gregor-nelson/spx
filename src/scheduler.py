#!/usr/bin/env python3
"""
SPX Options Scheduler
======================
Unified long-running scheduler for SPX options monitoring.

Handles:
- Polling at configurable intervals during market hours
- EOD consolidation after market close
- Weekends, holidays, and early close days
- 15-minute data delay from API provider

Run:
    python src/scheduler.py

Production (systemd):
    Create service file pointing to this script
"""

import os
import sys
import time
import signal
import logging
from datetime import datetime, date, timedelta
from zoneinfo import ZoneInfo
from pathlib import Path
from typing import Optional, Tuple

# =============================================================================
# SCHEDULER CONFIGURATION
# =============================================================================

# Polling
POLL_INTERVAL_MINUTES = 15       # How often to poll during market hours
FIRST_POLL_DELAY_MINUTES = 15    # Minutes after open for first poll (data delay)

# Market Hours (Eastern Time) - Normal days
MARKET_OPEN_HOUR = 9
MARKET_OPEN_MINUTE = 30
MARKET_CLOSE_HOUR = 16
MARKET_CLOSE_MINUTE = 0
EARLY_CLOSE_HOUR = 13            # 1:00 PM for early close days
EARLY_CLOSE_MINUTE = 0

# EOD Processing
EOD_DELAY_MINUTES = 30           # Wait after close for final data to settle

# Retry/Recovery
MAX_POLL_RETRIES = 3
RETRY_DELAY_SECONDS = 60

# Logging
LOG_LEVEL = "INFO"
LOG_TO_FILE = True
LOG_DIR = "logs"

# =============================================================================
# MARKET CALENDAR
# =============================================================================

# Full market closure days (no trading)
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

# Early close days (1:00 PM ET close)
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
}

# =============================================================================
# TIMEZONE UTILITIES
# =============================================================================

ET = ZoneInfo("America/New_York")


def now_et() -> datetime:
    """Current time in Eastern timezone."""
    return datetime.now(ET)


def today_et() -> date:
    """Current date in Eastern timezone."""
    return now_et().date()


def make_et_datetime(d: date, hour: int, minute: int = 0) -> datetime:
    """Create a timezone-aware datetime in ET."""
    return datetime(d.year, d.month, d.day, hour, minute, tzinfo=ET)


# =============================================================================
# MARKET CALENDAR UTILITIES
# =============================================================================

def is_weekend(d: Optional[date] = None) -> bool:
    """Check if date is Saturday (5) or Sunday (6)."""
    d = d or today_et()
    return d.weekday() >= 5


def is_holiday(d: Optional[date] = None) -> bool:
    """Check if date is a market holiday."""
    d = d or today_et()
    return d.isoformat() in MARKET_HOLIDAYS


def is_early_close(d: Optional[date] = None) -> bool:
    """Check if date is an early close day (1:00 PM)."""
    d = d or today_et()
    return d.isoformat() in EARLY_CLOSE_DAYS


def is_trading_day(d: Optional[date] = None) -> bool:
    """Check if date is a regular trading day."""
    d = d or today_et()
    return not is_weekend(d) and not is_holiday(d)


def get_market_open(d: Optional[date] = None) -> datetime:
    """Get market open time for given date."""
    d = d or today_et()
    return make_et_datetime(d, MARKET_OPEN_HOUR, MARKET_OPEN_MINUTE)


def get_market_close(d: Optional[date] = None) -> datetime:
    """Get market close time for given date (handles early close)."""
    d = d or today_et()
    if is_early_close(d):
        return make_et_datetime(d, EARLY_CLOSE_HOUR, EARLY_CLOSE_MINUTE)
    return make_et_datetime(d, MARKET_CLOSE_HOUR, MARKET_CLOSE_MINUTE)


def get_first_poll_time(d: Optional[date] = None) -> datetime:
    """Get first poll time (market open + data delay)."""
    d = d or today_et()
    market_open = get_market_open(d)
    return market_open + timedelta(minutes=FIRST_POLL_DELAY_MINUTES)


def get_eod_time(d: Optional[date] = None) -> datetime:
    """Get EOD consolidation time (close + delay for data to settle)."""
    d = d or today_et()
    market_close = get_market_close(d)
    return market_close + timedelta(minutes=EOD_DELAY_MINUTES)


def next_trading_day(d: Optional[date] = None) -> date:
    """Find the next trading day after given date."""
    d = d or today_et()
    candidate = d + timedelta(days=1)
    # Safety limit to prevent infinite loop
    for _ in range(10):
        if is_trading_day(candidate):
            return candidate
        candidate += timedelta(days=1)
    return candidate


# =============================================================================
# LOGGING
# =============================================================================

logger = None


def setup_logging() -> logging.Logger:
    """Configure dual logging to console and file."""
    global logger

    log_format = "%(asctime)s [%(levelname)s] %(message)s"
    date_format = "%Y-%m-%d %H:%M:%S"

    # Create logger
    logger = logging.getLogger("spx_scheduler")
    logger.setLevel(getattr(logging, LOG_LEVEL))
    logger.handlers = []  # Clear any existing handlers

    # Console handler
    console = logging.StreamHandler(sys.stdout)
    console.setFormatter(logging.Formatter(log_format, date_format))
    logger.addHandler(console)

    # File handler (daily log files)
    if LOG_TO_FILE:
        log_dir = Path(LOG_DIR)
        log_dir.mkdir(exist_ok=True)
        log_file = log_dir / f"scheduler_{today_et().isoformat()}.log"

        file_handler = logging.FileHandler(log_file, encoding='utf-8')
        file_handler.setFormatter(logging.Formatter(log_format, date_format))
        logger.addHandler(file_handler)

    return logger


def log(message: str, level: str = "INFO"):
    """Log a message."""
    if logger:
        getattr(logger, level.lower())(message)
    else:
        print(f"[{level}] {message}")


def log_banner(title: str):
    """Log a banner for visibility."""
    log("=" * 70)
    log(title)
    log("=" * 70)


# =============================================================================
# GRACEFUL SHUTDOWN
# =============================================================================

shutdown_requested = False


def signal_handler(signum, frame):
    """Handle shutdown signals gracefully."""
    global shutdown_requested
    log("Shutdown signal received (Ctrl+C or SIGTERM)")
    shutdown_requested = True


def sleep_interruptible(seconds: float):
    """
    Sleep that can be interrupted by shutdown signal.
    Sleeps in 1-second chunks to allow responsive shutdown.
    """
    end_time = time.time() + seconds
    while time.time() < end_time and not shutdown_requested:
        time.sleep(min(1.0, end_time - time.time()))

    if shutdown_requested:
        raise KeyboardInterrupt("Shutdown requested")


# =============================================================================
# POLL EXECUTION
# =============================================================================

def run_poll_with_retry() -> Tuple[int, Optional[str]]:
    """
    Execute poll with retry logic.

    Returns:
        Tuple of (contracts_stored, error_message)
        error_message is None on success
    """
    # Import here to avoid circular imports and allow standalone testing
    try:
        from .poller import poll_spx_options
    except ImportError:
        from poller import poll_spx_options

    last_error = None

    for attempt in range(1, MAX_POLL_RETRIES + 1):
        try:
            count, error = poll_spx_options()

            if error is None:
                return (count, None)

            last_error = error
            log(f"Poll attempt {attempt}/{MAX_POLL_RETRIES} failed: {error}", "WARNING")

        except Exception as e:
            last_error = str(e)
            log(f"Poll attempt {attempt}/{MAX_POLL_RETRIES} exception: {e}", "ERROR")

        if attempt < MAX_POLL_RETRIES:
            log(f"Retrying in {RETRY_DELAY_SECONDS} seconds...")
            sleep_interruptible(RETRY_DELAY_SECONDS)

    return (0, f"All {MAX_POLL_RETRIES} attempts failed. Last error: {last_error}")


# =============================================================================
# EOD EXECUTION
# =============================================================================

def run_eod(trade_date: Optional[str] = None) -> dict:
    """
    Execute EOD consolidation.

    Args:
        trade_date: Date to consolidate (ISO format). Defaults to today.

    Returns:
        Stats dictionary with keys: consolidated, intraday_cleaned, daily_cleaned, errors
    """
    try:
        from .eod import run_eod_consolidation
    except ImportError:
        from eod import run_eod_consolidation

    trade_date = trade_date or today_et().isoformat()

    try:
        stats = run_eod_consolidation(trade_date)
        return stats
    except Exception as e:
        log(f"EOD consolidation exception: {e}", "ERROR")
        return {
            'trade_date': trade_date,
            'consolidated': 0,
            'intraday_cleaned': 0,
            'daily_cleaned': 0,
            'errors': [str(e)]
        }


# =============================================================================
# STATE MACHINE
# =============================================================================

class SchedulerState:
    """State constants for the scheduler."""
    INITIALIZING = "INITIALIZING"
    WEEKEND = "WEEKEND"
    HOLIDAY = "HOLIDAY"
    WAITING_FOR_OPEN = "WAITING_FOR_OPEN"
    MARKET_OPEN = "MARKET_OPEN"
    EOD_PENDING = "EOD_PENDING"
    EOD_RUNNING = "EOD_RUNNING"
    MARKET_CLOSED = "MARKET_CLOSED"


def determine_initial_state() -> str:
    """Determine the appropriate state based on current time."""
    now = now_et()
    today = today_et()

    # Check weekend first
    if is_weekend(today):
        return SchedulerState.WEEKEND

    # Check holiday
    if is_holiday(today):
        return SchedulerState.HOLIDAY

    # It's a trading day - check time
    market_open = get_market_open(today)
    market_close = get_market_close(today)
    first_poll = get_first_poll_time(today)
    eod_time = get_eod_time(today)

    if now < first_poll:
        return SchedulerState.WAITING_FOR_OPEN
    elif now < market_close:
        return SchedulerState.MARKET_OPEN
    elif now < eod_time:
        return SchedulerState.EOD_PENDING
    else:
        return SchedulerState.MARKET_CLOSED


# =============================================================================
# STATE HANDLERS
# =============================================================================

def handle_weekend() -> str:
    """Handle WEEKEND state - sleep until next trading day."""
    now = now_et()
    today = today_et()

    next_day = next_trading_day(today)
    wake_time = make_et_datetime(next_day, 9, 0)

    sleep_seconds = (wake_time - now).total_seconds()

    log(f"Weekend detected. Next trading day: {next_day}")
    log(f"Sleeping until {wake_time.strftime('%Y-%m-%d %H:%M')} ET ({sleep_seconds/3600:.1f} hours)")

    sleep_interruptible(sleep_seconds)

    return determine_initial_state()


def handle_holiday() -> str:
    """Handle HOLIDAY state - sleep until next trading day."""
    now = now_et()
    today = today_et()

    next_day = next_trading_day(today)
    wake_time = make_et_datetime(next_day, 9, 0)

    sleep_seconds = (wake_time - now).total_seconds()

    log(f"Market holiday today ({today}). Next trading day: {next_day}")
    log(f"Sleeping until {wake_time.strftime('%Y-%m-%d %H:%M')} ET ({sleep_seconds/3600:.1f} hours)")

    sleep_interruptible(sleep_seconds)

    return determine_initial_state()


def handle_waiting_for_open() -> str:
    """Handle WAITING_FOR_OPEN state - wait until first poll time."""
    now = now_et()
    today = today_et()

    first_poll = get_first_poll_time(today)

    if now >= first_poll:
        log("Market open + data delay elapsed. Starting polling.")
        return SchedulerState.MARKET_OPEN

    sleep_seconds = (first_poll - now).total_seconds()

    log(f"Waiting for market. First poll at {first_poll.strftime('%H:%M')} ET ({sleep_seconds/60:.0f} min)")

    sleep_interruptible(min(sleep_seconds, 60))

    return SchedulerState.WAITING_FOR_OPEN


def handle_market_open(poll_count: int, last_poll_time: Optional[datetime]) -> Tuple[str, int, Optional[datetime]]:
    """
    Handle MARKET_OPEN state - run polls at interval.

    Returns:
        Tuple of (new_state, updated_poll_count, updated_last_poll_time)
    """
    now = now_et()
    today = today_et()

    market_close = get_market_close(today)

    # Check if market has closed
    if now >= market_close:
        close_str = "13:00" if is_early_close(today) else "16:00"
        log(f"Market closed at {close_str} ET. Transitioning to EOD_PENDING.")
        return (SchedulerState.EOD_PENDING, poll_count, last_poll_time)

    # Determine if it's time to poll
    should_poll = False

    if last_poll_time is None:
        should_poll = True
    else:
        next_poll_time = last_poll_time + timedelta(minutes=POLL_INTERVAL_MINUTES)
        if now >= next_poll_time:
            should_poll = True

    if should_poll:
        poll_count += 1
        log(f"Running poll #{poll_count}...")

        count, error = run_poll_with_retry()

        if error:
            log(f"[POLL FAILED] {error}", "ERROR")
        else:
            log(f"[POLL OK] Stored {count} contracts")

        last_poll_time = now_et()

        next_poll_time = last_poll_time + timedelta(minutes=POLL_INTERVAL_MINUTES)

        if next_poll_time < market_close:
            log(f"Next poll at {next_poll_time.strftime('%H:%M')} ET")
        else:
            close_str = market_close.strftime('%H:%M')
            log(f"No more polls scheduled. Market closes at {close_str} ET")
    else:
        next_poll_time = last_poll_time + timedelta(minutes=POLL_INTERVAL_MINUTES)
        sleep_until = min(next_poll_time, market_close)
        sleep_seconds = (sleep_until - now).total_seconds()

        if sleep_seconds > 0:
            sleep_interruptible(min(sleep_seconds, 60))

    return (SchedulerState.MARKET_OPEN, poll_count, last_poll_time)


def handle_eod_pending() -> str:
    """Handle EOD_PENDING state - wait for data delay then run EOD."""
    now = now_et()
    today = today_et()

    eod_time = get_eod_time(today)

    if now >= eod_time:
        log("Data delay elapsed. Starting EOD consolidation.")
        return SchedulerState.EOD_RUNNING

    remaining_seconds = (eod_time - now).total_seconds()
    log(f"EOD pending. Will run at {eod_time.strftime('%H:%M')} ET ({remaining_seconds/60:.0f} min remaining)")

    sleep_interruptible(min(remaining_seconds, 60))

    return SchedulerState.EOD_PENDING


def handle_eod_running() -> Tuple[str, bool]:
    """
    Handle EOD_RUNNING state - run consolidation.

    Returns:
        Tuple of (new_state, eod_completed)
    """
    log("Running EOD consolidation...")

    stats = run_eod()

    if stats.get('errors'):
        log(f"[EOD FAILED] {stats['errors']}", "ERROR")
    else:
        log(f"[EOD OK] Consolidated {stats['consolidated']} contracts")
        log(f"         Cleaned {stats['intraday_cleaned']} intraday, {stats['daily_cleaned']} daily records")

    return (SchedulerState.MARKET_CLOSED, True)


def handle_market_closed() -> str:
    """Handle MARKET_CLOSED state - sleep until next trading day."""
    now = now_et()
    today = today_et()

    next_day = next_trading_day(today)
    wake_time = make_et_datetime(next_day, 9, 0)

    sleep_seconds = (wake_time - now).total_seconds()

    log(f"Market closed for today. Next trading day: {next_day}")
    log(f"Sleeping until {wake_time.strftime('%Y-%m-%d %H:%M')} ET ({sleep_seconds/3600:.1f} hours)")

    sleep_interruptible(sleep_seconds)

    return determine_initial_state()


# =============================================================================
# MAIN SCHEDULER LOOP
# =============================================================================

def main():
    """Main scheduler entry point."""
    global shutdown_requested

    # Set up signal handlers for graceful shutdown
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    # Initialize logging
    setup_logging()

    # Startup banner
    log_banner("SPX Options Scheduler")
    log(f"Poll interval: {POLL_INTERVAL_MINUTES} minutes")
    log(f"Data delay: {FIRST_POLL_DELAY_MINUTES} minutes")
    log(f"EOD delay: {EOD_DELAY_MINUTES} minutes after close")
    log(f"Timezone: America/New_York (ET)")
    log(f"Current time: {now_et().strftime('%Y-%m-%d %H:%M:%S')} ET")

    # Check if today is early close
    if is_early_close():
        log(f"NOTE: Today is an early close day (1:00 PM ET)")

    # Determine initial state
    state = determine_initial_state()
    log(f"Initial state: {state}")

    # Daily tracking variables
    poll_count_today = 0
    last_poll_time = None
    eod_completed_today = False
    current_date = today_et()

    # Main loop
    while not shutdown_requested:
        try:
            now = now_et()
            today = today_et()

            # Reset daily counters at date change
            if today != current_date:
                log(f"Date changed: {current_date} -> {today}")
                poll_count_today = 0
                last_poll_time = None
                eod_completed_today = False
                current_date = today

                # Re-setup logging for new day's log file
                setup_logging()

                # Check if new day is early close
                if is_early_close(today):
                    log(f"NOTE: Today is an early close day (1:00 PM ET)")

            # State machine dispatch
            if state == SchedulerState.WEEKEND:
                state = handle_weekend()

            elif state == SchedulerState.HOLIDAY:
                state = handle_holiday()

            elif state == SchedulerState.WAITING_FOR_OPEN:
                state = handle_waiting_for_open()

            elif state == SchedulerState.MARKET_OPEN:
                state, poll_count_today, last_poll_time = handle_market_open(
                    poll_count_today, last_poll_time
                )

            elif state == SchedulerState.EOD_PENDING:
                state = handle_eod_pending()

            elif state == SchedulerState.EOD_RUNNING:
                if not eod_completed_today:
                    state, eod_completed_today = handle_eod_running()
                else:
                    state = SchedulerState.MARKET_CLOSED

            elif state == SchedulerState.MARKET_CLOSED:
                state = handle_market_closed()

            else:
                log(f"Unknown state: {state}. Resetting.", "ERROR")
                state = determine_initial_state()

        except KeyboardInterrupt:
            log("Shutdown requested via interrupt")
            break
        except Exception as e:
            log(f"Unexpected error in main loop: {e}", "ERROR")
            import traceback
            log(traceback.format_exc(), "ERROR")
            log("Continuing in 60 seconds...")
            try:
                sleep_interruptible(60)
            except KeyboardInterrupt:
                break

    # Cleanup
    log_banner("SPX Scheduler Shutting Down")
    log(f"Final stats: {poll_count_today} polls today, EOD completed: {eod_completed_today}")
    log("Goodbye!")


if __name__ == "__main__":
    main()
