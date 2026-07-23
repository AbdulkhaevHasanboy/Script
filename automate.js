const { chromium } = require("playwright");

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const wsEndpoint = "ws://127.0.0.1:40673/devtools/browser";
  console.log(`Connecting to Chrome at ${wsEndpoint}...`);
  const browser = await chromium.connect({ wsEndpoint });
  console.log("Connected successfully!");

  // Wait a bit to let the runner open the page
  await sleep(4000);

  const contexts = browser.contexts();
  if (contexts.length === 0) {
    console.error("No active contexts found.");
    await browser.close();
    return;
  }

  const context = contexts[0];
  const pages = context.pages();
  console.log(`Found ${pages.length} active pages.`);

  let targetPage = null;
  for (const page of pages) {
    const url = page.url();
    console.log(`- Page: ${url}`);
    if (url.includes("coursera.org") || url.includes("google.com/url") || url.includes("link.coursera.org")) {
      targetPage = page;
      break;
    }
  }

  if (!targetPage) {
    console.log("No Coursera or Google URL page found. Checking again in 5 seconds...");
    await sleep(5000);
    const updatedPages = context.pages();
    for (const page of updatedPages) {
      const url = page.url();
      if (url.includes("coursera.org") || url.includes("google.com/url") || url.includes("link.coursera.org")) {
        targetPage = page;
        break;
      }
    }
  }

  if (!targetPage) {
    console.error("Could not find the target Coursera page tab. Exiting.");
    await browser.close();
    return;
  }

  console.log(`Target page identified: ${targetPage.url()}`);

  // 1. Wait for google/link.coursera.org redirect to resolve
  let currentUrl = targetPage.url();
  const startTime = Date.now();
  while ((currentUrl.includes("google.com/url") || currentUrl.includes("link.coursera.org")) && Date.now() - startTime < 20000) {
    console.log(`Waiting for redirection to settle... Current URL: ${currentUrl}`);
    await sleep(2000);
    currentUrl = targetPage.url();
  }

  console.log(`Redirection settled at: ${currentUrl}`);

  // 2. Dismiss cookie consent if it appears
  try {
    const acceptCookiesBtn = targetPage.locator("#onetrust-accept-btn-handler, button:has-text('Accept'), button:has-text('Accept all')").first();
    if (await acceptCookiesBtn.count() > 0 && await acceptCookiesBtn.isVisible()) {
      console.log("Cookie consent banner found. Clicking accept...");
      await acceptCookiesBtn.click({ timeout: 5000 });
      await sleep(2000);
    }
  } catch (e) {
    console.log("Cookie banner check failed (ignoring):", e.message);
  }

  // 3. Adaptive check: if we are on signup or password setup page, try to proceed
  try {
    const passwordInput = targetPage.locator('input[type="password"], input[name="password"]').first();
    if (await passwordInput.count() > 0 && await passwordInput.isVisible()) {
      console.log("Password setup page detected. Filling password...");
      await passwordInput.fill("ChatGPTCourse2026!");
      await sleep(1000);
      const setPasswordBtn = targetPage.locator('button[data-testid="set-password"], button:has-text("Set Password"), button:has-text("Continue")').first();
      await setPasswordBtn.click();
      await sleep(4000);
    }
  } catch (e) {
    console.log("Password check failed (ignoring):", e.message);
  }

  // Skip recovery email if it asks
  try {
    const skipBtn = targetPage.locator('button[data-testid="skip-recovery-email"], button:has-text("Skip for now"), button:has-text("Skip")').first();
    if (await skipBtn.count() > 0 && await skipBtn.isVisible()) {
      console.log("Recovery email prompt found. Clicking skip...");
      await skipBtn.click();
      await sleep(4000);
    }
  } catch (e) {
    console.log("Skip recovery email check failed (ignoring):", e.message);
  }

  // 4. Locate and click the ChatGPT Course
  console.log("Locating the ChatGPT course link...");
  const chatgptCourse = targetPage.locator('a[aria-label*="ChatGPT"], a[href*="chatgpt"], a:has-text("ChatGPT"), a[aria-label*="chatgpt"]').first();
  await chatgptCourse.waitFor({ state: "visible", timeout: 20000 });
  console.log("Found ChatGPT course link. Clicking it...");
  await chatgptCourse.click();
  console.log("Clicked ChatGPT course link. Waiting for page load...");
  await sleep(6000);

  // 5. Click the Enroll / Go to course / Start / Continue button on the course page
  console.log("Locating the Enroll/Continue/Go to course/Start course button...");
  const actionButton = targetPage.locator('button:has-text("Enroll"), a:has-text("Enroll"), button:has-text("Go to course"), button:has-text("Start"), button:has-text("Continue"), button:has-text("Start the course")').first();
  await actionButton.waitFor({ state: "visible", timeout: 15000 });
  console.log("Action button found. Clicking it...");
  await actionButton.click();
  console.log("Clicked action button. Waiting for page to load...");
  await sleep(6000);

  console.log("Closing page to trigger recording save in the runner...");
  await targetPage.close();
  console.log("Automation task complete!");
  await browser.close();
}

main().catch((err) => {
  console.error("Error in automation script:", err);
});
