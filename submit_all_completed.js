const fs = require("fs").promises;
const { chromium } = require("playwright");
const CSV_FILE = "students.csv";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function parseCsv(text) {
  const lines = text.split("\n");
  return lines
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const matches = [];
      let current = "";
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === "\"") {
          inQuotes = !inQuotes;
        } else if (char === "," && !inQuotes) {
          matches.push(current.trim());
          current = "";
        } else {
          current += char;
        }
      }
      matches.push(current.trim());
      return matches;
    });
}

async function loadStudents(csvFile) {
  const text = await fs.readFile(csvFile, "utf8");
  const rows = parseCsv(text);
  const headers = rows.shift();
  return rows.map((row) =>
    Object.fromEntries(headers.map((header, index) => [header, row[index] || ""])),
  );
}

async function submitToGoogleForm(browser, fullName, email, password, certUrl) {
  let formUrl = "https://forms.gle/Jw4WsW1kao7f6WtC7";
  try {
    const configData = await fs.readFile("config.json", "utf8");
    const config = JSON.parse(configData);
    if (config.GOOGLE_FORM_URL) {
      formUrl = config.GOOGLE_FORM_URL;
    }
  } catch (e) {}

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent: USER_AGENT,
    locale: "uz-UZ",
  });
  const page = await context.newPage();
  try {
    console.log(`-> Submitting to Google Form: ${fullName} (${email})...`);
    await page.goto(formUrl, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("input[type=\"text\"], textarea", { timeout: 15000 });

    const inputs = page.locator("input[type=\"text\"], textarea");
    await inputs.nth(0).fill(fullName);
    await inputs.nth(1).fill(email);
    await inputs.nth(2).fill(password);
    await inputs.nth(3).fill(certUrl);

    const submitBtn = page.locator(`div[role="button"]:has-text("Yuborish"), button:has-text("Yuborish"), div[role="button"]:has-text("Submit"), button:has-text("Submit")`).first();
    await submitBtn.click({ timeout: 10000 });

    await page.waitForTimeout(4000);
    const text = await page.evaluate(() => document.body.innerText);
    if (text.includes("received") || text.includes("yozib olindi") || text.includes("recorded") || text.includes("tahrirlang")) {
      console.log(`   [SUCCESS] Submitted successfully.`);
    } else {
      console.log(`   [WARNING] Confirmation not matched. Page text snippet: ${text.replace(/\s+/g, " ").substring(0, 100)}`);
    }
  } catch (e) {
    console.error(`   [ERROR] Failed: ${e.message}`);
  } finally {
    await context.close().catch(() => {});
  }
}

async function main() {
  console.log("Loading students from students.csv...");
  const students = await loadStudents(CSV_FILE);
  const completed = students.filter(s => s.certificate_url && s.certificate_url.trim());

  if (completed.length === 0) {
    console.log("No completed students found in students.csv.");
    return;
  }

  console.log(`Found ${completed.length} completed students. Launching browser to submit to Google Form...`);
  const browser = await chromium.launch({ headless: true });
  
  for (let i = 0; i < completed.length; i++) {
    const student = completed[i];
    const fullName = `${student.first_name} ${student.last_name}`;
    console.log(`\n[${i + 1}/${completed.length}] Processing ${fullName}`);
    await submitToGoogleForm(browser, fullName, student.email, student.password, student.certificate_url);
  }

  await browser.close();
  console.log("\nFinished Google Form sync.");
}

main().catch(console.error);
