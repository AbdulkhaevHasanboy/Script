#!/usr/bin/env python3
import time
import sys
import subprocess
from pathlib import Path

def run_cmd(cmd, desc):
    print("\n" + "=" * 70)
    print(f"🚀 {desc}")
    print("=" * 70)
    res = subprocess.run([sys.executable, cmd])
    if res.returncode != 0:
        print(f"⚠️ Warning: {cmd} returned code {res.returncode}")

def main():
    start_total_time = time.time()

    # Step 1: Download all activation emails from Spam
    run_cmd("update_activations_js.py", "STEP 1: Downloading AI Leaders Activation Emails from Gmail Spam...")

    # Step 2: Mass Activate AI Leaders accounts
    run_cmd("activate_all.py", "STEP 2: Mass Activating AI Leaders Accounts on aileaders.uz...")

    # Step 3: Wait 5 minutes (300 seconds)
    print("\n" + "=" * 70)
    print("⏳ STEP 3: Waiting 5 minutes (300 seconds) for Coursera invitations to arrive in Gmail INBOX...")
    print("=" * 70)
    for remaining in range(300, 0, -30):
        print(f"   ⏱️ {remaining} seconds remaining...")
        time.sleep(30)
    print("✅ 5-minute wait completed!")

    # Step 4: Re-run AI Leaders activation pass & Wait 3 minutes (180 seconds)
    run_cmd("activate_all.py", "STEP 4a: Re-activating AI Leaders Accounts (Verification Pass)...")

    print("\n" + "=" * 70)
    print("⏳ STEP 4b: Waiting 3 minutes (180 seconds) for INBOX messages to settle...")
    print("=" * 70)
    for remaining in range(180, 0, -30):
        print(f"   ⏱️ {remaining} seconds remaining...")
        time.sleep(30)
    print("✅ 3-minute wait completed!")

    # Step 5: Redownload INBOX Coursera mails, extract Join links, update NEW.csv & Names.xlsx, and sort A-Z
    run_cmd("download_coursera_mails.py", "STEP 5: Downloading INBOX Mails, Extracting Coursera Join Links, Updating CSV & Excel, and Sorting A-Z...")

    total_elapsed = time.time() - start_total_time
    print("\n" + "=" * 70)
    print(f"🎉 FULL PIPELINE COMPLETED IN {total_elapsed/60:.2f} MINUTES!")
    print("=" * 70)

if __name__ == "__main__":
    main()
