import io
import os
import shutil
import stat
import subprocess
import sys
import urllib.request
import zipfile

# ======================= EDIT THESE IN COLAB =======================
# --- Distributed (multi-PC) mode — REQUIRED ----------------------------------
# Coordinator Web app URL for the shared Google Sheet queue (see coordinator/
# README.md for the 5-minute setup). Run MANY PCs/Colab sessions against this one
# queue with no number-juggling and no duplicates: each PC just claims the next
# student automatically. students.csv is not needed.
COORDINATOR_URL = "https://script.google.com/macros/s/AKfycbzl3TijKis8trT9-_K8EMDwEj6a0tm7itxcV9w8nlZPO0PkaHo1lc2JGQCrHLlCO8WuEQ/exec"
PC_ID = ""           # optional friendly name for this PC in the dashboard
# -----------------------------------------------------------------------------
# This bootstrap runs in DISTRIBUTED (shared-queue) mode: every PC/Colab pulls
# the next student from the Google Sheet queue above. There is NO START/END to
# set and no duplicates — just run this cell on each machine.
CONCURRENCY = 1      # how many browsers run in parallel (per PC)
# --- Anti-CAPTCHA browser settings -------------------------------------------
# CHANNEL="chrome" launches REAL Google Chrome (much less CAPTCHA-prone than the
# bundled Chromium); set "" to use bundled Chromium. HEADLESS=False runs a real
# visible browser, which is far less likely to be challenged. On Colab there is
# no screen, so when HEADLESS=False the bootstrap automatically runs under a
# virtual display (Xvfb) — you don't need to do anything.
CHANNEL = "chrome"
HEADLESS = False     # False = headful (least CAPTCHA; auto-uses Xvfb on Colab)
# --- VPN & Speed settings ----------------------------------------------------
VPN = "n"            # "y" to enable Browsec VPN extension, "n" to disable
SPEED = 1            # Timeout multiplier: 2 means 2x slower actions (defaults to 2 automatically if VPN is enabled)
# --- Proxy (the real fix for Colab CAPTCHA) ----------------------------------
# Colab runs on Google DATACENTER IPs, which Coursera challenges on signup even
# with real Chrome. The only thing that changes that is exiting through a
# different IP. Put a RESIDENTIAL proxy here to route the browser through it,
# e.g. "http://user:pass@host:port" or "socks5://user:pass@host:port".
# Leave "" to use the machine's own IP (fine on real PCs/phones; CAPTCHA-prone
# on Colab). Use a per-session/rotating residential endpoint for best results.
PROXY = ""
# ===================================================================

# The repo is now a full Node.js project at its root (runner + node_modules
# committed), so we git clone it directly. The archive zip is kept only as a
# no-git fallback; GitHub serves it under /archive/refs/heads/<branch>.zip.
REPO_URL = "https://github.com/AbdulkhaevHasanboy/Script.git"
ZIP_URLS = [
    "https://github.com/AbdulkhaevHasanboy/Script/archive/refs/heads/main.zip",
    "https://github.com/AbdulkhaevHasanboy/Script/archive/refs/heads/master.zip",
]
EXTRACT_DIR = "SCRIPT"

# The runner JS is the anchor: the project root is whatever dir contains it.
RUNNER_JS = "coursera_manual_runner.js"

# Data files that are NOT committed to the public repo (they hold student
# emails/passwords). Upload these to the Colab session first (drag them into the
# file panel, or use files.upload()); the bootstrap copies whatever it finds in
# the current dir into the extracted project. students.csv is required.
DATA_FILES = [
    "students.csv",
    "names.xlsx",
    "recorded_steps.json",
    "recorded_steps.backup.json",
    "config.json",
]


def have_git():
    try:
        subprocess.check_output("git --version", shell=True, text=True)
        return True
    except Exception:  # noqa: BLE001
        return False


def fetch_repo():
    """Get the project into ./EXTRACT_DIR and return that path.

    Preferred: a shallow git clone of the whole Node.js project. Fallback (no
    git available): download and unpack the GitHub archive zip.
    """
    # Start clean so re-running the cell doesn't fail on an existing dir.
    shutil.rmtree(EXTRACT_DIR, ignore_errors=True)

    if have_git():
        print(f"Cloning {REPO_URL} -> ./{EXTRACT_DIR} ...")
        proc = subprocess.run(
            f'git clone --depth 1 "{REPO_URL}" "{EXTRACT_DIR}"',
            shell=True,
        )
        if proc.returncode == 0:
            return EXTRACT_DIR
        print("  git clone failed; falling back to the archive zip.")

    # --- zip fallback ---
    last_err = None
    for url in ZIP_URLS:
        try:
            print(f"Downloading {url} ...")
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req) as resp:
                data = resp.read()
            print(f"Downloaded {len(data)} bytes; extracting into ./{EXTRACT_DIR} ...")
            os.makedirs(EXTRACT_DIR, exist_ok=True)
            with zipfile.ZipFile(io.BytesIO(data)) as zf:
                zf.extractall(EXTRACT_DIR)
            return EXTRACT_DIR
        except Exception as e:  # noqa: BLE001
            print(f"  failed: {e}")
            last_err = e
    raise SystemExit(f"Could not fetch the project. Last error: {last_err}")


# A known-good run_on_colab.py. We always write this into the extracted project,
# overwriting whatever stale copy shipped in the zip, so setup is reliable
# regardless of what is committed in the repo.
ROBUST_RUNNER = r'''#!/usr/bin/env python3
"""Auto-generated by bootstrap.py: set up and run the Coursera runner."""

import os
import stat
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
os.chdir(HERE)


def run(cmd, env=None):
    print(f"\n$ {cmd}", flush=True)
    proc = subprocess.Popen(
        cmd, shell=True, env=env,
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1,
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

# names.xlsx is parsed by the Node runner via `python3 -c "import openpyxl ..."`,
# so the python3 the runner shells out to must have openpyxl. Colab usually ships
# it, but install it defensively so the run never dies with "No module named
# 'openpyxl'". openpyxl is a Python package; it must NOT be in the npm list.
try:
    import openpyxl  # noqa: F401
    print("openpyxl already available.")
except ImportError:
    print("Installing openpyxl (needed to read names.xlsx)...")
    if not (run(f'"{sys.executable}" -m pip install -q openpyxl')
            or run("python3 -m pip install -q openpyxl")
            or run("pip3 install -q openpyxl")):
        sys.exit("Error installing openpyxl (required to read names.xlsx).")

if not run("npm install playwright playwright-extra puppeteer-extra-plugin-stealth"):
    sys.exit("Error installing npm dependencies.")

# Repair +x bits stripped by zip extraction so npx/.bin shims can execute.
bin_dir = os.path.join(HERE, "node_modules", ".bin")
if os.path.isdir(bin_dir):
    for name in os.listdir(bin_dir):
        path = os.path.join(bin_dir, name)
        try:
            mode = os.stat(path).st_mode
            os.chmod(path, mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
        except OSError:
            pass

browsers = "chromium"
cli = os.path.join(HERE, "node_modules", "playwright", "cli.js")
if os.path.exists(cli):
    with_deps = f'node "{cli}" install {browsers} --with-deps'
    plain = f'node "{cli}" install {browsers}'
else:
    with_deps = f"npx playwright install {browsers} --with-deps"
    plain = f"npx playwright install {browsers}"
if not (run(with_deps) or run(plain)):
    sys.exit("Error installing Playwright browsers.")

# If CHANNEL=chrome (real Google Chrome — much less CAPTCHA-prone than bundled
# Chromium), install that real browser too.
_channel = os.environ.get("CHANNEL", "").strip().lower()
if _channel in ("chrome", "chrome-beta", "msedge", "msedge-beta"):
    print(f"Installing real browser channel '{_channel}' (lower CAPTCHA rate)...")
    if os.path.exists(cli):
        run(f'node "{cli}" install {_channel} --with-deps') or run(f'node "{cli}" install {_channel}')
    else:
        run(f"npx playwright install {_channel} --with-deps") or run(f"npx playwright install {_channel}")

# In distributed mode the student list comes from the coordinator queue, so a
# local students.csv is not needed.
if not os.environ.get("COORDINATOR_URL") and not os.path.exists("students.csv"):
    sys.exit("Error: students.csv not found next to the runner. Upload it to the "
             "Colab session before running bootstrap.py (or set COORDINATOR_URL "
             "for distributed mode).")

print("\n=== Setup complete! Starting the runner (MODE=auto) ===")
start_cmd = "node coursera_manual_runner.js"
if os.environ.get("HEADLESS", "").strip().lower() in ("n", "no", "0", "false"):
    # Headful was requested, but Colab/servers have no screen. Install a virtual
    # display (Xvfb) and run the real browser inside it — far less CAPTCHA-prone
    # than headless, with no GUI needed.
    print("Headful mode on a headless machine: setting up a virtual display (Xvfb)...")
    run("apt-get update -y && apt-get install -y xvfb")
    start_cmd = "xvfb-run -a -s '-screen 0 1920x1080x24' node coursera_manual_runner.js"
if not run(start_cmd, env=dict(os.environ, MODE="auto")):
    sys.exit("The runner exited with an error.")
'''


def find_project_dir(base):
    # The project root is the directory containing the runner JS. Skip node_modules.
    for root, dirs, files in os.walk(base):
        dirs[:] = [d for d in dirs if d != "node_modules"]
        if RUNNER_JS in files:
            return root
    return None


def provision_data_files(project_dir):
    """Copy the not-committed data files (students.csv, etc.) from the Colab
    working dir into the project, since they are no longer in the GitHub zip."""
    cwd = os.getcwd()
    copied = []
    for name in DATA_FILES:
        dest = os.path.join(project_dir, name)
        if os.path.exists(dest):
            continue  # already shipped in the zip (e.g. recorded_steps.json)
        src = os.path.join(cwd, name)
        if os.path.exists(src) and os.path.abspath(src) != os.path.abspath(dest):
            shutil.copy2(src, dest)
            copied.append(name)
    if copied:
        print(f"Provisioned uploaded data files into the project: {', '.join(copied)}")

    # In distributed mode the student list comes from the coordinator queue, so a
    # local students.csv is not required.
    if COORDINATOR_URL:
        return

    if not os.path.exists(os.path.join(project_dir, "students.csv")):
        raise SystemExit(
            "students.csv was not found. It is no longer in the public repo, so "
            "you must upload it to the Colab session (drag it into the file panel, "
            "or use files.upload()) BEFORE running bootstrap.py."
        )


def run_project(base):
    project_dir = find_project_dir(base)
    if not project_dir:
        listing = "\n".join(
            os.path.join(r, f) for r, _d, fs in os.walk(base) for f in fs
        )
        raise SystemExit(
            f"Could not find {RUNNER_JS} in the project.\n"
            f"Extracted files:\n{listing}"
        )

    # Always install a known-good setup script, overwriting any stale copy.
    runner_path = os.path.join(project_dir, "run_on_colab.py")
    with open(runner_path, "w", encoding="utf-8") as fh:
        fh.write(ROBUST_RUNNER)
    print(f"Installed fresh run_on_colab.py into {project_dir}")

    # Bring in the data files the repo no longer ships (students.csv, etc.).
    provision_data_files(project_dir)

    # Pass the Colab-side knobs through as env vars. The runner pulls the student
    # list from the shared coordinator queue (no START/END), reading the rest from
    # the environment first, then config.json.
    env = dict(os.environ)
    env["CONCURRENCY"] = str(CONCURRENCY)
    env["HEADLESS"] = "y" if HEADLESS else "n"
    env["COURSERA_COLAB"] = "1"
    if CHANNEL:
        env["CHANNEL"] = CHANNEL
    env["VPN"] = str(VPN)
    env["SPEED"] = str(SPEED)
    # Route the browser through a residential proxy (the real fix for Colab's
    # datacenter-IP CAPTCHA). On Linux, Chromium reads these standard proxy env
    # vars for its system proxy, so the browser exits through PROXY's IP.
    if PROXY:
        for _k in ("HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY",
                   "http_proxy", "https_proxy", "all_proxy"):
            env[_k] = PROXY
        print(f"-> Routing browser traffic through proxy: {PROXY.split('@')[-1]}")

    # Distributed (shared-queue) mode is required: hand the coordinator URL (and
    # optional PC id) to the runner, which then pulls students from the Sheet.
    if not COORDINATOR_URL:
        raise SystemExit(
            "COORDINATOR_URL is empty. Set it at the top of bootstrap.py to your "
            "coordinator Web app URL (see coordinator/README.md). This bootstrap "
            "runs in shared-queue mode and has no START/END."
        )
    env["COORDINATOR_URL"] = COORDINATOR_URL
    if PC_ID:
        env["PC_ID"] = PC_ID
    print(f"\n=== Running {' '.join([sys.executable, 'run_on_colab.py'])} in {project_dir} "
          f"(DISTRIBUTED queue mode, CONCURRENCY={CONCURRENCY}, HEADLESS={HEADLESS}, "
          f"CHANNEL={CHANNEL or 'chromium'}) ===", flush=True)

    cmd = [sys.executable, "run_on_colab.py"]

    # Stream the child's output straight through — no screenshot viewer.
    proc = subprocess.Popen(
        cmd,
        cwd=project_dir,
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
        raise SystemExit(
            f"\nProject exited with code {proc.returncode}. See the output above "
            "for the error (e.g. missing students.csv, npm/playwright failure)."
        )


def main():
    project_base = fetch_repo()
    run_project(project_base)


if __name__ == "__main__":
    main()
