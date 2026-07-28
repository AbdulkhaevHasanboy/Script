const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright-extra");
const stealth = require("puppeteer-extra-plugin-stealth")();

chromium.use(stealth);

const TARGET_URL = process.env.COURSE_URL || "https://www.coursera.org/programs/learning-program-h13rq/learn/build-ai-apps-with-chatgpt-dalle-gpt4?collectionId=2mufz#authMode=signup";
const ACTIONS_JSON = path.join(__dirname, "recorded_user_actions.json");
const ACTIONS_LOG = path.join(__dirname, "recorded_user_actions.log");
const API_JSON = path.join(__dirname, "recorded_coursera_api.json");

const recordedActions = [];
const capturedTraffic = [];

function logAction(text) {
  console.log(text);
  fs.appendFileSync(ACTIONS_LOG, text + "\n", "utf8");
}

function saveFiles() {
  fs.writeFileSync(ACTIONS_JSON, JSON.stringify(recordedActions, null, 2), "utf8");
  fs.writeFileSync(API_JSON, JSON.stringify(capturedTraffic, null, 2), "utf8");
}

async function main() {
  console.log("=" .repeat(70));
  console.log("🔴 Coursera Interactive User Action & Network Recorder");
  console.log(`🔗 Target URL: ${TARGET_URL}`);
  console.log(`📁 Saving DOM Clicks & Input Fills to: recorded_user_actions.json`);
  console.log(`📁 Saving Network API Traffic to: recorded_coursera_api.json`);
  console.log("=" .repeat(70));

  fs.writeFileSync(ACTIONS_JSON, "[]", "utf8");
  fs.writeFileSync(API_JSON, "[]", "utf8");
  fs.writeFileSync(ACTIONS_LOG, `--- Interactive Action Recorder Started ${new Date().toISOString()} ---\n`, "utf8");

  const forceHeadless = process.env.HEADLESS === "true" || process.env.HEADLESS === "1";
  const isHeadless = forceHeadless;

  const browser = await chromium.launch({
    headless: isHeadless,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-infobars",
      "--start-maximized"
    ]
  });

  const context = await browser.newContext({
    viewport: null, // Full window
    userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    extraHTTPHeaders: {
      "Accept-Language": "en-US,en;q=0.9"
    }
  });

  // Expose binding to receive DOM click/fill events from page script
  await context.exposeBinding("__recordUserAction", async ({ page }, action) => {
    action.timestamp = new Date().toISOString();
    recordedActions.push(action);
    saveFiles();

    if (action.type === "click") {
      logAction(`\n🖱️ [CLICK] Tag: <${action.tagName.toLowerCase()}> | Text: "${action.text}" | Selector: ${action.selector || "n/a"} | URL: ${action.url}`);
    } else if (action.type === "change" || action.type === "input") {
      logAction(`\n✍️ [INPUT/FILL] Field: ${action.id || action.name || action.placeholder || action.tagName} | Value: "${action.value}" | Selector: ${action.selector} | URL: ${action.url}`);
    } else if (action.type === "navigation") {
      logAction(`\n🌐 [NAVIGATE] URL: ${action.url}`);
    }
  });

  // Inject DOM event listeners into every page frame
  await context.addInitScript(() => {
    function getCssSelector(el) {
      if (!el || el.nodeType !== Node.ELEMENT_NODE) return "";
      if (el.id) return `#${el.id}`;
      if (el.getAttribute("data-testid")) return `[data-testid="${el.getAttribute("data-testid")}"]`;
      if (el.getAttribute("name")) return `[name="${el.getAttribute("name")}"]`;
      let selector = el.tagName.toLowerCase();
      if (el.className && typeof el.className === "string") {
        const classes = el.className.split(/\s+/).filter(c => c && !c.includes(":") && !c.includes("/")).join(".");
        if (classes) selector += `.${classes}`;
      }
      return selector;
    }

    document.addEventListener("click", (e) => {
      const target = e.target.closest("button, a, input, [role='button'], label, [data-testid]") || e.target;
      const info = {
        type: "click",
        tagName: target.tagName,
        text: (target.innerText || target.value || target.getAttribute("aria-label") || "").trim().substring(0, 150),
        selector: getCssSelector(target),
        id: target.id || null,
        dataTestId: target.getAttribute("data-testid") || null,
        href: target.href || null,
        url: window.location.href
      };
      if (window.__recordUserAction) window.__recordUserAction(info);
    }, true);

    document.addEventListener("change", (e) => {
      const target = e.target;
      const info = {
        type: "change",
        tagName: target.tagName,
        inputType: target.type || null,
        id: target.id || null,
        name: target.name || null,
        placeholder: target.placeholder || null,
        selector: getCssSelector(target),
        value: target.type === "password" ? "*****" : target.value,
        checked: target.checked,
        url: window.location.href
      };
      if (window.__recordUserAction) window.__recordUserAction(info);
    }, true);
  });

  const page = await context.newPage();

  // Listen to network API calls as well
  page.on("request", (request) => {
    const url = request.url();
    if (url.includes("/api/") || url.includes("coursera.org")) {
      capturedTraffic.push({
        type: "request",
        timestamp: new Date().toISOString(),
        method: request.method(),
        url: url,
        payload: request.postData() || null
      });
    }
  });

  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) {
      const info = {
        type: "navigation",
        url: frame.url()
      };
      recordedActions.push(info);
      logAction(`\n🌐 [PAGE LOAD] ${frame.url()}`);
      saveFiles();
    }
  });

  console.log(`\n🚀 Navigating to target page...`);
  try {
    await page.goto(TARGET_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
    console.log("✅ Loaded page successfully!");

    // Automatically click Join for Free / Sign Up button if modal is not open yet
    await page.waitForTimeout(1000);
    const joinBtn = page.locator('button:has-text("Join for Free"), button:has-text("Join for free"), a:has-text("Join for free"), [href*="authMode=signup"]').filter({ visible: true }).first();
    if (await joinBtn.count() > 0) {
      console.log("👉 Auto-clicking 'Join for free' button to open Signup dialog...");
      await joinBtn.click().catch(() => {});
    }
  } catch (e) {
    console.log(`⚠️ Navigation note: ${e.message}`);
  }

  console.log("\n" + "=" .repeat(70));
  console.log("🔴 Action & Network Recording Active!");
  console.log("👉 Click buttons, fill forms, and navigate normally in the browser window.");
  console.log("👉 All your CLICKS and INPUT FILLS will be printed live here and saved to:");
  console.log("   - recorded_user_actions.json");
  console.log("   - recorded_user_actions.log");
  console.log("=" .repeat(70) + "\n");

  await new Promise((resolve) => {
    browser.on("disconnected", resolve);
    process.on("SIGINT", async () => {
      console.log("\n🔒 SIGINT received. Saving logs and closing browser...");
      saveFiles();
      await browser.close();
      resolve();
    });
  });

  console.log(`\n✅ Recording complete. Saved ${recordedActions.length} user actions.`);
}

main().catch((err) => {
  console.error("❌ Error in recorder:", err);
  process.exit(1);
});
