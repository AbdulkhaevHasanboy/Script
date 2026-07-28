#!/usr/bin/env python3
import json
import csv
import requests
import concurrent.futures
import fcntl
import openpyxl
from pathlib import Path

MAILS_JS_PATH = Path("mails/activations.js")
MAILS_JSON_PATH = Path("mails/activations.json")
NEW_CSV_PATH = Path("NEW.csv")
DB_PATH = Path("Names_db.json")
EXCEL_PATH = Path("Names.xlsx")

CONCURRENCY = 25

def load_activations():
    if MAILS_JSON_PATH.exists():
        try:
            return json.loads(MAILS_JSON_PATH.read_text())
        except Exception:
            pass
    if MAILS_JS_PATH.exists():
        try:
            content = MAILS_JS_PATH.read_text().replace("module.exports =", "").strip().rstrip(";")
            return json.loads(content)
        except Exception:
            pass
    return []

def activate_account(session, record):
    url = record.get("activationUrl")
    email_addr = record.get("email")
    if not url:
        return False, email_addr, "No URL"
    try:
        resp = session.get(url, headers={
            "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36"
        }, timeout=15)
        if resp.status_code == 200:
            return True, email_addr, None
        return False, email_addr, f"HTTP {resp.status_code}"
    except Exception as e:
        return False, email_addr, str(e)

def main():
    records = load_activations()
    if not records:
        print("❌ No activation records found.")
        return

    print(f"🚀 Starting mass activation for {len(records)} accounts on AI Leaders...")
    session = requests.Session()
    success_count = 0
    activated_emails = set()

    with concurrent.futures.ThreadPoolExecutor(max_workers=CONCURRENCY) as executor:
        futures = {executor.submit(activate_account, session, r): r for r in records}
        for f in concurrent.futures.as_completed(futures):
            ok, em, err = f.result()
            if ok:
                success_count += 1
                if em:
                    activated_emails.add(em.strip().lower())
            else:
                print(f"⚠️ Activation failed for {em}: {err}")

    print(f"\n🎉 Successfully activated {success_count} / {len(records)} accounts on aileaders.uz!")

    # Flush activated status to Names_db.json
    if DB_PATH.exists() and activated_emails:
        try:
            db = json.loads(DB_PATH.read_text())
            updated_db = 0
            for item in db:
                em = (item.get("email") or "").strip().lower()
                if em in activated_emails:
                    item["activated"] = True
                    updated_db += 1
            DB_PATH.write_text(json.dumps(db, ensure_ascii=False, indent=2))
            print(f"💾 Updated {updated_db} records in Names_db.json with activated=True.")
        except Exception as e:
            print(f"Error updating Names_db.json: {e}")

if __name__ == "__main__":
    main()
