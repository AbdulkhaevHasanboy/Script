#!/usr/bin/env python3
import os
import sys
import re
import json
import csv
import email
import socket
import imaplib
from pathlib import Path
import subprocess

socket.setdefaulttimeout(30)

GMAIL_USER = "qwertyuioplkjhgfdsazxcvbnmhrh@gmail.com"
GMAIL_APP_PASS = "lxpgpkkhxitatnut"

MAILS_DIR = Path("mails")
COURSERA_DIR = MAILS_DIR / "coursera"
NEW_CSV_PATH = Path("NEW.csv")
DB_PATH = Path("Names_db.json")

def ensure_coursera_dir(clear_old=False):
    COURSERA_DIR.mkdir(parents=True, exist_ok=True)

def extract_coursera_join_link(body):
    """Extract direct clean 'Join now' or 'Start learning' button Coursera URL."""
    anchors = re.findall(r'<a\s+[^>]*href=[\"\']([^\"\']+)[\"\'][^>]*>(.*?)</a>', body, re.DOTALL | re.IGNORECASE)
    raw_href = None
    
    # Priority 1: Anchor text containing 'join' (e.g. 'Join now')
    for href, text in anchors:
        clean_text = re.sub(r'<[^>]+>', '', text).strip().lower()
        if 'join' in clean_text:
            raw_href = href
            break
            
    # Priority 2: Anchor text containing 'start' or 'accept'
    if not raw_href:
        for href, text in anchors:
            clean_text = re.sub(r'<[^>]+>', '', text).strip().lower()
            if 'start' in clean_text or 'accept' in clean_text:
                raw_href = href
                break

    if not raw_href and anchors:
        raw_href = anchors[1][0] if len(anchors) > 1 else anchors[0][0]

    # Return direct clean URL (no google redirect wrapper)
    return raw_href if raw_href else None

def parse_coursera_eml(file_path):
    try:
        with open(file_path, "rb") as f:
            msg = email.message_from_binary_file(f)

        to_header = msg.get("To") or ""
        to_emails = re.findall(r'[\w\.-]+@[\w\.-]+', to_header)
        target_email = to_emails[0].strip().lower() if to_emails else ""

        subject = str(msg.get("Subject") or "")

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

        url = extract_coursera_join_link(body)
        return {
            "email": target_email,
            "subject": subject,
            "invitation_url": url,
            "eml_file": file_path.name
        }
    except Exception as e:
        print(f"Error parsing {file_path}: {e}")
    return None

def process_coursera_mails():
    ensure_coursera_dir(clear_old=False)
    eml_files = list(COURSERA_DIR.glob("*.eml"))
    print(f"🔍 Parsing {len(eml_files)} Coursera `.eml` files...")

    # Mapping student names & docs from NEW.csv and Names_db.json
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
        except Exception:
            pass

    records = []
    for eml_path in eml_files:
        info = parse_coursera_eml(eml_path)
        if info:
            em = info["email"]
            if not em:
                continue
            st_info = email_to_student.get(em, {})
            record = {
                "fullName": st_info.get("fullName", ""),
                "document": st_info.get("document", ""),
                "email": em,
                "subject": info["subject"],
                "invitationUrl": info["invitation_url"] or "",
                "emlFile": eml_path.name
            }
            records.append(record)

    print(f"✅ Extracted {len(records)} direct clean Coursera 'Join now' URLs.")

    # Save to mails/coursera/coursera_mails.json
    json_out = COURSERA_DIR / "coursera_mails.json"
    json_out.write_text(json.dumps(records, ensure_ascii=False, indent=2))
    print(f"💾 Updated {json_out}")

    # Save to mails/coursera/coursera_mails.js
    js_out = COURSERA_DIR / "coursera_mails.js"
    js_out.write_text(f"module.exports = {json.dumps(records, ensure_ascii=False, indent=2)};\n")
    print(f"💾 Updated {js_out}")

    return True

if __name__ == "__main__":
    process_coursera_mails()
