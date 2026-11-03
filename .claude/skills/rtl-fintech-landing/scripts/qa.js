#!/usr/bin/env node
/*
 * QA for a page built with this skill. Usage:
 *   node scripts/qa.js <path-to-index.html or URL> [out-dir]
 * Takes full-page screenshots at desktop (1440) and phone (390), after scrolling through so every reveal has played,
 * and fails loudly on the things that break this style most often:
 *   - horizontal overflow on a phone (a glass tile or glow poking past the edge)
 *   - elements still invisible after the scroll (a [data-r] that never revealed)
 *   - console errors
 *   - missing dir="rtl" / lang="he"
 * Uses the preinstalled Playwright (require('playwright')).
 */
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");

const target = process.argv[2];
if (!target) { console.error("usage: node qa.js <index.html|url> [out-dir]"); process.exit(2); }
const url = /^https?:/.test(target) ? target : "file://" + path.resolve(target);
const out = process.argv[3] || path.join(process.cwd(), "qa-shots");
fs.mkdirSync(out, { recursive: true });

(async () => {
  const browser = await chromium.launch();
  let failed = false;
  for (const [name, viewport] of [["desktop", { width: 1440, height: 900 }], ["phone", { width: 390, height: 844 }]]) {
    const page = await browser.newPage({ viewport, deviceScaleFactor: 1, hasTouch: name === "phone", isMobile: name === "phone" });
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 300) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 90)); }
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(1800);
    const report = await page.evaluate(() => {
      const html = document.documentElement;
      const wide = [];
      document.querySelectorAll("body *").forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width && (r.right > innerWidth + 1 || r.left < -1) && getComputedStyle(el).position !== "fixed") {
          // ignore things inside a clipping ancestor (marquee, carousel)
          let p = el.parentElement, clipped = false;
          while (p && p !== document.body) { const o = getComputedStyle(p); if (/(hidden|clip)/.test(o.overflowX) || /(hidden|clip)/.test(o.overflow)) { clipped = true; break; } p = p.parentElement; }
          if (!clipped) wide.push(el.className || el.tagName);
        }
      });
      const hidden = [...document.querySelectorAll("[data-r], [data-media], .lp-line")]
        .filter((e) => e.offsetParent !== null && parseFloat(getComputedStyle(e).opacity) < 0.5)
        .map((e) => e.className || e.tagName);
      return {
        dir: html.getAttribute("dir"), lang: html.getAttribute("lang"),
        scrollW: html.scrollWidth, innerW: innerWidth,
        wide: [...new Set(wide)].slice(0, 15), hidden: hidden.slice(0, 15),
      };
    });
    const file = path.join(out, `${name}.png`);
    await page.screenshot({ path: file, fullPage: true });
    const problems = [];
    if (report.dir !== "rtl") problems.push('html is missing dir="rtl"');
    if (report.lang !== "he") problems.push('html is missing lang="he"');
    if (report.scrollW > report.innerW + 1) problems.push(`page scrolls sideways: ${report.scrollW}px > ${report.innerW}px`);
    if (report.wide.length) problems.push("elements past the edge: " + report.wide.join(", "));
    if (report.hidden.length) problems.push("still invisible after scroll: " + report.hidden.join(", "));
    if (errors.length) problems.push("console errors: " + errors.join(" | "));
    console.log(`\n[${name}] ${file}`);
    if (problems.length) { failed = true; problems.forEach((p) => console.log("  ✗ " + p)); } else console.log("  ✓ clean");
    await page.close();
  }
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
