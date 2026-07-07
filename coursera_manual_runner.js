const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const readline = require("node:readline/promises");
const { stdin: input, stdout: output } = require("node:process");
const { execFileSync, execSync } = require("node:child_process");
const { chromium } = require("playwright-extra");
const { skip } = require("node:test");
const stealth = require("puppeteer-extra-plugin-stealth")();

// Apply the stealth plugin: spoofs navigator.webdriver, plugins, WebGL, etc.
chromium.use(stealth);

const CSV_FILE = "students.csv";
const COURSE_URL = "https://www.coursera.org/projects/build-a-computer-vision-app-with-azure-cognitive-services";
const BROWSEC_EXTENSION_ID = "omghfjlpggmjjaagoclmmobgdodcjboh";
const DEFAULT_BROWSEC_EXTENSION_PATH = path.resolve(__dirname, "extensions", "browsec");

// Heuristic reinforcement / adaptive learning metrics
let globalConsecutiveSuccesses = 0;
let globalSuccessStreak = 0;
let globalRemediationFactor = 1.0;
let lastSuccessfulEnrollButtonText = null;
let globalConsecutiveFailures = 0;
let cooldownActive = false;

// Dynamic Action-State Q-Table for button weight learning
let globalActionWeights = {};

async function loadLearnedWeights() {
  try {
    const data = await fs.readFile("learned_weights.json", "utf8");
    globalActionWeights = JSON.parse(data);
    console.log(`[RL] Loaded ${Object.keys(globalActionWeights).length} learned state profiles from learned_weights.json`);
  } catch {
    globalActionWeights = {};
    console.log("[RL] No learned_weights.json found, starting with empty/default Q-table.");
  }
}

async function saveLearnedWeights() {
  try {
    await fs.writeFile("learned_weights.json", JSON.stringify(globalActionWeights, null, 2), "utf8");
  } catch (e) {
    // ignore write errors
  }
}

function getPageStateKey(pageUrl, pageText = "", profileName = "default", vpnCountry = "default") {
  try {
    const url = new URL(pageUrl);
    // Dynamic key incorporating browser profile and active VPN location
    let key = `${url.pathname}@${profileName}@${vpnCountry}`;
    if (pageText.includes("unexpected error")) key += "#error";
    if (pageText.includes("Terms of Use")) key += "#tou";
    if (pageText.includes("onetrust")) key += "#cookies";
    return key;
  } catch {
    return "unknown";
  }
}

async function adaptiveActionDecision(page, log, targetCheck, TF = 1.0, profileName = "default", vpnCountry = "default") {
  let visibleButtons = [];
  const startWait = Date.now();
  const maxWait = 10000 * TF; // Wait up to 10 seconds (scaled by TF) for buttons to appear

  while (Date.now() - startWait < maxWait) {
    const buttonLocators = await page.locator('button, [role="button"], a.btn, a[href*="enroll"], a[href*="certificate"], a.cds-button, button.cds-button, input[type="button"], input[type="submit"]').all().catch(() => []);
    visibleButtons = [];

    for (const loc of buttonLocators) {
      try {
        const isVisible = await loc.isVisible().catch(() => false);
        if (!isVisible) continue;

        // Filter out buttons located in the global header or navigation elements
        const inHeaderOrNav = await loc.evaluate(el => {
          return !!el.closest('header, nav, [role="navigation"], [data-testid="header"]');
        }).catch(() => false);
        if (inHeaderOrNav) continue;

        const rawText = await loc.innerText().catch(() => "");
        const text = rawText.trim().toLowerCase().replace(/\s+/g, " ");
        const ariaLabel = (await loc.getAttribute("aria-label").catch(() => "") || "").trim().toLowerCase();
        const title = (await loc.getAttribute("title").catch(() => "") || "").trim().toLowerCase();
        if (!text && !ariaLabel) continue;

        // Hard-skip buttons that are never useful for course progression
        if (
          text.endsWith("?") ||
          text.includes("report") ||
          ariaLabel.includes("report") ||
          title.includes("report") ||
          /^(show \d+ more|learn more|read more|save now|save \d+% now|sounds great!|turn it off|how does this compare|what does the first week|will this help|is this the right level|what other options|set your goal|set a goal|in progress|in-progress|active|saved|archived)$/i.test(text)
        ) continue;

        visibleButtons.push({
          locator: loc,
          text,
          rawText
        });
      } catch {
        // ignore detached elements
      }
    }

    if (visibleButtons.length > 0) {
      break;
    }
    await page.waitForTimeout(200);
  }

  if (visibleButtons.length === 0) {
    return false;
  }

  // Compute the state key once at least one button is visible
  const currentUrl = page.url();
  const bodyText = await page.innerText("body").catch(() => "");
  const stateKey = getPageStateKey(currentUrl, bodyText, profileName, vpnCountry);

  if (!globalActionWeights[stateKey]) {
    globalActionWeights[stateKey] = {};
  }

  // Assign or bootstrap weights
  for (const btn of visibleButtons) {
    const text = btn.text;
    if (globalActionWeights[stateKey][text] === undefined) {
      // Bootstrap initial weights to guide early learning
      let initialWeight = 1.0;
      if (/^(continue|go to course|start learning|go to first project|enroll for free|start|start assignment|view certificate|submit|yes|agree|i agree|accept|i accept|accept all cookies|mark complete|start the guided project|go to first item|completed|certificates|download certificate|share certificate)$/i.test(text)) {
        initialWeight = 10.0;
      } else if (/close|cancel|reject/i.test(text)) {
        initialWeight = 0.5;
      }
      globalActionWeights[stateKey][text] = initialWeight;
    }
    btn.weight = globalActionWeights[stateKey][text];
  }

  // Sort choices by learned weight descending
  visibleButtons.sort((a, b) => b.weight - a.weight);

  // Filter out heavily penalized options to avoid wasting time
  const candidates = visibleButtons.filter(b => b.weight > -5.0);
  if (candidates.length === 0) return false;

  log(`[RL] State [${stateKey}] visible buttons: ` +
    candidates.map(b => `"${b.text}"(w:${b.weight.toFixed(1)})`).join(", ")
  );

  // Attempt the best choice
  const choice = candidates[0];
  log(`[RL] Decision: Attempting to click "${choice.text}"`);
  const preUrl = page.url();
  
  try {
    // Wait briefly (300ms to 800ms scaled by TF) to simulate human behavior and maintain stealth
    const waitTime = Math.max(300, 300 * TF) + Math.floor(Math.random() * 500);
    log(`[RL] Waiting ${(waitTime / 1000).toFixed(2)}s before clicking "${choice.text}"...`);
    await page.waitForTimeout(waitTime);

    // Dynamic click timeout scaled by the slowdown TF factor to prevent false timing drops on slower VPNs
    try {
      await choice.locator.click({ timeout: Math.max(5000, 5000 * TF) });
    } catch (clickErr) {
      log(`[RL] Normal click failed/timed out, attempting force click on "${choice.text}"...`);
      await choice.locator.click({ force: true, timeout: Math.max(5000, 5000 * TF) });
    }
    
    // Wait for navigation to settle
    await page.waitForURL(url => url !== preUrl, { timeout: 4000 * TF }).catch(() => {});
    await page.waitForLoadState("networkidle", { timeout: 3000 * TF }).catch(() => {});

    const postUrl = page.url();
    let success = false;
    if (targetCheck) {
      // Poll targetCheck for up to 3 seconds to allow page rendering to finish
      const checkStart = Date.now();
      while (Date.now() - checkStart < 3000 * TF) {
        if (await targetCheck()) {
          success = true;
          break;
        }
        await page.waitForTimeout(200);
      }
    } else {
      success = postUrl !== preUrl || postUrl.includes("/learn/");
    }
    
    if (success) {
      // Reward
      globalActionWeights[stateKey][choice.text] += 3.0;
      log(`[RL] Reward: +3.0 to "${choice.text}" in state [${stateKey}] (new weight: ${globalActionWeights[stateKey][choice.text].toFixed(1)})`);
      await saveLearnedWeights().catch(() => {});
      return true;
    } else {
      // Penalize slightly
      globalActionWeights[stateKey][choice.text] -= 1.0;
      log(`[RL] Penalty: -1.0 to "${choice.text}" (target check failed, new weight: ${globalActionWeights[stateKey][choice.text].toFixed(1)})`);
      await saveLearnedWeights().catch(() => {});
    }
  } catch (e) {
    // Penalize heavily for failure
    globalActionWeights[stateKey][choice.text] -= 3.0;
    log(`[RL] Penalty: -3.0 to "${choice.text}" due to failure: ${e.message.split("\n")[0]} (new weight: ${globalActionWeights[stateKey][choice.text].toFixed(1)})`);
    await saveLearnedWeights().catch(() => {});
  }
  
  return true;
}

async function adaptiveEnrollDecision(page, log, TF = 1.0, profileName = "default", vpnCountry = "default") {
  return await adaptiveActionDecision(page, log, null, TF, profileName, vpnCountry);
}

const COURSERA_BROWSER_PROFILES = [
  {
    name: "linux-us-east",
    userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
    headers: {
      "accept-language": "en-US,en;q=0.9",
      "sec-ch-ua": '"Google Chrome";v="149", "Chromium";v="149", "Not)A;Brand";v="24"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"Linux"',
    },
    locale: "en-US",
    timezoneId: "America/New_York",
    geolocation: { latitude: 40.7128, longitude: -74.0060 },
  },
  {
    name: "windows-us-west",
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
    headers: {
      "accept-language": "en-US,en;q=0.9",
      "sec-ch-ua": '"Google Chrome";v="149", "Chromium";v="149", "Not)A;Brand";v="24"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"Windows"',
    },
    locale: "en-US",
    timezoneId: "America/Los_Angeles",
    geolocation: { latitude: 34.0522, longitude: -118.2437 },
  },
  {
    name: "macos-us-east",
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
    headers: {
      "accept-language": "en-US,en;q=0.9",
      "sec-ch-ua": '"Google Chrome";v="149", "Chromium";v="149", "Not)A;Brand";v="24"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"macOS"',
    },
    locale: "en-US",
    timezoneId: "America/New_York",
    geolocation: { latitude: 40.7128, longitude: -74.0060 },
  },
  {
    name: "windows-gb",
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
    headers: {
      "accept-language": "en-GB,en;q=0.9,en-US;q=0.8",
      "sec-ch-ua": '"Google Chrome";v="149", "Chromium";v="149", "Not)A;Brand";v="24"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"Windows"',
    },
    locale: "en-GB",
    timezoneId: "Europe/London",
    geolocation: { latitude: 51.5072, longitude: -0.1276 },
  },
  {
    name: "macos-ca",
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
    headers: {
      "accept-language": "en-CA,en;q=0.9,en-US;q=0.8",
      "sec-ch-ua": '"Google Chrome";v="149", "Chromium";v="149", "Not)A;Brand";v="24"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"macOS"',
    },
    locale: "en-CA",
    timezoneId: "America/Toronto",
    geolocation: { latitude: 43.6532, longitude: -79.3832 },
  },
  {
    name: "linux-us-west",
    userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
    headers: {
      "accept-language": "en-US,en;q=0.9,uz;q=0.7",
      "sec-ch-ua": '"Google Chrome";v="149", "Chromium";v="149", "Not)A;Brand";v="24"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"Linux"',
    },
    locale: "en-US",
    timezoneId: "America/Los_Angeles",
    geolocation: { latitude: 34.0522, longitude: -118.2437 },
  },
  {
    name: "linux-gb",
    userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
    headers: {
      "accept-language": "en-GB,en;q=0.9,en-US;q=0.8",
      "sec-ch-ua": '"Google Chrome";v="149", "Chromium";v="149", "Not)A;Brand";v="24"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"Linux"',
    },
    locale: "en-GB",
    timezoneId: "Europe/London",
    geolocation: { latitude: 51.5072, longitude: -0.1276 },
  },
];
const USER_AGENT = COURSERA_BROWSER_PROFILES[0].userAgent;
const COURSERA_BROWSER_HEADERS = COURSERA_BROWSER_PROFILES[0].headers;
const PROFILE_BATCH_SIZE = 5;
const profileOrder = COURSERA_BROWSER_PROFILES
  .map((_, index) => index)
  .sort(() => Math.random() - 0.5);
let profileSequence = 0;

function courseraProfileForSequence(sequence) {
  const batch = Math.floor(sequence / PROFILE_BATCH_SIZE);
  const index = profileOrder[batch % profileOrder.length];
  return COURSERA_BROWSER_PROFILES[index];
}

function nextCourseraProfile() {
  const profile = courseraProfileForSequence(profileSequence);
  profileSequence += 1;
  return profile;
}

const COURSERA_SENTRY_ENVELOPE_URL =
  "https://o75955.ingest.sentry.io/api/4505745374576640/envelope/**";

function courseraContextOptions({ width = 1920, height = 1080, locale = null, profile = COURSERA_BROWSER_PROFILES[0] } = {}) {
  return {
    viewport: { width, height },
    userAgent: profile.userAgent,
    locale: locale || profile.locale,
    timezoneId: profile.timezoneId,
    geolocation: profile.geolocation,
    permissions: ["geolocation"],
    extraHTTPHeaders: profile.headers,
  };
}

async function applyCourseraNetworkProfile(context, profile = COURSERA_BROWSER_PROFILES[0]) {
  await context.route(COURSERA_SENTRY_ENVELOPE_URL, async (route, request) => {
    const headers = {
      ...request.headers(),
      ...profile.headers,
      accept: "*/*",
      "content-type": "text/plain;charset=UTF-8",
      origin: "https://www.coursera.org",
      referer: "https://www.coursera.org/",
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "cross-site",
      "user-agent": profile.userAgent,
      priority: "u=1, i",
    };
    await route.continue({ headers });
  });
}

const STEALTH_SCRIPT = `
  // 1. Hide Webdriver
  try {
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined,
    });
    delete Object.getPrototypeOf(navigator).webdriver;
  } catch (e) {}

  // 2. Mock Languages
  try {
    Object.defineProperty(navigator, 'languages', {
      get: () => ['en-US', 'en'],
    });
  } catch (e) {}

  // 3. Mock Plugins
  try {
    Object.defineProperty(navigator, 'plugins', {
      get: () => [
        {
          description: "Portable Document Format",
          filename: "internal-pdf-viewer",
          name: "Chrome PDF Viewer",
          length: 1
        }
      ],
    });
  } catch (e) {}

  // 4. Mock Permissions
  try {
    const originalQuery = window.navigator.permissions.query;
    window.navigator.permissions.query = (parameters) =>
      parameters.name === 'notifications'
        ? Promise.resolve({ state: Notification.permission })
        : originalQuery(parameters);
  } catch (e) {}

  // 5. Mock WebGL Vendor & Renderer
  try {
    const getParameter = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function(parameter) {
      if (parameter === 37445) return 'Intel Inc.';
      if (parameter === 37446) return 'Intel(R) Iris(TM) Plus Graphics 640';
      return getParameter.call(this, parameter);
    };
  } catch (e) {}
`;

// Build Chromium launch options tuned to look like a real browser to anti-bot
// systems (Arkose/FunCaptcha on Coursera signup). The big levers:
//   - --disable-blink-features=AutomationControlled removes the engine-level
//     `navigator.webdriver` automation signal (stronger than patching it in JS).
//   - CHANNEL=chrome launches the REAL installed Google Chrome instead of the
//     bundled Chromium (very different, less-flagged fingerprint). Install it
//     once with: npx playwright install chrome
//   - Headful (HEADLESS=n) is far less detectable than headless. On a server with
//     no display, run under a virtual one (xvfb-run) to stay headful.
function chromiumLaunchOptions(headless) {
  const args = [
    "--disable-blink-features=AutomationControlled",
    "--disable-features=IsolateOrigins,site-per-process",
    "--no-sandbox",
  ];
  const browsecPath = browsecExtensionPath();
  if (browsecEnabled()) {
    args.push(
      `--disable-extensions-except=${browsecPath}`,
      `--load-extension=${browsecPath}`,
    );
  }
  if (!headless) args.push("--start-maximized");
  const opts = { headless, args };
  const channel = process.env.CHANNEL || process.env.BROWSER_CHANNEL;
  if (channel) opts.channel = channel; // e.g. CHANNEL=chrome -> real Google Chrome
  if (browsecEnabled()) opts.ignoreDefaultArgs = ["--disable-extensions"];
  return opts;
}

function browsecEnabled() {
  return /^(1|y|yes|true)$/i.test(
    process.env.VPN || process.env.VPM || process.env.BROWSEC || process.env.USE_BROWSEC || ""
  );
}

function browsecExtensionPath() {
  return path.resolve(process.env.BROWSEC_EXTENSION_PATH || DEFAULT_BROWSEC_EXTENSION_PATH);
}

function browsecCountry() {
  return String(process.env.BROWSEC_COUNTRY || "us").trim().toLowerCase();
}

async function assertBrowsecExtensionReady() {
  if (!browsecEnabled()) return;
  const manifestPath = path.join(browsecExtensionPath(), "manifest.json");
  try {
    await fs.access(manifestPath);
  } catch {
    throw new Error(
      `VPN is enabled but Browsec extension was not found at ${browsecExtensionPath()}.\n` +
      "Set BROWSEC_EXTENSION_PATH to the unpacked extension folder containing manifest.json.",
    );
  }
}

async function createBrowserController(headless) {
  if (!browsecEnabled()) {
    const browser = await chromium.launch(chromiumLaunchOptions(headless));
    return {
      async newContext(options) {
        return await browser.newContext(options);
      },
      async close() {
        await browser.close().catch(() => {});
      },
    };
  }

  await assertBrowsecExtensionReady();
  if (headless) {
    console.log("-> BROWSEC=y requires extensions, so using HEADFUL Chromium.");
  }

  return {
    async newContext(options) {
      const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "coursera-browsec-"));
      const context = await chromium.launchPersistentContext(userDataDir, {
        ...chromiumLaunchOptions(false),
        ...options,
      });
      await enableBrowsecVpn(context);
      const originalClose = context.close.bind(context);
      context.close = async (...args) => {
        try {
          await originalClose(...args);
        } finally {
          await fs.rm(userDataDir, { recursive: true, force: true }).catch(() => {});
        }
      };
      return context;
    },
    async close() {},
  };
}

async function enableBrowsecVpn(context) {
  const country = browsecCountry();
  const extensionUrlPrefix = `chrome-extension://${BROWSEC_EXTENSION_ID}/`;
  const existingWorker = context
    .serviceWorkers()
    .find((worker) => worker.url().startsWith(extensionUrlPrefix));
  const worker = existingWorker || await context.waitForEvent("serviceworker", {
    timeout: 15000,
    predicate: (worker) => worker.url().startsWith(extensionUrlPrefix),
  });

  const state = await worker.evaluate(async (country) => {
    const waitFor = async (predicate, timeoutMs = 15000) => {
      const started = Date.now();
      while (Date.now() - started < timeoutMs) {
        if (await predicate()) return true;
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      return false;
    };

    const ready = await waitFor(() => self.store && self.highLevelPac && self.proxy);
    if (!ready) throw new Error("Browsec background API did not become ready.");

    await self.store.initiate();
    await self.highLevelPac.setCountry(country);
    if (self.reloadFullServersChain) {
      await self.reloadFullServersChain().catch(() => {});
    }
    await self.proxy.setFromStore();
    await waitFor(async () => {
      const { lowLevelPac } = await self.store.getStateAsync();
      return lowLevelPac && lowLevelPac.globalReturn === country;
    }, 10000);

    const { userPac, lowLevelPac, proxyServers } = await self.store.getStateAsync();
    return {
      mode: userPac.mode,
      country: userPac.country,
      globalReturn: lowLevelPac.globalReturn || null,
      freeCountries: Array.from(proxyServers.freeCountries ? proxyServers.freeCountries() : []),
    };
  }, country);

  if (state.mode !== "proxy") {
    throw new Error(`Browsec did not turn on. Current mode: ${state.mode || "(unknown)"}`);
  }
  if (state.country !== country || state.globalReturn !== country) {
    console.warn(
      `-> Browsec requested ${country}, current state: country=${state.country || "(none)"} ` +
      `globalReturn=${state.globalReturn || "(none)"}. Free countries: ${state.freeCountries.join(", ") || "(unknown)"}`,
    );
  } else {
    console.log(`-> Browsec VPN is ON (${country}).`);
  }
}

// --- Course-specific constants for AUTO mode (derived from the recording) ---
const COURSE_SLUG = "build-a-computer-vision-app-with-azure-cognitive-services";
const LEARN_BASE = `https://www.coursera.org/learn/${COURSE_SLUG}`;
const SUPPLEMENT_PATH = "/supplement/MhGNK/guided-project-overview";
const ASSIGNMENT_PATH = "/assignment-submission/fEJPQ/assess-your-knowledge";
const LAB_PATH = `/ungradedLab/Sr2cy/${COURSE_SLUG}`;
const SURVEY_PATH = "/ungradedWidget/xJWEK/course-end-survey-we-appreciate-your-feedback";
const ARTIFACTS_DIR = process.env.ARTIFACTS_DIR || "artifacts";
const OBSERVE_VERBOSE = /^(1|y|yes|true)$/i.test(process.env.OBSERVE_VERBOSE || "");
const CERT_ATTEMPTS = Number.parseInt(process.env.CERT_ATTEMPTS || "8", 10);
const CERT_WAIT_MS = Number.parseInt(process.env.CERT_WAIT_MS || "5000", 10);
const COLAB_RECOVERY = /^(1|y|yes|true)$/i.test(
  process.env.COURSERA_COLAB || process.env.COLAB_RECOVERY || process.env.GOOGLE_COLAB || "",
);
const envFlag = (name, defaultValue = false) => {
  const value = process.env[name];
  if (value == null || value === "") return defaultValue;
  return /^(1|y|yes|true)$/i.test(value);
};
const extraButtonsEnabled = () => envFlag("EXTRA", envFlag("EXTRA_BUTTONS", true));
// The graded-quiz answers the recorded student selected (stable per-course content IDs).
const QUIZ_ANSWER_IDS = [
  "2TwGVWrREeqKFQpvVMrRlw",
  "hrNXcK3dEeux2xL1pqXu9Q",
  "76DnjmrREeq23BInykBZSw",
  "AOQApGrSEeq23BInykBZSw",
  "Eb_ze2rSEeq23BInykBZSw",
  "9ujlN72qEeuH5RI9EGRpeQ",
  "I8ifqr2rEeuH5RI9EGRpeQ",
  "cwhAnb2rEeuH5RI9EGRpeQ",
];

function slugify(value) {
  return String(value || "page")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "page";
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

// Navigate resiliently: retry a few times and never throw, so a flaky network or a slow
// first paint can't crash a run before we've even captured the page. Returns true on a
// successful load, false if every attempt failed (the caller can still inspect the page).
async function safeGoto(page, url, { attempts = 3, timeout = 45000, log = () => {} } = {}) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout });
      await page.waitForLoadState("networkidle", { timeout: 12000 }).catch(() => {});
      if (await isCloudFrontBlockedPage(page)) {
        log("CloudFront 403 block detected on this network.");
        return false;
      }
      return true;
    } catch (error) {
      log(`navigation attempt ${attempt}/${attempts} failed: ${error.message.split("\n")[0]}`);
      if (attempt < attempts) await page.waitForTimeout(2000).catch(() => {});
    }
  }
  return false;
}

async function isCloudFrontBlockedPage(page) {
  const text = await page
    .locator("body")
    .innerText({ timeout: 2000 })
    .catch(() => "");
  return /403 ERROR/i.test(text) &&
    /request could not be satisfied/i.test(text) &&
    /Generated by cloudfront/i.test(text);
}

async function analyzePage(page) {
  return await page.evaluate(() => {
    const clean = (text) => String(text || "").replace(/\s+/g, " ").trim();
    const isVisible = (el) => {
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.visibility !== "hidden" &&
        style.display !== "none" &&
        rect.width > 0 &&
        rect.height > 0;
    };
    const controls = Array.from(document.querySelectorAll(
      "button, a, input, select, textarea, [role='button'], [role='link'], [role='checkbox'], [role='radio']"
    ))
      .filter(isVisible)
      .slice(0, 80)
      .map((el) => {
        const type = el.getAttribute("type") || "";
        const valueText = type.toLowerCase() === "password" ? "[password]" : el.value;
        return {
          tag: el.tagName.toLowerCase(),
          role: el.getAttribute("role") || "",
          type,
          text: clean(el.innerText || valueText || el.getAttribute("aria-label") || el.getAttribute("placeholder")),
          testId: el.getAttribute("data-testid") || "",
          name: el.getAttribute("name") || "",
          href: el.href || "",
        };
      });

    const bodyText = clean(document.body ? document.body.innerText : "");
    return {
      url: window.location.href,
      title: document.title,
      bodyText: bodyText.slice(0, 5000),
      controls,
    };
  }).catch((error) => ({
    url: page.url(),
    title: "",
    bodyText: "",
    controls: [],
    analysisError: error.message,
  }));
}

function createObserver(page, student) {
  let count = 0;
  const studentSlug = slugify(`${student.first_name}-${student.last_name}-${student.student_id || student.email}`);

  return {
    async capture(label, error = null) {
      count += 1;
      await fs.mkdir(ARTIFACTS_DIR, { recursive: true });
      const base = `${timestamp()}-${String(count).padStart(3, "0")}-${studentSlug}-${slugify(label)}`;
      const screenshotPath = path.join(ARTIFACTS_DIR, `${base}.png`);
      const analysisPath = path.join(ARTIFACTS_DIR, `${base}.json`);
      const analysis = await analyzePage(page);

      await page.screenshot({ path: screenshotPath }).catch(() => {});
      await fs.writeFile(analysisPath, JSON.stringify({
        label,
        capturedAt: new Date().toISOString(),
        student: {
          student_id: student.student_id || "",
          first_name: student.first_name || "",
          last_name: student.last_name || "",
          email: student.email || "",
        },
        error: error ? {
          name: error.name,
          message: error.message,
          stack: error.stack,
        } : null,
        analysis,
      }, null, 2), "utf8").catch(() => {});

      console.log(`  [observe] ${label}: ${screenshotPath} + ${analysisPath}`);
      return { screenshotPath, analysisPath, analysis };
    },
  };
}

async function clickAny(page, candidates, { timeout = 12000, optional = false, force = false, log = () => {} } = {}) {
  const deadline = Date.now() + timeout;
  let lastError = null;

  while (Date.now() < deadline) {
    for (const candidate of candidates) {
      try {
        let locator;
        if (candidate.role) {
          locator = page.getByRole(candidate.role, { name: candidate.name }).filter({ visible: true }).first();
        } else if (candidate.text) {
          locator = page.locator(`${candidate.selector || "button, a"}:has-text("${candidate.text}")`).filter({ visible: true }).first();
        } else {
          locator = page.locator(candidate.selector).filter({ visible: true }).first();
        }
        await locator.click({ timeout: 1500, force });
        log(`clicked ${candidate.label || candidate.selector || candidate.text || candidate.name}`);
        return true;
      } catch (error) {
        lastError = error;
      }
    }
    await page.waitForTimeout(500);
  }

  if (optional) {
    log(`(skip) none found: ${candidates.map((c) => c.label || c.selector || c.text || c.name).join(", ")}`);
    return false;
  }
  throw new Error(`could not click any candidate: ${lastError ? lastError.message.split("\n")[0] : "not found"}`);
}

async function findCertificateUrl(page) {
  const currentUrl = page.url();
  if (/coursera\.org\/(share|account\/accomplishments|verify)\b|\/accomplishments\//i.test(currentUrl)) {
    return currentUrl;
  }

  return await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll("a[href]")).map((a) => a.href);
    return links.find((href) =>
      /coursera\.org\/(share|account\/accomplishments|verify)\b|\/accomplishments\//i.test(href)
    ) || "";
  }).catch(() => "");
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = ""
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (quoted && char === '"' && next === '"') {
      value += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (!quoted && char === ",") {
      row.push(value);
      value = "";
    } else if (!quoted && (char === "\n" || char === "\r")) {
      if (char === "\r" && next === "\n") {
        i += 1;
      }
      row.push(value);
      if (row.some((field) => field.length > 0)) {
        rows.push(row);
      }
      row = [];
      value = "";
    } else {
      value += char;
    }
  }

  if (value.length > 0 || row.length > 0) {
    row.push(value);
    rows.push(row);
  }

  return rows;
}

function escapeCsv(value) {
  const text = value == null ? "" : String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

async function loadStudentsFromExcelAndCSV(csvFile, excelFile) {
  let csvStudents = [];
  try {
    const csvData = await loadStudents(csvFile);
    csvStudents = csvData.students;
  } catch (e) {
    // If CSV doesn't exist, we start with empty
  }

  let excelStudents = [];
  try {
    const pythonCmd = `python3 -c 'import openpyxl, json; wb = openpyxl.load_workbook("${excelFile}", data_only=True); sheet = wb["Talabalar"]; students = []; [students.append({"student_id": str(sheet.cell(r, 1).value).strip(), "full_name": str(sheet.cell(r, 2).value).strip()}) for r in range(3, sheet.max_row + 1) if sheet.cell(r, 1).value and sheet.cell(r, 2).value]; print(json.dumps(students))'`;
    const jsonOutput = execSync(pythonCmd, { encoding: "utf8", maxBuffer: 50 * 1024 * 1024 });
    excelStudents = JSON.parse(jsonOutput);
  } catch (e) {
    console.error("Error reading Excel file names.xlsx:", e.message);
    throw new Error(`Failed to load names.xlsx: ${e.message}`);
  }

  const csvMap = new Map();
  for (const s of csvStudents) {
    if (s.student_id) {
      csvMap.set(s.student_id, s);
    }
  }

  const mergedStudents = excelStudents.map((es) => {
    const parts = es.full_name.trim().split(/\s+/);
    const first_name = parts[0] || "";
    const last_name = parts.slice(1).join(" ") || "";

    const existing = csvMap.get(es.student_id) || {};
    return {
      student_id: es.student_id,
      first_name: first_name,
      last_name: last_name,
      email: existing.email || "",
      certificate_url: existing.certificate_url || "",
      password: existing.password || "",
    };
  });

  return mergedStudents;
}

async function loadStudents(csvFile) {
  const text = await fs.readFile(csvFile, "utf8");
  const rows = parseCsv(text);
  const headers = rows.shift();

  return {
    headers,
    students: rows.map((row) =>
      Object.fromEntries(headers.map((header, index) => [header, row[index] || ""])),
    ),
  };
}

async function saveStudents(csvFile, headers, students) {
  const lines = [
    headers.map(escapeCsv).join(","),
    ...students.map((student) => headers.map((header) => escapeCsv(student[header])).join(",")),
  ];
  await fs.writeFile(csvFile, `${lines.join("\n")}\n`, "utf8");
}

async function submitToGoogleForm(browser, fullName, email, password, certUrl, logPrefix = "", profile = COURSERA_BROWSER_PROFILES[0]) {
  const prefix = logPrefix ? `${logPrefix} ` : "";
  const log = (m) => console.log(`  ${prefix}[google-form] ${m}`);

  let formUrl = "https://forms.gle/Jw4WsW1kao7f6WtC7";
  try {
    const configData = await fs.readFile("config.json", "utf8");
    const config = JSON.parse(configData);
    if (config.GOOGLE_FORM_URL) {
      formUrl = config.GOOGLE_FORM_URL;
    }
  } catch (e) {}

  const context = await browser.newContext(courseraContextOptions({ width: 1280, height: 800, locale: "uz-UZ", profile }));
  await applyCourseraNetworkProfile(context, profile);
  await context.addInitScript(STEALTH_SCRIPT);
  const page = await context.newPage();
  try {
    log(`Submitting details for ${fullName} (${email})...`);
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
      log(`Successfully submitted to Google Form.`);
    } else {
      log(`Warning: Submission screen check did not match expected confirmation text. Page text: ${text.replace(/\\s+/g, " ").substring(0, 100)}`);
    }
  } catch (e) {
    log(`Error submitting to Google Form: ${e.message}`);
  } finally {
    await context.close().catch(() => {});
  }
}

function generateRandomCredentials() {
  const firstNames = [
    "James", "John", "Robert", "Michael", "William", "David", "Richard", "Joseph",
    "Thomas", "Charles", "Christopher", "Daniel", "Matthew", "Anthony", "Mark", "Donald",
    "Mary", "Patricia", "Jennifer", "Linda", "Elizabeth", "Barbara", "Susan", "Jessica",
    "Sarah", "Karen", "Lisa", "Nancy", "Betty", "Sandra", "Margaret", "Ashley"
  ];
  const lastNames = [
    "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis",
    "Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez", "Wilson", "Anderson", "Thomas",
    "Taylor", "Moore", "Jackson", "Martin", "Lee", "Perez", "Thompson", "White"
  ];

  const first = firstNames[Math.floor(Math.random() * firstNames.length)];
  const last = lastNames[Math.floor(Math.random() * lastNames.length)];
  const randomNum = `${Date.now()}${Math.floor(Math.random() * 1000)}`; // Unix time (ms) + jitter

  const email = `${first.toLowerCase()}.${last.toLowerCase()}.${randomNum}@gmail.com`;
  const password = `${first}${last}!${Math.floor(Math.random() * 900) + 100}`;

  return {
    first_name: first,
    last_name: last,
    email: email,
    password: password
  };
}

function makePassword(student) {
  const clean = (s) => String(s || "").replace(/[^a-zA-Z0-9]/g, "");
  const first = clean(student.first_name) || "User";
  const last = clean(student.last_name) || "Student";
  return `${first}${last}!${Math.floor(Math.random() * 900) + 100}`;
}

// Build a fresh, unique email from the student's real name so each run signs up a new
// account (Coursera rejects sign-up if the email already exists). Keeps the name intact —
// only the email changes — e.g. "Jennifer Lopez" -> "jennifer.lopez.4837261@gmail.com".
function makeFreshEmail(student) {
  const slug = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  const first = slug(student.first_name).substring(0, 8) || "user";
  const last = slug(student.last_name).substring(0, 8) || "student";
  // Full Unix time (ms) so every run yields a unique address; name kept intact.
  const rand = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  return `${first}.${last}.${rand}@gmail.com`;
}

// AUTO mode: drive the whole course with robust, semantic locators (accessible name / role /
// data-testid / id) and known URLs — no recorded DOM paths, no timing waits. Playwright's
// locators auto-wait for the element to be actionable, so this is both faster and far more
// reliable than replaying coordinates. Returns the certificate URL (or "" if not reached).
async function runAutomatedFlow(page, student, logPrefix = "", profile = null) {
  const FULL = `${student.first_name} ${student.last_name}`.trim();
  const prefix = logPrefix ? `${logPrefix} ` : "";
  const log = (m) => console.log(`  ${prefix}[auto] ${m}`);
  const observer = createObserver(page, student);

  // Slow / VPN networks: SPEED or SLOW_FACTOR (>= 1) multiplies EVERY wait below so a step
  // doesn't fail just because a page or button took longer to arrive. Default 1
  // (no change). If a VPN is enabled, default to 2 (2x slower) to prevent disasters.
  const defaultSlowdown = browsecEnabled() ? 2 : 1;
  const baseTF = Math.max(1, Number(process.env.SPEED) || Number(process.env.SLOW_FACTOR) || defaultSlowdown);
  const speedScale = Math.max(0.7, 1.0 - (globalConsecutiveSuccesses * 0.1));
  const TF = Math.max(1, baseTF * speedScale * globalRemediationFactor);
  const profileName = profile ? profile.name : "default";
  const vpnCountry = browsecEnabled() ? browsecCountry() : "default";
  log(`Starting run with Speed Factor TF=${TF.toFixed(2)} (base=${baseTF}, successScale=${speedScale.toFixed(2)}, remediationScale=${globalRemediationFactor.toFixed(2)}, consecutiveSuccesses=${globalConsecutiveSuccesses})`);
  page.setDefaultNavigationTimeout(45000 * TF);
  page.setDefaultTimeout(15000 * TF);

  // The cookie-consent ("We Care About Your Privacy" / OneTrust) dialog can pop
  // up at ANY moment and overlay the page. Register an auto-handler so Playwright
  // clicks Accept the instant it appears and blocks an action — no matter when —
  // then retries the action. Runs unlimited times; never throws.
  const cookieAccept = page
    .locator("#onetrust-accept-btn-handler")
    .or(page.getByRole("button", { name: /^accept( all( cookies)?)?$/i }))
    .first();
  await page
    .addLocatorHandler(cookieAccept, async () => {
      await cookieAccept.click({ timeout: 5000 * TF }).catch(() => {});
      log("auto-accepted cookie consent");
    }, { noWaitAfter: true })
    .catch(() => {});

  const clickRole = async (role, name, { timeout = 15000, optional = false } = {}) => {
    const loc = page.getByRole(role, { name }).filter({ visible: true }).first();
    try {
      await loc.click({ timeout: timeout * TF });
      log(`clicked ${role} "${name}"`);
      return true;
    } catch (e) {
      if (optional) { log(`(skip) ${role} "${name}" not found`); return false; }
      await observer.capture(`failed-click-${role}`, e);
      throw new Error(`could not click ${role} "${name}": ${e.message.split("\n")[0]}`);
    }
  };
  const clickSel = async (selector, { timeout = 15000, optional = false, force = false } = {}) => {
    const loc = page.locator(selector).filter({ visible: true }).first();
    try {
      await loc.click({ timeout: timeout * TF, force });
      log(`clicked ${selector}`);
      return true;
    } catch (e) {
      if (optional) { log(`(skip) ${selector} not found`); return false; }
      await observer.capture(`failed-click-${selector}`, e);
      throw new Error(`could not click ${selector}: ${e.message.split("\n")[0]}`);
    }
  };
  const fillSel = async (selector, value, { timeout = 15000, optional = false } = {}) => {
    try {
      const loc = page.locator(selector).first();
      await loc.fill(value, { timeout: timeout * TF });
      await loc.focus().catch(() => {});
      await page.keyboard.press("End").catch(() => {});
      await page.keyboard.press("Space").catch(() => {});
      await page.keyboard.press("Backspace").catch(() => {});
      await loc.blur().catch(() => {});
      log(`filled ${selector}`);
      return true;
    } catch (e) {
      if (optional) { log(`(skip) fill ${selector} not found`); return false; }
      await observer.capture(`failed-fill-${selector}`, e);
      throw new Error(`could not fill ${selector}: ${e.message.split("\n")[0]}`);
    }
  };
  const goto = async (url) => {
    log(`goto ${url}`);
    await page.goto(url, { waitUntil: "domcontentloaded" }).catch(() => {});
    await page.waitForLoadState("networkidle", { timeout: 3000 * TF }).catch(() => {});
    if (await isCloudFrontBlockedPage(page)) {
      await observer.capture("cloudfront-403-block");
      throw new Error(
        "CloudFront 403 block detected. This network/IP is blocked; switch to a permitted network or resolve access with the site owner before retrying.",
      );
    }
    if (OBSERVE_VERBOSE) await observer.capture(`goto-${new URL(url).pathname}`);
  };

  // Coursera intermittently drops the freshly-created session by the time we reach
  // the graded assignment, replacing the quiz with a "Log in or create account"
  // wall (visible input[name="email"]). When that happens there is no quiz and no
  // submit button, so every option + the submit click "time out". Detect the wall
  // and sign back in with the SAME credentials we just registered, then return to
  // `returnUrl` so the quiz loads authenticated. No-op when already logged in.
  // Returns true if it had to re-login. Retries the login a couple of times.
  const ensureLoggedIn = async (returnUrl) => {
    const isWalled = async () =>
      (await page.locator('input[name="email"]').filter({ visible: true }).first().count().catch(() => 0)) > 0;
    if (!(await isWalled())) return false;
    log("login wall detected on a post-signup page — signing back in");
    for (let attempt = 1; attempt <= 3; attempt++) {
      const emailBox = page.locator('input[name="email"]').filter({ visible: true }).first();
      await emailBox.fill(student.email, { timeout: 10000 * TF }).catch(() => {});
      await clickRole("button", /^continue$/i, { optional: true, timeout: 12000 });
      await page.waitForTimeout(1500 * TF);
      const pwBox = page.locator('input[name="password"]').filter({ visible: true }).first();
      await pwBox.fill(student.password, { timeout: 10000 * TF }).catch(() => {});
      // Existing-account submit is "Login"; tolerate "Log in"/"Continue"/"Submit".
      await clickRole("button", /^(log ?in|continue|submit)$/i, { optional: true, timeout: 12000 });
      await page.waitForLoadState("networkidle", { timeout: 6000 * TF }).catch(() => {});
      if (returnUrl) await goto(returnUrl);
      if (!(await isWalled())) {
        log(`re-login succeeded (attempt ${attempt})`);
        return true;
      }
      log(`re-login attempt ${attempt} did not clear the wall; retrying`);
    }
    log("WARNING: still on the login wall after re-login attempts");
    await observer.capture("relogin-failed");
    return true;
  };

  // Coursera SOMETIMES interrupts the post-signup/enroll flow with a "We've
  // updated our Terms of Use" consent dialog (the URL gains showTouAccept=1).
  // It often does NOT appear at all. This is self-gating: it does a quick,
  // bounded check and returns immediately when no accept control is on screen,
  // so signup behaves identically whether or not the dialog shows. Never throws.
  const acceptTermsDialog = async () => {
    const accept = /^(accept|i accept|accept (and continue|& continue)|agree|i agree)$/i;
    const btn = page.getByRole("button", { name: accept }).filter({ visible: true }).first();
    const present = await btn
      .waitFor({ state: "visible", timeout: 2500 })
      .then(() => true)
      .catch(() => false);
    if (!present) return false;  // no dialog — nothing to do, fall straight through
    // Tick any required consent checkbox in the surrounding dialog, then accept.
    const dialog = page.getByRole("dialog").filter({ visible: true }).first();
    if (await dialog.count().catch(() => 0)) {
      const boxes = dialog.locator('input[type="checkbox"]');
      const n = await boxes.count().catch(() => 0);
      for (let i = 0; i < n; i++) {
        await boxes.nth(i).check({ force: true, timeout: 2000 }).catch(() => {});
      }
    }
    await btn.click({ timeout: 5000 }).catch(() => {});
    log("accepted Terms of Use dialog");
    await page.waitForLoadState("networkidle", { timeout: 3000 }).catch(() => {});
    return true;
  };

  // Coursera's cookie-consent dialog ("We Care About Your Privacy" with Accept /
  // Reject) overlays the page and blocks the Enroll/Continue buttons until it's
  // dismissed. Click Accept. Best-effort and tolerant of slow (VPN) loads: it
  // waits up to `timeout` for the banner to appear, retries a couple of times,
  // and never throws. No-op (fast) when there's no banner.
  const acceptCookies = async ({ timeout = 2000 } = {}) => {
    const deadline = Date.now() + timeout * TF;
    do {
      // OneTrust's standard accept button id is the most reliable anchor; fall
      // back to an "Accept"/"Accept all cookies" button by its accessible name.
      const byId = page.locator("#onetrust-accept-btn-handler").filter({ visible: true }).first();
      const byText = page
        .getByRole("button", { name: /^accept( all( cookies)?)?$/i })
        .filter({ visible: true })
        .first();
      for (const [loc, label] of [[byId, "onetrust"], [byText, "accept"]]) {
        if (await loc.count().catch(() => 0)) {
          try {
            await loc.click({ timeout: 4000 * TF });
            log(`accepted cookie consent (${label})`);
            await page.waitForLoadState("networkidle", { timeout: 3000 * TF }).catch(() => {});
            return true;
          } catch (e) { /* try the other locator / next poll */ }
        }
      }
      await page.waitForTimeout(500);
    } while (Date.now() < deadline);
    return false;
  };

  // The "Enroll for free" button on the /projects/ landing page is a
  // PROGRESSIVELY-ENHANCED control. The saved DOM shows it server-rendered as a
  // plain GET form:
  //   <form action="/projects/<slug>" method="GET">
  //     <input type="hidden" name="action" value="enroll">
  //     <button type="submit" data-e2e="enroll-button">Enroll for free</button>
  //   </form>
  // Coursera's React attaches the REAL enroll handler (an XHR that enrolls, then
  // redirects into /learn/) onClick only AFTER hydration. If we click before
  // hydration finishes, the native form submit wins and merely reloads
  // /projects/?action=enroll WITHOUT enrolling — which is exactly the bounce the
  // logs showed (`after enrollment, URL: .../projects/...?action=enroll`). So we
  // (a) wait for the page to settle so the handler is wired up, and (b) prefer the
  // stable [data-e2e="enroll-button"] selector over fragile "Enroll for free" text.
  const clickEnroll = async ({ timeout = 20000, optional = false } = {}) => {
    const bySelector = page
      .locator('[data-e2e="enroll-button"], button:has-text("Enroll for free")')
      .filter({ visible: true })
      .first();
    try {
      // Wait for the enroll button to appear in the DOM and be visible
      await bySelector.waitFor({ state: "visible", timeout: 8000 * TF });
      // Brief human-like settle to ensure hydration is complete (500ms)
      await page.waitForTimeout(500);
      await bySelector.click({ timeout: timeout * TF });
      log('clicked enroll button');
      return true;
    } catch (e) {
      return clickRole("button", /enroll for free/i, { optional, timeout });
    }
  };

  // After signup the "Enroll for free" click sometimes fires (URL gains
  // ?action=enroll) but the page never transitions into the course — the account
  // stays UNENROLLED on the /projects/ marketing landing page. When that happens
  // every /learn/<slug>/... URL silently redirects back to /projects/, so the
  // supplement/lab/quiz never load and the quiz "options" are all "not found".
  // This verifies enrollment by navigating to the course home and checking we
  // actually land on a /learn/ URL (not bounced to /projects/); if we got bounced
  // it re-clicks Enroll (incl. the modal-confirm variant) and waits for the
  // redirect, retrying a few times. Returns true once enrolled.
  // The real enroll button usually carries data-e2e="enroll-button", but the
  // Colab failure artifact showed a plain submit button with only visible text.
  // Treat either shape as the "still unenrolled" signal.
  const ENROLL_BTN = 'button[data-e2e="enroll-button"], button:has-text("Enroll for free")';
  const countEnrollButtons = async () =>
    await page.locator(ENROLL_BTN).filter({ visible: true }).count().catch(() => 0);
  const isProjectLanding = () => {
    const url = page.url();
    return /coursera\.org\/projects\//i.test(url);
  };
  const isOnLearnCourse = async () =>
    page.url().startsWith(LEARN_BASE) && !(await countEnrollButtons());
  const settleAfterClick = async (clicked, { timeout = 4000, urlPattern = null } = {}) => {
    if (!clicked) return;
    const waits = [
      page.waitForLoadState("networkidle", { timeout: timeout * TF }).catch(() => {}),
    ];
    if (urlPattern) {
      waits.push(page.waitForURL(urlPattern, { timeout: timeout * TF }).catch(() => {}));
    }
    await Promise.race(waits);
  };

  const recoverFromLandingAndRetry = async (targetUrl, label = "course page") => {
    if (!COLAB_RECOVERY) {
      await goto(targetUrl);
      return true;
    }

    const targetPath = new URL(targetUrl).pathname;
    for (let attempt = 1; attempt <= 3; attempt++) {
      await goto(targetUrl);
      const currentPath = new URL(page.url()).pathname;
      const onTargetCourse = page.url().startsWith(LEARN_BASE) && currentPath === targetPath;
      const enrollVisible = await countEnrollButtons();
      if (onTargetCourse && !enrollVisible) {
        if (attempt > 1) log(`${label} reached after landing recovery: ${page.url()}`);
        return true;
      }

      log(`${label} bounced/stayed on landing (attempt ${attempt}): ${page.url()} — reopening landing and enrolling`);
      await goto(COURSE_URL);
      await acceptCookies({ timeout: 4000 });
      await clickEnroll({ optional: true, timeout: 12000 });
      await clickRole("button", /^(enroll for free|continue|start|go to course|start learning)$/i, { optional: true, timeout: 8000 });
      await page.waitForURL(/\/learn\//, { timeout: 20000 * TF }).catch(() => {});
      await page.waitForLoadState("networkidle", { timeout: 3000 * TF }).catch(() => {});
    }

    await observer.capture(`landing-recovery-failed-${slugify(label)}`);
    throw new Error(`${label} stayed on the landing page after repeated enroll recovery attempts.`);
  };

  const ensureEnrolled = async () => {
    if (await isOnLearnCourse()) {
      log(`enrollment confirmed from current page: ${page.url()}`);
      return true;
    }
    for (let attempt = 1; attempt <= 4; attempt++) {
      await goto(`${LEARN_BASE}/home/welcome`);
      // Enrolled iff we land on a /learn/ URL AND the project page's enroll
      // button is gone (it lingers in the DOM on the bounced marketing page).
      const onLearn = /\/learn\//.test(page.url());
      const enrollVisible = await countEnrollButtons();
      if (onLearn && !enrollVisible) {
        log(`enrollment confirmed (attempt ${attempt}): ${page.url()}`);
        return true;
      }
      log(`not enrolled yet (attempt ${attempt}): url=${page.url()} enrollBtn=${enrollVisible} — clicking Enroll`);
      if (!isProjectLanding()) {
        await goto(COURSE_URL);
      }
      await acceptCookies({ timeout: 4000 });
      // clickEnroll waits for hydration first so the real enroll XHR fires
      // instead of the GET-form fallback that just re-bounces to /projects/.
      await clickEnroll({ optional: true, timeout: 10000 });
      // A confirmation dialog ("Enroll for free"/"Continue") sometimes follows the
      // first click; click it too, then wait for the redirect into the course.
      await clickRole("button", /^(enroll for free|continue|start)$/i, { optional: true, timeout: 6000 });
      await page.waitForURL(/\/learn\//, { timeout: 20000 }).catch(() => {});
    }
    // Final verdict: on /learn/ and no enroll button left to click.
    const stillEnroll = await countEnrollButtons();
    return /\/learn\//.test(page.url()) && !stillEnroll;
  };

  // 1) Landing page -> Enroll for free
  await goto(COURSE_URL);
  await observer.capture("landing");
  await acceptCookies({ timeout: 1500 });  // dismiss the cookie banner before it blocks anything
  await clickEnroll({ timeout: 25000 });
  // On slow (VPN) links the first click often registers but doesn't actually
  // open the sign-up form. In slow mode (SLOW_FACTOR >= 2) always give it a
  // second click after a short settle — optional, so it's a no-op/skip if the
  // form already opened (the button is gone once the form is up).
  if (extraButtonsEnabled() && TF >= 2) {
    await page.waitForTimeout(1500 * TF);
    await clickEnroll({ optional: true, timeout: 8000 });
  }

  // 2) Sign-up form
  await fillSel('input[name="email"]', student.email);
  await clickRole("button", /^continue$/i);
  await fillSel('input[name="name"]', FULL);
  await fillSel('input[name="password"]', student.password);
  await clickRole("button", /join for free/i);
  if (extraButtonsEnabled()) {
    await clickRole("button", /join for free/i, { optional: true, timeout: 1000 });
  }
  await page.waitForLoadState("networkidle", { timeout: 3000 }).catch(() => {});
  log(`after sign-up, URL: ${page.url()}`);
  await observer.capture("after-signup");

  // OFF BY DEFAULT. The original working version never touched a Terms-of-Use
  // dialog — the navigation to /home/welcome below already moves past any
  // post-signup interstitial without interacting with the page. Interacting with
  // it was the only behavioral change vs the original, so we don't do it unless
  // explicitly asked. Set ENABLE_TOU=y to opt back into clicking Accept.
  if (/^(1|y|yes|true)$/i.test(process.env.ENABLE_TOU || "") && page.url().includes("showTouAccept")) {
    await acceptTermsDialog();
  }

  // Check if we got blocked or CAPTCHAd
  const currentUrl = page.url();
  if (currentUrl.includes("#authMode=signup") || currentUrl.includes("#authMode=login")) {
    const captchaExists = await page.locator('iframe[src*="arkose"], iframe[title*="verification"], iframe[src*="funcaptcha"]').count();
    if (captchaExists > 0) {
      throw new Error("Signup blocked: CAPTCHA challenge triggered.");
    }
    const bodyText = await page.innerText("body").catch(() => "");
    if (bodyText.includes("unexpected error") || bodyText.includes("Please solve this puzzle") || bodyText.includes("Protecting your account") || bodyText.includes("verify you are human")) {
      throw new Error("Signup blocked: CAPTCHA or unexpected signup error alert detected.");
    }
    const joinBtn = page.locator('button:has-text("Join for free")').first();
    const btnVisible = await joinBtn.isVisible().catch(() => false);
    if (btnVisible) {
      throw new Error("Signup blocked: Form did not submit (Join button still visible).");
    }
  }

  // 3) Finish enrollment: run adaptive decision loop until we land in the course (/learn/)
  const enrollDeadline = Date.now() + 50000 * TF;
  log("Entering adaptive reinforcement learning enrollment loop...");
  
  await acceptCookies({ timeout: 6000 });
  
  while (Date.now() < enrollDeadline && !(await isOnLearnCourse())) {
    // Fail fast if we get CAPTCHAd or blocked during this phase
    const bodyText = await page.innerText("body").catch(() => "");
    if (bodyText.includes("unexpected error") || bodyText.includes("Please solve this puzzle") || bodyText.includes("verify you are human")) {
      throw new Error("Enrollment blocked: CAPTCHA or unexpected error detected during enrollment loop.");
    }

    const madeMove = await adaptiveEnrollDecision(page, log, TF, profileName, vpnCountry);
    if (!madeMove) {
      log("No confident buttons found via adaptive learning, trying clickEnroll fallback...");
      const clicked = await clickEnroll({ optional: true, timeout: 8000 });
      if (clicked) {
        await settleAfterClick(clicked, { timeout: 6000, urlPattern: /\/learn\// });
      } else {
        await page.waitForTimeout(3000 * TF);
      }
    }
  }
  // After the Enroll/Continue clicks above, Coursera should redirect into the
  // course. Verify it actually took without bouncing away from a page that has
  // already opened; if enrollment never completes there is no point walking
  // through a quiz that can't load — fail fast so the queue retries.
  if (!/\/learn\//.test(page.url())) {
    await page.waitForURL(/\/learn\//, { timeout: 30000 }).catch(() => {});
  }
  await page.waitForLoadState("networkidle", { timeout: 2000 }).catch(() => {});
  log(`after enrollment, URL: ${page.url()}`);
  if (!(await ensureEnrolled())) {
    await observer.capture("enrollment-failed");
    throw new Error("Enrollment did not complete: account stayed on the /projects/ landing page (every /learn/ URL bounced back).");
  }
  // These starter controls unlock the guided-project items. Without them,
  // Coursera can bounce direct supplement/lab URLs back to /home/module/1.
  await clickSel('input[type="checkbox"]', { optional: true, force: true, timeout: 8000 });

  const startBtn = page.getByRole("button", { name: /start the guided project/i }).filter({ visible: true }).first();
  const goFirstBtn = page.getByRole("button", { name: /go to first item/i }).filter({ visible: true }).first();

  const chosenBtn = await Promise.race([
    startBtn.waitFor({ state: "visible", timeout: 3000 * TF }).then(() => startBtn).catch(() => null),
    goFirstBtn.waitFor({ state: "visible", timeout: 3000 * TF }).then(() => goFirstBtn).catch(() => null),
  ]);

  if (chosenBtn) {
    const isStart = chosenBtn === startBtn;
    await chosenBtn.click({ timeout: 5000 * TF }).catch(() => {});
    log(`clicked button "/${isStart ? "start the guided project" : "go to first item"}/i"`);
    await settleAfterClick(true, { timeout: 6000, urlPattern: /\/(supplement|item)\// });
  } else {
    log('(skip) buttons "/start the guided project/i" and "/go to first item/i" not found');
  }
  log(`after start-project, URL: ${page.url()}`);
  await observer.capture("after-start-project");

  // 5) Open the graded assignment and start it (supplement and lab are skipped for speed)
  await recoverFromLandingAndRetry(`${LEARN_BASE}${ASSIGNMENT_PATH}`, "assignment page");
  log(`assignment page URL: ${page.url()}`);
  // If the session was dropped, the assignment URL shows a login wall instead of
  // the quiz — re-authenticate and reload before trying to answer/submit.
  const didLogin = await ensureLoggedIn(`${LEARN_BASE}${ASSIGNMENT_PATH}`);
  if (didLogin) {
    await recoverFromLandingAndRetry(`${LEARN_BASE}${ASSIGNMENT_PATH}`, "assignment page after login");
  }

  log("Starting assignment via adaptive RL decision loop...");
  const assignDeadline = Date.now() + 30000 * TF;
  // Exclude inputs/labels inside dialogs/modals (e.g. the "Report an Issue"
  // modal has radio buttons that would otherwise fake a quiz-ready signal).
  const isQuizLoaded = async () =>
    (await page.locator('label, input[type="radio"], input[type="checkbox"]')
      .filter({ visible: true })
      .filter({ hasNot: page.locator('[role="dialog"], [role="alertdialog"], .rc-Modal, [data-testid*="modal"]') })
      .count().catch(() => 0)) > 0;

  while (Date.now() < assignDeadline && !(await isQuizLoaded())) {
    const madeMove = await adaptiveActionDecision(page, log, isQuizLoaded, TF, profileName, vpnCountry);
    if (!madeMove) {
      log("No confident buttons found on assignment page, trying standard fallbacks...");
      const clicked = await clickSel('button[data-testid="continue-button"], button[data-testid="CoverPageActionButton"]', { optional: true, timeout: 5000 });
      if (!clicked) {
        await page.waitForTimeout(3000 * TF);
      }
    }
  }
  await page.waitForLoadState("networkidle", { timeout: 2000 }).catch(() => {});

  // 6) Select the correct options for the quiz based on correct answer texts
  const answers = [
    /12 months of free.*200\$/i,
    /container that holds related resources/i,
    /Standard Tier/i,
    /Free tier/i,
    /Two keys/i,
    /^200$/i,
    /JSON/i,
    /OperationID/i,
    /^C#$/i,
    /^Java$/i,
    /^ObjC$/i,
    /^Python$/i
  ];

  log("Waiting for quiz questions to load...");
  await page.waitForSelector("label", { state: "visible", timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(500);

  log("Answering quiz questions...");
  for (const pattern of answers) {
    try {
      const label = page.locator("label").filter({ hasText: pattern }).first();
      const count = await label.count();
      if (count > 0) {
        await label.scrollIntoViewIfNeeded({ timeout: 4000 });
        
        // Wait at least 1.5 seconds (plus small random jitter) before checking to simulate human behavior
        const quizWaitTime = Math.max(1500, 1500 * TF) + Math.floor(Math.random() * 500);
        log(`[Quiz] Waiting ${(quizWaitTime / 1000).toFixed(2)}s before selecting option "${pattern}"...`);
        await page.waitForTimeout(quizWaitTime);

        const input = label.locator("input").first();
        if (await input.count() > 0) {
          await input.check({ timeout: 4000, force: true }).catch(async () => {
            await label.click({ timeout: 4000, force: true });
          });
        } else {
          await label.click({ timeout: 4000, force: true });
        }
        log(`Answered matching: ${pattern}`);
      } else {
        const fallback = page.locator("span, div, p").filter({ hasText: pattern }).first();
        if (await fallback.count() > 0) {
          // Wait at least 1.5 seconds (plus small random jitter) before clicking fallback
          const quizWaitTime = Math.max(1500, 1500 * TF) + Math.floor(Math.random() * 500);
          log(`[Quiz] Waiting ${(quizWaitTime / 1000).toFixed(2)}s before selecting fallback option "${pattern}"...`);
          await page.waitForTimeout(quizWaitTime);

          await fallback.click({ timeout: 4000, force: true });
          log(`Answered matching (fallback): ${pattern}`);
        } else {
          log(`Warning: Option matching ${pattern} not found`);
        }
      }
    } catch (e) {
      log(`Error answering matching ${pattern}: ${e.message.split("\n")[0]}`);
    }
  }

  // 7) Honor code + submit
  await fillSel('input[data-testid="honor-code-legal-name-input"]', FULL, { optional: true });
  // The submit button often sits below the fold and behind lazy-rendered content;
  // scroll it into view first so the click isn't intercepted, then click.
  const submitBtn = page.locator('button[data-testid="submit-button"]').filter({ visible: true }).first();
  await submitBtn.scrollIntoViewIfNeeded({ timeout: 5000 * TF }).catch(() => {});
  // Wait at least 1.5 seconds (plus small random jitter) before clicking submit
  const submitWaitTime = Math.max(1500, 1500 * TF) + Math.floor(Math.random() * 500);
  log(`[Quiz] Waiting ${(submitWaitTime / 1000).toFixed(2)}s before clicking submit button...`);
  await page.waitForTimeout(submitWaitTime);
  await clickSel('button[data-testid="submit-button"]', { timeout: 10000 });

  // Wait at least 1.5 seconds (plus small random jitter) before clicking the dialog submit confirmation
  const dialogSubmitWaitTime = Math.max(1500, 1500 * TF) + Math.floor(Math.random() * 500);
  log(`[Quiz] Waiting ${(dialogSubmitWaitTime / 1000).toFixed(2)}s before clicking dialog submit confirmation button...`);
  await page.waitForTimeout(dialogSubmitWaitTime);
  await clickSel('button[data-testid="dialog-submit-button"]', { timeout: 12000 });
  // After confirming the quiz submit, stay on the page briefly so Coursera can
  // persist the submission state before we move to the next course item.
  await page.waitForTimeout(4000 * TF);
  await page.waitForLoadState("networkidle", { timeout: 3000 }).catch(() => {});
  await observer.capture("after-quiz-submit");

  // 8) Verify name (required before the certificate is issued) - survey is skipped for speed
  await goto("https://www.coursera.org/user-verification?returnTo=%2Fmy-learning%3FmyLearningTab%3DCERTIFICATES");
  await fillSel("#first-name", student.first_name, { optional: true });
  await fillSel("#last-name", student.last_name, { optional: true });
  await clickSel("#check-acknowledge-age-base", { optional: true, force: true });
  
  log("Submitting name verification via adaptive RL decision loop...");
  const nameDeadline = Date.now() + 20000 * TF;
  const hasLeftVerification = async () => {
    const url = page.url();
    return !url.includes("user-verification");
  };
  while (Date.now() < nameDeadline && !(await hasLeftVerification())) {
    const madeMove = await adaptiveActionDecision(page, log, hasLeftVerification, TF, profileName, vpnCountry);
    if (!madeMove) {
      log("No confident buttons found on name verification page, trying submit fallback...");
      const clicked = await clickRole("button", /^submit$/i, { optional: true, timeout: 5000 });
      if (!clicked) {
        await page.waitForTimeout(3000 * TF);
      }
    }
  }
  await page.waitForLoadState("networkidle", { timeout: 2000 }).catch(() => {});
  await observer.capture("after-name-verification");

  // 9) Open the certificate and capture its public URL. The certificate can take a little
  //    while to generate after the course hits 100%, so retry a few times.
  for (let attempt = 1; attempt <= CERT_ATTEMPTS; attempt++) {
    await goto("https://www.coursera.org/my-learning?myLearningTab=CERTIFICATES");
    let directUrl = await findCertificateUrl(page);
    if (directUrl) {
      log(`certificate link found on page: ${directUrl}`);
      return directUrl;
    }

    const certFound = async () => {
      const url = await findCertificateUrl(page);
      return !!url;
    };

    log(`Attempting to locate certificate page via adaptive RL (attempt ${attempt}/${CERT_ATTEMPTS})...`);
    const madeMove = await adaptiveActionDecision(page, log, certFound, TF, profileName, vpnCountry);
    if (madeMove) {
      await page.waitForLoadState("networkidle", { timeout: 2000 }).catch(() => {});
      directUrl = await findCertificateUrl(page);
      if (directUrl) {
        log(`certificate page: ${directUrl}`);
        return directUrl;
      }
    } else {
      // Fallback
      const viewLink = page.getByRole("link", { name: /view certificate/i }).filter({ visible: true }).first();
      if (await viewLink.count().catch(() => 0)) {
        await viewLink.click({ timeout: 12000 }).catch(() => {});
        await page.waitForLoadState("networkidle", { timeout: 2000 }).catch(() => {});
        const url = await findCertificateUrl(page);
        if (url) {
          log(`certificate page (fallback): ${url}`);
          return url;
        }
      }
    }

    await observer.capture(`certificate-not-ready-${attempt}`);
    log(`certificate not ready yet (attempt ${attempt}/${CERT_ATTEMPTS}), waiting...`);
    await page.waitForTimeout(CERT_WAIT_MS);
  }
  log(`no certificate URL captured (ended at ${page.url()})`);
  await observer.capture("no-certificate-url");
  return "";
}

async function promptForCertificateUrl(rl, page) {
  const currentUrl = page.url();
  console.log(`\nCurrent browser URL: ${currentUrl}`);
  const answer = await rl.question(
    "Paste certificate URL, type CURRENT to use current browser URL, or press Enter to leave blank: ",
  );

  if (answer.trim().toUpperCase() === "CURRENT") {
    return currentUrl;
  }

  return answer.trim();
}

// Dismiss any overlays/dialogs that intercept pointer events
async function dismissOverlays(page) {
  // Coursera "broken Chrome version" warning dialog
  const brokenDialog = page.locator('.broken-chrome-version-dialog-bg-fix, [id*="broken-chrome"]').first();
  if (await brokenDialog.count() > 0 && await brokenDialog.isVisible().catch(() => false)) {
    // Try pressing Escape to close it
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }
  // Dismiss any generic modal overlay by pressing Escape
  const modal = page.locator('[role="dialog"]').first();
  if (await modal.count() > 0 && await modal.isVisible().catch(() => false)) {
    const closeBtn = modal.locator('button[aria-label="close"], button[aria-label="Close"], button.cds-closeButton').first();
    if (await closeBtn.count() > 0) {
      await closeBtn.click({ force: true }).catch(() => {});
    }
  }
}

// ===================== Distributed coordinator (queue) mode =====================
// When COORDINATOR_URL is set, PCs do NOT iterate a local START..END range.
// Instead each worker repeatedly CLAIMS the next available student from a shared
// Google Apps Script + Sheet queue, runs the full flow, then reports done/failed.
// The coordinator guarantees no two PCs ever get the same student (atomic claim)
// and auto-reclaims students whose PC crashed (lease expiry). On any failure the
// student is simply redone from scratch (fresh signup) by whichever PC claims it
// next, so nothing is lost and no manual number-juggling is needed. See coordinator/.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function makePcId() {
  return process.env.PC_ID || `${os.hostname()}-${process.pid}-${Math.random().toString(36).slice(2, 7)}`;
}

// POST a JSON action to the coordinator with exponential-backoff retries. The
// Apps Script web app 302-redirects to googleusercontent.com; fetch follows it.
async function coordinatorRequest(url, action, payload = {}, { retries = 6 } = {}) {
  const body = JSON.stringify({ action, token: process.env.COORDINATOR_TOKEN || "", ...payload });
  let lastErr;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        redirect: "follow",
      });
      const text = await resp.text();
      if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${text.slice(0, 160)}`);
      let json;
      try {
        json = JSON.parse(text);
      } catch (e) {
        throw new Error(`non-JSON reply: ${text.slice(0, 160)}`);
      }
      if (json && json.error) throw new Error(`coordinator error: ${json.error}`);
      return json;
    } catch (e) {
      lastErr = e;
      const backoff = Math.min(20000, 800 * 2 ** attempt) + Math.floor(Math.random() * 600);
      await sleep(backoff);
    }
  }
  throw new Error(`coordinator '${action}' failed after ${retries} tries: ${lastErr.message}`);
}

// Turn a claimed {student_id, full_name} into a runnable student with a brand-new
// unique email + password (each retry is a fresh signup, so a half-made account
// from a crashed PC never blocks anyone).
function cleanClaimName(value) {
  const name = String(value || "").replace(/\s+/g, " ").trim();
  if (!name) return "";
  if (/^student\s+user$/i.test(name)) return "";
  return name;
}

async function fileExists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

async function findFullNameByStudentId(studentId) {
  const id = String(studentId || "").trim();
  if (!id) return "";

  for (const csvFile of ["queue_seed.csv", CSV_FILE]) {
    if (!(await fileExists(csvFile))) continue;
    try {
      const { students } = await loadStudents(csvFile);
      const match = students.find((student) => String(student.student_id || "").trim() === id);
      if (!match) continue;
      const fullName = cleanClaimName(match.full_name);
      if (fullName) return fullName;
      const fromParts = cleanClaimName(`${match.first_name || ""} ${match.last_name || ""}`);
      if (fromParts) return fromParts;
    } catch {
      // Try the next roster source.
    }
  }

  if (await fileExists("names.xlsx")) {
    try {
      const script = [
        "import json, openpyxl, sys",
        "student_id = sys.argv[1]",
        "wb = openpyxl.load_workbook('names.xlsx', data_only=True)",
        "sheet = wb['Talabalar']",
        "name = ''",
        "for r in range(3, sheet.max_row + 1):",
        "    sid = sheet.cell(r, 1).value",
        "    if sid and str(sid).strip() == student_id:",
        "        name = str(sheet.cell(r, 2).value or '').strip()",
        "        break",
        "print(json.dumps(name))",
      ].join("\n");
      const out = execFileSync("python3", ["-c", script, id], { encoding: "utf8", maxBuffer: 5 * 1024 * 1024 });
      return cleanClaimName(JSON.parse(out));
    } catch {
      return "";
    }
  }

  return "";
}

async function buildStudentFromClaim(claim) {
  let fullName = cleanClaimName(claim.full_name || claim.name);
  if (!fullName) {
    const firstLast = cleanClaimName(`${claim.first_name || ""} ${claim.last_name || ""}`);
    fullName = firstLast || await findFullNameByStudentId(claim.student_id);
  }
  if (!fullName) {
    throw new Error(
      `Coordinator claim for student_id=${claim.student_id || "(missing)"} has no full_name, ` +
      "and no local roster fallback found. Fix/import the Queue full_name column before running.",
    );
  }

  const parts = fullName.split(/\s+/).filter(Boolean);
  const first = parts[0];
  const last = parts.slice(1).join(" ");
  const student = { student_id: claim.student_id, first_name: first, last_name: last, email: "", password: "" };
  student.email = makeFreshEmail(student);
  student.password = makePassword(student);
  return student;
}

// Run the whole course flow for one student in Chromium, returning { cert, error }.
async function runFlowWithFallbacks(browser, student, headless, logPrefix, initialProfile = COURSERA_BROWSER_PROFILES[0]) {
  let cert = "";
  let error = "";
  
  const maxRetries = 3;
  let attemptProfile = initialProfile;
  
  const browsecCountries = ["us", "gb", "nl", "sg"];
  let currentCountryIdx = browsecCountries.indexOf(browsecCountry());
  if (currentCountryIdx === -1) currentCountryIdx = 0;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    if (attempt > 1) {
      console.log(`\n${logPrefix} [remediation] Attempt ${attempt - 1} was challenged/blocked. Triggering self-correction retry...`);
      
      // Reset successes and slow down subsequent actions
      globalConsecutiveSuccesses = 0;
      globalRemediationFactor = Math.min(3.0, globalRemediationFactor + 0.5);
      
      // Rotate Profile
      const nextProfileIdx = (COURSERA_BROWSER_PROFILES.indexOf(attemptProfile) + 1) % COURSERA_BROWSER_PROFILES.length;
      attemptProfile = COURSERA_BROWSER_PROFILES[nextProfileIdx];
      console.log(`${logPrefix} [remediation] Rotating browser profile to: ${attemptProfile.name}`);
      
      // Cycle Browsec country if enabled
      if (browsecEnabled()) {
        currentCountryIdx = (currentCountryIdx + 1) % browsecCountries.length;
        const newCountry = browsecCountries[currentCountryIdx];
        process.env.BROWSEC_COUNTRY = newCountry;
        console.log(`${logPrefix} [remediation] Cycling Browsec VPN country to: ${newCountry.toUpperCase()}`);
      }
      
      // Cooldown wait before trying again
      await sleep(6000);
    }
    
    let context;
    try {
      context = await browser.newContext(courseraContextOptions({ profile: attemptProfile }));
      await applyCourseraNetworkProfile(context, attemptProfile);
      await context.addInitScript(STEALTH_SCRIPT);
      const page = await context.newPage();
      
      cert = await runAutomatedFlow(page, student, logPrefix, attemptProfile);
      if (cert) {
        // Success: reward the reinforcement metrics
        globalConsecutiveSuccesses++;
        globalSuccessStreak = Math.max(globalSuccessStreak, globalConsecutiveSuccesses);
        globalRemediationFactor = Math.max(1.0, globalRemediationFactor - 0.2);
        break;
      }
    } catch (err) {
      error = err.message;
      console.warn(`\n${logPrefix} [queue] Attempt ${attempt} failed: ${err.message}`);
    } finally {
      if (context) {
        await context.close().catch(() => {});
      }
    }
  }
  
  return { cert: cert || "", error: cert ? "" : error };
}

async function runCoordinatorMode(config) {
  const coordinatorUrl = process.env.COORDINATOR_URL || config.COORDINATOR_URL;
  const pcId = makePcId();

  // Headless: explicit env/config wins, otherwise auto-headless when no display.
  const envHeadlessRaw = process.env.HEADLESS || (config.HEADLESS !== undefined ? (config.HEADLESS ? "y" : "n") : null);
  const hasDisplay = Boolean(process.env.DISPLAY || process.env.WAYLAND_DISPLAY);
  const headless = envHeadlessRaw ? /^(1|y|yes|true)$/i.test(envHeadlessRaw) : !hasDisplay;

  let concurrency = Math.max(1,
    process.env.CONCURRENCY ? parseInt(process.env.CONCURRENCY, 10)
      : (config.CONCURRENCY !== undefined ? parseInt(config.CONCURRENCY, 10) : 1));
  if (browsecEnabled() && concurrency !== 1) {
    console.log("-> BROWSEC=y uses a persistent Chrome extension context; forcing CONCURRENCY=1.");
    concurrency = 1;
  }
  const heartbeatMs = Math.max(30, parseInt(process.env.HEARTBEAT_SEC || "180", 10)) * 1000;

  console.log("\n==================== DISTRIBUTED (QUEUE) MODE ====================");
  console.log(`-> Coordinator : ${coordinatorUrl}`);
  console.log(`-> This PC id  : ${pcId}`);
  console.log(`-> Concurrency : ${concurrency}    Headless: ${headless}`);
  console.log("==================================================================");

  // Fail fast with a clear message if the coordinator URL is wrong/unreachable.
  let stats;
  try {
    stats = await coordinatorRequest(coordinatorUrl, "stats", {});
  } catch (e) {
    throw new Error(
      `Cannot reach the coordinator at COORDINATOR_URL.\n  ${e.message}\n` +
      "Check the URL, that the Apps Script is deployed as a Web app with access " +
      "'Anyone', and that the queue sheet is seeded."
    );
  }
  if (stats && stats.counts) console.log(`-> Queue at start: ${JSON.stringify(stats.counts)}`);

  const browser = await createBrowserController(headless);
  let processed = 0;
  let failedHere = 0;

  const worker = async (wid) => {
    while (true) {
      let claim;
      try {
        claim = await coordinatorRequest(coordinatorUrl, "claim", { pc: pcId });
      } catch (e) {
        console.warn(`[queue:w${wid}] claim failed: ${e.message}; retrying in 10s`);
        await sleep(10000);
        continue;
      }
      if (claim.done) {
        console.log(`[queue:w${wid}] queue drained — no claimable students left. Exiting.`);
        return;
      }
      if (claim.wait) {
        // Nothing claimable right now, but other PCs still hold leases that may
        // expire and need redoing. Idle a bit, then ask again.
        await sleep(8000 + Math.floor(Math.random() * 6000));
        continue;
      }

      let student;
      try {
        student = await buildStudentFromClaim(claim);
      } catch (e) {
        console.error(`[queue:w${wid}] bad claim row ${claim.row || "?"}: ${e.message}`);
        await coordinatorRequest(coordinatorUrl, "fail", {
          pc: pcId, row: claim.row, student_id: claim.student_id,
          error: e.message.slice(0, 300),
        }).catch((err) => console.warn(`[queue:w${wid}] report bad-claim failed: ${err.message}`));
        failedHere++;
        continue;
      }
      const fullName = `${student.first_name} ${student.last_name}`.trim();
      const logPrefix = `[${student.student_id}]`;
      if (!cleanClaimName(claim.full_name || claim.name)) {
        console.warn(`${logPrefix} [queue:w${wid}] coordinator claim had no full_name; using local roster name: ${fullName}`);
      }
      console.log(`\n${logPrefix} [queue:w${wid}] claimed (attempt ${claim.attempt}): ${fullName} / ${student.email}`);

      // Keep the lease alive while this (possibly multi-minute) student runs.
      const hb = setInterval(() => {
        coordinatorRequest(coordinatorUrl, "heartbeat", { pc: pcId, row: claim.row, student_id: claim.student_id })
          .catch(() => {});
      }, heartbeatMs);

      const profile = nextCourseraProfile();
      console.log(`${logPrefix} [queue:w${wid}] browser profile: ${profile.name} (cycles every ${PROFILE_BATCH_SIZE} students)`);

      const studentStartTime = Date.now();
      let result = { cert: "", error: "" };
      try {
        result = await runFlowWithFallbacks(browser, student, headless, logPrefix, profile);
      } catch (e) {
        result = { cert: "", error: e.message };
      } finally {
        clearInterval(hb);
      }

      const duration = ((Date.now() - studentStartTime) / 1000).toFixed(1);

      if (result.cert) {
        try {
          await submitToGoogleForm(browser, fullName, student.email, student.password, result.cert, logPrefix, profile);
        } catch (errForm) {
          console.error(`${logPrefix} [queue] Google Form submission failed: ${errForm.message}`);
        }
        await coordinatorRequest(coordinatorUrl, "complete", {
          pc: pcId, row: claim.row, student_id: claim.student_id,
          email: student.email, password: student.password, certificate_url: result.cert,
        }).catch((e) => console.warn(`${logPrefix} report 'complete' failed: ${e.message}`));
        processed++;
        globalConsecutiveFailures = 0;
        console.log(`${logPrefix} [queue:w${wid}] DONE -> ${result.cert} (Completed in ${duration} seconds)`);
      } else {
        await coordinatorRequest(coordinatorUrl, "fail", {
          pc: pcId, row: claim.row, student_id: claim.student_id,
          error: (result.error || "no certificate captured").slice(0, 300),
        }).catch((e) => console.warn(`${logPrefix} report 'fail' failed: ${e.message}`));
        failedHere++;
        globalConsecutiveFailures++;
        console.log(`${logPrefix} [queue:w${wid}] FAILED -> released for another PC to retry (Failed in ${duration} seconds). Error: ${result.error || "no certificate captured"}`);
        console.error(`[CRITICAL] Consecutive student failures: ${globalConsecutiveFailures}/5`);
        if (globalConsecutiveFailures >= 5) {
          if (!cooldownActive) {
            cooldownActive = true;
            console.error(`[CRITICAL] 5 consecutive student failures detected. Entering cooling-down sleep for 5 hours before automatically resuming queue processing...`);
            for (let hr = 1; hr <= 5; hr++) {
              await sleep(60 * 60 * 1000); // Wait 1 hour
              console.log(`[Cooldown Update] ${hr}/5 hours elapsed...`);
            }
            globalConsecutiveFailures = 0;
            cooldownActive = false;
            console.log(`[INFO] Cool-down complete. Resuming queue processing...`);
          } else {
            // If another worker thread already triggered the cooldown, wait until it finishes
            while (cooldownActive) {
              await sleep(10000);
            }
          }
        }
      }
    }
  };

  try {
    await Promise.all(Array.from({ length: concurrency }, (_, i) => worker(i)));
  } finally {
    await browser.close().catch(() => {});
  }
  console.log(`\n[queue] This PC finished. Completed: ${processed}, failed/released: ${failedHere}`);
}

async function main() {
  await loadLearnedWeights().catch(() => {});
  // Read config.json for default parameters if it exists
  let config = {};
  try {
    const configData = await fs.readFile("config.json", "utf8");
    config = JSON.parse(configData);
  } catch (e) {
    // config.json doesn't exist or is invalid, ignore
  }

  // Let config.json bake in the browser channel (e.g. "chrome" for real Google
  // Chrome) the same way it does HEADLESS/COORDINATOR_URL. Env still wins.
  if (config.CHANNEL && !process.env.CHANNEL) process.env.CHANNEL = config.CHANNEL;
  // Set VPN/VPM/BROWSEC from config.json
  const configVpn = config.VPN !== undefined ? config.VPN : (config.VPM !== undefined ? config.VPM : config.BROWSEC);
  if (configVpn !== undefined) {
    if (!process.env.VPN) process.env.VPN = String(configVpn);
    if (!process.env.VPM) process.env.VPM = String(configVpn);
    if (!process.env.BROWSEC) process.env.BROWSEC = String(configVpn);
  }
  if (config.BROWSEC_COUNTRY && !process.env.BROWSEC_COUNTRY) {
    process.env.BROWSEC_COUNTRY = config.BROWSEC_COUNTRY;
  }
  if (config.BROWSEC_EXTENSION_PATH && !process.env.BROWSEC_EXTENSION_PATH) {
    process.env.BROWSEC_EXTENSION_PATH = config.BROWSEC_EXTENSION_PATH;
  }
  // Set SPEED/SLOW_FACTOR (scale all waits up for slow/VPN links).
  if (config.SPEED && !process.env.SPEED) process.env.SPEED = String(config.SPEED);
  if (config.SLOW_FACTOR && !process.env.SLOW_FACTOR) process.env.SLOW_FACTOR = String(config.SLOW_FACTOR);
  // Optional slow-path Coursera buttons. Default is the original safer behavior.
  // Set EXTRA=n to skip duplicate safety clicks. Set OPEN_LAB=n separately to
  // skip the external lab launch.
  if (Object.hasOwn(config, "EXTRA") && !process.env.EXTRA) process.env.EXTRA = String(config.EXTRA);
  if (Object.hasOwn(config, "EXTRA_BUTTONS") && !process.env.EXTRA_BUTTONS) process.env.EXTRA_BUTTONS = String(config.EXTRA_BUTTONS);
  if (Object.hasOwn(config, "OPEN_LAB") && !process.env.OPEN_LAB) process.env.OPEN_LAB = String(config.OPEN_LAB);

  // --- Distributed (queue) mode ---
  // If a coordinator URL is configured, this PC pulls students from the shared
  // queue instead of a local range. This is the multi-PC path; it never touches
  // students.csv and needs no START/END.
  if (process.env.COORDINATOR_URL || config.COORDINATOR_URL) {
    await runCoordinatorMode(config);
    return;
  }

  // --- Env-var driven non-interactive mode ---
  // Set MODE=replay, RANDOM_CREDS=y, HEADLESS=y to run fully automated.
  const envMode       = process.env.MODE        ? process.env.MODE.toLowerCase()        : null;
  const envRandCreds  = process.env.RANDOM_CREDS ? process.env.RANDOM_CREDS.toLowerCase() : null;

  const envHeadlessRaw = process.env.HEADLESS || (config.HEADLESS !== undefined ? (config.HEADLESS ? "y" : "n") : null);
  const envHeadless   = envHeadlessRaw           ? envHeadlessRaw.toLowerCase()           : null;
  const autoMode      = envMode === "replay" || envMode === "record" || envMode === "manual" || envMode === "auto" || envMode === "diagnose";
  const diagnoseMode  = envMode === "diagnose";

  const rl = autoMode ? null : readline.createInterface({ input, output });

  async function ask(prompt, defaultVal) {
    if (autoMode || rl === null) return defaultVal;
    return await rl.question(prompt);
  }

  const envStart = process.env.START ? parseInt(process.env.START, 10) : (config.START !== undefined ? parseInt(config.START, 10) : 1);
  const envEnd = process.env.END ? parseInt(process.env.END, 10) : (config.END !== undefined ? parseInt(config.END, 10) : null);
  const envConcurrency = process.env.CONCURRENCY ? parseInt(process.env.CONCURRENCY, 10) : (config.CONCURRENCY !== undefined ? parseInt(config.CONCURRENCY, 10) : 3);

  const excelFile = "names.xlsx";
  let excelExists = false;
  try {
    await fs.access(excelFile);
    excelExists = true;
  } catch (e) {}

  let students = [];
  let headers = ["student_id", "first_name", "last_name", "email", "certificate_url", "password"];

  if (excelExists) {
    console.log(`-> Loading students from ${excelFile} and merging with ${CSV_FILE}...`);
    students = await loadStudentsFromExcelAndCSV(CSV_FILE, excelFile);
  } else {
    console.log(`-> Loading students from ${CSV_FILE}...`);
    const csvData = await loadStudents(CSV_FILE);
    students = csvData.students;
    headers = csvData.headers;
  }

  if (!headers.includes("password")) {
    headers.push("password");
  }
  if (!headers.includes("certificate_url")) {
    headers.push("certificate_url");
  }

  const startIdx = Math.max(1, envStart);
  const endIdx = envEnd !== null ? Math.min(students.length, envEnd) : students.length;
  console.log(`-> Range selected: student ${startIdx} to ${endIdx} (out of ${students.length} total)`);
  const rangeStudents = students.slice(startIdx - 1, endIdx);

  const pendingStudents = rangeStudents.filter((student) => !student.certificate_url?.trim());

  // DIAGNOSE is a read-only probe of the public page — it should run even when every student
  // already has a certificate. Fall back to any student (or a synthetic one) just so the
  // observer has a name to slugify for the artifact filenames.
  const runStudents = diagnoseMode
    ? [pendingStudents[0] || students[0] || { student_id: "diagnose", first_name: "diagnose", last_name: "probe", email: "" }]
    : pendingStudents;

  if (runStudents.length === 0) {
    console.log("All students already have certificate URLs.");
    if (rl) rl.close();
    return;
  }

  let mode = "manual";
  let recordingData = null;
  const recordingFilePath = "recorded_steps.json";

  try {
    const data = await fs.readFile(recordingFilePath, "utf8");
    recordingData = JSON.parse(data);
  } catch (e) {
    // Ignore error if file doesn't exist
  }

  if (envMode) {
    mode = envMode;
  } else if (recordingData && recordingData.steps && recordingData.steps.length > 0) {
    const ans = await ask(
      "\nRecorded steps found. Replay them [Y/n], record a [n]ew sequence, or run in [m]anual-only mode? ",
      "y"
    );
    const choice = ans.trim().toLowerCase();
    if (choice === "n") {
      mode = "record";
    } else if (choice === "m") {
      mode = "manual";
    } else {
      mode = "replay";
    }
  } else {
    const ans = await ask(
      "\nNo recorded steps found. Record a new sequence [Y/n] or run in [m]anual-only mode? ",
      "y"
    );
    const choice = ans.trim().toLowerCase();
    if (choice === "m") {
      mode = "manual";
    } else {
      mode = "record";
    }
  }

  console.log(`Running in ${mode.toUpperCase()} mode.`);

  let useRandomCreds = false;
  if (envRandCreds === "y" || envRandCreds === "yes") {
    useRandomCreds = true;
    console.log("-> Will generate and save random student credentials to students.csv.");
  } else if (!autoMode) {
    const randAns = await ask("\nUse random credentials for all students? [y/N]: ", "n");
    const randChoice = randAns.trim().toLowerCase();
    if (randChoice === "y" || randChoice === "yes") {
      useRandomCreds = true;
      console.log("-> Will generate and save random student credentials to students.csv.");
    }
  }

  // Fresh-email mode: keep each student's name/password but mint a unique email per run so
  // sign-up never collides with an already-created account. Defaults ON in replay mode
  // (the new-account-per-student workflow); set FRESH_EMAIL=n to disable, or it's ignored
  // when random credentials are in use.
  const envFreshEmail = process.env.FRESH_EMAIL ? process.env.FRESH_EMAIL.toLowerCase() : null;
  let useFreshEmail = false;
  if (!useRandomCreds) {
    if (envFreshEmail === "n" || envFreshEmail === "no") {
      useFreshEmail = false;
    } else if (envFreshEmail === "y" || envFreshEmail === "yes" || mode === "replay" || mode === "auto") {
      useFreshEmail = true;
      console.log("-> Fresh-email mode: a unique email will be generated per student each run.");
    }
  }

  const hasDisplay = Boolean(process.env.DISPLAY || process.env.WAYLAND_DISPLAY);
  let headless = false;
  if (envHeadless === "y" || envHeadless === "yes") {
    headless = true;
    console.log("-> Running in HEADLESS mode.");
  } else if (autoMode && !hasDisplay) {
    // No X11/Wayland display available — a headful launch would crash, so fall back to
    // headless automatically. This keeps `npm run diagnose`/`auto` working over SSH or in CI.
    headless = true;
    console.log("-> No display detected; running in HEADLESS mode automatically.");
  } else if (!autoMode) {
    const headlessAns = await ask("\nRun browser in headless mode? [y/N]: ", "n");
    const headlessChoice = headlessAns.trim().toLowerCase();
    if (headlessChoice === "y" || headlessChoice === "yes") {
      headless = true;
      console.log("-> Running in HEADLESS mode.");
    } else {
      console.log("-> Running in HEADFUL mode (requires active X11/Wayland display).");
    }
  }

  const browser = await createBrowserController(headless);

  let recordingDone = false;
  try {
    if (mode === "auto") {
      // Clamp configured concurrency to a sane range: at least 1, and never
      // more workers than there are students to process.
      let requested = Number.isFinite(envConcurrency) ? envConcurrency : 1;
      if (browsecEnabled() && requested !== 1) {
        console.log("-> BROWSEC=y uses a persistent Chrome extension context; forcing CONCURRENCY=1.");
        requested = 1;
      }
      const concurrency = Math.max(1, Math.min(requested, runStudents.length));
      console.log(`-> Running in AUTO mode with CONCURRENCY=${concurrency}`);

      // Process a single student end-to-end. Errors are contained here so one
      // failure never aborts the other workers.
      const processStudent = async (student, index) => {
        const studentStartTime = Date.now();
        if (useRandomCreds) {
          const randCreds = generateRandomCredentials();
          student.first_name = randCreds.first_name;
          student.last_name = randCreds.last_name;
          student.email = randCreds.email;
          student.password = randCreds.password;
        } else if (useFreshEmail) {
          student.email = makeFreshEmail(student);
        }

        const fullName = `${student.first_name} ${student.last_name}`;
        const password = student.password || makePassword(student);
        student.password = password;

        const logPrefix = `[${student.student_id || student.first_name}]`;
        console.log(`\n${logPrefix} Starting flow (${index + 1}/${runStudents.length}): ${fullName} / ${student.email}`);
        const profile = courseraProfileForSequence(index);
        console.log(`${logPrefix} Browser profile: ${profile.name} (cycles every ${PROFILE_BATCH_SIZE} students)`);

        const context = await browser.newContext(courseraContextOptions({ profile }));
        await applyCourseraNetworkProfile(context, profile);
        await context.addInitScript(STEALTH_SCRIPT);

        const page = await context.newPage();

        let cert = "";
        try {
          cert = await runAutomatedFlow(page, student, logPrefix, profile);
        } catch (err) {
          console.warn(`\n${logPrefix} [AUTO] Chromium flow stopped: ${err.message}`);
        } finally {
          await context.close().catch(() => {});
        }

        const duration = ((Date.now() - studentStartTime) / 1000).toFixed(1);

        student.certificate_url = cert || "";
        if (student.certificate_url) {
          globalConsecutiveFailures = 0;
          console.log(`\n${logPrefix} Certificate captured: ${student.certificate_url} (Completed in ${duration} seconds)`);
        } else {
          globalConsecutiveFailures++;
          console.log(`\n${logPrefix} Flow finished but no certificate URL was captured (Failed in ${duration} seconds).`);
          console.error(`[CRITICAL] Consecutive student failures: ${globalConsecutiveFailures}/5`);
          if (globalConsecutiveFailures >= 5) {
            if (!cooldownActive) {
              cooldownActive = true;
              console.error(`[CRITICAL] 5 consecutive student failures detected. Entering cooling-down sleep for 5 hours before automatically resuming execution...`);
              for (let hr = 1; hr <= 5; hr++) {
                await sleep(60 * 60 * 1000); // Wait 1 hour
                console.log(`[Cooldown Update] ${hr}/5 hours elapsed...`);
              }
              globalConsecutiveFailures = 0;
              cooldownActive = false;
              console.log(`[INFO] Cool-down complete. Resuming execution...`);
            } else {
              while (cooldownActive) {
                await sleep(10000);
              }
            }
          }
        }

        try {
          if (student.certificate_url) {
            await submitToGoogleForm(browser, fullName, student.email, student.password, student.certificate_url, logPrefix, profile);
          }
        } catch (errForm) {
          console.error(`\n${logPrefix} [AUTO] Google Form submission failed: ${errForm.message}`);
        } finally {
          await saveStudents(CSV_FILE, headers, students);
          console.log(`${logPrefix} Saved results for ${fullName}. Certificate URL: ${student.certificate_url || "(none)"}`);
        }
      };

      // Worker pool: a shared cursor hands the next student to whichever worker
      // is free, so exactly `concurrency` students are in flight at all times
      // (no waiting for a whole batch to drain before refilling).
      let cursor = 0;
      const worker = async () => {
        while (true) {
          const index = cursor++;
          if (index >= runStudents.length) return;
          await processStudent(runStudents[index], index);
        }
      };

      await Promise.all(
        Array.from({ length: concurrency }, () => worker())
      );
    } else {
      for (const student of runStudents) {
      if (useRandomCreds) {
        const randCreds = generateRandomCredentials();
        student.first_name = randCreds.first_name;
        student.last_name = randCreds.last_name;
        student.email = randCreds.email;
        student.password = randCreds.password;
      } else if (useFreshEmail) {
        // Keep the student's real name + password, but mint a brand-new unique email so the
        // sign-up flow doesn't collide with an account created on a previous run.
        student.email = makeFreshEmail(student);
        console.log(`-> Generated fresh email for ${student.first_name} ${student.last_name}: ${student.email}`);
      }

      const fullName = `${student.first_name} ${student.last_name}`;
      const password = student.password || makePassword(student);
      student.password = password;

      console.log("\n============================================================");
      console.log(`Student: ${fullName}`);
      console.log(`Email:   ${student.email}`);
      console.log(`Pass:    ${password}`);
      console.log(`Mode:    ${mode.toUpperCase()}`);
      const profile = nextCourseraProfile();
      console.log(`Browser profile: ${profile.name} (cycles every ${PROFILE_BATCH_SIZE} students)`);
      if (mode === "manual") {
        console.log("Complete the signup/course/certificate steps manually in the browser.");
      } else if (mode === "record") {
        console.log("RECORDING mode: perform the signup/course steps manually.");
      } else if (mode === "replay") {
        console.log("REPLAY mode: actions will run automatically; manual fallback on failure.");
      }
      console.log("============================================================");

      const context = await browser.newContext(courseraContextOptions({ profile }));
      await applyCourseraNetworkProfile(context, profile);
      await context.addInitScript(STEALTH_SCRIPT);

      const recordedSteps = [];

      // Persist the recording to disk as it grows, so closing the browser is enough to "finish"
      // — no terminal interaction required, and nothing is lost if anything crashes.
      const persistRecording = async () => {
        if (recordedSteps.length === 0) return;
        const data = {
          course_url: COURSE_URL,
          recorded_student: {
            first_name: student.first_name,
            last_name: student.last_name,
            email: student.email,
            password: student.password,
          },
          steps: recordedSteps.map(({ time, ...rest }) => rest),
        };
        await fs.writeFile(recordingFilePath, JSON.stringify(data, null, 2), "utf8").catch(() => {});
      };

      if (mode === "record") {
        // Expose function and inject script for recording
        await context.exposeFunction("recordPlaywrightEvent", (event) => {
          if (event.type === "fill") {
            const lastStep = recordedSteps[recordedSteps.length - 1];
            if (lastStep && lastStep.type === "fill" && lastStep.selector === event.selector) {
              // Coalesce consecutive keystrokes into one fill, but keep the latest time so
              // the recorded wait reflects when typing actually finished.
              lastStep.value = event.value;
              lastStep.url = event.url;
              lastStep.time = event.time;
              persistRecording();
              return;
            }
          }
          // waitMs = real time you spent between the previous action and this one (for the very
          // first step there's no prior action, so it's 0). Capped so an idle coffee break
          // doesn't bake a 5-minute pause into replay.
          const prev = recordedSteps[recordedSteps.length - 1];
          const waitMs = prev && prev.time ? Math.min(event.time - prev.time, 20000) : 0;
          event.waitMs = waitMs;
          recordedSteps.push(event);
          console.log(
            `[Record +${(waitMs / 1000).toFixed(1)}s] ${event.type.toUpperCase()}: ${event.selector}` +
            `${event.text ? ` (${event.text})` : ""}${event.value !== undefined ? ` -> "${event.value}"` : ""}`
          );
          persistRecording();
        });

        await context.addInitScript(() => {
          if (window.__playwright_recorder_injected) return;
          window.__playwright_recorder_injected = true;

          function getCssSelector(el) {
            if (!el || el.nodeType !== 1) return "";
            if (el.id && !/^(ember|react|auto|__)/i.test(el.id) && !/\d{4,}/.test(el.id)) {
              return "#" + el.id;
            }
            for (const attr of ["data-testid", "data-qa", "name", "placeholder", "type", "aria-label"]) {
              const val = el.getAttribute(attr);
              if (val) {
                return `${el.tagName.toLowerCase()}[${attr}="${val}"]`;
              }
            }
            const path = [];
            let current = el;
            while (current && current.nodeType === 1) {
              let selector = current.tagName.toLowerCase();
              if (current.id && !/^(ember|react|auto|__)/i.test(current.id) && !/\d{4,}/.test(current.id)) {
                selector += "#" + current.id;
                path.unshift(selector);
                break;
              }
              if (current.className && typeof current.className === "string") {
                const classes = current.className.trim().split(/\s+/).filter(c => c && !c.includes(":") && !/\d/.test(c));
                if (classes.length > 0) {
                  selector += "." + classes.slice(0, 3).join(".");
                }
              }
              let sibling = current;
              let index = 1;
              while ((sibling = sibling.previousElementSibling)) {
                if (sibling.tagName === current.tagName) {
                  index++;
                }
              }
              selector += `:nth-of-type(${index})`;
              path.unshift(selector);
              current = current.parentNode;
            }
            return path.join(" > ");
          }

          const INTERACTIVE = "button, a, input, select, textarea, label, " +
            "[role=\"button\"], [role=\"checkbox\"], [role=\"radio\"], [role=\"tab\"], " +
            "[role=\"menuitem\"], [role=\"option\"], [role=\"link\"]";

          document.addEventListener("click", (e) => {
            if (e.button !== 0) return;
            const target = e.target;
            let element = target.closest(INTERACTIVE);
            // Ignore clicks that don't land on a real interactive control — these are the
            // "random places" (empty container divs) that produced junk nth-of-type selectors.
            if (!element) return;

            // A <label> click really toggles its associated control — record the control
            // (stable name/id selector) instead of the label's fragile DOM path.
            if (element.tagName === "LABEL") {
              const control = element.control ||
                (element.htmlFor ? document.getElementById(element.htmlFor) : null) ||
                element.querySelector("input, select, textarea");
              if (control) element = control;
            }

            const selector = getCssSelector(element);
            if (!selector) return;
            const text = element.innerText ? element.innerText.trim().substring(0, 30) : "";
            window.recordPlaywrightEvent({
              type: "click",
              selector,
              text,
              url: window.location.href,
              time: Date.now()
            });
          }, true);

          const handleInput = (e) => {
            const target = e.target;
            if (!target || target.nodeType !== 1) return;
            const tagName = target.tagName.toUpperCase();
            if (tagName === "INPUT" || tagName === "TEXTAREA") {
              const type = target.type ? target.type.toLowerCase() : "";
              if (type === "checkbox" || type === "radio") return;
              const selector = getCssSelector(target);
              if (!selector) return;
              window.recordPlaywrightEvent({
                type: "fill",
                selector,
                value: target.value,
                url: window.location.href,
                time: Date.now()
              });
            } else if (tagName === "SELECT") {
              const selector = getCssSelector(target);
              if (!selector) return;
              window.recordPlaywrightEvent({
                type: "select",
                selector,
                value: target.value,
                url: window.location.href,
                time: Date.now()
              });
            }
          };

          document.addEventListener("input", handleInput, true);
          document.addEventListener("change", handleInput, true);
        });
      }

      const page = await context.newPage();
      console.log("Loading website: " + COURSE_URL);
      const loaded = await safeGoto(page, COURSE_URL, { log: (m) => console.log("  " + m) });
      if (!loaded) {
        console.warn("Initial navigation did not fully succeed; continuing with whatever loaded.");
      }

      // Give the page a moment to settle (XHR-driven content, hydration).
      console.log("Waiting for the website to settle...");
      await page.waitForTimeout(3000);

      if (mode === "diagnose") {
        // Read-only probe: capture one screenshot + analysis of the PUBLIC page and exit.
        // Nothing here enrolls, submits quizzes, or touches certificates. Every step is
        // guarded so the diagnose run reports a clear status instead of crashing.
        const observer = createObserver(page, student);
        try {
          const { analysis, screenshotPath, analysisPath } = await observer.capture("diagnose-public-course-page");
          const controls = Array.isArray(analysis.controls) ? analysis.controls : [];
          const hasEnroll = /enroll for free/i.test(analysis.bodyText || "") ||
            controls.some((c) => /enroll for free/i.test(c.text || ""));
          console.log("\nDIAGNOSE mode captured the public course page only (no enroll/quiz/cert).");
          console.log(`Page loaded:      ${loaded ? "yes" : "partial/failed"}`);
          console.log(`Title:            ${analysis.title || "(none)"}`);
          console.log(`URL:              ${analysis.url}`);
          console.log(`Visible controls: ${controls.length}`);
          console.log(`Enroll button:    ${hasEnroll ? "present" : "NOT found"}`);
          console.log(`Screenshot:       ${screenshotPath}`);
          console.log(`Analysis JSON:    ${analysisPath}`);
          if (analysis.analysisError) {
            console.warn(`Analysis warning: ${analysis.analysisError}`);
          }
          // Surface a non-zero exit code only when the layer genuinely didn't work, so this
          // can be used as a smoke test in scripts/CI while still never throwing.
          if (!loaded && controls.length === 0) {
            console.warn("DIAGNOSE: page did not load and no controls were found.");
            process.exitCode = 1;
          }
        } catch (error) {
          console.error(`DIAGNOSE capture failed: ${error.message}`);
          process.exitCode = 1;
        }
        await context.close().catch(() => {});
        break;
      }

      if (mode === "replay" && recordingData && recordingData.steps) {
        console.log(`Starting automated playback of ${recordingData.steps.length} steps...`);
        const { recorded_student, steps } = recordingData;

        for (let i = 0; i < steps.length; i++) {
          const step = steps[i];
          console.log(`[Playback ${i + 1}/${steps.length}] ${step.type.toUpperCase()} on ${step.selector}`);

          let resolvedValue = step.value;
          if (step.type === "fill" && resolvedValue) {
            const selectorLower = step.selector.toLowerCase();
            if (selectorLower.includes("email")) {
              resolvedValue = student.email;
              console.log(`  -> Detected email field, using: ${student.email}`);
            } else if (selectorLower.includes("name=\"name\"") || selectorLower.includes("[name=\"name\"]") || selectorLower.includes("input[name=\"name\"]")) {
              resolvedValue = `${student.first_name} ${student.last_name}`;
              console.log(`  -> Detected name field, using: ${student.first_name} ${student.last_name}`);
            } else if (selectorLower.includes("password")) {
              resolvedValue = student.password;
              console.log(`  -> Detected password field, using: [hidden password]`);
            } else if (recorded_student) {
              if (resolvedValue === recorded_student.email) {
                resolvedValue = student.email;
                console.log(`  -> Matched recorded email, using: ${student.email}`);
              } else if (resolvedValue === recorded_student.password) {
                resolvedValue = student.password;
                console.log(`  -> Matched recorded password, using: [hidden password]`);
              } else if (resolvedValue === recorded_student.first_name) {
                resolvedValue = student.first_name;
                console.log(`  -> Matched recorded first name, using: ${student.first_name}`);
              } else if (resolvedValue === recorded_student.last_name) {
                resolvedValue = student.last_name;
                console.log(`  -> Matched recorded last name, using: ${student.last_name}`);
              }
            }
          }

          // Detect "noise" steps — accidental clicks on generic container divs with
          // deeply nested nth-of-type selectors. Skip these on failure instead of aborting.
          const nthCount = (step.selector.match(/nth-of-type/g) || []).length;
          const isContainerClick = step.type === "click" && nthCount >= 3 &&
            /^(html|body|div|section|form)/.test(step.selector.split(">").pop().trim());
          const isOptionalStep = isContainerClick;

          try {
            // If this step's URL is different from the next step's URL, we may need to wait for navigation
            const nextStep = steps[i + 1];
            const expectNavigation = nextStep && nextStep.url && nextStep.url !== step.url;

            // Page-sync: once we're logged in, the recorded course/account URLs are stable and
            // reachable directly. If the browser isn't already on this step's recorded page,
            // navigate there instead of relying on fragile generic nav-button clicks. We only do
            // this for authenticated course pages, and only when the path actually differs (so
            // consecutive steps on the same page — e.g. a quiz — don't reload and lose state).
            const navigablePage = /\/(learn|my-learning|account|user-verification)\b/.test(step.url || "");
            if (navigablePage) {
              const stepPath = (() => { try { return new URL(step.url).pathname; } catch { return ""; } })();
              const curPath = (() => { try { return new URL(page.url()).pathname; } catch { return ""; } })();
              if (stepPath && stepPath !== curPath) {
                console.log(`  -> Page-sync: navigating to recorded page ${stepPath}`);
                await page.goto(step.url, { waitUntil: "domcontentloaded" }).catch(() => {});
                await page.waitForTimeout(2500);
                await dismissOverlays(page);
              }
            }

            // For checkboxes, always filter to visible only
            const isCheckbox = step.selector.includes("checkbox") || step.selector.includes("radio");

            if (isOptionalStep) {
              console.log(`  -> Optional container click, will skip if not found`);
            }

            // Wait for THIS thing to appear, then act — instead of pressing on a fixed timer.
            // Budget = how long you actually waited here while recording (waitMs) + margin,
            // clamped to a sane range. So a step you sat on for 8s gets ~10s to appear.
            const recordedWait = typeof step.waitMs === "number" ? step.waitMs : 0;
            const appearTimeout = isOptionalStep
              ? 2000
              : Math.min(Math.max(recordedWait + 4000, isCheckbox ? 15000 : 8000), 30000);
            const tWait = Date.now();
            await page.waitForSelector(step.selector, {
              state: isCheckbox ? "attached" : "visible",
              timeout: appearTimeout
            });
            console.log(`  -> Appeared after ${((Date.now() - tWait) / 1000).toFixed(1)}s (recorded wait ${(recordedWait / 1000).toFixed(1)}s)`);

            // Build the locator — if text is known, filter by it to avoid strict-mode violations
            let locator = page.locator(step.selector);

            // For checkboxes: filter to visible ones only
            if (isCheckbox) {
              const visibleCheckboxes = locator.filter({ visible: true });
              const visCount = await visibleCheckboxes.count();
              if (visCount > 0) {
                locator = visibleCheckboxes.first();
                console.log(`  -> Using first visible checkbox (${visCount} visible)`);
              } else {
                locator = locator.first();
              }
            } else {
              const count = await locator.count();
              if (count > 1 && step.text) {
                const filtered = locator.filter({ hasText: step.text });
                const filteredCount = await filtered.count();
                if (filteredCount === 1) {
                  locator = filtered;
                  console.log(`  -> Resolved ambiguity using text: "${step.text}"`);
                } else if (filteredCount > 1) {
                  locator = filtered.first();
                  console.log(`  -> Multiple matches even with text, using first: "${step.text}"`);
                } else {
                  locator = locator.first();
                  console.log(`  -> No text match, using first element`);
                }
              } else if (count > 1) {
                locator = locator.first();
                console.log(`  -> Multiple matches (${count}), using first`);
              }
            }

            // Dismiss any overlays that might intercept clicks
            await dismissOverlays(page);

            if (step.type === "click") {
              const urlBefore = page.url();
              try {
                await locator.click({ timeout: 5000 });
              } catch (clickErr) {
                console.log(`  -> Normal click failed, trying force click...`);
                await locator.click({ force: true, timeout: 5000 });
              }
              // If we expect a navigation, wait for URL to change or network to settle
              if (expectNavigation) {
                await Promise.race([
                  page.waitForURL(url => url.toString() !== urlBefore, { timeout: 10000 }).catch(() => {}),
                  page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {})
                ]);
                console.log(`  -> Navigated to: ${page.url()}`);
              }
            } else if (step.type === "fill") {
              await locator.fill(resolvedValue);
            } else if (step.type === "select") {
              await locator.selectOption(resolvedValue);
            }

            // Brief settle. Fills and plain clicks barely need any pause; only steps that
            // triggered a navigation need a moment for the next page to be ready.
            const settleMs = step.type === "fill"
              ? 120 + Math.random() * 120
              : (expectNavigation ? 500 + Math.random() * 300 : 200 + Math.random() * 200);
            await page.waitForTimeout(settleMs);
          } catch (err) {
            // Optional/noise steps (accidental container clicks) should be skipped,
            // not treated as fatal — otherwise replay aborts on the first stray click.
            if (isOptionalStep) {
              console.log(`  -> Optional step ${i + 1} not found, skipping.`);
              continue;
            }
            console.warn(`[Playback Interrupted] Step ${i + 1} failed: ${err.message}`);
            console.log("Please take over and complete the student steps manually.");
            break;
          }
        }
        console.log("Playback completed or interrupted. Control handed back to user.");
      }

      // AUTO mode: self-drive the whole course with robust selectors.
      if (mode === "auto") {
        console.log("AUTO mode: self-driving the course with robust selectors...");
        let cert = "";
        try {
          cert = await runAutomatedFlow(page, student, "", null);
        } catch (err) {
          console.warn(`\n[AUTO] Chromium flow stopped: ${err.message}`);
        }

        student.certificate_url = cert || "";
        console.log(student.certificate_url
          ? `\nCertificate captured: ${student.certificate_url}`
          : "\nFlow finished but no certificate URL was captured.");
      } else if (mode === "replay") {
        // Wait a bit for the page to settle after playback
        await page.waitForTimeout(3000);
        const certUrl = page.url();
        // Only treat it as a real certificate if it looks like one. Otherwise leave the field
        // blank so the student stays "pending" instead of being polluted with a junk page URL.
        const isRealCert = /\/(share|account\/accomplishments|verify)\b|coursera\.org\/share\//.test(certUrl);
        if (isRealCert) {
          console.log(`\nAuto-captured certificate URL: ${certUrl}`);
          student.certificate_url = certUrl;
        } else {
          console.log(`\nNo certificate reached (ended at: ${certUrl}). Leaving certificate_url blank.`);
          student.certificate_url = "";
        }
      } else if (mode === "record") {
        console.log("\n======================== RECORD MODE ========================");
        console.log("Perform ALL the steps in the browser window (signup -> course ->");
        console.log("quiz -> certificate). The time you wait between each action is");
        console.log("captured. Tip: click the actual buttons/answers, not empty space —");
        console.log("stray clicks on blank areas are now ignored automatically.");
        console.log("When you're DONE, just CLOSE the browser window to save.");
        console.log("=============================================================\n");

        // Finish when the user closes the browser window — no terminal interaction needed.
        await new Promise((resolve) => {
          page.once("close", resolve);
          context.once("close", resolve);
          browser.once("disconnected", resolve);
        });

        await persistRecording();
        if (recordedSteps.length > 0) {
          console.log(`\nSaved ${recordedSteps.length} steps (with timing) to ${recordingFilePath}.`);
        } else {
          console.log("\nNo steps were recorded.");
        }
        recordingDone = true;
      } else {
        await rl.question("Press Enter here after you finish this student in the browser...");
        student.certificate_url = await promptForCertificateUrl(rl, page);
      }

      if (student.certificate_url) {
        await submitToGoogleForm(browser, fullName, student.email, student.password, student.certificate_url, "", profile);
      }

      await saveStudents(CSV_FILE, headers, students);
      console.log(`Saved results for ${fullName}. Certificate URL: ${student.certificate_url || "(none)"}`);

      await context.close().catch(() => {});
      if (recordingDone) break;
    }
    }
  } finally {
    await browser.close();
    if (rl) rl.close();
  }

  console.log("\nFinished. Results saved to students.csv.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
