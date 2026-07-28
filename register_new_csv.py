#!/usr/bin/env python3
import json
import csv
import random
import time
import requests
import threading
import concurrent.futures
import fcntl
import openpyxl
from pathlib import Path

# Paths
NEW_CSV_PATH = Path("NEW.csv")
DB_PATH = Path("Names_db.json")
USED_EMAILS_PATH = Path("used_emails.json")
EXCEL_PATH = Path("Names.xlsx")

BASE_URL = "https://aileaders.uz"
GMAIL_USER = "qwertyuioplkjhgfdsazxcvbnmhrh@gmail.com"

# Settings
CONCURRENCY = 20
TARGET_REGISTRATIONS = 1200

HEADERS = {
    "accept": "*/*",
    "accept-language": "en-US,en;q=0.9,uz;q=0.8",
    "content-type": "application/json",
    "origin": "https://aileaders.uz",
    "priority": "u=1, i",
    "referer": "https://aileaders.uz/auth/register",
    "sec-ch-ua": "\"Not;A=Brand\";v=\"8\", \"Chromium\";v=\"150\", \"Google Chrome\";v=\"150\"",
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": "\"Linux\"",
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-origin",
    "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36",
}

lock = threading.Lock()

# Load memory cache of used emails
if USED_EMAILS_PATH.exists():
    try:
        used_emails = set(json.loads(USED_EMAILS_PATH.read_text()))
    except Exception:
        used_emails = set()
else:
    used_emails = set()

base_username = GMAIL_USER.split("@")[0]

def generate_dot_alias():
    L = len(base_username)
    while True:
        parts = [base_username[0]]
        for i in range(1, L):
            if random.choice([True, False]):
                parts.append(".")
            parts.append(base_username[i])
        email_addr = "".join(parts) + "@gmail.com"
        with lock:
            if email_addr not in used_emails:
                used_emails.add(email_addr)
                return email_addr

def flush_used_emails():
    with lock:
        try:
            USED_EMAILS_PATH.write_text(json.dumps(list(used_emails), indent=2))
        except Exception as e:
            print(f"Error flushing used emails: {e}")

def first_api_call(session, document, dob):
    url = f"{BASE_URL}/api/public/info/individual"
    params = {"document": document, "dob": dob, "occupation": "student"}
    response = session.post(url, params=params, headers=HEADERS, data="")
    response.raise_for_status()
    return response.json() if response.content else {}

def second_api_call(session, email_addr, document, dob, phone):
    valid_phone = phone if (phone and phone.startswith("+998") and len(phone) == 13) else "+998995337221"
    url = f"{BASE_URL}/api/registration/form"
    payload = {
        "email": email_addr,
        "employment_type": "student",
        "metrika": None,
        "passport": {"document": document, "dob": dob},
        "password": document,
        "phone": valid_phone,
    }
    response = session.post(url, headers=HEADERS, json=payload)
    response.raise_for_status()
    return response.json()

def delete_account(session, document, dob):
    url = f"{BASE_URL}/api/profile/delete-account"
    headers = HEADERS.copy()
    headers["content-type"] = "application/x-www-form-urlencoded"
    headers["referer"] = f"{BASE_URL}/auth/delete_account"
    payload = f"document={document}&dob={dob}"
    response = session.delete(url, headers=headers, data=payload)
    response.raise_for_status()
    return response.json() if response.content else {}

# Memory buffer for results
results_buffer = {}
results_lock = threading.Lock()

def record_registration(student_id, email_addr, password):
    with results_lock:
        results_buffer[student_id] = (email_addr, password)

def flush_all_data():
    with results_lock:
        if not results_buffer:
            return
        current_results = dict(results_buffer)

    # 1. Update NEW.csv
    try:
        lock_path = NEW_CSV_PATH.with_suffix(".csv.lock")
        with open(lock_path, "w") as lock_f:
            fcntl.flock(lock_f, fcntl.LOCK_EX)
            with open(NEW_CSV_PATH, "r", encoding="utf-8") as f:
                reader = csv.reader(f)
                rows = list(reader)

            updated_count = 0
            for row in rows[1:]:
                if len(row) > 0 and row[0] in current_results:
                    email_addr, password = current_results[row[0]]
                    while len(row) < 13:
                        row.append("")
                    row[10] = email_addr  # Column K: email
                    row[11] = password    # Column L: password
                    updated_count += 1

            with open(NEW_CSV_PATH, "w", encoding="utf-8", newline="") as f:
                writer = csv.writer(f)
                writer.writerows(rows)
            fcntl.flock(lock_f, fcntl.LOCK_UN)
            print(f"💾 Flushed {updated_count} updates to NEW.csv")
    except Exception as e:
        print(f"⚠️ Error flushing NEW.csv: {e}")

    # 2. Update Names_db.json
    try:
        if DB_PATH.exists():
            lock_path = DB_PATH.with_suffix(".json.lock")
            with open(lock_path, "w") as lock_f:
                fcntl.flock(lock_f, fcntl.LOCK_EX)
                db = json.loads(DB_PATH.read_text())
                for item in db:
                    doc = item.get("document")
                    if doc in current_results:
                        item["email"] = current_results[doc][0]
                        item["activated"] = False
                DB_PATH.write_text(json.dumps(db, ensure_ascii=False, indent=2))
                fcntl.flock(lock_f, fcntl.LOCK_UN)
                print(f"💾 Flushed updates to Names_db.json")
    except Exception as e:
        print(f"⚠️ Error flushing Names_db.json: {e}")

    # 3. Update used_emails.json
    flush_used_emails()

success_counter = 0
counter_lock = threading.Lock()

def register_worker(worker_id, row_index, student_id, full_name, dob, phone):
    global success_counter
    session = requests.Session()

    attempts = 0
    max_attempts = 3
    success = False

    while attempts < max_attempts and not success:
        attempts += 1
        email_addr = generate_dot_alias()

        try:
            # 1. Info check
            first_api_call(session, student_id, dob)
            time.sleep(0.05)

            # 2. Registration form
            resp = second_api_call(session, email_addr, student_id, dob, phone)
            res_code = resp.get("result", {}).get("code")

            if res_code != "ok":
                if res_code == "passport_is_already_in_use":
                    try:
                        delete_account(session, student_id, dob)
                    except Exception:
                        pass
                    time.sleep(0.05)
                    continue
                elif "email" in str(res_code):
                    continue
                else:
                    print(f"❌ [Worker {worker_id}] Student {student_id} ({full_name}) rejected: {res_code}")
                    break

            # 3. Authorization login to get JWT token
            login_resp = session.post(f"{BASE_URL}/api/authorization/login", headers={
                **HEADERS,
                "referer": f"{BASE_URL}/auth/login",
            }, json={
                "login": email_addr,
                "password": student_id
            })
            login_resp.raise_for_status()
            token = login_resp.json().get("content", {}).get("token")

            if not token:
                continue

            # 4. Trigger email verify endpoint (dispatches email to Gmail inbox)
            verify_resp = session.post(f"{BASE_URL}/api/profile/verify-email?email={email_addr}", headers={
                **HEADERS,
                "Authorization": f"Bearer {token}"
            })
            verify_resp.raise_for_status()

            # Record success in memory buffer
            record_registration(student_id, email_addr, student_id)
            success = True

            with counter_lock:
                success_counter += 1
                curr = success_counter

            print(f"✅ [{curr}/{TARGET_REGISTRATIONS}] Registered {student_id} ({full_name[:20]}) -> {email_addr}")

            # Periodic flush every 50 registrations
            if curr % 50 == 0:
                flush_all_data()

        except Exception as e:
            time.sleep(0.1)

def main():
    print("=" * 70)
    print(f"🚀 AI Leaders Bulk Registration Script (Target: {TARGET_REGISTRATIONS})")
    print(f"⚡ Concurrency: {CONCURRENCY} worker threads")
    print("=" * 70)

    # 1. Load NEW.csv and Names_db.json
    if not NEW_CSV_PATH.exists() or not DB_PATH.exists():
        print("❌ Error: NEW.csv or Names_db.json not found!")
        return

    with open(NEW_CSV_PATH, "r", encoding="utf-8") as f:
        csv_rows = list(csv.DictReader(f))

    db_entries = json.loads(DB_PATH.read_text())
    db_map = {item["document"]: item for item in db_entries if "document" in item}

    # 2. Collect pending students (email is empty in NEW.csv)
    pending_queue = []
    for idx, row in enumerate(csv_rows):
        email_val = (row.get("email") or "").strip()
        if not email_val:
            student_id = row["student_id"]
            db_info = db_map.get(student_id)
            if db_info and db_info.get("dob"):
                pending_queue.append({
                    "row_index": idx + 2,
                    "student_id": student_id,
                    "full_name": row.get("full_name", ""),
                    "dob": db_info["dob"],
                    "phone": db_info.get("phone", "+998995337221")
                })

    print(f"📊 Total pending (unregistered) students in NEW.csv: {len(pending_queue)}")

    # Slice first TARGET_REGISTRATIONS
    target_queue = pending_queue[:TARGET_REGISTRATIONS]
    print(f"🎯 Queued target for this run: {len(target_queue)} students\n")

    start_time = time.time()

    # 3. Threaded Execution
    with concurrent.futures.ThreadPoolExecutor(max_workers=CONCURRENCY) as executor:
        futures = []
        for i, item in enumerate(target_queue):
            w_id = (i % CONCURRENCY) + 1
            f = executor.submit(register_worker, w_id, item["row_index"], item["student_id"], item["full_name"], item["dob"], item["phone"])
            futures.append(f)

        for future in concurrent.futures.as_completed(futures):
            try:
                future.result()
            except Exception as e:
                pass

    print("\nFinalizing file save...")
    flush_all_data()

    elapsed = time.time() - start_time
    print("\n" + "=" * 70)
    print(f"🎉 Batch registration finished in {elapsed:.2f} seconds!")
    print(f"✅ Total successfully registered in this run: {success_counter}")
    print("=" * 70)

if __name__ == "__main__":
    main()

