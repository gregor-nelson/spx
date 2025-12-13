#!/usr/bin/env python3
"""
SPX Options Dashboard Server
=============================
Flask API server for SPX options monitoring dashboard.

Run:
    python src/server.py

Then open http://localhost:5000 in browser.
"""

import os
import sys
import json
from flask import Flask, jsonify, send_from_directory, request
from datetime import date, datetime, timedelta
from pathlib import Path

# Handle imports whether run as module or standalone
try:
    from .database import SPXDatabase
except ImportError:
    from database import SPXDatabase

# Load .env if available
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

# Determine paths based on where we're running from
SCRIPT_DIR = Path(__file__).parent.resolve()
PROJECT_ROOT = SCRIPT_DIR.parent
STATIC_DIR = PROJECT_ROOT / "static"

# Configuration from environment
DB_PATH = os.environ.get('SPX_DB_PATH', str(SCRIPT_DIR / 'spx_options.db'))
HOST = os.environ.get('SPX_HOST', '127.0.0.1')
PORT = int(os.environ.get('SPX_PORT', '5050'))
DEBUG = os.environ.get('SPX_DEBUG', 'false').lower() in ('true', '1', 'yes')

app = Flask(__name__, static_folder=str(STATIC_DIR))


# =============================================================================
# STATIC FILE ROUTES
# =============================================================================

@app.route('/')
def index():
    """Serve the main dashboard."""
    return send_from_directory(STATIC_DIR, 'index.html')


@app.route('/css/<path:filename>')
def serve_css(filename):
    """Serve CSS files."""
    return send_from_directory(STATIC_DIR / 'css', filename)


@app.route('/js/<path:filename>')
def serve_js(filename):
    """Serve JavaScript files."""
    return send_from_directory(STATIC_DIR / 'js', filename)


# =============================================================================
# API ROUTES
# =============================================================================

@app.route('/api/expirations')
def get_expirations():
    """Get list of available expirations in the database."""
    db = SPXDatabase(DB_PATH)

    # Get expirations from intraday (recent data)
    cursor = db.conn.execute("""
        SELECT DISTINCT expiration,
               MIN(dte) as dte,
               COUNT(DISTINCT ticker) as contract_count
        FROM intraday_snapshots
        WHERE captured_date = ?
        GROUP BY expiration
        ORDER BY expiration ASC
    """, (date.today().isoformat(),))

    intraday_exps = [dict(row) for row in cursor.fetchall()]

    # Get expirations from daily history
    cursor = db.conn.execute("""
        SELECT DISTINCT expiration,
               MIN(dte) as dte,
               COUNT(DISTINCT ticker) as contract_count
        FROM daily_history
        GROUP BY expiration
        ORDER BY expiration ASC
    """)

    daily_exps = [dict(row) for row in cursor.fetchall()]

    db.close()
    return jsonify({
        'intraday': intraday_exps,
        'daily': daily_exps
    })


@app.route('/api/intraday')
def get_intraday():
    """Get today's intraday snapshots. Optional expiration filter."""
    db = SPXDatabase(DB_PATH)
    today = date.today().isoformat()
    expiration = request.args.get('expiration')

    if expiration:
        cursor = db.conn.execute("""
            SELECT * FROM intraday_snapshots
            WHERE captured_date = ? AND expiration = ?
            ORDER BY captured_at DESC, strike ASC
        """, (today, expiration))
    else:
        cursor = db.conn.execute("""
            SELECT * FROM intraday_snapshots
            WHERE captured_date = ?
            ORDER BY captured_at DESC, strike ASC
        """, (today,))

    rows = [dict(row) for row in cursor.fetchall()]
    db.close()
    return jsonify(rows)


@app.route('/api/intraday/latest')
def get_latest_poll():
    """Get the most recent poll's data. Optional expiration filter."""
    db = SPXDatabase(DB_PATH)
    expiration = request.args.get('expiration')

    # Get latest captured_at
    cursor = db.conn.execute("""
        SELECT DISTINCT captured_at
        FROM intraday_snapshots
        ORDER BY captured_at DESC
        LIMIT 1
    """)
    latest = cursor.fetchone()

    if not latest:
        db.close()
        return jsonify([])

    if expiration:
        cursor = db.conn.execute("""
            SELECT * FROM intraday_snapshots
            WHERE captured_at = ? AND expiration = ?
            ORDER BY strike ASC
        """, (latest[0], expiration))
    else:
        cursor = db.conn.execute("""
            SELECT * FROM intraday_snapshots
            WHERE captured_at = ?
            ORDER BY strike ASC
        """, (latest[0],))

    rows = [dict(row) for row in cursor.fetchall()]
    db.close()
    return jsonify(rows)


@app.route('/api/intraday/latest/enriched')
def get_latest_enriched():
    """
    Get the most recent poll's data enriched with day-over-day comparisons.

    Returns all fields from the database plus:
    - Derived calculations (notional, avg_trade_size, price_range_pct)
    - Same-hour yesterday comparison (volume_delta_hour, volume_pct_change_hour, etc.)
    - EOD yesterday comparison (volume_delta_eod, volume_pct_change_eod, etc.)
    - OI changes from yesterday
    - Alert flags for each contract
    """
    db = SPXDatabase(DB_PATH)
    expiration_filter = request.args.get('expiration')

    # Step 1: Get latest captured_at timestamp
    cursor = db.conn.execute("""
        SELECT DISTINCT captured_at
        FROM intraday_snapshots
        ORDER BY captured_at DESC
        LIMIT 1
    """)
    latest_row = cursor.fetchone()

    if not latest_row:
        db.close()
        return jsonify({'data': [], 'meta': {'error': 'No data available'}})

    captured_at = latest_row[0]
    captured_date = captured_at[:10]
    captured_hour = int(captured_at[11:13])

    # Step 2: Get today's latest data
    if expiration_filter:
        cursor = db.conn.execute("""
            SELECT * FROM intraday_snapshots
            WHERE captured_at = ? AND expiration = ?
            ORDER BY strike ASC
        """, (captured_at, expiration_filter))
    else:
        cursor = db.conn.execute("""
            SELECT * FROM intraday_snapshots
            WHERE captured_at = ?
            ORDER BY strike ASC
        """, (captured_at,))

    today_data = [dict(row) for row in cursor.fetchall()]

    if not today_data:
        db.close()
        return jsonify({'data': [], 'meta': {'error': 'No data for latest poll'}})

    # Step 3: Calculate yesterday's date
    today_date_obj = datetime.strptime(captured_date, "%Y-%m-%d").date()
    yesterday_date = (today_date_obj - timedelta(days=1)).isoformat()

    # Step 4: Get yesterday's same-hour data (±1 hour tolerance)
    hour_start = max(0, captured_hour - 1)
    hour_end = min(23, captured_hour + 1)

    cursor = db.conn.execute("""
        SELECT ticker, volume_cumulative, open_interest, close_price, vwap, captured_at
        FROM intraday_snapshots
        WHERE captured_date = ?
          AND CAST(SUBSTR(captured_at, 12, 2) AS INTEGER) BETWEEN ? AND ?
        ORDER BY ticker, ABS(CAST(SUBSTR(captured_at, 12, 2) AS INTEGER) - ?) ASC
    """, (yesterday_date, hour_start, hour_end, captured_hour))

    yesterday_hour_data = {}
    yesterday_hour_source = None
    for row in cursor.fetchall():
        ticker = row[0]
        if ticker not in yesterday_hour_data:
            yesterday_hour_data[ticker] = {
                'volume': row[1] or 0,
                'open_interest': row[2],
                'close_price': row[3],
                'vwap': row[4],
                'captured_at': row[5]
            }
            if yesterday_hour_source is None:
                yesterday_hour_source = row[5]

    # Step 5: Get yesterday's EOD data from daily_history
    cursor = db.conn.execute("""
        SELECT ticker, volume, open_interest, close_price, vwap
        FROM daily_history
        WHERE trade_date = ?
    """, (yesterday_date,))

    yesterday_eod_data = {}
    for row in cursor.fetchall():
        yesterday_eod_data[row[0]] = {
            'volume': row[1] or 0,
            'open_interest': row[2],
            'close_price': row[3],
            'vwap': row[4]
        }

    # Step 6: Get today's alerts for flag information
    cursor = db.conn.execute("""
        SELECT ticker, trigger_reasons
        FROM alerts
        WHERE DATE(triggered_at) = ?
    """, (captured_date,))

    today_alerts = {}
    for row in cursor.fetchall():
        ticker = row[0]
        try:
            reasons = json.loads(row[1]) if row[1] else {}
            flags = reasons.get('flags', [])
        except (json.JSONDecodeError, TypeError):
            flags = []

        if ticker in today_alerts:
            today_alerts[ticker].extend(flags)
        else:
            today_alerts[ticker] = flags

    # Step 7: Enrich each contract
    enriched_data = []
    contracts_with_flags = 0

    for row in today_data:
        ticker = row['ticker']

        yest_hour = yesterday_hour_data.get(ticker, {})
        yest_eod = yesterday_eod_data.get(ticker, {})
        flags = list(set(today_alerts.get(ticker, [])))

        if flags:
            contracts_with_flags += 1

        volume_today = row.get('volume_cumulative') or 0
        oi_today = row.get('open_interest')
        close_price = row.get('close_price') or 0
        vwap = row.get('vwap') or close_price
        high_price = row.get('high_price')
        low_price = row.get('low_price')
        transactions = row.get('transactions') or 0

        notional_today = volume_today * vwap * 100 if vwap else 0
        avg_trade_size = round(volume_today / transactions, 1) if transactions > 0 else None

        if high_price and low_price and low_price > 0:
            price_range_pct = round(((high_price - low_price) / low_price) * 100, 2)
        else:
            price_range_pct = None

        # Same-hour comparison
        vol_yest_hour = yest_hour.get('volume', 0)
        vol_delta_hour = volume_today - vol_yest_hour
        vol_pct_hour = round((vol_delta_hour / vol_yest_hour) * 100, 1) if vol_yest_hour > 0 else None

        vwap_yest_hour = yest_hour.get('vwap') or yest_hour.get('close_price') or 0
        notional_yest_hour = vol_yest_hour * vwap_yest_hour * 100 if vwap_yest_hour else 0
        notional_delta_hour = notional_today - notional_yest_hour

        # EOD comparison
        vol_yest_eod = yest_eod.get('volume', 0)
        vol_delta_eod = volume_today - vol_yest_eod
        vol_pct_eod = round((vol_delta_eod / vol_yest_eod) * 100, 1) if vol_yest_eod > 0 else None

        vwap_yest_eod = yest_eod.get('vwap') or yest_eod.get('close_price') or 0
        notional_yest_eod = vol_yest_eod * vwap_yest_eod * 100 if vwap_yest_eod else 0
        notional_delta_eod = notional_today - notional_yest_eod

        # OI comparison
        oi_yest = yest_eod.get('open_interest')
        if oi_today is not None and oi_yest is not None:
            oi_delta = oi_today - oi_yest
            oi_pct = round((oi_delta / oi_yest) * 100, 2) if oi_yest > 0 else None
        else:
            oi_delta = None
            oi_pct = None

        enriched = {
            'ticker': ticker,
            'strike': row.get('strike'),
            'expiration': row.get('expiration'),
            'contract_type': row.get('contract_type'),
            'dte': row.get('dte'),
            'moneyness': row.get('moneyness'),
            'spot_price': row.get('spot_price'),
            'volume_today': volume_today,
            'volume_delta_intraday': row.get('volume_delta'),
            'transactions': transactions,
            'avg_trade_size': avg_trade_size,
            'close_price': close_price,
            'high_price': high_price,
            'low_price': low_price,
            'vwap': vwap,
            'price_range_pct': price_range_pct,
            'open_interest': oi_today,
            'delta': row.get('delta'),
            'gamma': row.get('gamma'),
            'theta': row.get('theta'),
            'vega': row.get('vega'),
            'implied_vol': row.get('implied_vol'),
            'market_status': row.get('market_status'),
            'timeframe': row.get('timeframe'),
            'notional_today': round(notional_today, 2),
            'volume_yesterday_hour': vol_yest_hour,
            'volume_delta_hour': vol_delta_hour,
            'volume_pct_change_hour': vol_pct_hour,
            'notional_yesterday_hour': round(notional_yest_hour, 2),
            'notional_delta_hour': round(notional_delta_hour, 2),
            'volume_yesterday_eod': vol_yest_eod,
            'volume_delta_eod': vol_delta_eod,
            'volume_pct_change_eod': vol_pct_eod,
            'notional_yesterday_eod': round(notional_yest_eod, 2),
            'notional_delta_eod': round(notional_delta_eod, 2),
            'oi_yesterday': oi_yest,
            'oi_delta': oi_delta,
            'oi_pct_change': oi_pct,
            'flags': flags,
            'flag_count': len(flags)
        }

        enriched_data.append(enriched)

    db.close()

    response = {
        'data': enriched_data,
        'meta': {
            'captured_at': captured_at,
            'captured_date': captured_date,
            'yesterday_date': yesterday_date,
            'yesterday_hour_source': yesterday_hour_source,
            'yesterday_eod_source': yesterday_date if yesterday_eod_data else None,
            'contracts_count': len(enriched_data),
            'contracts_with_flags': contracts_with_flags,
            'spot_price': today_data[0].get('spot_price') if today_data else None
        }
    }

    return jsonify(response)


@app.route('/api/daily')
def get_daily():
    """Get daily history (last 7 days). Optional expiration filter."""
    db = SPXDatabase(DB_PATH)
    cutoff = (date.today() - timedelta(days=7)).isoformat()
    expiration = request.args.get('expiration')

    if expiration:
        cursor = db.conn.execute("""
            SELECT * FROM daily_history
            WHERE trade_date >= ? AND expiration = ?
            ORDER BY trade_date DESC, strike ASC
        """, (cutoff, expiration))
    else:
        cursor = db.conn.execute("""
            SELECT * FROM daily_history
            WHERE trade_date >= ?
            ORDER BY trade_date DESC, strike ASC
        """, (cutoff,))

    rows = [dict(row) for row in cursor.fetchall()]
    db.close()
    return jsonify(rows)


@app.route('/api/alerts')
def get_alerts():
    """Get recent alerts."""
    db = SPXDatabase(DB_PATH)
    alerts = db.get_recent_alerts(limit=50)
    db.close()
    return jsonify(alerts)


@app.route('/api/stats')
def get_stats():
    """Get database statistics."""
    db = SPXDatabase(DB_PATH)

    cursor = db.conn.execute("""
        SELECT
            COUNT(*) as total_rows,
            COUNT(DISTINCT captured_at) as poll_count,
            COUNT(DISTINCT ticker) as unique_contracts,
            MIN(captured_at) as earliest,
            MAX(captured_at) as latest
        FROM intraday_snapshots
    """)
    intraday = dict(cursor.fetchone())

    daily = db.get_daily_history_stats()

    cursor = db.conn.execute("SELECT COUNT(*) as count FROM alerts")
    alert_count = cursor.fetchone()[0]

    size_bytes = db.get_database_size()

    db.close()

    return jsonify({
        'intraday': intraday,
        'daily': daily,
        'alert_count': alert_count,
        'db_size_mb': round(size_bytes / (1024 * 1024), 2)
    })


@app.route('/api/health')
def health_check():
    """Health check endpoint for monitoring."""
    try:
        db = SPXDatabase(DB_PATH)
        cursor = db.conn.execute("SELECT 1")
        cursor.fetchone()
        db.close()
        return jsonify({'status': 'healthy', 'database': 'connected'})
    except Exception as e:
        return jsonify({'status': 'unhealthy', 'error': str(e)}), 500


# =============================================================================
# MAIN
# =============================================================================

if __name__ == '__main__':
    print("Starting SPX Dashboard server...")
    print(f"Database: {DB_PATH}")
    print(f"Static files: {STATIC_DIR}")
    print(f"Debug mode: {DEBUG}")
    print(f"Listening on http://{HOST}:{PORT}")
    app.run(host=HOST, port=PORT, debug=DEBUG)
