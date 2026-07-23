# bulk_activate.py
import json
import re
import time
import email
import imaplib
import socket
import requests
import threading
import concurrent.futures
import fcntl
import openpyxl
from pathlib import Path

# Set default socket timeout to prevent hangs
socket.setdefaulttimeout(15)

DB_PATH = Path("Names_db.json")
EXCEL_PATH = Path("Names.xlsx")
GMAIL_USER = "qwertyuioplkjhgfdsazxcvbnmhrh@gmail.com"
GMAIL_APP_PASS = "feykxtyuitmnjevn".replace(" ", "")

db_lock = threading.Lock()

def activate_url_worker(session, email_addr, url):
    try:
        resp = session.get(url, headers={
            "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36"
        }, timeout=15)
        if resp.status_code == 200:
            print(f"✅ Activated {email_addr}", flush=True)
            # Update database
            lock_path = DB_PATH.with_suffix(".json.lock")
            with db_lock:
                try:
                    with open(lock_path, "w") as lock_f:
                        fcntl.flock(lock_f, fcntl.LOCK_EX)
                        db = json.loads(DB_PATH.read_text())
                        for item in db:
                            if item.get("email") == email_addr:
                                item["activated"] = True
                                break
                        DB_PATH.write_text(json.dumps(db, ensure_ascii=False, indent=2))
                        fcntl.flock(lock_f, fcntl.LOCK_UN)
                except Exception as e:
                    print(f"Error updating DB for {email_addr}: {e}", flush=True)
            return True
        else:
            print(f"❌ Failed to activate {email_addr}: HTTP {resp.status_code}", flush=True)
            return False
    except Exception as e:
        print(f"❌ Error activating {email_addr}: {e}", flush=True)
        return False

def main():
    print("=" * 60, flush=True)
    print("AIleaders Batch Bulk Activation Tool", flush=True)
    print("=" * 60, flush=True)

    # Load database to identify pending registrations
    if not DB_PATH.exists():
        print("Database not found!", flush=True)
        return
    db = json.loads(Path(DB_PATH).read_text())
    pending_emails = {r["email"].lower() for r in db if r.get("email") and not r.get("activated")}
    print(f"Loaded {len(pending_emails)} pending registrations from DB.", flush=True)
    if not pending_emails:
        print("No pending activations found in database.", flush=True)
        return

    # 1. Connect to Gmail IMAP
    print("Connecting to Gmail IMAP...", flush=True)
    mail = imaplib.IMAP4_SSL("imap.gmail.com", timeout=15)
    mail.login(GMAIL_USER, GMAIL_APP_PASS)

    email_to_link = {}

    folders = ["INBOX", "[Gmail]/Spam"]
    for folder in folders:
        print(f"\nChecking folder: {folder}...", flush=True)
        status, _ = mail.select(f'"{folder}"', readonly=True)
        if status != "OK":
            status, _ = mail.select(folder, readonly=True)
            if status != "OK":
                continue
        
        status, data = mail.search(None, '(SINCE "19-Jul-2026" SUBJECT "Activation")')
        if status != "OK" or not data[0]:
            print(f"No messages found in {folder} today.", flush=True)
            continue
        
        msg_ids = data[0].split()
        print(f"Found {len(msg_ids)} messages in {folder}.", flush=True)
        if not msg_ids:
            continue

        # Fetch To headers of ALL messages in a single command!
        print("Fetching recipient headers in bulk...", flush=True)
        msg_id_str = b",".join(msg_ids)
        status, fetch_data = mail.fetch(msg_id_str, "(BODY[HEADER.FIELDS (TO)])")
        if status != "OK":
            print(f"Failed to fetch headers in bulk from {folder}", flush=True)
            continue

        msg_id_to_email = {}
        for item in fetch_data:
            if isinstance(item, tuple):
                try:
                    # item[0] is like b'123 (BODY[HEADER.FIELDS (TO)] {45}'
                    m_id = item[0].split()[0].decode()
                    header_text = item[1].decode(errors="ignore")
                    to_emails = re.findall(r'[\w\.-]+@[\w\.-]+', header_text)
                    if to_emails:
                        msg_id_to_email[m_id] = to_emails[0].strip().lower()
                except Exception:
                    pass

        # Filter message IDs matching our pending emails
        matching_msg_ids = []
        for m_id, email_addr in msg_id_to_email.items():
            if email_addr in pending_emails:
                matching_msg_ids.append((m_id, email_addr))

        print(f"Found {len(matching_msg_ids)} matching messages for pending students in {folder}.", flush=True)
        if not matching_msg_ids:
            continue

        # Fetch bodies in batches of 100
        batch_size = 100
        for i in range(0, len(matching_msg_ids), batch_size):
            batch = matching_msg_ids[i:i+batch_size]
            batch_ids = b",".join([item[0].encode() for item in batch])
            print(f"Fetching bodies batch {i//batch_size + 1} ({len(batch)} messages)...", flush=True)
            try:
                status, body_data = mail.fetch(batch_ids, "(RFC822)")
                if status != "OK":
                    continue
                
                # Parse bodies
                for part in body_data:
                    if isinstance(part, tuple):
                        try:
                            # part[0] contains the msg ID
                            m_id = part[0].split()[0].decode()
                            raw_email = part[1]
                            msg = email.message_from_bytes(raw_email)
                            
                            # Find recipient
                            to_header = msg.get("To") or ""
                            to_emails = re.findall(r'[\w\.-]+@[\w\.-]+', to_header)
                            if not to_emails:
                                continue
                            target_email = to_emails[0].strip().lower()
                            
                            # Extract activation URL
                            body = ""
                            if msg.is_multipart():
                                for subpart in msg.walk():
                                    content_type = subpart.get_content_type()
                                    content_disp = str(subpart.get("Content-Disposition"))
                                    if content_type == "text/html" and "attachment" not in content_disp:
                                        body = subpart.get_payload(decode=True).decode(subpart.get_content_charset() or "utf-8", errors="ignore")
                                        break
                                    elif content_type == "text/plain" and "attachment" not in content_disp:
                                        body = subpart.get_payload(decode=True).decode(subpart.get_content_charset() or "utf-8", errors="ignore")
                                        break
                            else:
                                body = msg.get_payload(decode=True).decode(msg.get_content_charset() or "utf-8", errors="ignore")
                            
                            match = re.search(r'https://aileaders.uz/auth/activate/[^\s"\'>\<\#]+', body)
                            if match:
                                activation_url = match.group(0).replace("&amp;", "&")
                                email_to_link[target_email] = activation_url
                        except Exception as e:
                            pass
            except Exception as e:
                print(f"Batch fetch error: {e}", flush=True)

    print("\nDisconnecting from Gmail.", flush=True)
    try:
        mail.close()
    except Exception:
        pass
    try:
        mail.logout()
    except Exception:
        pass

    print(f"\nSuccessfully harvested {len(email_to_link)} activation links from Gmail.", flush=True)

    pending_activations = []
    for r in db:
        if r.get("email") and not r.get("activated"):
            email_lower = r["email"].lower()
            if email_lower in email_to_link:
                pending_activations.append({
                    "email": r["email"],
                    "url": email_to_link[email_lower]
                })

    print(f"Matching pending activations in DB: {len(pending_activations)} students.", flush=True)
    if not pending_activations:
        print("No pending activations found to match links.", flush=True)
        return

    # Activate in parallel
    print("Activating accounts in parallel...", flush=True)
    session = requests.Session()
    with concurrent.futures.ThreadPoolExecutor(max_workers=25) as executor:
        futures = []
        for item in pending_activations:
            f = executor.submit(activate_url_worker, session, item["email"], item["url"])
            futures.append(f)
        
        concurrent.futures.wait(futures)

    print("\n✅ Bulk Activation Complete!", flush=True)

if __name__ == "__main__":
    main()
