#!/usr/bin/env python3
"""
run_on_colab.py — set up and run the Coursera runner on Google Colab / Ubuntu.

What it does, in order:
  1. Ensure Node.js >= 18 (Playwright needs it); install Node 20 LTS if missing.
  2. Install the npm packages the runner actually imports.
  3. Repair executable bits on node_modules/.bin (zip extraction strips them).
  4. Install the Playwright browsers, calling the CLI via `node` so a missing
     +x bit on the .bin shim can never cause "Permission denied".
  5. Verify the input data (students.csv) is present.
  6. Launch the runner in automated mode.

It is safe to re-run: already-satisfied steps are quick no-ops.
"""

import os
import stat
import subprocess
import sys

# ======================= EDIT THESE =======================
# Which students to process (1-based, inclusive). Set END = None for "to the end".
# Only used when COORDINATOR_URL is "none".
START = 1
END = 100
CONCURRENCY = 1      # how many browsers run in parallel
USE_XVFB = True      # Run headful inside virtual display (Xvfb) on Colab to bypass headless anti-bot blocks
VPN = "n"            # "y" to enable Browsec VPN extension, "n" to disable
SPEED = 1            # Timeout multiplier (defaults to 2 automatically if VPN is enabled)

# The course URL to solve
COURSE_URL = "https://www.coursera.org/learn/build-ai-apps-with-chatgpt-dalle-gpt4"

# Set to "none" to run locally using Names.xlsx/students.csv and the START/END range.
# Otherwise, leave as empty string "" to use the coordinator URL from config.json,
# or specify a custom Google Apps Script Web App URL.
COORDINATOR_URL = ""
# ==========================================================

# Always operate from the directory this script lives in.
HERE = os.path.dirname(os.path.abspath(__file__))
os.chdir(HERE)


def run(cmd, env=None):
    """Run a shell command, streaming its output. Returns True on success."""
    print(f"\n$ {cmd}", flush=True)
    proc = subprocess.Popen(
        cmd,
        shell=True,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )
    for line in proc.stdout:
        print(line, end="", flush=True)
    proc.wait()
    if proc.returncode != 0:
        print(f"[command failed: exit {proc.returncode}]", flush=True)
    return proc.returncode == 0


def node_major_version():
    try:
        out = subprocess.check_output("node -v", shell=True, text=True).strip()
        return int(out.lstrip("v").split(".")[0])
    except Exception:
        return 0


print("=== Setting up environment for the Coursera runner ===")

# 1. Node.js >= 18 ----------------------------------------------------------
if node_major_version() >= 18:
    print(f"Found Node.js {subprocess.check_output('node -v', shell=True, text=True).strip()}")
else:
    print("Installing Node.js 20 LTS (Playwright requires v18+)...")
    run("apt-get update -y && apt-get install -y curl")
    run("curl -fsSL https://deb.nodesource.com/setup_20.x | bash -")
    run("apt-get install -y nodejs")
    if node_major_version() < 18:
        sys.exit("Error: Node.js 18+ is required but could not be installed.")

run("node -v")
run("npm -v")

# 2. npm dependencies -------------------------------------------------------
# These are exactly what coursera_manual_runner.js imports. NOTE: openpyxl is a
# *Python* package and must never appear here (npm would 404 on it).
if not run("npm install playwright playwright-extra puppeteer-extra-plugin-stealth"):
    sys.exit("Error installing npm dependencies.")

# 3. Repair executable bits on node_modules/.bin ----------------------------
# When the project is delivered as a .zip, extraction can drop the +x bit on the
# CLI shims, which makes `npx playwright` fail with "Permission denied" (exit 126).
bin_dir = os.path.join(HERE, "node_modules", ".bin")
if os.path.isdir(bin_dir):
    for name in os.listdir(bin_dir):
        path = os.path.join(bin_dir, name)
        try:
            mode = os.stat(path).st_mode
            os.chmod(path, mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
        except OSError:
            pass

# 4. Playwright browsers ----------------------------------------------------
# Invoke the CLI through `node` directly so we never depend on the .bin +x bit.
browsers = "chromium"
cli = os.path.join(HERE, "node_modules", "playwright", "cli.js")
if os.path.exists(cli):
    install_with_deps = f'node "{cli}" install {browsers} --with-deps'
    install_plain = f'node "{cli}" install {browsers}'
else:
    install_with_deps = f"npx playwright install {browsers} --with-deps"
    install_plain = f"npx playwright install {browsers}"

if not (run(install_with_deps) or run(install_plain)):
    sys.exit("Error installing Playwright browsers.")

# 5. Verify input data ------------------------------------------------------
# The runner reads students.csv (see CSV_FILE in coursera_manual_runner.js).
if not os.path.exists("students.csv"):
    sys.exit("Error: students.csv not found next to the runner. Upload it first.")

# 6. Run --------------------------------------------------------------------
print(f"\n=== Setup complete! Starting the runner ===")
env = dict(os.environ, MODE="auto")
if COURSE_URL:
    env["COURSE_URL"] = str(COURSE_URL)
if COORDINATOR_URL:
    env["COORDINATOR_URL"] = str(COORDINATOR_URL)
env["START"] = str(START)
if END is not None:
    env["END"] = str(END)
else:
    env.pop("END", None)
env["CONCURRENCY"] = str(CONCURRENCY)
env["COURSERA_COLAB"] = "1"
env["VPN"] = str(VPN)
env["SPEED"] = str(SPEED)

if USE_XVFB:
    print("Installing Xvfb (Virtual Frame Buffer) for headful evasion...")
    run("apt-get update -y && apt-get install -y xvfb")
    env["HEADLESS"] = "n"
    cmd = "xvfb-run -a -s '-screen 0 1920x1080x24' node coursera_manual_runner.js"
else:
    env["HEADLESS"] = "y"
    cmd = "node coursera_manual_runner.js"

if not run(cmd, env=env):
    sys.exit("The runner exited with an error.")
