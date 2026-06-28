# Distributed (multi-PC) mode — setup

Run the Coursera runner on many PCs at once with **no manual number-juggling and
no duplicates**. A free Google Sheet + Apps Script web app acts as a shared work
queue. Each PC automatically claims the next student, and if a PC crashes or a
student fails, another PC picks it up later. The Sheet is your live dashboard.

## How it works

- Each PC, instead of using `START`/`END`, asks the coordinator for the **next
  available student** (`claim`). The claim is atomic (`LockService`), so two PCs
  never get the same one.
- While working, the PC sends a **heartbeat** to keep a time-limited **lease**.
- On success it reports **complete** (and stores the generated
  email/password/certificate URL in the Sheet).
- On failure it reports **fail** (records *when* and *why*). The student becomes
  claimable again and another PC **redoes it from scratch** (fresh signup), up to
  `MAX_ATTEMPTS` times.
- If a PC dies without reporting, its lease expires after `LEASE_MINUTES` and the
  student is automatically reclaimed. Nothing gets stuck.

You never assign ranges. Start as many PCs as you want; they share the one queue.

## One-time setup (~5 minutes)

1. **Create the Sheet.** Make a new Google Sheet. Rename the first tab to
   `Queue` (must match `QUEUE_SHEET` in `Code.gs`).

2. **Seed the students.** On any machine with `names.xlsx`:
   ```bash
   pip install openpyxl
   # Pre-mark everyone who already finished (matched by name to your Google
   # Form responses sheet) as "done" so the PCs never redo them:
   python3 make_queue_seed.py --done "https://docs.google.com/spreadsheets/d/<RESPONSES_ID>/edit"
   # ...or, if nobody is done yet, just:  python3 make_queue_seed.py
   ```
   This writes `queue_seed.csv` with the full column layout (status already
   filled: `done` for completed people, `pending` for the rest).
   In the Sheet: click cell **A1** → **File → Import → Upload** `queue_seed.csv`
   → **Import location: "Replace data at selected cell"**.

3. **Add the script.** In the Sheet: **Extensions → Apps Script**. Delete the
   placeholder, paste the entire contents of [`Code.gs`](./Code.gs), and **Save**.

4. **Initialize the queue.** Because the seed already has the `status` column,
   you can **skip this step**. (If you seeded only `student_id`+`full_name`, run
   `initQueue` once from the Apps Script editor — it only fills blank statuses
   and never overwrites `done` rows.)

5. **Deploy as a web app.** **Deploy → New deployment → type: Web app**.
   - *Execute as*: **Me**
   - *Who has access*: **Anyone**
   - Click **Deploy**, authorize, and **copy the Web app URL** (it ends in
     `/exec`). That URL is your `COORDINATOR_URL`.

   Quick test: open the URL in a browser — you should see JSON like
   `{"counts":{"pending":13256,...}}`.

## Run it on each PC

Set `COORDINATOR_URL` and run. The runner switches to queue mode automatically
when that variable is present (it ignores `START`/`END` and never touches
`students.csv`).

**Locally:**
```bash
COORDINATOR_URL="https://script.google.com/macros/s/XXXX/exec" \
HEADLESS=y CONCURRENCY=1 node coursera_manual_runner.js
```

**On Colab (via bootstrap.py):** set `COORDINATOR_URL` near the top of
`bootstrap.py` (the edit-these block) and run the cell. Repeat on every Colab
session / PC — they coordinate through the same Sheet.

### Optional knobs
- `PC_ID` — friendly name for this PC in the Sheet's `owner` column (defaults to
  `hostname-pid-rand`).
- `CONCURRENCY` — browsers in parallel **per PC** (default 1).
- `HEARTBEAT_SEC` — lease-renew interval (default 180; keep it well under
  `LEASE_MINUTES`).
- `COORDINATOR_TOKEN` — only if you set a non-empty `TOKEN` in `Code.gs`; both
  must match.

## Watching progress / failures

Open the Sheet. Each row shows live `status`, which PC (`owner`), `attempts`,
`claimed_at`, `finished_at`, `last_error`, and on success the `email`,
`password`, and `certificate_url`. Filter `status = failed` to see what failed
and when; filter `status = done` for finished certificates.

`GET <COORDINATOR_URL>?action=stats` returns counts at any time.

## Tuning (top of `Code.gs`)
- `LEASE_MINUTES` (25) — make it longer than the slowest single-student run.
- `MAX_ATTEMPTS` (4) — how many times a failing student is retried before it's
  left as `failed`.
- `TOKEN` ("") — set a shared secret to lock down the endpoint.

After changing `Code.gs`, **Deploy → Manage deployments → Edit → Version: New →
Deploy** to publish (the `/exec` URL stays the same).
