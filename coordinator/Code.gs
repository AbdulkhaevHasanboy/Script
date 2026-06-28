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
    var giveUp = []; // expired + exhausted rows to mark terminally failed
    for (var i = 0; i < n; i++) {
      var status = String(meta[i][0] || "").toLowerCase();       // C
      var attempts = Number(meta[i][COL.ATTEMPTS - COL.STATUS]) || 0; // E
      var lease = Number(meta[i][COL.LEASE - COL.STATUS]) || 0;       // G

      if (status === "" || status === "pending") { pick = i; break; }
      if (status === "in-progress") {
        if (lease && lease < now) {
          // The PC holding this crashed / timed out. Reclaim ONLY if attempts
          // remain; otherwise give up so it can't loop forever (this is what let
          // attempts climb past MAX_ATTEMPTS before).
          if (attempts < MAX_ATTEMPTS) { pick = i; break; }
          giveUp.push(i);
        } else {
          anyActive = true; // still being worked on under a live lease
        }
      } else if (status === "failed" && attempts < MAX_ATTEMPTS) {
        pick = i; break;
      }
    }

    // Mark abandoned-and-exhausted rows as terminally failed: visible in the
    // dashboard, never retried, lease cleared. (Run retryFailed() to revive them
    // later, e.g. after switching to a proxy / clean IP.)
    for (var g = 0; g < giveUp.length; g++) {
      var gr = giveUp[g] + 2;
      sh.getRange(gr, COL.STATUS).setValue("failed");
      sh.getRange(gr, COL.LEASE, 1, 3).setValues([["", now, "exhausted: max attempts reached"]]);
    }

    if (pick === -1) {
      // Nothing to hand out. If others still hold live leases, tell the caller to
      // wait (they may yet fail and need redoing); otherwise the queue is drained.
      if (giveUp.length) SpreadsheetApp.flush();
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
 * Admin helper: revive students that ended up "failed" (e.g. CAPTCHA'd to death
 * on a bad IP) by resetting them to pending with a fresh attempt count. Run this
 * from the Apps Script editor AFTER you fix the underlying cause (proxy / clean
 * IP / real machines). Also un-sticks any "in-progress" row whose lease expired.
 */
function retryFailed() {
  var sh = _sheet();
  var n = sh.getLastRow() - 1;
  if (n < 1) return;
  var now = Date.now();
  var grid = sh.getRange(2, COL.STATUS, n, COL.LEASE - COL.STATUS + 1).getValues(); // C..G
  var revived = 0;
  for (var i = 0; i < n; i++) {
    var status = String(grid[i][0] || "").toLowerCase();
    var lease = Number(grid[i][COL.LEASE - COL.STATUS]) || 0;
    var stale = status === "failed" || (status === "in-progress" && lease && lease < now);
    if (stale) {
      grid[i][0] = "pending";                       // C status
      grid[i][COL.OWNER - COL.STATUS] = "";         // D owner
      grid[i][COL.ATTEMPTS - COL.STATUS] = 0;       // E attempts
      grid[i][COL.CLAIMED_AT - COL.STATUS] = "";    // F claimed_at
      grid[i][COL.LEASE - COL.STATUS] = "";         // G lease_expires
      revived++;
    }
  }
  sh.getRange(2, COL.STATUS, n, COL.LEASE - COL.STATUS + 1).setValues(grid);
  SpreadsheetApp.flush();
  Logger.log("Revived failed/stale -> pending: " + revived);
}

/**
 * One-time helper: writes the header row and marks any row with a BLANK status
 * as "pending". It does NOT touch rows that already have a status (e.g. "done"
 * rows pre-filled by make_queue_seed.py from your already-completed list), nor
 * any email/password/certificate values. Safe to re-run.
 *
 * If you imported a seed that already includes the status column, you can skip
 * this entirely — it's only needed when you seeded just student_id + full_name.
 */
function initQueue() {
  var sh = _sheet();
  sh.getRange(1, 1, 1, LAST_COL).setValues([[
    "student_id", "full_name", "status", "owner", "attempts", "claimed_at",
    "lease_expires", "finished_at", "last_error", "email", "password", "certificate_url",
  ]]);
  var n = sh.getLastRow() - 1;
  if (n > 0) {
    var rng = sh.getRange(2, COL.STATUS, n, 1);
    var st = rng.getValues();
    for (var i = 0; i < n; i++) {
      if (String(st[i][0] || "").trim() === "") st[i][0] = "pending";
    }
    rng.setValues(st);
  }
  SpreadsheetApp.flush();
}

/**
 * Optional admin helper: re-mark already-completed people as "done" from the
 * Google Form responses, matched by full name. Paste your responses sheet ID
 * below and run this once if you ever re-seed and need to re-apply completions
 * without regenerating the CSV. Leave RESPONSES_SHEET_ID empty to no-op.
 */
function applyDoneFromResponses() {
  var RESPONSES_SHEET_ID = ""; // <-- responses spreadsheet ID, or leave ""
  if (!RESPONSES_SHEET_ID) throw new Error("Set RESPONSES_SHEET_ID first.");
  var norm = function (s) { return String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, ""); };

  var rsh = SpreadsheetApp.openById(RESPONSES_SHEET_ID).getSheets()[0];
  var data = rsh.getDataRange().getValues();
  var head = data[0].map(function (h) { return String(h).toLowerCase().replace(/[^a-z]/g, ""); });
  var ci = function (n) { return head.indexOf(n); };
  var nameI = ci("fullname"), emailI = ci("email"), passI = ci("password"),
      urlI = head.indexOf("url") >= 0 ? head.indexOf("url") : ci("certificateurl");
  var done = {};
  for (var r = 1; r < data.length; r++) {
    var key = norm(data[r][nameI]);
    if (key) done[key] = [data[r][emailI] || "", data[r][passI] || "", data[r][urlI] || ""];
  }

  var sh = _sheet();
  var n = sh.getLastRow() - 1;
  if (n < 1) return;
  var grid = sh.getRange(2, 1, n, LAST_COL).getValues();
  var updated = 0;
  for (var i = 0; i < n; i++) {
    var d = done[norm(grid[i][COL.NAME - 1])];
    if (d && String(grid[i][COL.STATUS - 1]).toLowerCase() !== "done") {
      grid[i][COL.STATUS - 1] = "done";
      grid[i][COL.EMAIL - 1] = d[0];
      grid[i][COL.PASSWORD - 1] = d[1];
      grid[i][COL.CERT - 1] = d[2];
      updated++;
    }
  }
  sh.getRange(2, 1, n, LAST_COL).setValues(grid);
  SpreadsheetApp.flush();
  Logger.log("Marked done: " + updated);
}
