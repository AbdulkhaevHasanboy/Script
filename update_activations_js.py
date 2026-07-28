#!/usr/bin/env python3
import os
import sys
import re
import json
import csv
import email
from pathlib import Path
import subprocess

MAILS_DIR = Path("mails")
DB_PATH = Path("Names_db.json")
NEW_CSV_PATH = Path("NEW.csv")
EXTRACTED_JSON_PATH = Path("extracted_activations.json")
ACTIVATIONS_JSON_PATH = MAILS_DIR / "activations.json"
ACTIVATIONS_JS_PATH = MAILS_DIR / "activations.js"

def extract_url_from_body(body):
    match = re.search(r'https://aileaders\.uz/auth/activate/[^\s"\'>\<\#]+', body)
    if match:
        url = match.group(0).replace("&amp;", "&")
        token_match = re.search(r'[?&]token=([a-f0-9]+)', url)
        token = token_match.group(1) if token_match else None
        return url, token
    return None, None

def parse_eml_file(file_path):
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
                "eml_file": file_path.name
            }
    except Exception as e:
        print(f"Error parsing {file_path}: {e}")
    return None

def main():
    print("📥 1. Running download_and_extract_mails.py to download latest emails...")
    res = subprocess.run([sys.executable, "download_and_extract_mails.py", "--no-activate"])

    print("\n🔍 2. Mapping downloaded emails to student database records...")

    # Load mapping from NEW.csv and Names_db.json
    email_to_student = {}

    if NEW_CSV_PATH.exists():
        with open(NEW_CSV_PATH, encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                em = (row.get("email") or "").strip().lower()
                if em:
                    email_to_student[em] = {
                        "fullName": (row.get("full_name") or "").strip(),
                        "document": (row.get("student_id") or "").strip()
                    }

    if DB_PATH.exists():
        try:
            db_entries = json.loads(DB_PATH.read_text())
            for item in db_entries:
                em = (item.get("email") or "").strip().lower()
                doc = (item.get("document") or "").strip()
                name = (item.get("full_name") or "").strip()
                if em and em not in email_to_student:
                    email_to_student[em] = {
                        "fullName": name,
                        "document": doc
                    }
        except Exception as e:
            print(f"Error reading Names_db.json: {e}")

    # Parse all .eml files in mails/
    records = []
    seen_keys = set()

    for eml_file in MAILS_DIR.glob("*.eml"):
        info = parse_eml_file(eml_file)
        if info:
            em = info["email"]
            token = info["token"]
            dedup_key = (em, token)
            if dedup_key in seen_keys:
                continue
            seen_keys.add(dedup_key)

            st_info = email_to_student.get(em, {})
            record = {
                "fullName": st_info.get("fullName", ""),
                "document": st_info.get("document", ""),
                "email": em,
                "activationKey": token or "",
                "activationUrl": info["activation_url"],
                "emlFile": info["eml_file"]
            }
            records.append(record)

    print(f"✅ Found {len(records)} activation email records.")

    # Write mails/activations.json
    ACTIVATIONS_JSON_PATH.write_text(json.dumps(records, ensure_ascii=False, indent=2))
    print(f"💾 Updated {ACTIVATIONS_JSON_PATH}")

    # Write mails/activations.js
    js_content = f"module.exports = {json.dumps(records, ensure_ascii=False, indent=2)};\n"
    ACTIVATIONS_JS_PATH.write_text(js_content)
    print(f"💾 Updated {ACTIVATIONS_JS_PATH}")

    # Also update extracted_activations.json
    extracted_records = [
        {
            "email": r["email"],
            "activation_url": r["activationUrl"],
            "token": r["activationKey"],
            "eml_file": str(MAILS_DIR / r["emlFile"])
        }
        for r in records
    ]
    EXTRACTED_JSON_PATH.write_text(json.dumps(extracted_records, ensure_ascii=False, indent=2))
    print(f"💾 Updated {EXTRACTED_JSON_PATH}")

if __name__ == "__main__":
    main()
