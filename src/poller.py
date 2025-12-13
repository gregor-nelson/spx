#!/usr/bin/env python3
"""
SPX Options Poller
==================
Fetches SPX deep OTM put data from Polygon API and stores in database.

Run hourly during market hours via scheduler or standalone:
    python src/poller.py

Environment Variables:
    POLYGON_API_KEY - API key for Polygon.io (required)
    SPX_DB_PATH     - Path to SQLite database (optional, default: spx_options.db)
"""

import os
import sys
import requests
from datetime import datetime, timedelta, date
from typing import Optional, Tuple, List, Dict
import time

# Load .env file if python-dotenv is available
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass  # python-dotenv not installed, rely on system environment

# Handle imports whether run as module or standalone
try:
    from .database import SPXDatabase
except ImportError:
    from database import SPXDatabase

# =============================================================================
# CONFIGURATION
# =============================================================================

# API Configuration
API_KEY = os.environ.get('POLYGON_API_KEY', os.environ.get('MASSIVE_API_KEY', ''))
BASE_URL = "https://api.polygon.io"

# Target Parameters
MIN_DTE = 3       # Include near-term expirations
MAX_DTE = 90      # Up to ~3 months out
MIN_MONEYNESS = 0.5  # 50% of spot (deep OTM)
MAX_MONEYNESS = 0.99  # 1% OTM
CONTRACT_TYPE = "put"

# API Limits
MAX_TICKERS_PER_REQUEST = 250

# Database
DB_PATH = os.environ.get('SPX_DB_PATH', 'spx_options.db')

# =============================================================================
# DETECTION CONFIG
# =============================================================================

DETECTION_ENABLED = True        # Master switch for anomaly detection
ALERT_STORAGE_ENABLED = False   # Toggle to enable writing to alerts table

# Thresholds (adjust as needed based on observed data)
VOLUME_FLOOR = 100              # Minimum volume to consider
PREMIUM_FLOOR = 100_000         # Minimum notional ($) to consider
DELTA_THRESHOLD = 200           # Flag if volume delta exceeds this
DORMANCY_THRESHOLD = 100        # Flag if was 0 yesterday, now exceeds this
MULTIPLIER_THRESHOLD = 5        # Flag if today > N× yesterday


# =============================================================================
# EXPIRATION LOGIC
# =============================================================================

def get_third_friday(year: int, month: int) -> date:
    """
    Calculate the 3rd Friday of a given month (standard monthly expiration).
    """
    first_day = date(year, month, 1)
    first_day_weekday = first_day.weekday()

    # Days until first Friday (weekday 4 = Friday)
    days_until_friday = (4 - first_day_weekday) % 7
    first_friday = first_day + timedelta(days=days_until_friday)

    # Third Friday is 14 days after first Friday
    third_friday = first_friday + timedelta(days=14)

    return third_friday


def get_monthly_expirations(start_date: date, months_ahead: int = 4) -> List[date]:
    """
    Generate list of monthly option expiration dates (3rd Fridays).
    """
    expirations = []
    year = start_date.year
    month = start_date.month

    for _ in range(months_ahead):
        exp = get_third_friday(year, month)

        if exp >= start_date:
            expirations.append(exp)

        month += 1
        if month > 12:
            month = 1
            year += 1

    if len(expirations) < months_ahead:
        exp = get_third_friday(year, month)
        expirations.append(exp)

    return expirations


def find_target_expirations(
    min_dte: int = MIN_DTE,
    max_dte: int = MAX_DTE,
    reference_date: Optional[date] = None
) -> List[Tuple[date, int]]:
    """
    Find ALL monthly expirations within the target DTE window.

    Returns:
        List of (expiration_date, dte) tuples, sorted by DTE ascending.
        Returns nearest expiration if none in window (fallback).
    """
    if reference_date is None:
        reference_date = date.today()

    expirations = get_monthly_expirations(reference_date, months_ahead=6)

    # Filter to those in DTE window
    in_window = []
    nearest_future = None

    for exp in expirations:
        dte = (exp - reference_date).days

        if min_dte <= dte <= max_dte:
            in_window.append((exp, dte))
        elif dte > 0 and nearest_future is None:
            nearest_future = (exp, dte)

    # Return in-window expirations, sorted by DTE
    if in_window:
        return sorted(in_window, key=lambda x: x[1])

    # Fallback: return nearest future expiration
    if nearest_future:
        return [nearest_future]

    # Last resort: first available
    if expirations:
        dte = (expirations[0] - reference_date).days
        return [(expirations[0], dte)]

    return []


# =============================================================================
# API FUNCTIONS
# =============================================================================

def fetch_option_chain(
    expiration_date: Optional[str] = None,
    contract_type: str = "put",
    strike_gte: Optional[float] = None,
    strike_lte: Optional[float] = None,
    limit: int = 250
) -> List[Dict]:
    """
    Fetch option chain snapshot for SPX (discovery endpoint - no greeks).

    Endpoint: GET /v3/snapshot/options/SPX
    """
    url = f"{BASE_URL}/v3/snapshot/options/SPX"

    params = {
        "apiKey": API_KEY,
        "contract_type": contract_type,
        "limit": limit,
        "order": "asc",
        "sort": "strike_price"
    }

    # Only add expiration filter if specified
    if expiration_date:
        params["expiration_date"] = expiration_date

    if strike_gte:
        params["strike_price.gte"] = strike_gte
    if strike_lte:
        params["strike_price.lte"] = strike_lte

    response = requests.get(url, params=params, timeout=30)
    response.raise_for_status()

    data = response.json()
    return data.get("results", [])


def fetch_unified_snapshot(tickers: List[str]) -> List[Dict]:
    """
    Fetch unified snapshot for specific option tickers (has greeks!).

    Endpoint: GET /v3/snapshot
    Max 250 tickers per request.
    """
    if not tickers:
        return []

    url = f"{BASE_URL}/v3/snapshot"

    params = {
        "apiKey": API_KEY,
        "ticker.any_of": ",".join(tickers),
    }

    response = requests.get(url, params=params, timeout=30)
    response.raise_for_status()

    data = response.json()
    return data.get("results", [])


def fetch_unified_snapshot_batched(tickers: List[str], batch_size: int = MAX_TICKERS_PER_REQUEST) -> List[Dict]:
    """
    Fetch unified snapshot in batches if more than 250 tickers.
    """
    all_results = []

    for i in range(0, len(tickers), batch_size):
        batch = tickers[i:i+batch_size]
        print(f"  Fetching batch {i//batch_size + 1}: {len(batch)} tickers...")

        results = fetch_unified_snapshot(batch)
        all_results.extend(results)

        # Rate limiting - be nice to the API
        if i + batch_size < len(tickers):
            time.sleep(0.5)

    return all_results


# =============================================================================
# DATA TRANSFORMATION
# =============================================================================

def transform_to_snapshot(
    contract: Dict,
    captured_at: str,
    captured_date: str,
    spot_price: float
) -> Dict:
    """
    Transform API response to database snapshot format.
    """
    details = contract.get("details", {})
    session = contract.get("session", {})
    greeks = contract.get("greeks", {})

    strike = details.get("strike_price", 0)
    expiration = details.get("expiration_date", "")

    # Calculate DTE
    if expiration:
        exp_date = datetime.strptime(expiration, "%Y-%m-%d").date()
        cap_date = datetime.strptime(captured_date, "%Y-%m-%d").date()
        dte = (exp_date - cap_date).days
    else:
        dte = None

    # Calculate moneyness
    moneyness = strike / spot_price if spot_price and strike else None

    return {
        'captured_at': captured_at,
        'captured_date': captured_date,
        'ticker': contract.get("ticker", details.get("ticker", "")),
        'expiration': expiration,
        'strike': strike,
        'contract_type': details.get("contract_type", CONTRACT_TYPE),
        'spot_price': spot_price,
        'moneyness': moneyness,
        'dte': dte,
        'volume_cumulative': session.get("volume") or 0,
        'open_interest': contract.get("open_interest"),
        'close_price': session.get("close"),
        'high_price': session.get("high"),
        'low_price': session.get("low"),
        'vwap': session.get("vwap"),
        'transactions': session.get("transactions"),
        'delta': greeks.get("delta"),
        'gamma': greeks.get("gamma"),
        'theta': greeks.get("theta"),
        'vega': greeks.get("vega"),
        'implied_vol': contract.get("implied_volatility"),
        'market_status': contract.get("market_status"),
        'timeframe': contract.get("timeframe")
    }


# =============================================================================
# ANOMALY DETECTION
# =============================================================================

def get_yesterday_volume_with_fallback(
    db: 'SPXDatabase',
    ticker: str,
    current_hour: int,
    today_date: str
) -> Tuple[Optional[int], str]:
    """
    Get yesterday's volume with tiered fallback logic.

    Tries multiple sources in priority order:
    1. Yesterday same hour (±1h) from intraday_snapshots
    2. Yesterday EOD from daily_history
    3. Yesterday any hour (most recent) from intraday_snapshots
    4. 2 days ago EOD from daily_history

    Returns:
        Tuple of (volume, source) where source is one of:
        - "yesterday_hour"  : Same hour ±1h from intraday
        - "yesterday_eod"   : EOD from daily_history
        - "yesterday_any"   : Any hour from intraday (most recent)
        - "2_days_ago_eod"  : EOD from 2 days ago
        - "none"            : No comparison data found
    """
    today = date.fromisoformat(today_date)
    yesterday_date = (today - timedelta(days=1)).isoformat()
    two_days_ago_date = (today - timedelta(days=2)).isoformat()

    # Priority 1: Yesterday same hour (±1h) from intraday_snapshots
    hour_start = max(0, current_hour - 1)
    hour_end = min(23, current_hour + 1)

    cursor = db.conn.execute("""
        SELECT volume_cumulative
        FROM intraday_snapshots
        WHERE ticker = ?
          AND captured_date = ?
          AND CAST(SUBSTR(captured_at, 12, 2) AS INTEGER) BETWEEN ? AND ?
        ORDER BY ABS(CAST(SUBSTR(captured_at, 12, 2) AS INTEGER) - ?) ASC
        LIMIT 1
    """, (ticker, yesterday_date, hour_start, hour_end, current_hour))

    row = cursor.fetchone()
    if row and row[0] is not None:
        return (row[0], "yesterday_hour")

    # Priority 2: Yesterday EOD from daily_history
    cursor = db.conn.execute("""
        SELECT volume
        FROM daily_history
        WHERE ticker = ? AND trade_date = ?
        LIMIT 1
    """, (ticker, yesterday_date))

    row = cursor.fetchone()
    if row and row[0] is not None:
        return (row[0], "yesterday_eod")

    # Priority 3: Yesterday any hour (most recent) from intraday_snapshots
    cursor = db.conn.execute("""
        SELECT volume_cumulative
        FROM intraday_snapshots
        WHERE ticker = ? AND captured_date = ?
        ORDER BY captured_at DESC
        LIMIT 1
    """, (ticker, yesterday_date))

    row = cursor.fetchone()
    if row and row[0] is not None:
        return (row[0], "yesterday_any")

    # Priority 4: 2 days ago EOD from daily_history (handles weekends/holidays)
    cursor = db.conn.execute("""
        SELECT volume
        FROM daily_history
        WHERE ticker = ? AND trade_date = ?
        LIMIT 1
    """, (ticker, two_days_ago_date))

    row = cursor.fetchone()
    if row and row[0] is not None:
        return (row[0], "2_days_ago_eod")

    # No comparison data found
    return (None, "none")


def detect_anomalies(snapshots: List[Dict], db: 'SPXDatabase', captured_at: str) -> List[Dict]:
    """
    Analyze snapshots for unusual volume activity compared to yesterday.

    Uses tiered fallback logic to find comparison data.
    """
    alerts = []

    # Parse current timestamp
    current_dt = datetime.strptime(captured_at, "%Y-%m-%dT%H:%M:%S")
    current_hour = current_dt.hour
    today_date = current_dt.date().isoformat()

    # Track comparison data sources for logging
    comparison_stats = {
        "yesterday_hour": 0,
        "yesterday_eod": 0,
        "yesterday_any": 0,
        "2_days_ago_eod": 0,
        "none": 0
    }
    contracts_evaluated = 0

    for snapshot in snapshots:
        ticker = snapshot['ticker']
        volume_today = snapshot.get('volume_cumulative', 0) or 0
        close_price = snapshot.get('close_price', 0) or 0

        # Skip if below volume floor
        if volume_today < VOLUME_FLOOR:
            continue

        # Calculate notional value
        notional = volume_today * close_price * 100

        # Skip if below premium floor
        if notional < PREMIUM_FLOOR:
            continue

        contracts_evaluated += 1

        # Look up yesterday's volume with fallback logic
        volume_yesterday, comparison_source = get_yesterday_volume_with_fallback(
            db, ticker, current_hour, today_date
        )
        comparison_stats[comparison_source] += 1

        # Handle no comparison data case
        if comparison_source == "none":
            volume_yesterday = 0
            skip_dormancy = True
        else:
            volume_yesterday = volume_yesterday or 0
            skip_dormancy = False

        # Calculate delta
        volume_delta = volume_today - volume_yesterday

        # Evaluate flags
        flags = []

        # Delta threshold check
        if volume_delta > DELTA_THRESHOLD:
            flags.append("delta")

        # Multiplier check (only if yesterday had some volume)
        if volume_yesterday > 0 and volume_today > (volume_yesterday * MULTIPLIER_THRESHOLD):
            flags.append("multiplier")

        # Dormancy check (yesterday was 0, today is significant)
        if not skip_dormancy and volume_yesterday == 0 and volume_today > DORMANCY_THRESHOLD:
            flags.append("dormancy")

        # If any flags triggered, create alert
        if flags:
            if volume_yesterday > 0:
                pct_change = ((volume_today - volume_yesterday) / volume_yesterday) * 100
                delta_str = f"+{volume_delta} ({pct_change:.0f}%)"
            else:
                delta_str = f"+{volume_delta} (from 0)"

            alert = {
                "triggered_at": captured_at,
                "ticker": ticker,
                "strike": snapshot.get('strike'),
                "expiration": snapshot.get('expiration'),
                "moneyness": snapshot.get('moneyness'),
                "dte": snapshot.get('dte'),
                "contract_type": snapshot.get('contract_type', 'put'),
                "volume_today": volume_today,
                "volume_yesterday": volume_yesterday,
                "volume_delta": volume_delta,
                "notional": notional,
                "flags": flags,
                "comparison_source": comparison_source,
                "summary": f"Vol {volume_today} vs {volume_yesterday} yesterday ({delta_str}). ${notional:,.0f} notional. Flags: {', '.join(flags)}"
            }
            alerts.append(alert)

    # Log comparison data availability
    if contracts_evaluated > 0:
        print(f"  [COMPARISON] Data sources for {contracts_evaluated} contracts:")
        if comparison_stats["yesterday_hour"] > 0:
            print(f"    - Yesterday same hour: {comparison_stats['yesterday_hour']}")
        if comparison_stats["yesterday_eod"] > 0:
            print(f"    - Yesterday EOD: {comparison_stats['yesterday_eod']}")
        if comparison_stats["yesterday_any"] > 0:
            print(f"    - Yesterday other hour: {comparison_stats['yesterday_any']}")
        if comparison_stats["2_days_ago_eod"] > 0:
            print(f"    - 2 days ago EOD: {comparison_stats['2_days_ago_eod']}")
        if comparison_stats["none"] > 0:
            print(f"    - No comparison data: {comparison_stats['none']} (dormancy check skipped)")

    return alerts


def log_alerts(alerts: List[Dict]) -> None:
    """Log detected anomalies to console."""
    if not alerts:
        print("  [DETECTION] No anomalies detected")
        return

    print(f"  [DETECTION] {len(alerts)} anomaly(s) detected:")
    for alert in alerts:
        strike = alert['strike']
        exp = alert['expiration']
        vol = alert['volume_today']
        delta = alert['volume_delta']
        notional = alert['notional']
        flags = ', '.join(alert['flags'])

        print(f"    [ALERT] Strike {strike} ({exp}) | Vol {vol} (+{delta}) | ${notional:,.0f} | {flags}")


def store_alerts(alerts: List[Dict], db: 'SPXDatabase') -> int:
    """Store alerts to database."""
    stored = 0
    for alert in alerts:
        db_alert = {
            'triggered_at': alert['triggered_at'],
            'ticker': alert['ticker'],
            'expiration': alert['expiration'],
            'strike': alert['strike'],
            'contract_type': alert['contract_type'],
            'moneyness': alert['moneyness'],
            'dte': alert['dte'],
            'score': len(alert['flags']),
            'volume_current': alert['volume_today'],
            'volume_historical_avg': alert['volume_yesterday'],
            'volume_historical_p90': None,
            'premium_notional': alert['notional'],
            'trigger_reasons': {'flags': alert['flags'], 'summary': alert['summary']}
        }
        db.insert_alert(db_alert)
        stored += 1

    return stored


# =============================================================================
# MAIN POLLING LOGIC
# =============================================================================

def fetch_spot_price() -> Tuple[Optional[float], Optional[str]]:
    """Fetch current SPX spot price via a sample option contract."""
    try:
        chain_results = fetch_option_chain(
            expiration_date=None,
            contract_type=CONTRACT_TYPE,
            limit=1
        )

        if not chain_results:
            return (None, "No contracts found for spot price discovery")

        sample_ticker = chain_results[0].get("details", {}).get("ticker")
        if not sample_ticker:
            return (None, "Could not extract ticker from chain results")

        sample_result = fetch_unified_snapshot([sample_ticker])
        if not sample_result:
            return (None, "Could not fetch sample contract for spot price")

        spot_price = sample_result[0].get("underlying_asset", {}).get("value")
        if not spot_price:
            return (None, "SPX spot price not available in API response")

        return (spot_price, None)

    except requests.exceptions.RequestException as e:
        return (None, f"API error fetching spot price: {e}")


def fetch_expiration_contracts(
    expiration_str: str,
    spot_price: float,
    min_strike: float,
    max_strike: float
) -> Tuple[List[str], Optional[str]]:
    """Fetch and filter contracts for a single expiration."""
    try:
        chain_results = fetch_option_chain(
            expiration_date=expiration_str,
            contract_type=CONTRACT_TYPE,
            limit=250
        )
    except requests.exceptions.RequestException as e:
        return ([], f"Option chain API error for {expiration_str}: {e}")

    if not chain_results:
        return ([], None)

    # Filter to target strike range
    target_tickers = []
    for contract in chain_results:
        details = contract.get("details", {})
        strike = details.get("strike_price")
        ticker = details.get("ticker")

        if strike and ticker and min_strike <= strike <= max_strike:
            target_tickers.append(ticker)

    return (target_tickers, None)


def poll_spx_options() -> Tuple[int, Optional[str]]:
    """
    Main polling function. Fetches SPX put data across multiple expirations.

    Returns:
        Tuple of (contracts_stored, error_message)
        error_message is None on success
    """
    # Capture timestamp
    now = datetime.now()
    captured_at = now.strftime("%Y-%m-%dT%H:%M:%S")
    captured_date = now.strftime("%Y-%m-%d")

    print(f"[{captured_at}] Starting SPX options poll")

    # Step 1: Find ALL target expirations in DTE window
    target_expirations = find_target_expirations()

    if not target_expirations:
        return (0, "No expirations found in target DTE window")

    print(f"  Found {len(target_expirations)} expiration(s) in {MIN_DTE}-{MAX_DTE} DTE window:")
    for exp, dte in target_expirations:
        print(f"    - {exp.strftime('%Y-%m-%d')} ({dte} DTE)")

    # Step 2: Get SPX spot price
    print(f"  Fetching SPX spot price...")
    spot_price, spot_error = fetch_spot_price()

    if spot_error:
        return (0, spot_error)

    print(f"  SPX spot price: ${spot_price:.2f}")

    # Step 3: Calculate target strike range
    min_strike = spot_price * MIN_MONEYNESS
    max_strike = spot_price * MAX_MONEYNESS
    print(f"  Target strike range: {min_strike:.0f} - {max_strike:.0f} ({MIN_MONEYNESS:.0%} - {MAX_MONEYNESS:.0%} moneyness)")

    # Step 4: Discover contracts for each expiration
    print(f"  Discovering contracts across expirations...")
    all_tickers = []
    expiration_counts = {}
    errors = []

    for exp, dte in target_expirations:
        exp_str = exp.strftime("%Y-%m-%d")

        tickers, error = fetch_expiration_contracts(
            expiration_str=exp_str,
            spot_price=spot_price,
            min_strike=min_strike,
            max_strike=max_strike
        )

        if error:
            errors.append(error)
            print(f"    [WARN] {exp_str}: {error}")
            continue

        expiration_counts[exp_str] = len(tickers)
        all_tickers.extend(tickers)
        print(f"    {exp_str} ({dte} DTE): {len(tickers)} contracts")

    if errors and not all_tickers:
        return (0, f"All expirations failed: {'; '.join(errors)}")

    if not all_tickers:
        return (0, "No contracts found in target range across all expirations")

    print(f"  Total contracts to fetch: {len(all_tickers)}")

    # Step 5: Fetch detailed data via unified snapshot (batched)
    print(f"  Fetching detailed data...")
    try:
        unified_results = fetch_unified_snapshot_batched(all_tickers)
    except requests.exceptions.RequestException as e:
        return (0, f"Unified snapshot batch API error: {e}")

    print(f"  Received {len(unified_results)} detailed contracts")

    if not unified_results:
        return (0, "Unified snapshot returned no results")

    # Step 6: Transform to database format
    snapshots = []
    for contract in unified_results:
        snapshot = transform_to_snapshot(
            contract=contract,
            captured_at=captured_at,
            captured_date=captured_date,
            spot_price=spot_price
        )
        snapshots.append(snapshot)

    # Step 7: Store in database
    print(f"  Storing {len(snapshots)} snapshots in database...")
    try:
        db = SPXDatabase(DB_PATH)
        count = db.insert_intraday_batch(snapshots)
        print(f"  Successfully stored {count} snapshots")

        # Log breakdown by expiration
        print(f"  Breakdown by expiration:")
        for exp_str, exp_count in expiration_counts.items():
            print(f"    {exp_str}: {exp_count} contracts")

        # Step 8: Run anomaly detection
        if DETECTION_ENABLED:
            print(f"  Running anomaly detection...")
            alerts = detect_anomalies(snapshots, db, captured_at)
            log_alerts(alerts)

            if ALERT_STORAGE_ENABLED and alerts:
                stored = store_alerts(alerts, db)
                print(f"  Stored {stored} alert(s) to database")

        db.close()
        return (count, None)
    except Exception as e:
        return (0, f"Database error: {e}")


def main():
    """Main entry point."""
    if not API_KEY:
        print("ERROR: No API key found!")
        print("Set POLYGON_API_KEY or MASSIVE_API_KEY environment variable")
        sys.exit(1)

    print("=" * 70)
    print("SPX Options Poller")
    print("=" * 70)

    try:
        count, error = poll_spx_options()

        if error:
            print(f"\nERROR: {error}")
            sys.exit(1)
        else:
            print(f"\nSUCCESS: {count} contracts stored")
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
