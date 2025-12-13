#!/usr/bin/env python3
"""
SPX Options Monitor - Unified Entry Point
==========================================
Runs both the API server and data scheduler in a single managed process.

Usage:
    python src/main.py

Production (systemd):
    ExecStart=/path/to/python main.py
"""

import os
import sys
import signal
import multiprocessing
from pathlib import Path

# Ensure src directory is in path
SRC_DIR = Path(__file__).parent.resolve()
sys.path.insert(0, str(SRC_DIR))

# Load .env
try:
    from dotenv import load_dotenv
    load_dotenv(SRC_DIR.parent / '.env')
except ImportError:
    pass


def run_server():
    """Run the Flask API server."""
    from server import app, HOST, PORT, DEBUG

    # Disable Flask's reloader in subprocess (causes issues with multiprocessing)
    app.run(host=HOST, port=PORT, debug=DEBUG, use_reloader=False)


def run_scheduler():
    """Run the data collection scheduler."""
    from scheduler import main as scheduler_main
    scheduler_main()


def main():
    """Main entry point - runs both server and scheduler."""
    print("=" * 60)
    print("SPX Options Monitor")
    print("=" * 60)
    print(f"Starting API server and scheduler...")
    print()

    # Create processes
    server_proc = multiprocessing.Process(target=run_server, name="spx-server")
    scheduler_proc = multiprocessing.Process(target=run_scheduler, name="spx-scheduler")

    # Track processes for cleanup
    processes = [server_proc, scheduler_proc]

    def shutdown(signum=None, frame=None):
        """Graceful shutdown of all processes."""
        print("\nShutting down...")
        for proc in processes:
            if proc.is_alive():
                print(f"  Stopping {proc.name}...")
                proc.terminate()

        # Wait for processes to finish
        for proc in processes:
            proc.join(timeout=5)
            if proc.is_alive():
                print(f"  Force killing {proc.name}...")
                proc.kill()

        print("Shutdown complete.")
        sys.exit(0)

    # Register signal handlers
    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    # Start processes
    server_proc.start()
    print(f"[OK] API server started (PID: {server_proc.pid})")

    scheduler_proc.start()
    print(f"[OK] Scheduler started (PID: {scheduler_proc.pid})")
    print()
    print("Press Ctrl+C to stop")
    print("=" * 60)

    # Monitor processes
    try:
        while True:
            # Check if any process died unexpectedly
            if not server_proc.is_alive():
                print(f"[WARN] Server process died (exit code: {server_proc.exitcode}). Restarting...")
                server_proc = multiprocessing.Process(target=run_server, name="spx-server")
                server_proc.start()
                processes[0] = server_proc

            if not scheduler_proc.is_alive():
                print(f"[WARN] Scheduler process died (exit code: {scheduler_proc.exitcode}). Restarting...")
                scheduler_proc = multiprocessing.Process(target=run_scheduler, name="spx-scheduler")
                scheduler_proc.start()
                processes[1] = scheduler_proc

            # Sleep before next check
            server_proc.join(timeout=5)

    except KeyboardInterrupt:
        shutdown()


if __name__ == "__main__":
    # Required for Windows compatibility
    multiprocessing.freeze_support()
    main()
