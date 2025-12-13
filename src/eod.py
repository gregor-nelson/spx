#!/usr/bin/env python3
"""
SPX Options End-of-Day Consolidation
=====================================
Consolidates intraday snapshots into daily history and cleans up old data.

Run once daily after market close via scheduler or standalone:
    python src/eod.py [YYYY-MM-DD]

Environment Variables:
    SPX_DB_PATH - Path to SQLite database (optional, default: spx_options.db)
"""

import os
import sys
from datetime import date, datetime

# Handle imports whether run as module or standalone
try:
    from .database import SPXDatabase
except ImportError:
    from database import SPXDatabase

# Configuration
DB_PATH = os.environ.get('SPX_DB_PATH', 'spx_options.db')
INTRADAY_RETENTION_DAYS = 3
DAILY_RETENTION_DAYS = 60


def run_eod_consolidation(trade_date: str = None) -> dict:
    """
    Run end-of-day consolidation process.

    Args:
        trade_date: Date to consolidate (ISO format). Defaults to today.

    Returns:
        Dictionary with consolidation stats
    """
    if trade_date is None:
        trade_date = date.today().isoformat()

    timestamp = datetime.now().strftime("%Y-%m-%dT%H:%M:%S")
    print(f"[{timestamp}] Starting EOD consolidation for {trade_date}")

    stats = {
        'trade_date': trade_date,
        'consolidated': 0,
        'intraday_cleaned': 0,
        'daily_cleaned': 0,
        'errors': []
    }

    try:
        db = SPXDatabase(DB_PATH)

        # Step 1: Consolidate intraday -> daily_history
        print(f"  Consolidating intraday snapshots to daily history...")
        consolidated = db.consolidate_day_to_history(trade_date)
        stats['consolidated'] = consolidated
        print(f"  Consolidated {consolidated} contracts")

        # Step 2: Cleanup old intraday data
        print(f"  Cleaning up intraday data older than {INTRADAY_RETENTION_DAYS} days...")
        intraday_cleaned = db.cleanup_old_intraday_data(days_to_keep=INTRADAY_RETENTION_DAYS)
        stats['intraday_cleaned'] = intraday_cleaned
        print(f"  Removed {intraday_cleaned} old intraday records")

        # Step 3: Cleanup old daily history
        print(f"  Cleaning up daily history older than {DAILY_RETENTION_DAYS} days...")
        daily_cleaned = db.cleanup_old_daily_history(days_to_keep=DAILY_RETENTION_DAYS)
        stats['daily_cleaned'] = daily_cleaned
        print(f"  Removed {daily_cleaned} old daily records")

        # Step 4: Report database stats
        db_stats = db.get_daily_history_stats()
        print(f"\n  Database stats:")
        print(f"    Daily history records: {db_stats['total_records']}")
        print(f"    Trading days covered: {db_stats['trading_days']}")
        if db_stats['earliest_date'] and db_stats['latest_date']:
            print(f"    Date range: {db_stats['earliest_date']} to {db_stats['latest_date']}")

        # Get database size
        db_size_mb = db.get_database_size() / (1024 * 1024)
        print(f"    Database size: {db_size_mb:.2f} MB")

        db.close()

    except Exception as e:
        stats['errors'].append(str(e))
        print(f"  ERROR: {e}")

    return stats


def main():
    """Main entry point."""
    print("=" * 70)
    print("SPX Options EOD Consolidation")
    print("=" * 70)

    # Allow date override via command line argument
    trade_date = None
    if len(sys.argv) > 1:
        trade_date = sys.argv[1]
        print(f"Using specified date: {trade_date}")

    try:
        stats = run_eod_consolidation(trade_date)

        if stats['errors']:
            print(f"\nERROR: {'; '.join(stats['errors'])}")
            sys.exit(1)
        else:
            print(f"\nSUCCESS:")
            print(f"  - Consolidated: {stats['consolidated']} contracts")
            print(f"  - Intraday cleaned: {stats['intraday_cleaned']} records")
            print(f"  - Daily cleaned: {stats['daily_cleaned']} records")
            sys.exit(0)

    except KeyboardInterrupt:
        print("\nInterrupted by user")
        sys.exit(130)
    except Exception as e:
        print(f"\nUNEXPECTED ERROR: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
