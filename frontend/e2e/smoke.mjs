// End-to-end smoke check: every screen of all three paths with every folded section open, desktop and phone, light and dark.
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
/** Every screen of both paths. Each opens every folded section, so all of it is checked. */
const SCREENS = [
  'own', 'own-debts', 'own-result', 'buy', 'buy-results',
  'money', 'money-flow', 'money-spending', 'money-debts', 'money-savings', 'money-summary',
  'start', 'start-question', 'start-help', 'start-result', 'start-today-mortgage', 'start-improve', 'start-improve-loans', 'start-compare', 'start-plan', 'start-refinance', 'start-details', 'start-recovery', 'shared',
];
/** The household journey's steps after the files, by the name its progress bar gives each. */
const MONEY_STEPS = {
  'money-flow': 'שלב 2: נכנס ויוצא',
  'money-spending': 'שלב 3: לאן הולך הכסף',
  'money-debts': 'שלב 4: הלוואות ומשכנתא',
  'money-savings': 'שלב 5: איפה לחסוך',
  'money-summary': 'שלב 6: הסיכום',
};

/** An invented bank statement, in the layout Israeli banks export, for the household picture. */
const SAMPLE_BANK = [
  'תאריך,יום ערך,תיאור התנועה,זכות/חובה ₪, יתרה ₪',
  ...['06', '05', '04'].flatMap((month) => [
    `"28/${month}/26","28/${month}/26","משכורת חברת דוגמה","15,000","2,000"`,
    `"15/${month}/26","15/${month}/26","חיוב לכרטיס ויזה 1111","-900","-13,000"`,
    `"10/${month}/26","10/${month}/26","בנק-משכ חיוב","-5,000","-12,100"`,
    `"05/${month}/26","05/${month}/26","פירעון הלוואה 1234","-1,200","-7,100"`,
    `"02/${month}/26","02/${month}/26","כספומט בנק דוגמה","-400","-7,100"`,
  ]),
].join('\n');
const VIEWPORTS = { desktop: { width: 1366, height: 900 }, phone: { width: 360, height: 780 } };

const browser = await playwright.chromium.launch();
const problems = [];

// The first screen of either path has no charts. Recharts is over 100KB gzipped; it must arrive
// only with a page that draws one.
for (const first of ['own', 'buy', 'start']) {
  const page = await browser.newPage();
  const scripts = [];
  page.on('request', (request) => request.resourceType() === 'script' && scripts.push(request.url()));
  await page.goto(`${base}/#/${first}`);
  await page.waitForLoadState('networkidle');
  const charts = scripts.filter((url) => /\/charts-[\w-]+\.js$/.test(url));
  if (charts.length > 0) {
    problems.push(`first visit to ${first} downloaded the charting library: ${charts.join(', ')}`);
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
  await page.goto(`${base}/#/buy`);
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

    for (const screen of SCREENS) {
      current = screen;
      await page.goto(`${base}/#/own`);
      if (screen === 'own-debts' || screen === 'own-result') {
        await page.getByRole('button', { name: screen === 'own-debts' ? 'יש' : 'אין', exact: true }).click();
      }
      if (screen === 'own-result') {
        await page.getByRole('button', { name: /לתוצאה/ }).click();
        await page.getByRole('heading', { name: /התמהיל שנבחר לכם/ }).waitFor({ timeout: 15_000 });
      }
      if (screen.startsWith('buy')) {
        await page.goto(`${base}/#/buy`);
      }
      if (screen.startsWith('money')) {
        await page.goto(`${base}/#/money`);
      }
      if (screen === 'start' || screen === 'start-question' || screen === 'start-help') {
        // The home page is the questionnaire.
        await page.goto(screen === 'start' ? `${base}/?home=${Date.now()}` : `${base}/#/start`);
        await page.getByRole('heading', { name: 'מה נסדר היום?' }).waitFor();
      }
      if (screen === 'start-question' || screen === 'start-help') {
        // The questionnaire is kept on the device: start it afresh for each screen.
        if ((await page.getByRole('button', { name: 'להתחיל מחדש' }).count()) > 0) {
          await page.getByRole('button', { name: 'להתחיל מחדש' }).click();
        }
        await page.getByRole('checkbox', { name: /למחזר את המשכנתא/ }).check({ force: true });
        await page.getByRole('checkbox', { name: /לצאת מהמינוס/ }).check({ force: true });
        await page.getByRole('button', { name: /בואו נתחיל/ }).click();
        await page.getByRole('radio', { name: 'אמלא בעצמי, בערך' }).click();
        if (screen === 'start-help') {
          await page.getByRole('button', { name: 'הסבר על השאלה' }).click();
          await page.getByRole('dialog').waitFor();
        }
      }
      if (['start-result', 'start-today-mortgage', 'start-improve', 'start-improve-loans', 'start-compare', 'start-plan', 'start-refinance', 'start-details'].includes(screen)) {
        // Invented answers, straight to a result screen: written while the questionnaire is not
        // open (it would write its own state over them), then read by a fresh load.
        const refinancing = ['start-refinance', 'start-today-mortgage', 'start-improve-loans'].includes(screen);
        const answers = !refinancing
          ? { propertyValue: 2000000, segment: 'UPGRADER', equity: 500000, hasEligibility: 'NO', netIncome: 22000, hasObligations: 'NO', stability: 'BALANCED' }
          : { mortgageHow: 'MANUAL', mortgageBalance: 800000, mortgagePayment: 7200, mortgageYears: 'TEN_20', homeValue: 2400000, refinanceGoal: 'LOWER_PAYMENT', netIncome: 28000, stability: 'BALANCED', hasLoans: 'NO' };
        const at = { 'start-result': 'DONE', 'start-today-mortgage': 'DONE', 'start-compare': 'compare', 'start-plan': 'plan' }[screen] ?? 'improve';
        await page.goto(`${base}/#/buy`);
        const loans = screen === 'start-improve-loans';
        await page.evaluate(
          ({ goals, answers, at, loans }) => {
            localStorage.setItem('mashkanta:questionnaire', JSON.stringify({ state: { goals, at, answers: loans ? { ...answers, hasLoans: 'YES' } : answers }, version: 1 }));
            if (loans) {
              // An invented loan, as a lender's report would give it.
              const debts = [{ id: 'e2e', kind: 'CAR', label: 'הלוואת רכב לדוגמה', balance: 60000, annualRate: 0.08, monthlyPayment: 1500, remainingMonths: 48, include: false }];
              localStorage.setItem('mashkanta:consolidation', JSON.stringify({ state: { debts, netIncome: 28000 }, version: 2 }));
            }
          },
          { goals: [refinancing ? 'REFINANCE' : 'BUY'], answers, at, loans },
        );
        await page.goto(`${base}/?fresh=${Date.now()}#/start/${at === 'DONE' ? 'done' : at}`);
        const ready = {
          'start-result': page.getByText('צריך ללוות'),
          'start-today-mortgage': page.getByRole('img', { name: /^היתרה יורדת/ }),
          'start-compare': page.getByRole('region', { name: 'הבנקים, לתמהיל הזה' }),
          'start-plan': page.getByRole('region', { name: 'מה עושים עכשיו' }),
          'start-refinance': page.getByText('הערכה ממה שמילאתם'),
          'start-improve-loans': page.getByRole('radiogroup', { name: 'מה לעשות עם הלוואת רכב לדוגמה' }),
        }[screen] ?? page.getByText('החזר חודשי בהתחלה');
        await ready.waitFor({ timeout: 20_000 });
        if (loans) {
          await page.getByRole('radio', { name: /^לפרוס/ }).click();
          await page.getByRole('checkbox', { name: /הלוואת רכב לדוגמה: פריסה/ }).waitFor();
        }
        if (screen === 'start-details') {
          await page.getByRole('button', { name: 'כל הפרטים' }).click();
          await page.getByRole('region', { name: 'אם הריבית או המדד יעלו' }).waitFor({ timeout: 20_000 });
        }
      }
      if (screen === 'shared') {
        // A result someone shared, opened from its link.
        const result = {
          v: 1,
          goals: ['BUY', 'RECOVERY'],
          answers: { propertyValue: 2000000, segment: 'FIRST_HOME', equity: 600000, netIncome: 25000, stability: 'BALANCED' },
          recovery: { months: 3, today: -1200, after: 300, decisions: [{ label: 'לבטל את מה שסימנתם', monthly: 1500 }] },
        };
        await page.goto(`${base}/#/s/${Buffer.from(JSON.stringify(result)).toString('base64url')}`);
        await page.getByText('החזר חודשי בהתחלה').waitFor({ timeout: 20_000 });
      }
      if (screen === 'start-recovery') {
        // A recovery plan from the invented statement: uploaded, then the next question.
        await page.goto(`${base}/#/buy`);
        await page.evaluate(() =>
          localStorage.setItem('mashkanta:questionnaire', JSON.stringify({ state: { goals: ['RECOVERY'], at: 'statementsUpload', answers: { hasMortgage: 'NO' } }, version: 1 })),
        );
        await page.goto(`${base}/?fresh=${Date.now()}#/start/statementsUpload`);
        await page
          .getByLabel('בחירת קבצי עו״ש או כרטיס אשראי')
          .setInputFiles({ name: 'bank.csv', mimeType: 'text/csv', buffer: Buffer.from(SAMPLE_BANK) });
        await page.getByText('עו״ש · נקרא').waitFor({ timeout: 15_000 });
        await page.getByRole('button', { name: 'הבא', exact: true }).click();
        await page.getByRole('progressbar').waitFor();
      }
      if (MONEY_STEPS[screen]) {
        // The statements live in memory: upload them again if this page has none.
        if ((await page.getByRole('list', { name: 'קבצים שהועלו' }).count()) === 0) {
          await page
            .getByLabel('בחירת קבצי עו״ש או כרטיס אשראי')
            .setInputFiles({ name: 'bank.csv', mimeType: 'text/csv', buffer: Buffer.from(SAMPLE_BANK) });
          await page.getByText('נקרא', { exact: true }).waitFor({ timeout: 15_000 });
        }
        await page.getByRole('button', { name: MONEY_STEPS[screen] }).click();
        await page.getByRole('button', { name: MONEY_STEPS[screen] }).and(page.locator('[aria-current="step"]')).waitFor();
        // The categories fold with <details>; open them so their pickers are checked too.
        await page.locator('main details').evaluateAll((all) => all.forEach((details) => (details.open = true)));
      }
      if (screen === 'buy-results') {
        // Walk the wizard to the optimizer's results, the heaviest page in the app.
        await page.getByRole('button', { name: 'המשך' }).click();
        await page.getByRole('button', { name: 'המשך' }).click();
        await page.getByRole('button', { name: 'חשב תמהיל אופטימלי' }).click();
        await page.getByText('פרטים נוספים').waitFor({ timeout: 15_000 });
      }
      // Open every folded section, so its content is checked too.
      const closed = page.locator('main button[aria-expanded="false"]');
      for (let guard = 0; guard < 20 && (await closed.count()) > 0; guard++) {
        await closed.first().click();
      }
      await page.waitForTimeout(1800);
      const dark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
      if (dark !== (scheme === 'dark')) {
        problems.push(`${tag(screen)} theme class did not follow the system preference`);
      }

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (overflow > 1) {
        problems.push(`${tag(screen)} horizontal overflow of ${overflow}px`);
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
          problems.push(`${tag(screen)} axe ${violation.id} (${violation.nodes.length}): ${where}`);
        }
      }
      if (shots) {
        await page.screenshot({ path: `${shots}/${device}-${scheme}-${screen}.png`, fullPage: true });
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
console.log('smoke: every screen of all three paths, all sections open, clean on desktop and phone, light and dark');
