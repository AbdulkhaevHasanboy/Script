#!/usr/bin/env python3
import sys
import json
import time
import re
import imaplib
import email
import random
import csv
import requests
from pathlib import Path

DB_PATH = Path("Names_db.json")
USED_EMAILS_PATH = Path("used_emails.json")
BASE_URL = "https://aileaders.uz"
GMAIL_USER = "qwertyuioplkjhgfdsazxcvbnmhrh@gmail.com"
GMAIL_APP_PASS = "feykxtyuitmnjevn"

HEADERS = {
    "accept": "*/*",
    "accept-language": "en-US,en;q=0.9,uz;q=0.8",
    "content-type": "application/json",
    "origin": "https://aileaders.uz",
    "referer": "https://aileaders.uz/auth/register",
    "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36",
}

def load_used_emails():
    if USED_EMAILS_PATH.exists():
        try:
            return set(json.loads(USED_EMAILS_PATH.read_text()))
        except Exception:
            return set()
    return set()

def save_used_email(email_addr):
    try:
        if USED_EMAILS_PATH.exists():
            used = set(json.loads(USED_EMAILS_PATH.read_text()))
        else:
            used = set()
        used.add(email_addr)
        USED_EMAILS_PATH.write_text(json.dumps(list(used), indent=2))
    except Exception as e:
        print(f"-> Warning saving used email: {e}", file=sys.stderr)

def generate_dot_alias(base_username, used_emails):
    L = len(base_username)
    while True:
        parts = [base_username[0]]
        for i in range(1, L):
            if random.choice([True, False]):
                parts.append(".")
            parts.append(base_username[i])
        email_addr = "".join(parts) + "@gmail.com"
        if email_addr not in used_emails:
            return email_addr

def resolve_redirect(url):
    if "google.com/url?" in url:
        m = re.search(r'[?&]q=(https?://[^&]+)', url)
        if m:
            url = urllib.parse.unquote(m.group(1))
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    try:
        response = requests.get(url, allow_redirects=True, headers=headers, timeout=10, stream=True)
        return response.url
    except Exception:
        return url

def get_connected_imap():
    mail = imaplib.IMAP4_SSL("imap.gmail.com")
    mail.login(GMAIL_USER, GMAIL_APP_PASS)
    return mail

def poll_gmail_for_activation(email_addr, timeout=120):
    norm_target = email_addr.replace(".", "").lower()
    start_time = time.time()
    mail = None
    
    while time.time() - start_time < timeout:
        try:
            if not mail:
                mail = get_connected_imap()
            
            for folder in ['"[Gmail]/Spam"', 'INBOX', '"[Gmail]/All Mail"']:
                try:
                    status, _ = mail.select(folder, readonly=False)
                    if status != "OK":
                        continue
                    status, data = mail.search(None, "ALL")
                    if status != "OK" or not data[0]:
                        continue
                    
                    msg_ids = data[0].split()
                    latest_ids = msg_ids[-100:]
                    
                    for msg_id in reversed(latest_ids):
                        _, mdata = mail.fetch(msg_id, "(BODY.PEEK[HEADER.FIELDS (TO SUBJECT)])")
                        if not mdata or not mdata[0] or not isinstance(mdata[0], tuple):
                            continue
                        header_text = mdata[0][1].decode("utf-8", errors="ignore")
                        msg = email.message_from_string(header_text)
                        
                        subj = (msg.get("Subject") or "").lower()
                        to_hdr = (msg.get("To") or "").lower().replace(".", "")
                        
                        if norm_target in to_hdr:
                            if "activation" in subj or "activate" in subj or "link" in subj or "verify" in subj:
                                _, full_data = mail.fetch(msg_id, "(RFC822)")
                                full_msg = email.message_from_bytes(full_data[0][1])
                                body = ""
                                if full_msg.is_multipart():
                                    for part in full_msg.walk():
                                        if part.get_content_type() == "text/html":
                                            body = part.get_payload(decode=True).decode(part.get_content_charset() or "utf-8", errors="ignore")
                                            break
                                else:
                                    body = full_msg.get_payload(decode=True).decode(full_msg.get_content_charset() or "utf-8", errors="ignore")
                                
                                match = re.search(r'https://aileaders\.uz/auth/activate/[^\s"\'>\<\#]+', body)
                                if match:
                                    # Immediately delete activation email from mailbox
                                    try:
                                        mail.store(msg_id, '+FLAGS', '\\Deleted')
                                        mail.expunge()
                                        print("-> Activation email deleted from mailbox.", file=sys.stderr)
                                    except Exception:
                                        pass
                                    mail.logout()
                                    return match.group(0).replace("&amp;", "&")
                except Exception:
                    pass
        except Exception:
            mail = None
        time.sleep(2)
        
    if mail:
        try: mail.logout()
        except Exception: pass
    return None

def poll_gmail_for_coursera_invite(email_addr, timeout=120):
    norm_target = email_addr.replace(".", "").lower()
    start_time = time.time()
    mail = None
    
    while time.time() - start_time < timeout:
        try:
            if not mail:
                mail = get_connected_imap()
            
            for folder in ['"[Gmail]/Spam"', 'INBOX', '"[Gmail]/All Mail"']:
                try:
                    status, _ = mail.select(folder, readonly=False)
                    if status != "OK":
                        continue
                    status, data = mail.search(None, "ALL")
                    if status != "OK" or not data[0]:
                        continue
                    
                    msg_ids = data[0].split()
                    latest_ids = msg_ids[-100:]
                    
                    for msg_id in reversed(latest_ids):
                        _, mdata = mail.fetch(msg_id, "(BODY.PEEK[HEADER.FIELDS (TO SUBJECT FROM)])")
                        if not mdata or not mdata[0] or not isinstance(mdata[0], tuple):
                            continue
                        header_text = mdata[0][1].decode("utf-8", errors="ignore")
                        msg = email.message_from_string(header_text)
                        
                        to_hdr = (msg.get("To") or "").lower().replace(".", "")
                        subj = (msg.get("Subject") or "").lower()
                        from_hdr = (msg.get("From") or "").lower()
                        
                        if norm_target in to_hdr:
                            if "coursera" in subj or "coursera" in from_hdr or "invite" in subj or "learn" in subj or "program" in subj:
                                _, full_data = mail.fetch(msg_id, "(RFC822)")
                                full_msg = email.message_from_bytes(full_data[0][1])
                                body = ""
                                if full_msg.is_multipart():
                                    for part in full_msg.walk():
                                        if part.get_content_type() == "text/html":
                                            body = part.get_payload(decode=True).decode(part.get_content_charset() or "utf-8", errors="ignore")
                                            break
                                else:
                                    body = full_msg.get_payload(decode=True).decode(full_msg.get_content_charset() or "utf-8", errors="ignore")
                                
                                all_matches = re.findall(r'https?://[^\s\"\'\>]+', body)
                                for raw_url in all_matches:
                                    clean_url = "".join(raw_url.split()).replace("&amp;", "&").rstrip(".,;!?'\"<>#")
                                    if "google.com/url?" in clean_url:
                                        m = re.search(r'[?&]q=(https?://[^&]+)', clean_url)
                                        if m:
                                            clean_url = urllib.parse.unquote(m.group(1))
                                    if "invitationToken=" in clean_url:
                                        try:
                                            mail.store(msg_id, '+FLAGS', '\\Deleted')
                                            mail.expunge()
                                            print("-> Coursera invite email deleted from mailbox.", file=sys.stderr)
                                        except Exception:
                                            pass
                                        mail.logout()
                                        return clean_url
                                    if "link.coursera.org" in clean_url:
                                        try:
                                            resolved = resolve_redirect(clean_url)
                                            if "invitationToken=" in resolved:
                                                try:
                                                    mail.store(msg_id, '+FLAGS', '\\Deleted')
                                                    mail.expunge()
                                                    print("-> Coursera invite email deleted from mailbox.", file=sys.stderr)
                                                except Exception:
                                                    pass
                                                mail.logout()
                                                return resolved
                                        except Exception:
                                            pass
                except Exception:
                    pass
        except Exception:
            mail = None
        time.sleep(2)
        
    if mail:
        try: mail.logout()
        except Exception: pass
    return None

def purge_all_student_emails(email_addr):
    if not email_addr:
        return
    norm_target = email_addr.replace(".", "").lower()
    try:
        mail = get_connected_imap()
        folders = ['"[Gmail]/Spam"', 'INBOX', '"[Gmail]/All Mail"']
        for folder in folders:
            try:
                status, _ = mail.select(folder, readonly=False)
                if status != "OK":
                    continue
                status, data = mail.search(None, "ALL")
                if status != "OK" or not data[0]:
                    continue
                
                msg_ids = data[0].split()
                for mid in msg_ids:
                    _, mdata = mail.fetch(mid, "(BODY.PEEK[HEADER.FIELDS (TO)])")
                    if mdata and mdata[0] and isinstance(mdata[0], tuple):
                        hdr = mdata[0][1].decode("utf-8", errors="ignore")
                        msg = email.message_from_string(hdr)
                        to_hdr = msg.get("To") or ""
                        matches = re.findall(r"[\w\.-]+@[\w\.-]+", to_hdr)
                        if matches and matches[0].replace(".", "").lower() == norm_target:
                            try:
                                mail.copy(mid, '"[Gmail]/Trash"')
                            except Exception:
                                pass
                            mail.store(mid, "+FLAGS", "\\Deleted")
                mail.expunge()
            except Exception:
                pass
        try:
            mail.select('"[Gmail]/Trash"', readonly=False)
            status, data = mail.search(None, "ALL")
            if data[0]:
                for mid in data[0].split():
                    mail.store(mid, "+FLAGS", "\\Deleted")
                mail.expunge()
        except Exception:
            pass
        mail.logout()
        print(f"-> All emails for alias {email_addr} purged from Spam, Inbox, and Trash.", file=sys.stderr)
    except Exception as e:
        print(f"-> Warning purging emails for {email_addr}: {e}", file=sys.stderr)

def update_db(document, email_addr, invite_url):
    try:
        db = json.loads(DB_PATH.read_text())
        for entry in db:
            if entry.get("document") == document:
                entry["email"] = email_addr
                entry["invite_url"] = invite_url
                entry["activated"] = True
                break
        DB_PATH.write_text(json.dumps(db, ensure_ascii=False, indent=2))
        print(f"-> Database Names_db.json updated for {document}.", file=sys.stderr)
    except Exception as e:
        print(f"-> Error updating database: {e}", file=sys.stderr)

def update_students_csv(document, email_addr, invite_url):
    CSV_PATH = Path("students.csv")
    if not CSV_PATH.exists():
        return
    try:
        students = []
        headers = []
        with open(CSV_PATH, "r", newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            headers = reader.fieldnames
            students = list(reader)
        
        for s in students:
            if s.get("student_id") == document or s.get("password") == document:
                s["email"] = email_addr
                s["invite_url"] = invite_url
                break
        
        with open(CSV_PATH, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=headers)
            writer.writeheader()
            writer.writerows(students)
        print(f"-> CSV students.csv updated for {document}.", file=sys.stderr)
    except Exception as e:
        print(f"-> Error updating CSV: {e}", file=sys.stderr)

def main():
    if len(sys.argv) < 2:
        print("Usage: python3 register_and_get_invite.py <student_passport>", file=sys.stderr)
        sys.exit(1)
        
    document = sys.argv[1].strip()
    
    if not DB_PATH.exists():
        print(f"Error: {DB_PATH} not found.", file=sys.stderr)
        sys.exit(1)
        
    db = json.loads(DB_PATH.read_text())
    student = None
    for entry in db:
        if entry.get("document") == document:
            student = entry
            break
            
    if not student:
        print(f"Error: Passport {document} not found in database.", file=sys.stderr)
        sys.exit(1)
        
    dob = student.get("dob")
    phone = student.get("phone") or "+998995337221"
    
    session = requests.Session()
    try:
        session.get(BASE_URL, headers={"User-Agent": HEADERS["user-agent"]})
    except Exception as e:
        print(f"Warning: WAF fetch failed: {e}", file=sys.stderr)
        
    used_emails = load_used_emails()
    base_username = GMAIL_USER.split("@")[0]
    
    success = False
    attempts = 0
    max_attempts = 5
    invite_url = None
    email_used = None
    
    # Delete existing account first to start fresh and clean
    print(f"-> Deleting existing aileaders account for {document} before registration...", file=sys.stderr)
    try:
        del_headers = HEADERS.copy()
        del_headers["content-type"] = "application/x-www-form-urlencoded"
        del_headers["referer"] = f"{BASE_URL}/auth/delete_account"
        session.delete(f"{BASE_URL}/api/profile/delete-account", headers=del_headers, data=f"document={document}&dob={dob}")
        time.sleep(5)
    except Exception as e:
        print(f"-> Account delete warning: {e}", file=sys.stderr)

    while attempts < max_attempts and not success:
        attempts += 1
        email_used = generate_dot_alias(base_username, used_emails)
        used_emails.add(email_used)
        print(f"-> Attempt {attempts}/{max_attempts}: registering with alias {email_used}", file=sys.stderr)
        
        try:
            # First API call
            params = {"document": document, "dob": dob, "occupation": "student"}
            session.post(f"{BASE_URL}/api/public/info/individual", params=params, headers=HEADERS, data="")
            time.sleep(0.2)
            
            # Second API call
            payload = {
                "email": email_used,
                "employment_type": "student",
                "metrika": None,
                "passport": {"document": document, "dob": dob},
                "password": document,
                "phone": "+998995337221",
            }
            resp2 = session.post(f"{BASE_URL}/api/registration/form", headers=HEADERS, json=payload)
            resp2_data = resp2.json()
            res_code = resp2_data.get("result", {}).get("code")
            
            if res_code != "ok":
                if res_code == "passport_is_already_in_use":
                    print("-> Account already exists. Deleting it to refresh...", file=sys.stderr)
                    del_headers = HEADERS.copy()
                    del_headers["content-type"] = "application/x-www-form-urlencoded"
                    del_headers["referer"] = f"{BASE_URL}/auth/delete_account"
                    session.delete(f"{BASE_URL}/api/profile/delete-account", headers=del_headers, data=f"document={document}&dob={dob}")
                    time.sleep(5)
                    continue
                elif "email" in str(res_code):
                    print("-> Email already in use, generating a new one...", file=sys.stderr)
                    continue
                else:
                    raise Exception(f"Registration rejected: {res_code}")
                    
            # Login
            login_resp = session.post(f"{BASE_URL}/api/authorization/login", headers={
                **HEADERS,
                "referer": f"{BASE_URL}/auth/login",
            }, json={
                "login": email_used,
                "password": document
            })
            login_data = login_resp.json()
            token = login_data.get("content", {}).get("token")
            if not token:
                print("-> Failed to obtain login token, retrying...", file=sys.stderr)
                continue
                
            # Trigger verification email
            session.post(f"{BASE_URL}/api/profile/verify-email?email={email_used}", headers={
                **HEADERS,
                "Authorization": f"Bearer {token}"
            })
            
            # Poll for activation email
            print("-> Polling for activation email...", file=sys.stderr)
            activation_url = poll_gmail_for_activation(email_used)
            if not activation_url:
                print("-> Timeout waiting for activation email.", file=sys.stderr)
                continue
                
            # Activate account
            act_resp = session.get(activation_url, headers={"user-agent": HEADERS["user-agent"]})
            if act_resp.status_code != 200:
                print(f"-> Activation failed with HTTP {act_resp.status_code}", file=sys.stderr)
                continue
                
            print("-> Account activated successfully! Waiting for Coursera invite...", file=sys.stderr)
            save_used_email(email_used)
            
            # Poll for Coursera invite link
            invite_url = poll_gmail_for_coursera_invite(email_used)
            if not invite_url:
                print("-> Timeout waiting for Coursera invite email.", file=sys.stderr)
                continue
                
            success = True
            break
        except Exception as e:
            print(f"-> Attempt {attempts} error: {e}", file=sys.stderr)
            time.sleep(2)
            
    if success and invite_url:
        print(f"SUCCESS_INVITE_URL: {invite_url}", file=sys.stderr)
        # Output ONLY the invite URL and the email to stdout so JavaScript can parse it!
        print(f"{invite_url} {email_used}")
        update_db(document, email_used, invite_url)
        update_students_csv(document, email_used, invite_url)
        purge_all_student_emails(email_used)
        sys.exit(0)
    else:
        print("FAIL: Could not register/extract invite URL", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
