#!/usr/bin/env python3
"""
SPX Options Monitor - Unified Entry Point
==========================================
Runs both the API server and data scheduler in a single managed process.

Usage:
    python src/main.py

Production (systemd):
    ExecStart=/path/to/python main.py

Signals:
    SIGTERM/SIGINT: Graceful shutdown
    SIGHUP: Restart subprocesses (reload)
"""

import os
import sys
import signal
import logging
import time
import traceback
import multiprocessing
from pathlib import Path
from datetime import datetime

# Ensure src directory is in path
SRC_DIR = Path(__file__).parent.resolve()
PROJECT_ROOT = SRC_DIR.parent
sys.path.insert(0, str(SRC_DIR))

# Load .env
try:
    from dotenv import load_dotenv
    load_dotenv(PROJECT_ROOT / '.env')
except ImportError:
    pass

# =============================================================================
# CONFIGURATION
# =============================================================================

LOG_DIR = Path(os.environ.get('SPX_LOG_DIR', PROJECT_ROOT / 'logs'))
LOG_LEVEL = os.environ.get('SPX_LOG_LEVEL', 'INFO')

# Restart backoff settings
MAX_RAPID_RESTARTS = 5          # Max restarts before entering cooldown
RAPID_RESTART_WINDOW = 60       # Seconds - restarts within this window count as "rapid"
RESTART_COOLDOWN = 300          # Seconds to wait after hitting max rapid restarts

# Track restart times for backoff logic
restart_history = {
    'server': [],
    'scheduler': []
}

# =============================================================================
# LOGGING
# =============================================================================

logger = None


def setup_logging():
    """Configure logging to both console and file."""
    global logger

    LOG_DIR.mkdir(parents=True, exist_ok=True)

    log_format = "%(asctime)s [%(levelname)s] %(message)s"
    date_format = "%Y-%m-%d %H:%M:%S"

    logger = logging.getLogger("spx_main")
    logger.setLevel(getattr(logging, LOG_LEVEL))
    logger.handlers = []

    # Console handler
    console = logging.StreamHandler(sys.stdout)
    console.setFormatter(logging.Formatter(log_format, date_format))
    logger.addHandler(console)

    # File handler
    log_file = LOG_DIR / f"main_{datetime.now().strftime('%Y-%m-%d')}.log"
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


def check_restart_backoff(proc_name: str) -> None:
    """
    Check if process is restarting too rapidly and apply backoff if needed.

    Tracks restart timestamps and enters cooldown if MAX_RAPID_RESTARTS
    is exceeded within RAPID_RESTART_WINDOW seconds.
    """
    now = time.time()

    # Clean old entries outside the window
    restart_history[proc_name] = [
        t for t in restart_history[proc_name]
        if now - t < RAPID_RESTART_WINDOW
    ]

    # Check if we've hit the limit
    if len(restart_history[proc_name]) >= MAX_RAPID_RESTARTS:
        log(f"{proc_name} crashed {MAX_RAPID_RESTARTS} times in {RAPID_RESTART_WINDOW}s. "
            f"Cooling down for {RESTART_COOLDOWN}s...", "ERROR")
        time.sleep(RESTART_COOLDOWN)
        restart_history[proc_name] = []

    # Record this restart
    restart_history[proc_name].append(now)


# =============================================================================
# SUBPROCESS WRAPPERS
# =============================================================================

def run_server():
    """Run the Flask API server with error capture."""
    try:
        from server import run_server as start_server
        start_server()
    except Exception as e:
        print(f"[SERVER FATAL] {e}", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        sys.exit(1)


def run_scheduler():
    """Run the data collection scheduler with error capture."""
    try:
        from scheduler import main as scheduler_main
        scheduler_main()
    except Exception as e:
        print(f"[SCHEDULER FATAL] {e}", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        sys.exit(1)


def main():
    """Main entry point - runs both server and scheduler."""
    setup_logging()

    log("=" * 60)
    log("SPX Options Monitor")
    log("=" * 60)
    log("Starting API server and scheduler...")

    # Create processes
    server_proc = multiprocessing.Process(target=run_server, name="spx-server")
    scheduler_proc = multiprocessing.Process(target=run_scheduler, name="spx-scheduler")

    # Track processes for cleanup
    processes = [server_proc, scheduler_proc]

    def shutdown(signum=None, frame=None):
        """Graceful shutdown of all processes."""
        log("Shutdown signal received...")
        for proc in processes:
            if proc.is_alive():
                log(f"  Stopping {proc.name}...")
                proc.terminate()

        # Wait for processes to finish
        for proc in processes:
            proc.join(timeout=5)
            if proc.is_alive():
                log(f"  Force killing {proc.name}...", "WARNING")
                proc.kill()

        log("Shutdown complete.")
        sys.exit(0)

    # Register signal handlers
    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    # Start processes
    server_proc.start()
    log(f"API server started (PID: {server_proc.pid})")

    scheduler_proc.start()
    log(f"Scheduler started (PID: {scheduler_proc.pid})")
    log("Press Ctrl+C to stop")
    log("=" * 60)

    # Monitor processes
    try:
        while True:
            # Check if any process died unexpectedly
            if not server_proc.is_alive():
                log(f"Server process died (exit code: {server_proc.exitcode})", "WARNING")
                server_proc.join()  # Clean up zombie
                check_restart_backoff('server')
                log("Restarting server...")
                server_proc = multiprocessing.Process(target=run_server, name="spx-server")
                server_proc.start()
                processes[0] = server_proc

            if not scheduler_proc.is_alive():
                log(f"Scheduler process died (exit code: {scheduler_proc.exitcode})", "WARNING")
                scheduler_proc.join()  # Clean up zombie
                check_restart_backoff('scheduler')
                log("Restarting scheduler...")
                scheduler_proc = multiprocessing.Process(target=run_scheduler, name="spx-scheduler")
                scheduler_proc.start()
                processes[1] = scheduler_proc

            # Sleep before next check
            time.sleep(5)

    except KeyboardInterrupt:
        shutdown()


if __name__ == "__main__":
    # Required for Windows compatibility
    multiprocessing.freeze_support()
    main()
