#!/usr/bin/env bash
#
# setup.sh — one-shot installer for the Coursera manual runner on Ubuntu/Debian.
#
# Installs (if missing): Node.js + npm + npx, Python 3 + pip + openpyxl,
# the project's npm dependencies, and the Playwright Chromium browser
# (with its system libraries).
#
# Usage:
#   chmod +x setup.sh
#   ./setup.sh
#
# Re-running is safe: anything already installed is skipped.

set -euo pipefail

# Always operate from the directory this script lives in.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# --- pretty logging -------------------------------------------------------
c_green=$'\033[0;32m'; c_yellow=$'\033[0;33m'; c_red=$'\033[0;31m'; c_reset=$'\033[0m'
info()  { printf '%s==>%s %s\n' "$c_green"  "$c_reset" "$*"; }
warn()  { printf '%s!!%s  %s\n' "$c_yellow" "$c_reset" "$*"; }
error() { printf '%s xx%s %s\n' "$c_red"    "$c_reset" "$*" >&2; }

# --- sudo helper ----------------------------------------------------------
# Use sudo only when not already root.
if [ "$(id -u)" -eq 0 ]; then
  SUDO=""
else
  if command -v sudo >/dev/null 2>&1; then
    SUDO="sudo"
  else
    error "This script needs root privileges (apt) but 'sudo' is not installed."
    error "Run it as root, or install sudo first."
    exit 1
  fi
fi

NODE_MAJOR=20  # LTS to install if Node is missing/too old

# --- 1. apt base packages -------------------------------------------------
info "Updating apt package lists..."
$SUDO apt-get update -y

info "Installing base tools (curl, ca-certificates, git, build tools)..."
$SUDO apt-get install -y curl ca-certificates gnupg git build-essential

# --- 2. Python 3 + pip + openpyxl ----------------------------------------
info "Installing Python 3 and pip..."
$SUDO apt-get install -y python3 python3-pip

info "Installing the python3-openpyxl module..."
if $SUDO apt-get install -y python3-openpyxl; then
  info "openpyxl installed via apt."
else
  warn "apt package python3-openpyxl unavailable; falling back to pip."
  pip3 install --user --break-system-packages openpyxl
fi

# Verify openpyxl is importable.
if python3 -c 'import openpyxl' 2>/dev/null; then
  info "openpyxl import OK."
else
  warn "openpyxl not importable system-wide; installing for current user via pip."
  pip3 install --user --break-system-packages openpyxl
  python3 -c 'import openpyxl' && info "openpyxl import OK (user install)."
fi

# --- 3. Node.js + npm + npx ----------------------------------------------
need_node=true
if command -v node >/dev/null 2>&1; then
  current_major="$(node -v | sed -E 's/^v([0-9]+).*/\1/')"
  if [ "${current_major:-0}" -ge 18 ]; then
    info "Node.js $(node -v) already installed."
    need_node=false
  else
    warn "Node.js $(node -v) is too old; upgrading to ${NODE_MAJOR}.x LTS."
  fi
fi

if [ "$need_node" = true ]; then
  info "Installing Node.js ${NODE_MAJOR}.x LTS via NodeSource..."
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | $SUDO -E bash -
  $SUDO apt install -y nodejs
fi

info "node $(node -v) | npm $(npm -v) | npx $(npx --version)"

# --- 4. Project npm dependencies -----------------------------------------
info "Installing project npm dependencies (npm install)..."
npm install

# Repair executable bits on the CLI shims. When the project is delivered as a
# .zip (rather than a git clone), extraction can drop the +x bit, which makes
# `npx playwright` fail with "Permission denied" (exit 126).
if [ -d node_modules/.bin ]; then
  chmod +x node_modules/.bin/* 2>/dev/null || true
fi

# --- 5. Playwright browsers + system libraries ---------------------------
# The runner uses Chromium only. --with-deps pulls in the OS libraries it needs
# (uses sudo internally).
BROWSERS="chromium"
PW_CLI="node_modules/playwright/cli.js"

# Prefer calling the CLI through `node` so a missing +x bit on the .bin shim can
# never cause "Permission denied"; fall back to npx if the cli.js isn't present.
if [ -f "$PW_CLI" ]; then
  PW="node $PW_CLI"
else
  PW="npx playwright"
fi

info "Installing Playwright browsers ($BROWSERS) and their system deps..."
if ! $PW install --with-deps $BROWSERS; then
  warn "Could not auto-install browser system deps; installing the browsers only."
  $PW install $BROWSERS
fi

# --- done -----------------------------------------------------------------
info "All set! 🎉"
cat <<'EOF'

You can now run the project:

  npm start              # manual mode (visible browser)
  npm run auto           # automated run (visible browser)
  npm run auto:headless  # automated, no visible window (SSH/CI safe)
  npm run diagnose       # safe smoke test, no enroll/submit

EOF
