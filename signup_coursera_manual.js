const fs = require("node:fs/promises");
const path = require("node:path");
const net = require("node:net");
const os = require("node:os");
const { chromium } = require("playwright-extra");
const stealth = require("puppeteer-extra-plugin-stealth")();

chromium.use(stealth);

const COORDINATOR_URL = process.env.COORDINATOR_URL || "https://script.google.com/macros/s/AKfycbzGoKxVczv9oK60XudR1eSgVWG266Zu4bciEOA2L-R5VvLjk7fgXDL0vSQfkofIZ2jO/exec";
const TARGET_URL = process.env.COURSE_URL || "https://www.coursera.org/programs/learning-program-h13rq/learn/build-ai-apps-with-chatgpt-dalle-gpt4?collectionId=2mufz#authMode=signup";
const QUEUE_FILE = path.join(__dirname, "students_queue.json");
const MAILS_DIR = path.join(__dirname, "mails");
const TOR_PROXY = process.env.TOR_PROXY || "socks5://127.0.0.1:9050";

function makePcId() {
  const host = os.hostname().replace(/[^a-zA-Z0-9-]/g, "").substring(0, 15);
  const rand = Math.random().toString(36).substring(2, 7);
  return `${host}-${process.pid}-${rand}`;
}

const PC_ID = makePcId();

// HTTP Request helper to communicate with Google Apps Script Coordinator
async function fetchCoordinator(payload) {
  try {
    const isPost = Boolean(payload);
    const options = {
      method: isPost ? "POST" : "GET",
      headers: isPost ? { "Content-Type": "application/json" } : {},
      body: isPost ? JSON.stringify(payload) : undefined
    };
    const res = await fetch(COORDINATOR_URL + (isPost ? "" : "?action=stats"), options);
    return await res.json();
  } catch (e) {
    console.error("Coordinator API error:", e.message);
    return null;
  }
}

// Rotate Tor IP via control port (9051) if blocked or timed out
async function rotateTorIp() {
  return new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port: 9051 });
    socket.setTimeout(3000);
    socket.on("connect", () => {
      socket.write('AUTHENTICATE ""\r\nSIGNAL NEWNYM\r\nQUIT\r\n');
    });
    socket.on("data", () => {
      console.log("[Tor JS] Successfully rotated Tor IP address.");
      socket.end();
      resolve(true);
    });
    socket.on("error", () => resolve(false));
    socket.on("timeout", () => {
      socket.destroy();
      resolve(false);
    });
  });
}

// Load or initialize students_queue.json from mails/ directory for local fallback
async function loadLocalQueue() {
  try {
    const data = await fs.readFile(QUEUE_FILE, "utf8");
    const parsed = JSON.parse(data);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
  } catch (e) {}

  try {
    const files = await fs.readdir(MAILS_DIR);
    const emlFiles = files.filter((f) => f.endsWith(".eml"));
    const students = [];

    for (const file of emlFiles) {
      try {
        const content = await fs.readFile(path.join(MAILS_DIR, file), "utf8");
        const toMatch = content.match(/^To:\s*([^\r\n]+)/im);
        const emailAddr = toMatch ? toMatch[1].trim() : "";
        if (!emailAddr || !emailAddr.includes("@")) continue;

        const nameMatch = content.match(/Hello\s+([^<\r\n]+)/i);
        let fullName = nameMatch ? nameMatch[1].trim() : "";
        fullName = fullName
          .replace(/&#39;/g, "'")
          .replace(/&amp;/g, "&")
          .replace(/&quot;/g, '"')
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">");

        if (!fullName) continue;

        const isMeliboyeva = fullName.toLowerCase().includes("meliboyeva");

        students.push({
          student_id: file.replace(".eml", ""),
          full_name: fullName,
          email: emailAddr,
          password: "adu2026_x",
          status: isMeliboyeva ? "done" : "pending"
        });
      } catch (e) {}
    }

    await fs.writeFile(QUEUE_FILE, JSON.stringify(students, null, 2), "utf8");
    return students;
  } catch (e) {
    return [];
  }
}

async function updateLocalStatus(studentId, status) {
  try {
    const data = await fs.readFile(QUEUE_FILE, "utf8");
    const queue = JSON.parse(data);
    const item = queue.find((s) => s.student_id === studentId || s.email === studentId);
    if (item) {
      item.status = status;
      item.updated_at = new Date().toISOString();
      await fs.writeFile(QUEUE_FILE, JSON.stringify(queue, null, 2), "utf8");
    }
  } catch (e) {}
}

async function processStudent(student, indexText) {
  console.log("\n" + "=".repeat(70));
  console.log(`[${indexText}] Processing Student: ${student.full_name} (${student.email})`);
  console.log("=".repeat(70));

  const isHeadless = /^(1|y|yes|true)$/i.test(process.env.HEADLESS || "");

  const browser = await chromium.launch({
    headless: isHeadless,
    proxy: process.env.NO_TOR ? undefined : { server: TOR_PROXY },
    args: [
      "--disable-blink-features=AutomationControlled",
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-infobars"
    ]
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
  });

  // Block non-essential telemetry, fonts, & media to boost speed over Tor
  await context.route("**/*", (route) => {
    const req = route.request();
    const type = req.resourceType();
    const url = req.url();

    if (
      type === "media" || type === "font" ||
      url.includes("google-analytics") || url.includes("hotjar") ||
      url.includes("facebook.net") || url.includes("segment.io") ||
      url.includes("sentry.io")
    ) {
      return route.abort();
    }
    return route.continue();
  });

  const page = await context.newPage();
  let success = false;

  try {
    console.log(`🚀 Navigating to signup page...`);
    await page.goto(TARGET_URL, { waitUntil: "domcontentloaded", timeout: 60000 });

    // Explicitly wait for Signup form input fields to render in DOM
    console.log(`⏳ Waiting for Signup form fields (Full Name, Email, Password) to render...`);
    const nameInput = page.locator('input[name="name"], input[placeholder*="full name" i], [id*=":r8:"]').filter({ visible: true }).first();
    await nameInput.waitFor({ state: "visible", timeout: 15000 });

    // Step 1: Fill Full Name
    console.log(`✍️ Filling Full Name: ${student.full_name}`);
    await nameInput.click().catch(() => {});
    await page.waitForTimeout(100);
    await nameInput.fill(student.full_name).catch(() => {});

    // Step 2: Fill Email
    const emailInput = page.locator('input[name="email"], input[type="email"], [id*=":ra:"]').filter({ visible: true }).first();
    console.log(`✍️ Filling Email: ${student.email}`);
    await emailInput.click().catch(() => {});
    await page.waitForTimeout(100);
    await emailInput.fill(student.email).catch(() => {});

    // Step 3: Fill Password
    const passwordInput = page.locator('input[name="password"], input[type="password"], [id*=":rc:"]').filter({ visible: true }).first();
    console.log(`✍️ Filling Password: ${student.password || "adu2026_x"}`);
    await passwordInput.click().catch(() => {});
    await page.waitForTimeout(100);
    await passwordInput.fill(student.password || "adu2026_x").catch(() => {});

    // Step 4: Click Join for Free
    const joinBtn = page.locator('button:has-text("Join for Free"), button:has-text("Join for free"), button.css-18xham5, button[type="submit"]').filter({ visible: true }).first();
    console.log(`🖱️ Clicking 'Join for Free' button...`);
    await joinBtn.click().catch(() => {});

    // Step 5: Wait for 'Success' message / signupSuccess URL in dialog
    console.log(`⏳ Waiting for 'Success' message in signup dialog...`);
    await page.waitForFunction(() => {
      const text = document.body ? document.body.innerText.toLowerCase() : "";
      const href = window.location.href;
      return href.includes("signupSuccess") || href.includes("isNewUser=true") || text.includes("success") || text.includes("check your email") || text.includes("welcome");
    }, { timeout: 15000 }).catch(() => {});

    // Step 6: Wait 1 second after Success
    console.log(`⏱️ Success detected! Waiting 1 second before reloading page...`);
    await page.waitForTimeout(1000);

    // Step 7: Reload the page
    console.log(`🔄 Reloading page...`);
    await page.reload({ waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});

    // Step 8: After DOM ready, start 1-minute (60s) countdown for 'Resend verification email' button
    console.log(`⏱️ DOM ready after reload. Waiting up to 1 minute (60s) for 'Resend verification email' button...`);
    let resendAppeared = false;
    const startWait = Date.now();

    while (Date.now() - startWait < 60000) {
      const resendBtn = page.locator('button:has-text("Resend verification email"), button.cds-124.cds-button-primary').filter({ visible: true }).first();
      if (await resendBtn.count().catch(() => 0) > 0) {
        resendAppeared = true;
        console.log(`✅ [SUCCESS] 'Resend verification email' button appeared! Clicking it...`);
        await resendBtn.click().catch(() => {});
        console.log(`⏳ Waiting 3 seconds for verification API request to complete...`);
        await page.waitForTimeout(3000);
        break;
      }
      await page.waitForTimeout(500);
    }

    if (resendAppeared) {
      console.log(`🎉 Account signup verified for ${student.email}`);
      success = true;
    } else {
      console.log(`❌ [ERR] 'Resend verification email' button did NOT appear within 1 minute.`);
      await rotateTorIp();
    }
  } catch (err) {
    console.error(`❌ Error during signup for ${student.email}:`, err.message);
    await rotateTorIp();
  } finally {
    await browser.close().catch(() => {});
  }

  return success;
}

async function main() {
  console.log(`\n======================================================================`);
  console.log(`🚀 Coursera Google Sheets Connected Account Creator`);
  console.log(`🔗 Coordinator URL : ${COORDINATOR_URL}`);
  console.log(`💻 This PC ID       : ${PC_ID}`);
  console.log(`======================================================================\n`);

  // Check stats from Google Sheets Coordinator
  const stats = await fetchCoordinator(null);
  if (stats) {
    console.log(`📊 Google Sheet Queue Stats: Pending=${stats.pending} | In-Progress=${stats.in_progress} | Done=${stats.done} | Err=${stats.err} | Total=${stats.total}`);
  }

  let count = 0;

  while (true) {
    count++;
    // Claim next student from Google Sheets
    const res = await fetchCoordinator({ action: "claim", pc: PC_ID });

    if (!res || res.done || !res.student) {
      console.log("\n🎉 No more pending accounts in Google Sheet Queue! Done!");
      break;
    }

    const student = res.student;
    const success = await processStudent(student, `#${count}`);

    if (success) {
      // Complete in Google Sheets -> Sets status = "done" and is_finished = TRUE
      await fetchCoordinator({ action: "complete", student_id: student.student_id, email: student.email });
      await updateLocalStatus(student.student_id, "done");
      console.log(`✅ Updated Google Sheet: Marked ${student.email} as DONE (is_finished = TRUE)`);
    } else {
      // Fail in Google Sheets -> Sets status = "err" and is_finished = FALSE
      await fetchCoordinator({ action: "fail", student_id: student.student_id, email: student.email });
      await updateLocalStatus(student.student_id, "err");
      console.log(`❌ Updated Google Sheet: Marked ${student.email} as ERR (is_finished = FALSE)`);
    }
  }

  console.log("\n======================================================================");
  console.log("✅ All accounts processed in Google Sheets Queue!");
  console.log("======================================================================");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
