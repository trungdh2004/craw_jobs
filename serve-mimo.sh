#!/bin/bash

# Start Chrome with remote debugging + MiMo Code server
# Usage: ./serve-mimo.sh [mimo_port] [chrome_port]

MIMO_PORT=${1:-6000}
CHROME_PORT=${2:-9222}

# Start Chrome if not running
if ! pgrep -f "remote-debugging-port=$CHROME_PORT" > /dev/null; then
    echo "Starting Chrome on port $CHROME_PORT..."
    google-chrome \
        --remote-debugging-port=$CHROME_PORT \
        --user-data-dir=/home/$USER/chrome-auto \
        >/dev/null 2>&1 &
    sleep 2
else
    echo "Chrome already running on port $CHROME_PORT"
fi

echo "Starting MiMo Code server on port $MIMO_PORT..."
mimo serve --port "$MIMO_PORT"