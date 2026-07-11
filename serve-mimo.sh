#!/bin/bash

set -e

# Start Chrome with remote debugging + MiMo Code server + Node app
# Usage: ./serve-mimo.sh [mimo_port] [chrome_port]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
cd "$SCRIPT_DIR"

MIMO_PORT=${1:-6000}
CHROME_PORT=${2:-9222}

# Start Chrome if not running
if ! pgrep -f "remote-debugging-port=$CHROME_PORT" > /dev/null; then
    echo "Starting Chrome on port $CHROME_PORT..."
    google-chrome \
        --remote-debugging-port="$CHROME_PORT" \
        --user-data-dir="/home/$USER/chrome-auto" \
        >/dev/null 2>&1 &
    sleep 2
else
    echo "Chrome already running on port $CHROME_PORT"
fi

echo "Starting MiMo Code server on port $MIMO_PORT..."
mimo serve --port "$MIMO_PORT" >/dev/null 2>&1 &
MIMO_PID=$!

echo "Starting Node app..."
node index.js &
NODE_PID=$!

cleanup() {
    echo "Shutting down MiMo and Node app..."
    kill "$MIMO_PID" "$NODE_PID" 2>/dev/null || true
    wait "$MIMO_PID" 2>/dev/null || true
    wait "$NODE_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

wait "$MIMO_PID" "$NODE_PID"
