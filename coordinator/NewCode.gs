/**
 * Coursera Account Registration Coordinator — Google Apps Script (NewCode.gs)
 *
 * Automates account creation queue using a Google Sheet.
 *
 * SHEET LAYOUT (sheet name: "Queue", header row 1):
 *   Col 1 (A): student_id  | Col 2 (B): full_name | Col 3 (C): email
 *   Col 4 (D): password    | Col 5 (E): status    | Col 6 (F): is_finished (TRUE/FALSE)
 *   Col 7 (G): claimed_by  | Col 8 (H): updated_at
 */

var QUEUE_SHEET = "Queue";
var LOCK_TIMEOUT_MS = 25000;

var COL = {
  ID: 1,
  FULL_NAME: 2,
  EMAIL: 3,
  PASSWORD: 4,
  STATUS: 5,
  IS_FINISHED: 6,
  CLAIMED_BY: 7,
  UPDATED_AT: 8
};

function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || "stats";
  if (action === "stats") return _json(_stats());
  return _json({ error: "Use POST for claim, complete, fail, stats" });
}

function doPost(e) {
  var req;
  try {
    req = JSON.parse((e && e.postData && e.postData.contents) || "{}");
  } catch (err) {
    return _json({ error: "Invalid JSON request body" });
  }

  var action = req.action || (e && e.parameter && e.parameter.action);
  try {
    switch (action) {
      case "claim":     return _json(_claim(req));
      case "complete":  return _json(_complete(req));
      case "fail":      return _json(_fail(req));
      case "stats":     return _json(_stats());
      default:          return _json({ error: "Unknown action: " + action });
    }
  } catch (err) {
    return _json({ error: String(err && err.message || err) });
  }
}

function _sheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(QUEUE_SHEET) || ss.getSheets()[0];
  if (!sh) throw new Error("No valid sheet tab found");
  return sh;
}

function _claim(req) {
  var pc = req.pc || "unknown";
  var lock = LockService.getScriptLock();
  lock.waitLock(LOCK_TIMEOUT_MS);

  try {
    var sh = _sheet();
    var lastRow = sh.getLastRow();
    if (lastRow < 2) return { done: true, message: "Queue is empty" };

    var range = sh.getRange(2, 1, lastRow - 1, COL.UPDATED_AT);
    var data = range.getValues();

    for (var i = 0; i < data.length; i++) {
      var rowNum = i + 2;
      var studentId = String(data[i][COL.ID - 1] || "").trim();
      var fullName  = String(data[i][COL.FULL_NAME - 1] || "").trim();
      var email     = String(data[i][COL.EMAIL - 1] || "").trim();
      var password  = String(data[i][COL.PASSWORD - 1] || "adu2026_x").trim();
      var status    = String(data[i][COL.STATUS - 1] || "").toLowerCase().trim();
      var isFinished = data[i][COL.IS_FINISHED - 1] === true || String(data[i][COL.IS_FINISHED - 1]).toLowerCase() === "true";

      if (!isFinished && status !== "in-progress" && email && email.indexOf("@") !== -1) {
        var now = new Date().toISOString();
        sh.getRange(rowNum, COL.STATUS).setValue("in-progress");
        sh.getRange(rowNum, COL.IS_FINISHED).setValue(false);
        sh.getRange(rowNum, COL.CLAIMED_BY).setValue(pc);
        sh.getRange(rowNum, COL.UPDATED_AT).setValue(now);

        return {
          done: false,
          student: {
            student_id: studentId || ("row_" + rowNum),
            full_name: fullName,
            email: email,
            password: password
          }
        };
      }
    }

    return { done: true, message: "All accounts are completed or in-progress" };
  } finally {
    lock.releaseLock();
  }
}

function _complete(req) {
  var lock = LockService.getScriptLock();
  lock.waitLock(LOCK_TIMEOUT_MS);

  try {
    var sh = _sheet();
    var target = String(req.student_id || req.email || "").toLowerCase().trim();
    if (!target) return { error: "Missing student_id or email" };

    var lastRow = sh.getLastRow();
    if (lastRow < 2) return { error: "Empty queue sheet" };

    var range = sh.getRange(2, 1, lastRow - 1, COL.UPDATED_AT);
    var data = range.getValues();

    for (var i = 0; i < data.length; i++) {
      var rowNum = i + 2;
      var studentId = String(data[i][COL.ID - 1] || "").toLowerCase().trim();
      var email     = String(data[i][COL.EMAIL - 1] || "").toLowerCase().trim();

      if (studentId === target || email === target) {
        var now = new Date().toISOString();
        sh.getRange(rowNum, COL.STATUS).setValue("done");
        sh.getRange(rowNum, COL.IS_FINISHED).setValue(true); // Sets TRUE boolean checkbox
        sh.getRange(rowNum, COL.UPDATED_AT).setValue(now);
        return { success: true, row: rowNum, is_finished: true };
      }
    }

    return { error: "Student not found in sheet: " + target };
  } finally {
    lock.releaseLock();
  }
}

function _fail(req) {
  var lock = LockService.getScriptLock();
  lock.waitLock(LOCK_TIMEOUT_MS);

  try {
    var sh = _sheet();
    var target = String(req.student_id || req.email || "").toLowerCase().trim();
    if (!target) return { error: "Missing student_id or email" };

    var lastRow = sh.getLastRow();
    if (lastRow < 2) return { error: "Empty queue sheet" };

    var range = sh.getRange(2, 1, lastRow - 1, COL.UPDATED_AT);
    var data = range.getValues();

    for (var i = 0; i < data.length; i++) {
      var rowNum = i + 2;
      var studentId = String(data[i][COL.ID - 1] || "").toLowerCase().trim();
      var email     = String(data[i][COL.EMAIL - 1] || "").toLowerCase().trim();

      if (studentId === target || email === target) {
        var now = new Date().toISOString();
        sh.getRange(rowNum, COL.STATUS).setValue("err");
        sh.getRange(rowNum, COL.IS_FINISHED).setValue(false); // Sets FALSE boolean checkbox
        sh.getRange(rowNum, COL.UPDATED_AT).setValue(now);
        return { success: true, row: rowNum, is_finished: false };
      }
    }

    return { error: "Student not found in sheet: " + target };
  } finally {
    lock.releaseLock();
  }
}

function _stats() {
  var sh = _sheet();
  var lastRow = sh.getLastRow();
  if (lastRow < 2) return { pending: 0, in_progress: 0, done: 0, err: 0, total: 0 };

  var range = sh.getRange(2, 1, lastRow - 1, COL.UPDATED_AT);
  var data = range.getValues();

  var stats = { pending: 0, in_progress: 0, done: 0, err: 0, total: data.length };

  for (var i = 0; i < data.length; i++) {
    var status = String(data[i][COL.STATUS - 1] || "").toLowerCase().trim();
    var isFinished = data[i][COL.IS_FINISHED - 1] === true || String(data[i][COL.IS_FINISHED - 1]).toLowerCase() === "true";

    if (isFinished || status === "done") {
      stats.done++;
    } else if (status === "in-progress") {
      stats.in_progress++;
    } else if (status === "err" || status === "failed") {
      stats.err++;
    } else {
      stats.pending++;
    }
  }

  return stats;
}

function _json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj, null, 2))
    .setMimeType(ContentService.MimeType.JSON);
}
