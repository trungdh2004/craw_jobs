#!/bin/bash

# Kill any existing Chrome debug instances
pkill -f "chrome.*remote-debugging-port=9222" 2>/dev/null
sleep 1

# Launch Chrome with remote debugging AND disable extensions
# Extensions (e.g. Tampermonkey) cause Playwright connectOverCDP to crash
google-chrome \
  --remote-debugging-port=9222 \
  --user-data-dir=/home/do-huu-trung/chrome-auto \
  --disable-extensions \
  --no-first-run \
  &

# Wait for Chrome to start
sleep 3

# Run the crawl pipeline
node index.js