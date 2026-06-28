Coursera manual runner (Node.js + Playwright stealth):

```bash
npm install
npm run install-browsers
npm start
```

Automated run:

```bash
npm run auto
```

Headless automated run:

```bash
npm run auto:headless
```

Safe public-page diagnosis:

```bash
npm run diagnose
```

Notes:

- Opens Coursera in a visible browser (stealth-enabled) and waits while you
  complete signup, course, and certificate steps manually.
- After each student, press Enter in the terminal, then paste the certificate
  URL (or type `CURRENT` to capture the browser's current URL).
- Results are saved back to `students.csv` after each student.
- AUTO mode saves screenshots and compact page-analysis JSON files into
  `artifacts/` at important checkpoints and whenever a selector fails.
- DIAGNOSE mode only opens the public course page, captures one screenshot and
  one JSON analysis file, then exits. It never enrolls, submits quizzes, or
  touches certificates. It runs even when every student already has a
  certificate, retries a flaky page load, and exits non-zero only if the page
  truly failed to load — so it works as a smoke test in scripts/CI.
- Automated modes (`auto`/`diagnose`) fall back to headless automatically when
  no X11/Wayland display is detected, so they won't crash over SSH or in CI.
- For extra screenshots after each navigation, run `npm run auto:verbose`.
- Certificate polling can be tuned with `CERT_ATTEMPTS=12` and
  `CERT_WAIT_MS=15000`.
