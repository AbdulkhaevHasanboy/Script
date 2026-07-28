#!/usr/bin/env bash
NODE_BIN="/home/xasanboy/snap/antigravity/5/.cache/ms-playwright-go/1.57.0/node"
if [ ! -f "$NODE_BIN" ]; then
    NODE_BIN="node"
fi
export PATH="/home/xasanboy/snap/antigravity/5/.cache/ms-playwright-go/1.57.0:$PATH"

echo "======================================================================"
echo "🚀 Starting Coursera Network API Traffic Recorder"
echo "======================================================================"

export DISPLAY="${DISPLAY:-:0}"

SCRIPT_TO_RUN="${1:-record_activation_flow.js}"

if [ "$HEADLESS" = "true" ] && command -v xvfb-run >/dev/null 2>&1; then
    echo "🖥️  Running $SCRIPT_TO_RUN in headless mode with xvfb-run..."
    xvfb-run -a -s "-screen 0 1920x1080x24" "$NODE_BIN" "$SCRIPT_TO_RUN"
else
    echo "🖥️  Opening visible Chromium browser window on display ($DISPLAY) for $SCRIPT_TO_RUN..."
    "$NODE_BIN" "$SCRIPT_TO_RUN"
fi
