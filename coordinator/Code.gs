/**
 * Coursera runner — distributed work queue (Google Apps Script web app).
 *
 * Backs a single Google Sheet that acts as a shared job queue so 1..N PCs can
 * process students with NO manual number-juggling and no duplicates:
 *
 *   - claim     : atomically hand the caller the next available student and put
 *                 it "in-progress" under a time-limited lease. LockService makes
 *                 this safe even with many PCs hitting it at once.
 *   - heartbeat : extend the lease while a (multi-minute) student is running.
 *   - complete  : mark done + store the generated email/password/certificate.
 *   - fail      : mark failed (records when + why); the student becomes
 *                 claimable again so another PC redoes it (up to MAX_ATTEMPTS).
 *   - stats     : counts per status (used as a health check + dashboard).
 *
 * A student is "claimable" when it is pending, OR in-progress with an EXPIRED
 * lease (its PC crashed), OR failed with attempts < MAX_ATTEMPTS. That gives you
 * crash-safety for free: a dead PC's work is auto-reclaimed after LEASE_MINUTES.
 *
 * SHEET LAYOUT (sheet name in QUEUE_SHEET, header row 1):
 *   A student_id | B full_name | C status | D owner | E attempts | F claimed_at
 *   G lease_expires | H finished_at | I last_error | J email | K password
 *   L certificate_url
 * Seed it with just columns A (student_id) and B (full_name); the rest is
 * managed here. An empty status counts as "pending".
 */

// ----------------------------- CONFIG -----------------------------
var QUEUE_SHEET = "Queue";   // tab name holding the student rows
var LEASE_MINUTES = 25;      // a claim is valid this long without a heartbeat
var MAX_ATTEMPTS = 4;        // give up on a student after this many failed tries
var TOKEN = "";              // optional shared secret; "" = no auth. If set, the
                             // runner must send the same COORDINATOR_TOKEN.
// Column indexes (1-based) — keep in sync with the layout above.
var COL = {
  ID: 1, NAME: 2, STATUS: 3, OWNER: 4, ATTEMPTS: 5, CLAIMED_AT: 6,
  LEASE: 7, FINISHED_AT: 8, ERROR: 9, EMAIL: 10, PASSWORD: 11, CERT: 12,
};
var LAST_COL = COL.CERT;
// ------------------------------------------------------------------

function doGet(e) {
  // Convenience: GET ?action=stats so you can sanity-check in a browser.
  var action = (e && e.parameter && e.parameter.action) || "stats";
  if (action === "stats") return _json(_stats());
  return _json({ error: "use POST for claim/complete/fail/heartbeat" });
}

function doPost(e) {
  var req;
  try {
    req = JSON.parse((e && e.postData && e.postData.contents) || "{}");
  } catch (err) {
    return _json({ error: "bad JSON body" });
  }

  if (TOKEN && req.token !== TOKEN) return _json({ error: "unauthorized" });

  var action = req.action;
  try {
    switch (action) {
      case "claim":     return _json(_claim(req));
      case "heartbeat": return _json(_heartbeat(req));
      case "complete":  return _json(_complete(req));
      case "fail":      return _json(_fail(req));
      case "stats":     return _json(_stats());
      default:          return _json({ error: "unknown action: " + action });
    }
  } catch (err) {
    return _json({ error: String(err && err.message || err) });
  }
}

function _sheet() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(QUEUE_SHEET);
  if (!sh) throw new Error("Sheet tab '" + QUEUE_SHEET + "' not found");
  return sh;
}

// Atomically grab the next claimable student. Serialized by a script lock so two
// concurrent PCs can never pick the same row.
function _claim(req) {
  var pc = req.pc || "unknown";
  var lock = LockService.getScriptLock();
  lock.waitLock(25000); // wait up to 25s for our turn, else throw -> client retries
  try {
    var sh = _sheet();
    var n = sh.getLastRow() - 1; // data rows (excluding header)
    if (n < 1) return { done: true };

    var now = Date.now();
    // Read only the decision columns (status..lease) for a fast scan.
    var meta = sh.getRange(2, COL.STATUS, n, COL.LEASE - COL.STATUS + 1).getValues();
    var pick = -1;
    var anyActive = false;
    for (var i = 0; i < n; i++) {
      var status = String(meta[i][0] || "").toLowerCase();       // C
      var attempts = Number(meta[i][COL.ATTEMPTS - COL.STATUS]) || 0; // E
      var lease = Number(meta[i][COL.LEASE - COL.STATUS]) || 0;       // G

      if (status === "" || status === "pending") { pick = i; break; }
      if (status === "in-progress") {
        if (lease && lease < now) { pick = i; break; } // crashed PC -> reclaim
        anyActive = true;
      } else if (status === "failed" && attempts < MAX_ATTEMPTS) {
        pick = i; break;
      }
    }

    if (pick === -1) {
      // Nothing to hand out. If others still hold live leases, tell the caller to
      // wait (they may yet fail and need redoing); otherwise the queue is drained.
      return anyActive ? { wait: true } : { done: true };
    }

    var row = pick + 2;
    var idName = sh.getRange(row, COL.ID, 1, 2).getValues()[0];
    var attempts = (Number(meta[pick][COL.ATTEMPTS - COL.STATUS]) || 0) + 1;
    // status, owner, attempts, claimed_at, lease_expires  (C..G)
    sh.getRange(row, COL.STATUS, 1, 5).setValues([[
      "in-progress", pc, attempts, now, now + LEASE_MINUTES * 60000,
    ]]);
    // clear finished_at + last_error from any previous attempt (H..I)
    sh.getRange(row, COL.FINISHED_AT, 1, 2).setValues([["", ""]]);
    SpreadsheetApp.flush();
    return { student_id: idName[0], full_name: idName[1], row: row, attempt: attempts };
  } finally {
    lock.releaseLock();
  }
}

function _heartbeat(req) {
  var row = _resolveRow(req);
  if (!row) return { ok: false, error: "row not found" };
  _sheet().getRange(row, COL.LEASE).setValue(Date.now() + LEASE_MINUTES * 60000);
  return { ok: true };
}

function _complete(req) {
  var row = _resolveRow(req);
  if (!row) return { ok: false, error: "row not found" };
  var sh = _sheet();
  sh.getRange(row, COL.STATUS).setValue("done");
  // clear lease, set finished_at, clear error  (G..I)
  sh.getRange(row, COL.LEASE, 1, 3).setValues([["", Date.now(), ""]]);
  // email, password, certificate_url  (J..L)
  sh.getRange(row, COL.EMAIL, 1, 3).setValues([[
    req.email || "", req.password || "", req.certificate_url || "",
  ]]);
  SpreadsheetApp.flush();
  return { ok: true };
}

function _fail(req) {
  var row = _resolveRow(req);
  if (!row) return { ok: false, error: "row not found" };
  var sh = _sheet();
  sh.getRange(row, COL.STATUS).setValue("failed");
  // clear lease so it is reclaimable, record finished_at + the error  (G..I)
  sh.getRange(row, COL.LEASE, 1, 3).setValues([["", Date.now(), String(req.error || "").slice(0, 500)]]);
  SpreadsheetApp.flush();
  return { ok: true };
}

// Trust the row index returned by claim (rows are never inserted/deleted, so it
// is stable), but verify the student_id matches as a guard against a stale row.
function _resolveRow(req) {
  var sh = _sheet();
  var row = Number(req.row) || 0;
  if (row >= 2 && row <= sh.getLastRow()) {
    if (!req.student_id || String(sh.getRange(row, COL.ID).getValue()) === String(req.student_id)) {
      return row;
    }
  }
  // Fallback: locate by student_id (slow path, only if row was wrong/missing).
  if (req.student_id) {
    var ids = sh.getRange(2, COL.ID, Math.max(0, sh.getLastRow() - 1), 1).getValues();
    for (var i = 0; i < ids.length; i++) {
      if (String(ids[i][0]) === String(req.student_id)) return i + 2;
    }
  }
  return 0;
}

function _stats() {
  var sh = _sheet();
  var n = sh.getLastRow() - 1;
  var counts = { pending: 0, "in-progress": 0, done: 0, failed: 0, total: n > 0 ? n : 0 };
  if (n < 1) return { counts: counts };
  var statuses = sh.getRange(2, COL.STATUS, n, 1).getValues();
  for (var i = 0; i < n; i++) {
    var s = String(statuses[i][0] || "").toLowerCase() || "pending";
    if (counts[s] === undefined) counts[s] = 0;
    counts[s]++;
  }
  return { counts: counts };
}

function _json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * One-time helper: writes the header row and resets every data row to pending
 * (clears owner/lease/status/etc). Run from the Apps Script editor after you
 * paste/import the student_id + full_name columns. Safe to re-run to reset.
 */
function initQueue() {
  var sh = _sheet();
  sh.getRange(1, 1, 1, LAST_COL).setValues([[
    "student_id", "full_name", "status", "owner", "attempts", "claimed_at",
    "lease_expires", "finished_at", "last_error", "email", "password", "certificate_url",
  ]]);
  var n = sh.getLastRow() - 1;
  if (n > 0) {
    var blank = [];
    for (var i = 0; i < n; i++) blank.push(["pending", "", 0, "", "", "", "", "", "", ""]);
    sh.getRange(2, COL.STATUS, n, LAST_COL - COL.STATUS + 1).setValues(blank);
  }
  SpreadsheetApp.flush();
}
