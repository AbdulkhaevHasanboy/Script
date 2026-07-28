#!/usr/bin/env python3
"""
download_and_extract_mails.py

Downloads raw activation emails from Gmail via IMAP into a local `mails/` directory,
extracts AI Leaders activation links and tokens, saves them into `extracted_activations.json`,
and activates the accounts on aileaders.uz.
"""

import os
import sys
import re
import json
import csv
import time
import email
import socket
import argparse
import imaplib
import requests
import threading
import concurrent.futures
import fcntl
from pathlib import Path

# Set socket timeout to prevent IMAP/HTTP hangs
socket.setdefaulttimeout(20)

# Paths
MAILS_DIR = Path("mails")
DB_PATH = Path("Names_db.json")
NEW_CSV_PATH = Path("NEW.csv")
EXTRACTED_JSON_PATH = Path("extracted_activations.json")

# Default Config
DEFAULT_GMAIL_USER = "qwertyuioplkjhgfdsazxcvbnmhrh@gmail.com"
DEFAULT_GMAIL_APP_PASS = "lxpgpkkhxitatnut"
BASE_URL = "https://aileaders.uz"

# Lock for thread safety
file_lock = threading.Lock()

def parse_args():
    parser = argparse.ArgumentParser(description="Download Gmail activation emails and extract tokens.")
    parser.add_argument("--user", default=DEFAULT_GMAIL_USER, help="Gmail email address")
    parser.add_argument("--pass", dest="app_pass", default=os.getenv("GMAIL_APP_PASS", DEFAULT_GMAIL_APP_PASS), help="Gmail App Password")
    parser.add_argument("--offline", action="store_true", help="Only parse already downloaded emails in mails/ without connecting to IMAP")
    parser.add_argument("--no-activate", action="store_true", help="Skip HTTP activation after extraction")
    parser.add_argument("--concurrency", type=int, default=20, help="Number of worker threads for activation HTTP requests")
    return parser.parse_args()

def ensure_mails_dir():
    MAILS_DIR.mkdir(parents=True, exist_ok=True)

def extract_url_from_body(body):
    """Extract activation URL from email body text or HTML."""
    match = re.search(r'https://aileaders\.uz/auth/activate/[^\s"\'>\<\#]+', body)
    if match:
        url = match.group(0).replace("&amp;", "&")
        # Extract token parameter if present
        token_match = re.search(r'[?&]token=([a-f0-9]+)', url)
        token = token_match.group(1) if token_match else None
        return url, token
    return None, None

def parse_eml_file(file_path):
    """Parses a single .eml file and returns recipient email, activation_url, and token."""
    try:
        with open(file_path, "rb") as f:
            msg = email.message_from_binary_file(f)
        
        to_header = msg.get("To") or ""
        to_emails = re.findall(r'[\w\.-]+@[\w\.-]+', to_header)
        if not to_emails:
            return None
        target_email = to_emails[0].strip().lower()

        body = ""
        if msg.is_multipart():
            for subpart in msg.walk():
                content_type = subpart.get_content_type()
                content_disp = str(subpart.get("Content-Disposition"))
                if content_type in ("text/html", "text/plain") and "attachment" not in content_disp:
                    payload = subpart.get_payload(decode=True)
                    if payload:
                        charset = subpart.get_content_charset() or "utf-8"
                        body += payload.decode(charset, errors="ignore") + "\n"
        else:
            payload = msg.get_payload(decode=True)
            if payload:
                charset = msg.get_content_charset() or "utf-8"
                body = payload.decode(charset, errors="ignore")

        url, token = extract_url_from_body(body)
        if url:
            return {
                "email": target_email,
                "activation_url": url,
                "token": token,
                "eml_file": str(file_path)
            }
    except Exception as e:
        pass
    return None

def download_emails_from_gmail(gmail_user, app_password):
    """Connects to Gmail IMAP, downloads new messages to mails/ directory."""
    print("=" * 70)
    print(f"📧 Connecting to Gmail IMAP ({gmail_user})...")
    print("=" * 70)

    try:
        mail = imaplib.IMAP4_SSL("imap.gmail.com")
        mail.login(gmail_user, app_password)
        print("✅ Gmail IMAP login successful!")
    except Exception as e:
        print(f"❌ Failed to connect to Gmail IMAP: {e}")
        print("Please verify your Gmail address and 16-character App Password.")
        return False

    folders = ["INBOX", "[Gmail]/Spam"]
    downloaded_count = 0
    skipped_count = 0

    for folder in folders:
        print(f"\n📂 Checking IMAP folder: {folder}...")
        status, _ = mail.select(f'"{folder}"', readonly=True)
        if status != "OK":
            status, _ = mail.select(folder, readonly=True)
            if status != "OK":
                print(f"⚠️ Could not select folder {folder}")
                continue

        # Search for activation emails
        status, data = mail.search(None, '(SUBJECT "Activation")')
        if status != "OK" or not data[0]:
            # Try searching for aileaders if subject query returned 0
            status, data = mail.search(None, '(BODY "aileaders.uz")')
            if status != "OK" or not data[0]:
                print(f"No activation messages found in {folder}.")
                continue

        msg_ids = data[0].split()
        print(f"Found {len(msg_ids)} activation emails in {folder}.")

        # Download messages not already saved locally
        batch_size = 50
        for i in range(0, len(msg_ids), batch_size):
            batch = msg_ids[i:i+batch_size]
            batch_str = b",".join(batch)
            
            # Check which msg_ids in this batch are already downloaded
            needed_ids = []
            for m_id in batch:
                m_id_str = m_id.decode()
                clean_folder = folder.replace("[Gmail]/", "").replace("/", "_").lower()
                eml_filename = MAILS_DIR / f"{clean_folder}_{m_id_str}.eml"
                if eml_filename.exists() and eml_filename.stat().st_size > 0:
                    skipped_count += 1
                else:
                    needed_ids.append(m_id)

            if not needed_ids:
                continue

            fetch_str = b",".join(needed_ids)
            try:
                status, msg_data = mail.fetch(fetch_str, "(RFC822)")
                if status != "OK":
                    continue

                for item in msg_data:
                    if isinstance(item, tuple):
                        m_id_str = item[0].split()[0].decode()
                        clean_folder = folder.replace("[Gmail]/", "").replace("/", "_").lower()
                        eml_path = MAILS_DIR / f"{clean_folder}_{m_id_str}.eml"
                        with open(eml_path, "wb") as f:
                            f.write(item[1])
                        downloaded_count += 1
            except Exception as e:
                print(f"⚠️ Batch fetch error in {folder}: {e}")

    try:
        mail.close()
        mail.logout()
    except Exception:
        pass

    print(f"\n✅ IMAP Download Complete! New downloaded: {downloaded_count}, Already cached: {skipped_count}")
    return True

def scan_and_extract_local_mails():
    """Scans all .eml files in mails/ directory and returns mapping email -> info."""
    print("\n🔍 Scanning local `mails/` folder for activation tokens...")
    eml_files = list(MAILS_DIR.glob("*.eml"))
    print(f"Found {len(eml_files)} `.eml` files locally.")

    extracted = {}
    for eml in eml_files:
        info = parse_eml_file(eml)
        if info and info["email"] and info["activation_url"]:
            extracted[info["email"]] = info

    print(f"✅ Successfully extracted activation URLs for {len(extracted)} unique emails.")
    
    # Write to extracted_activations.json
    EXTRACTED_JSON_PATH.write_text(json.dumps(extracted, indent=2, ensure_ascii=False))
    print(f"💾 Saved extraction report to `{EXTRACTED_JSON_PATH}`")
    return extracted

def activate_single_url(session, target_email, url):
    """Sends HTTP GET request to activate account."""
    try:
        resp = session.get(url, headers={
            "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36"
        }, timeout=15)
        if resp.status_code == 200:
            return True, None
        else:
            return False, f"HTTP {resp.status_code}"
    except Exception as e:
        return False, str(e)

def perform_bulk_activation(extracted_map, concurrency=20):
    """Bulk activates accounts on aileaders.uz and updates Names_db.json / NEW.csv."""
    if not extracted_map:
        print("No activation links available to process.")
        return

    print("\n" + "=" * 70)
    print(f"🚀 Starting Bulk Account Activation ({len(extracted_map)} accounts, concurrency={concurrency})...")
    print("=" * 70)

    # Load Names_db.json to identify which pending ones need activation
    db_items = []
    if DB_PATH.exists():
        try:
            db_items = json.loads(DB_PATH.read_text())
        except Exception:
            pass

    session = requests.Session()
    success_count = 0
    activated_emails = set()

    with concurrent.futures.ThreadPoolExecutor(max_workers=concurrency) as executor:
        futures = {}
        for target_email, info in extracted_map.items():
            f = executor.submit(activate_single_url, session, target_email, info["activation_url"])
            futures[f] = (target_email, info)

        for future in concurrent.futures.as_completed(futures):
            target_email, info = futures[future]
            try:
                ok, err = future.result()
                if ok:
                    success_count += 1
                    activated_emails.add(target_email)
                    print(f"✅ Activated [{success_count}/{len(extracted_map)}] -> {target_email}")
                else:
                    print(f"❌ Failed activation for {target_email}: {err}")
            except Exception as e:
                print(f"❌ Exception activating {target_email}: {e}")

    # Update Names_db.json
    if DB_PATH.exists() and activated_emails:
        try:
            lock_path = DB_PATH.with_suffix(".json.lock")
            with open(lock_path, "w") as lock_f:
                fcntl.flock(lock_f, fcntl.LOCK_EX)
                for item in db_items:
                    e_addr = (item.get("email") or "").strip().lower()
                    if e_addr in activated_emails:
                        item["activated"] = True
                        item["activation_url"] = extracted_map[e_addr]["activation_url"]
                DB_PATH.write_text(json.dumps(db_items, ensure_ascii=False, indent=2))
                fcntl.flock(lock_f, fcntl.LOCK_UN)
            print(f"\n💾 Updated activated status in `Names_db.json` for {len(activated_emails)} records.")
        except Exception as e:
            print(f"⚠️ Error updating Names_db.json: {e}")

    print("=" * 70)
    print(f"🎉 Bulk Activation Completed! Total Activated: {success_count}/{len(extracted_map)}")
    print("=" * 70)

def main():
    args = parse_args()
    ensure_mails_dir()

    if not args.offline:
        app_pass = args.app_pass.replace(" ", "")
        if not app_pass:
            print("⚠️ No Gmail App Password provided!")
            print("Usage: python3 download_and_extract_mails.py --pass \"your-16-char-app-password\"")
            print("Or pass via environment variable: export GMAIL_APP_PASS=\"your-app-password\"")
            print("Or run in offline mode to scan existing downloaded mails: python3 download_and_extract_mails.py --offline\n")
            sys.exit(1)

        success = download_emails_from_gmail(args.user, app_pass)
        if not success:
            sys.exit(1)

    # Extract activation URLs from downloaded .eml files
    extracted_map = scan_and_extract_local_mails()

    # Perform activation unless --no-activate was specified
    if not args.no_activate and extracted_map:
        perform_bulk_activation(extracted_map, concurrency=args.concurrency)

if __name__ == "__main__":
    main()
