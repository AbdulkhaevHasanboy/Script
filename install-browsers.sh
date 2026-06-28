#!/usr/bin/env bash
#
# Manually install the Playwright Chromium builds (v1228 / Chrome 149.0.7827.55)
# into the local Playwright cache, bypassing `npx playwright install`.
#
# Safe to re-run: wget -c resumes partial downloads, and already-installed
# binaries are skipped.
#
set -euo pipefail

VERSION="149.0.7827.55"          # Chrome for Testing version
BUILD="1228"                     # Playwright chromium build number
BASE="https://storage.googleapis.com/chrome-for-testing-public/${VERSION}/linux64"
CACHE="${HOME}/.cache/ms-playwright"
TMP="$(mktemp -d)"

# files: <zip name>|<cache dir>|<expected binary inside cache dir>
ENTRIES=(
  "chrome-headless-shell-linux64.zip|chromium_headless_shell-${BUILD}|chrome-headless-shell-linux64/chrome-headless-shell"
  "chrome-linux64.zip|chromium-${BUILD}|chrome-linux64/chrome"
)

download() {
  # Retry the download a few times; -c resumes so timeouts don't restart it.
  local url="$1" out="$2" tries=5 n=1
  while (( n <= tries )); do
    echo ">> Downloading ($n/$tries): $url"
    if wget -c --timeout=60 --tries=1 -O "$out" "$url"; then
      return 0
    fi
    echo "!! attempt $n failed, retrying..."
    ((n++))
    sleep 3
  done
  echo "XX Gave up downloading $url" >&2
  return 1
}

for entry in "${ENTRIES[@]}"; do
  IFS='|' read -r zip dir bin <<< "$entry"
  target_dir="${CACHE}/${dir}"
  target_bin="${target_dir}/${bin}"

  if [[ -x "$target_bin" ]]; then
    echo "== Already installed: $target_bin"
    continue
  fi

  echo
  echo "=== Installing $zip -> $target_dir"
  mkdir -p "$target_dir"
  download "${BASE}/${zip}" "${TMP}/${zip}"
  echo ">> Unzipping..."
  unzip -q -o "${TMP}/${zip}" -d "$target_dir"

  if [[ -x "$target_bin" ]]; then
    chmod +x "$target_bin" 2>/dev/null || true
    echo "OK  $target_bin"
  else
    echo "XX Expected binary not found at: $target_bin" >&2
    echo "   Check the unzipped layout under $target_dir" >&2
    exit 1
  fi
done

# Playwright keys installs by a marker file; create it so it doesn't re-prompt.
touch "${CACHE}/chromium_headless_shell-${BUILD}/INSTALLATION_COMPLETE" 2>/dev/null || true
touch "${CACHE}/chromium-${BUILD}/INSTALLATION_COMPLETE" 2>/dev/null || true

rm -rf "$TMP"
echo
echo "All done. Try:  npm run auto"
