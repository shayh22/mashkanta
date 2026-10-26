// End-to-end smoke check: every mode, desktop and phone, light and dark.
//
//   npm run build && npx vite preview --port 4173 &
//   node e2e/smoke.mjs http://localhost:4173 [screenshotDir]
//   node e2e/smoke.mjs https://mashkanta.shayh22.workers.dev    # the deployed site, with its real headers
//
// Fails on any console error, uncaught exception, horizontal page overflow, axe-core violation
// of serious/critical impact, the opening screen downloading the charting library, or live market
// data not arriving. Locally the preview server reads the Bank of Israel itself; behind a proxy,
// start it with NODE_USE_ENV_PROXY=1. Uses the Playwright that ships with the environment.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
let playwright;
try {
  playwright = require('playwright');
} catch {
  playwright = require(`${process.env.NODE_PATH ?? '/usr/lib/node_modules'}/playwright`);
}
const axeSource = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

const [base = 'http://localhost:4173', shots] = process.argv.slice(2);
const MODES = ['mortgage', 'refinance', 'consolidation', 'combined'];
const VIEWPORTS = { desktop: { width: 1366, height: 900 }, phone: { width: 360, height: 780 } };

const browser = await playwright.chromium.launch();
const problems = [];

// The first visit lands on the mortgage wizard, which has no charts. Recharts is over 100KB
// gzipped; it must arrive only with a page that draws one.
{
  const page = await browser.newPage();
  const scripts = [];
  page.on('request', (request) => request.resourceType() === 'script' && scripts.push(request.url()));
  await page.goto(`${base}/#/mortgage`);
  await page.waitForLoadState('networkidle');
  const charts = scripts.filter((url) => /\/charts-[\w-]+\.js$/.test(url));
  if (charts.length > 0) {
    problems.push(`first visit downloaded the charting library: ${charts.join(', ')}`);
  }
  await page.close();
}

// Live market figures: the endpoint answers (the Worker in production, the Vite middleware
// locally), and the header shows the prime rate read from it rather than the seeded fallback.
{
  const page = await browser.newPage();
  const response = await page.request.get(`${base}/api/market`);
  const market = response.ok() ? await response.json() : undefined;
  if (!market?.prime?.value || !market?.housing) {
    problems.push(`/api/market: HTTP ${response.status()} ${JSON.stringify(market?.missing ?? market)}`);
  }
  await page.goto(`${base}/#/mortgage`);
  const status = page.getByRole('status').filter({ hasText: 'נתוני בנק ישראל' });
  await status.waitFor({ timeout: 20_000 }).catch(() => problems.push('header never showed live market data'));
  await page.close();
}

for (const [device, viewport] of Object.entries(VIEWPORTS)) {
  for (const scheme of ['light', 'dark']) {
    const page = await browser.newPage({ viewport, colorScheme: scheme });
    const tag = (mode) => `${device}/${scheme}/${mode}`;
    let current = 'load';
    // axe-core re-fetches cross-origin stylesheets for its contrast checks, which the deployed
    // Content-Security-Policy (connect-src 'self') rightly blocks. Errors raised while axe runs are
    // the audit's own, not the app's; a real visitor never makes that request.
    let auditing = false;
    page.on(
      'console',
      (message) => message.type() === 'error' && !auditing && problems.push(`${tag(current)} console: ${message.text()}`),
    );
    page.on('pageerror', (error) => problems.push(`${tag(current)} exception: ${error.message}`));

    for (const mode of [...MODES, 'mortgage-results']) {
      current = mode;
      if (mode === 'mortgage-results') {
        // Walk the wizard to the optimizer's results, the heaviest page in the app.
        await page.goto(`${base}/#/mortgage`);
        await page.getByRole('button', { name: 'המשך' }).click();
        await page.getByRole('button', { name: 'המשך' }).click();
        await page.getByRole('button', { name: 'חשב תמהיל אופטימלי' }).click();
        await page.getByRole('button', { name: 'תוצאות', pressed: true }).waitFor({ timeout: 15_000 });
      } else {
        await page.goto(`${base}/#/${mode}`);
      }
      await page.waitForTimeout(1800);
      const dark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
      if (dark !== (scheme === 'dark')) {
        problems.push(`${tag(mode)} theme class did not follow the system preference`);
      }
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (overflow > 1) {
        problems.push(`${tag(mode)} horizontal overflow of ${overflow}px`);
      }
      await page.evaluate(axeSource);
      auditing = true;
      const result = await page.evaluate(async () =>
        axe.run(document, { resultTypes: ['violations'], runOnly: ['wcag2a', 'wcag2aa'] }),
      );
      // Let any console message the audit triggered arrive before attribution resumes.
      await page.waitForTimeout(200);
      auditing = false;
      for (const violation of result.violations) {
        if (violation.impact === 'serious' || violation.impact === 'critical') {
          const where = violation.nodes.slice(0, 3).map((node) => node.target.join(' ')).join(' | ');
          problems.push(`${tag(mode)} axe ${violation.id} (${violation.nodes.length}): ${where}`);
        }
      }
      if (shots) {
        await page.screenshot({ path: `${shots}/${device}-${scheme}-${mode}.png`, fullPage: true });
      }
    }
    await page.close();
  }
}

await browser.close();
if (problems.length > 0) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log('smoke: all modes clean on desktop and phone, light and dark');
