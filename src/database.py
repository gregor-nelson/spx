#!/usr/bin/env python3
"""
SPX Options Database Module
============================
Handles all database operations for the SPX tail-risk monitoring system.

Schema Design:
- intraday_snapshots: Hourly polls during market hours (3-day retention)
- daily_history: Consolidated end-of-day records (60-day rolling window)
- alerts: Triggered anomaly notifications (indefinite retention)

Key Features:
- Batch inserts for efficiency
- Automatic volume delta calculation
- Historical comparison queries
- Index optimization for fast lookups
- Atomic transactions
- Calendar-based cleanup (not row-based)
"""

import sqlite3
from datetime import datetime, date, timedelta
from typing import List, Dict, Optional, Tuple
from pathlib import Path
import json


class SPXDatabase:
    """Database manager for SPX options monitoring."""

    def __init__(self, db_path: str = "spx_options.db"):
        """
        Initialize database connection and create schema if needed.

        Args:
            db_path: Path to SQLite database file
        """
        self.db_path = db_path
        self.conn = None
        self.connect()
        self.create_schema()

    def connect(self):
        """Establish database connection with optimizations."""
        self.conn = sqlite3.connect(self.db_path)
        self.conn.row_factory = sqlite3.Row  # Access columns by name

        # SQLite optimizations
        self.conn.execute("PRAGMA journal_mode=WAL")  # Write-Ahead Logging for concurrency
        self.conn.execute("PRAGMA synchronous=NORMAL")  # Faster writes
        self.conn.execute("PRAGMA cache_size=-64000")  # 64MB cache
        self.conn.execute("PRAGMA temp_store=MEMORY")  # Temp tables in RAM

    def create_schema(self):
        """Create database schema with indexes."""

        # INTRADAY SNAPSHOTS TABLE
        # -------------------------
        # Stores every hourly poll. Used for volume delta calculation
        # and real-time monitoring. 3-day rolling retention.

        self.conn.execute("""
            CREATE TABLE IF NOT EXISTS intraday_snapshots (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                captured_at TEXT NOT NULL,           -- ISO timestamp of poll (e.g., '2025-12-03T10:30:00')
                captured_date DATE NOT NULL,         -- Trading date (for grouping)
                ticker TEXT NOT NULL,                -- Full option ticker (O:SPX251219P05000000)
                expiration DATE NOT NULL,
                strike REAL NOT NULL,
                contract_type TEXT NOT NULL,         -- 'put' or 'call'

                -- SPX spot price at capture
                spot_price REAL,
                moneyness REAL,                      -- strike / spot_price
                dte INTEGER,                         -- Days to expiration

                -- Volume tracking
                volume_cumulative INTEGER,           -- Total volume so far today
                volume_delta INTEGER,                -- New volume since last poll

                -- Market data
                open_interest INTEGER,
                close_price REAL,                    -- Option premium
                high_price REAL,
                low_price REAL,
                vwap REAL,
                transactions INTEGER,                -- Trade count

                -- Greeks (may be NULL for very deep OTM)
                delta REAL,
                gamma REAL,
                theta REAL,
                vega REAL,
                implied_vol REAL,

                -- Metadata
                market_status TEXT,                  -- 'open', 'closed', 'early_trading'
                timeframe TEXT,                      -- 'DELAYED' or 'REAL-TIME'

                -- Prevent duplicate polls at same timestamp
                UNIQUE(ticker, captured_date, captured_at)
            )
        """)

        # Indexes for intraday_snapshots
        self.conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_intraday_lookup
            ON intraday_snapshots(ticker, captured_date, captured_at)
        """)

        self.conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_intraday_cleanup
            ON intraday_snapshots(captured_date)
        """)

        # DAILY HISTORY TABLE
        # -------------------
        # Consolidated end-of-day records. Used for anomaly detection baseline.
        # 60-day rolling retention.

        self.conn.execute("""
            CREATE TABLE IF NOT EXISTS daily_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                trade_date DATE NOT NULL,
                ticker TEXT NOT NULL,
                expiration DATE NOT NULL,
                strike REAL NOT NULL,
                contract_type TEXT NOT NULL,

                -- SPX closing price
                spot_close REAL,
                moneyness REAL,                      -- strike / spot_close
                dte INTEGER,

                -- Daily aggregates
                volume INTEGER,                      -- Final daily volume
                open_interest INTEGER,               -- End-of-day OI
                close_price REAL,                    -- Final premium
                high_price REAL,
                low_price REAL,
                vwap REAL,
                transactions INTEGER,

                -- Final greeks
                delta REAL,
                gamma REAL,
                theta REAL,
                vega REAL,
                implied_vol REAL,

                UNIQUE(trade_date, ticker)           -- One record per contract per day
            )
        """)

        # Indexes for daily_history (critical for anomaly detection performance)
        self.conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_daily_moneyness
            ON daily_history(moneyness, dte, trade_date)
        """)

        self.conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_daily_ticker
            ON daily_history(ticker, trade_date)
        """)

        self.conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_daily_cleanup
            ON daily_history(trade_date)
        """)

        # ALERTS TABLE
        # ------------
        # Stores triggered anomaly notifications. Indefinite retention (audit trail).

        self.conn.execute("""
            CREATE TABLE IF NOT EXISTS alerts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                triggered_at TEXT NOT NULL,
                ticker TEXT NOT NULL,
                expiration DATE NOT NULL,
                strike REAL NOT NULL,
                contract_type TEXT NOT NULL,

                moneyness REAL,
                dte INTEGER,

                -- Anomaly scoring
                score REAL NOT NULL,                 -- Composite anomaly score
                volume_current INTEGER,
                volume_historical_avg REAL,
                volume_historical_p90 REAL,          -- 90th percentile

                -- Premium threshold
                premium_notional REAL,               -- volume × price × 100

                -- Trigger details
                trigger_reasons TEXT,                -- JSON: which components fired

                -- Alert handling
                acknowledged BOOLEAN DEFAULT 0,
                acknowledged_at TEXT,
                notes TEXT
            )
        """)

        self.conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_alerts_time
            ON alerts(triggered_at DESC)
        """)

        self.conn.commit()

    # =========================================================================
    # INTRADAY SNAPSHOT OPERATIONS
    # =========================================================================

    def insert_intraday_snapshot(self, snapshot: Dict) -> int:
        """
        Insert a single intraday snapshot with automatic volume delta calculation.

        Args:
            snapshot: Dictionary with contract data from API

        Returns:
            Row ID of inserted record
        """
        # Calculate volume delta
        volume_delta = self._calculate_volume_delta(
            ticker=snapshot['ticker'],
            captured_date=snapshot['captured_date'],
            current_volume=snapshot.get('volume_cumulative', 0),
            current_captured_at=snapshot['captured_at']
        )

        snapshot['volume_delta'] = volume_delta

        cursor = self.conn.execute("""
            INSERT OR REPLACE INTO intraday_snapshots (
                captured_at, captured_date, ticker, expiration, strike, contract_type,
                spot_price, moneyness, dte,
                volume_cumulative, volume_delta,
                open_interest, close_price, high_price, low_price, vwap, transactions,
                delta, gamma, theta, vega, implied_vol,
                market_status, timeframe
            ) VALUES (
                :captured_at, :captured_date, :ticker, :expiration, :strike, :contract_type,
                :spot_price, :moneyness, :dte,
                :volume_cumulative, :volume_delta,
                :open_interest, :close_price, :high_price, :low_price, :vwap, :transactions,
                :delta, :gamma, :theta, :vega, :implied_vol,
                :market_status, :timeframe
            )
        """, snapshot)

        self.conn.commit()
        return cursor.lastrowid

    def insert_intraday_batch(self, snapshots: List[Dict]) -> int:
        """
        Insert multiple snapshots in a single transaction (efficient).

        Args:
            snapshots: List of snapshot dictionaries

        Returns:
            Number of rows inserted
        """
        # Calculate volume deltas for all snapshots
        for snapshot in snapshots:
            volume_delta = self._calculate_volume_delta(
                ticker=snapshot['ticker'],
                captured_date=snapshot['captured_date'],
                current_volume=snapshot.get('volume_cumulative', 0),
                current_captured_at=snapshot['captured_at']
            )
            snapshot['volume_delta'] = volume_delta

        self.conn.executemany("""
            INSERT OR REPLACE INTO intraday_snapshots (
                captured_at, captured_date, ticker, expiration, strike, contract_type,
                spot_price, moneyness, dte,
                volume_cumulative, volume_delta,
                open_interest, close_price, high_price, low_price, vwap, transactions,
                delta, gamma, theta, vega, implied_vol,
                market_status, timeframe
            ) VALUES (
                :captured_at, :captured_date, :ticker, :expiration, :strike, :contract_type,
                :spot_price, :moneyness, :dte,
                :volume_cumulative, :volume_delta,
                :open_interest, :close_price, :high_price, :low_price, :vwap, :transactions,
                :delta, :gamma, :theta, :vega, :implied_vol,
                :market_status, :timeframe
            )
        """, snapshots)

        self.conn.commit()
        return len(snapshots)

    def _calculate_volume_delta(self, ticker: str, captured_date: str, current_volume: int, current_captured_at: str = None) -> int:
        """
        Calculate volume delta by comparing to previous poll on same day.

        Args:
            ticker: Option ticker
            captured_date: Trading date (ISO format)
            current_volume: Current cumulative volume
            current_captured_at: Current timestamp (excluded from lookup)

        Returns:
            Volume delta since last poll (or current_volume if first poll of day)
        """
        # Find previous poll, excluding current timestamp if provided
        if current_captured_at:
            cursor = self.conn.execute("""
                SELECT volume_cumulative
                FROM intraday_snapshots
                WHERE ticker = ? AND captured_date = ? AND captured_at < ?
                ORDER BY captured_at DESC
                LIMIT 1
            """, (ticker, captured_date, current_captured_at))
        else:
            cursor = self.conn.execute("""
                SELECT volume_cumulative
                FROM intraday_snapshots
                WHERE ticker = ? AND captured_date = ?
                ORDER BY captured_at DESC
                LIMIT 1
            """, (ticker, captured_date))

        previous = cursor.fetchone()

        if previous:
            return current_volume - previous['volume_cumulative']
        else:
            # First poll of the day
            return current_volume

    def get_latest_intraday_snapshot(self, ticker: str, captured_date: str) -> Optional[Dict]:
        """Get the most recent intraday snapshot for a ticker on a given date."""
        cursor = self.conn.execute("""
            SELECT * FROM intraday_snapshots
            WHERE ticker = ? AND captured_date = ?
            ORDER BY captured_at DESC
            LIMIT 1
        """, (ticker, captured_date))

        row = cursor.fetchone()
        return dict(row) if row else None

    def cleanup_old_intraday_data(self, days_to_keep: int = 3) -> int:
        """
        Delete intraday snapshots older than N days.

        Args:
            days_to_keep: Number of days to retain (default: 3)

        Returns:
            Number of rows deleted
        """
        cutoff_date = (date.today() - timedelta(days=days_to_keep)).isoformat()

        cursor = self.conn.execute("""
            DELETE FROM intraday_snapshots
            WHERE captured_date < ?
        """, (cutoff_date,))

        self.conn.commit()
        return cursor.rowcount

    # =========================================================================
    # DAILY HISTORY OPERATIONS
    # =========================================================================

    def insert_daily_history(self, record: Dict) -> int:
        """
        Insert or replace a daily history record.

        Args:
            record: Consolidated daily data

        Returns:
            Row ID of inserted record
        """
        cursor = self.conn.execute("""
            INSERT OR REPLACE INTO daily_history (
                trade_date, ticker, expiration, strike, contract_type,
                spot_close, moneyness, dte,
                volume, open_interest, close_price, high_price, low_price, vwap, transactions,
                delta, gamma, theta, vega, implied_vol
            ) VALUES (
                :trade_date, :ticker, :expiration, :strike, :contract_type,
                :spot_close, :moneyness, :dte,
                :volume, :open_interest, :close_price, :high_price, :low_price, :vwap, :transactions,
                :delta, :gamma, :theta, :vega, :implied_vol
            )
        """, record)

        self.conn.commit()
        return cursor.lastrowid

    def insert_daily_history_batch(self, records: List[Dict]) -> int:
        """Batch insert daily history records."""
        self.conn.executemany("""
            INSERT OR REPLACE INTO daily_history (
                trade_date, ticker, expiration, strike, contract_type,
                spot_close, moneyness, dte,
                volume, open_interest, close_price, high_price, low_price, vwap, transactions,
                delta, gamma, theta, vega, implied_vol
            ) VALUES (
                :trade_date, :ticker, :expiration, :strike, :contract_type,
                :spot_close, :moneyness, :dte,
                :volume, :open_interest, :close_price, :high_price, :low_price, :vwap, :transactions,
                :delta, :gamma, :theta, :vega, :implied_vol
            )
        """, records)

        self.conn.commit()
        return len(records)

    def consolidate_day_to_history(self, trade_date: str) -> int:
        """
        Consolidate all intraday snapshots for a given date into daily_history.

        This is the end-of-day (EOD) process that takes the last poll of each
        contract and stores it as the canonical daily record.

        Args:
            trade_date: Date to consolidate (ISO format: 'YYYY-MM-DD')

        Returns:
            Number of records consolidated
        """
        # Get the last snapshot of each contract for the given day
        cursor = self.conn.execute("""
            WITH last_snapshot AS (
                SELECT
                    ticker,
                    MAX(captured_at) as max_time
                FROM intraday_snapshots
                WHERE captured_date = ?
                GROUP BY ticker
            )
            SELECT s.*
            FROM intraday_snapshots s
            INNER JOIN last_snapshot ls
                ON s.ticker = ls.ticker
                AND s.captured_at = ls.max_time
            WHERE s.captured_date = ?
        """, (trade_date, trade_date))

        records = []
        for row in cursor.fetchall():
            record = {
                'trade_date': trade_date,
                'ticker': row['ticker'],
                'expiration': row['expiration'],
                'strike': row['strike'],
                'contract_type': row['contract_type'],
                'spot_close': row['spot_price'],
                'moneyness': row['moneyness'],
                'dte': row['dte'],
                'volume': row['volume_cumulative'],  # Final daily volume
                'open_interest': row['open_interest'],
                'close_price': row['close_price'],
                'high_price': row['high_price'],
                'low_price': row['low_price'],
                'vwap': row['vwap'],
                'transactions': row['transactions'],
                'delta': row['delta'],
                'gamma': row['gamma'],
                'theta': row['theta'],
                'vega': row['vega'],
                'implied_vol': row['implied_vol']
            }
            records.append(record)

        if records:
            return self.insert_daily_history_batch(records)
        return 0

    def get_historical_for_comparison(
        self,
        moneyness: float,
        dte: int,
        lookback_days: int = 60,
        moneyness_tolerance: float = 0.02,
        dte_tolerance: int = 5
    ) -> List[Dict]:
        """
        Query historical data for anomaly detection comparison.

        Returns contracts with similar moneyness and DTE from the past N days.
        This is the core query for the composite scoring algorithm.

        Args:
            moneyness: Current contract moneyness (strike/spot)
            dte: Current days to expiration
            lookback_days: How many days of history to retrieve
            moneyness_tolerance: +/- range for moneyness matching
            dte_tolerance: +/- range for DTE matching

        Returns:
            List of historical records (most recent first)
        """
        cutoff_date = (date.today() - timedelta(days=lookback_days)).isoformat()

        cursor = self.conn.execute("""
            SELECT *
            FROM daily_history
            WHERE moneyness BETWEEN ? AND ?
              AND dte BETWEEN ? AND ?
              AND trade_date >= ?
            ORDER BY trade_date DESC
        """, (
            moneyness - moneyness_tolerance,
            moneyness + moneyness_tolerance,
            dte - dte_tolerance,
            dte + dte_tolerance,
            cutoff_date
        ))

        return [dict(row) for row in cursor.fetchall()]

    def get_ticker_history(self, ticker: str, lookback_days: int = 60) -> List[Dict]:
        """
        Get historical data for a specific ticker.

        Useful for tracking OI changes or volume patterns for an exact contract.
        """
        cutoff_date = (date.today() - timedelta(days=lookback_days)).isoformat()

        cursor = self.conn.execute("""
            SELECT *
            FROM daily_history
            WHERE ticker = ?
              AND trade_date >= ?
            ORDER BY trade_date DESC
        """, (ticker, cutoff_date))

        return [dict(row) for row in cursor.fetchall()]

    def cleanup_old_daily_history(self, days_to_keep: int = 60) -> int:
        """
        Delete daily history older than N days (rolling window).

        Args:
            days_to_keep: Number of days to retain (default: 60)

        Returns:
            Number of rows deleted
        """
        cutoff_date = (date.today() - timedelta(days=days_to_keep)).isoformat()

        cursor = self.conn.execute("""
            DELETE FROM daily_history
            WHERE trade_date < ?
        """, (cutoff_date,))

        self.conn.commit()
        return cursor.rowcount

    def get_daily_history_stats(self) -> Dict:
        """Get statistics about daily history table."""
        cursor = self.conn.execute("""
            SELECT
                COUNT(*) as total_records,
                COUNT(DISTINCT trade_date) as trading_days,
                MIN(trade_date) as earliest_date,
                MAX(trade_date) as latest_date
            FROM daily_history
        """)

        return dict(cursor.fetchone())

    # =========================================================================
    # ALERT OPERATIONS
    # =========================================================================

    def insert_alert(self, alert: Dict) -> int:
        """
        Insert an anomaly alert.

        Args:
            alert: Alert data including score, trigger reasons, etc.

        Returns:
            Alert ID
        """
        # Convert trigger_reasons dict to JSON string
        if 'trigger_reasons' in alert and isinstance(alert['trigger_reasons'], dict):
            alert['trigger_reasons'] = json.dumps(alert['trigger_reasons'])

        cursor = self.conn.execute("""
            INSERT INTO alerts (
                triggered_at, ticker, expiration, strike, contract_type,
                moneyness, dte,
                score, volume_current, volume_historical_avg, volume_historical_p90,
                premium_notional, trigger_reasons
            ) VALUES (
                :triggered_at, :ticker, :expiration, :strike, :contract_type,
                :moneyness, :dte,
                :score, :volume_current, :volume_historical_avg, :volume_historical_p90,
                :premium_notional, :trigger_reasons
            )
        """, alert)

        self.conn.commit()
        return cursor.lastrowid

    def get_recent_alerts(self, limit: int = 50, unacknowledged_only: bool = False) -> List[Dict]:
        """Get recent alerts, optionally filtering for unacknowledged."""
        query = """
            SELECT * FROM alerts
            WHERE 1=1
        """

        if unacknowledged_only:
            query += " AND acknowledged = 0"

        query += " ORDER BY triggered_at DESC LIMIT ?"

        cursor = self.conn.execute(query, (limit,))
        return [dict(row) for row in cursor.fetchall()]

    def acknowledge_alert(self, alert_id: int, notes: str = None) -> bool:
        """Mark an alert as acknowledged."""
        self.conn.execute("""
            UPDATE alerts
            SET acknowledged = 1,
                acknowledged_at = ?,
                notes = ?
            WHERE id = ?
        """, (datetime.now().isoformat(), notes, alert_id))

        self.conn.commit()
        return True

    # =========================================================================
    # UTILITY METHODS
    # =========================================================================

    def close(self):
        """Close database connection."""
        if self.conn:
            self.conn.close()

    def vacuum(self):
        """Reclaim disk space and optimize database."""
        self.conn.execute("VACUUM")

    def get_database_size(self) -> int:
        """Get database file size in bytes."""
        return Path(self.db_path).stat().st_size

    def __enter__(self):
        """Context manager support."""
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager cleanup."""
        self.close()
