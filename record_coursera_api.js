const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright-extra");
const stealth = require("puppeteer-extra-plugin-stealth")();

// Apply stealth plugin
chromium.use(stealth);

const TARGET_URL = process.env.COURSE_URL || "https://www.coursera.org/programs/learning-program-h13rq/learn/build-ai-apps-with-chatgpt-dalle-gpt4?collectionId=2mufz";
const OUTPUT_JSON = path.join(__dirname, "recorded_coursera_api.json");
const OUTPUT_LOG = path.join(__dirname, "recorded_coursera_traffic.log");

const capturedTraffic = [];

function appendToLog(text) {
  fs.appendFileSync(OUTPUT_LOG, text + "\n", "utf8");
}

function saveTraffic() {
  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(capturedTraffic, null, 2), "utf8");
}

async function main() {
  console.log("=" .repeat(70));
  console.log("🔴 Coursera Network API Traffic Recorder Started");
  console.log(`🔗 Target URL: ${TARGET_URL}`);
  console.log(`📁 Saving traffic log to: ${OUTPUT_JSON}`);
  console.log("=" .repeat(70));

  const isHeadless = process.env.HEADLESS === "true" || process.env.HEADLESS === "1";
  console.log(`🖥️  Launching Chromium (Headless: ${isHeadless})...`);

  // Clear previous log
  fs.writeFileSync(OUTPUT_JSON, "[]", "utf8");
  fs.writeFileSync(OUTPUT_LOG, `--- Recorder Started ${new Date().toISOString()} ---\n`, "utf8");

  const launchArgs = [
    "--disable-blink-features=AutomationControlled",
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-infobars",
    "--window-size=1280,800"
  ];

  const browser = await chromium.launch({
    headless: isHeadless,
    args: launchArgs
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    extraHTTPHeaders: {
      "Accept-Language": "en-US,en;q=0.9"
    }
  });

  const page = await context.newPage();

  const pendingRequests = new Map();

  page.on("request", async (request) => {
    const url = request.url();
    const method = request.method();
    const headers = request.headers();
    const postData = request.postData();

    const isApi = url.includes("/api/") || url.includes("/graphql") || url.includes("coursera.org") || method !== "GET";

    const reqData = {
      id: Math.random().toString(36).substring(2, 10),
      timestamp: new Date().toISOString(),
      url,
      method,
      headers,
      postData: postData || null,
      isApi
    };

    pendingRequests.set(request, reqData);

    if (isApi) {
      console.log(`\n➡️  [${method}] ${url.substring(0, 110)}`);
      if (postData) {
        console.log(`   📤 Payload: ${postData.substring(0, 200)}`);
      }
      appendToLog(`[REQUEST] ${reqData.timestamp} ${method} ${url}\nHeaders: ${JSON.stringify(headers)}\nPayload: ${postData || "None"}\n`);
    }
  });

  page.on("response", async (response) => {
    const request = response.request();
    const reqData = pendingRequests.get(request);

    let responseBody = null;
    try {
      const contentType = response.headers()["content-type"] || "";
      if (contentType.includes("json") || contentType.includes("text") || contentType.includes("javascript")) {
        responseBody = await response.text();
      } else {
        responseBody = `[Binary/Media content: ${contentType}]`;
      }
    } catch (e) {
      responseBody = `[Error reading body: ${e.message}]`;
    }

    const record = {
      timestamp: new Date().toISOString(),
      url: response.url(),
      method: request.method(),
      status: response.status(),
      statusText: response.statusText(),
      requestHeaders: request.headers(),
      requestPayload: request.postData() || null,
      responseHeaders: response.headers(),
      responseBody: responseBody
    };

    capturedTraffic.push(record);
    saveTraffic();

    if (reqData && reqData.isApi) {
      console.log(`⬅️  [${response.status()}] ${response.url().substring(0, 110)}`);
      if (responseBody && responseBody.length < 500 && !responseBody.startsWith("[")) {
        console.log(`   📥 Response: ${responseBody.substring(0, 250)}`);
      }
      appendToLog(`[RESPONSE] ${record.timestamp} ${response.status()} ${response.url()}\nHeaders: ${JSON.stringify(record.responseHeaders)}\nBody: ${(responseBody || "").substring(0, 1000)}\n------------------------------------------------`);
    }
  });

  console.log(`\n🚀 Navigating to target Coursera course page...`);
  try {
    await page.goto(TARGET_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
    console.log("✅ Page loaded successfully!");
  } catch (e) {
    console.log(`⚠️ Navigation note: ${e.message}`);
  }

  // Dismiss cookie banner if present
  try {
    const acceptCookiesBtn = page.locator("#onetrust-accept-btn-handler, button:has-text('Accept'), button:has-text('Accept all')").first();
    if (await acceptCookiesBtn.count() > 0 && await acceptCookiesBtn.isVisible()) {
      await acceptCookiesBtn.click({ timeout: 5000 });
      console.log("🍪 Dismissed cookie consent banner.");
    }
  } catch (e) {}

  console.log("\n" + "=" .repeat(70));
  console.log("🔴 Browser network API traffic recording in progress!");
  console.log("👉 Close the browser window or press Ctrl+C when finished recording.");
  console.log("=" .repeat(70) + "\n");

  await new Promise((resolve) => {
    browser.on("disconnected", resolve);
    process.on("SIGINT", async () => {
      saveTraffic();
      try { await browser.close(); } catch (e) {}
      resolve();
    });
  });

  console.log("\n🔒 Flushing traffic log...");
  saveTraffic();
  console.log(`✅ Total recorded network requests: ${capturedTraffic.length}`);
}

main().catch((err) => {
  console.error("❌ Recorder Error:", err);
  process.exit(1);
});
