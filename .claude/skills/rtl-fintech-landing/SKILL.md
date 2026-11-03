---
name: rtl-fintech-landing
description: Build Hebrew/RTL marketing landing pages in a "calm fintech" style (distilled from yatzivplus.co.il) - huge tight headlines in masked lines, rotating verbs, pill buttons with an accent arrow and a rolling hover label, a laptop+phone product mock-up that animates, a zig-zag of text and people stepping out of rounded cards with frosted-glass tiles floating round them, deep bands with radial light, a logo marquee, counting stats, scroll-drawn steps, a promise band with a huge rounded top, a price panel, a smooth FAQ, an accent closing card, modals and a screen-filling "warp" transition. Use when the user asks for a landing page, marketing site, service page or lead-gen page "in this style", "like yatziv", "fintech style", a Hebrew/RTL landing page with GSAP motion, or wants to re-skin/extend a page built with this skill.
---

# RTL fintech landing (the "יציב+" language)

A complete, opinionated system for Hebrew landing pages that feel like a modern fintech product: one idea per screen,
a deep brand colour + one bright "moving part" accent, glass everywhere something floats, and quiet, purposeful motion.

Everything you need is in this folder:

| File | What it is |
|---|---|
| `template/index.html` | A working page with every section, in order, with demo copy. **Start every build by copying it.** |
| `template/css/tokens.css` | Palette from two hues (`--hue`, `--ahue`), type, radii, shadows, glass material. |
| `template/css/site.css` | All components (`lp-` prefix). Don't fork per page; add to it. |
| `template/js/boot.js` | Inline-in-head: marks the page animated before first paint, with a 2.5s safety net. |
| `template/js/site.js` | Header, phone menu, modals, FAQ, warp, cookie bar, Swiper carousel, all GSAP motion. |
| `scripts/qa.js` | Screenshots desktop+phone after scrolling and fails on side-scroll, never-revealed blocks, console errors. |
| `references/patterns.md` | Every section and component: anatomy, markup contract, variants, do/don't. |
| `references/motion.md` | The motion choreography: timings, easings, lite/reduced rules, how to add a new loop. |
| `references/copy.md` | Hebrew voice and microcopy rules (headline length, CTA form, kicker, disclaimers). |
| `references/theming.md` | Re-skinning: choosing hues, fonts, imagery, logo, what must never change. |

## Workflow

1. **Brief.** Get (or decide sensibly): brand name, what the service does, the one action the page drives (the CTA),
   3 benefits, 4 steps, 3 promises, 3 numbers, price line, 3-6 FAQs, audiences for the carousel. Ask only for what you
   cannot reasonably write yourself; draft copy per `references/copy.md` otherwise.
2. **Copy the template** into the target folder (`cp -r template/* <dest>/`). Keep the file layout.
3. **Theme.** Set `--hue` and `--ahue` in `tokens.css` (see `references/theming.md`); update `theme-color` meta to the
   deep colour; replace the `lp-brand` text mark with the real logo (SVG inline or `<img>`).
4. **Write the page top to bottom** following the section order below. Remove sections the brief doesn't support rather
   than padding them; never break the rhythm *light → deep → light → deep → accent → deep footer*.
5. **Media.** People: transparent cut-out PNG/WebP (`.lp-person__img`) taller than the card, waist-up, looking/pointing
   towards the text. Carousel: 4:5 photos. Until assets exist, keep the built-in placeholders (`.lp-person__ph`,
   empty `.lp-card__media`) - they hold the composition. AI-generated people need the footer disclaimer line.
6. **QA.** `node <skill>/scripts/qa.js <dest>/index.html <scratchpad>/qa` then *look* at both screenshots
   (split tall images into parts to read them). Fix every ✗. Check by eye: headline wraps into 2-3 balanced lines,
   no glass tile covers a face or the text, accent colour appears only on moving/important things.
7. **Production notes** to tell the user: vendor GSAP/ScrollTrigger/Swiper locally (exact versions in the template),
   serve images as AVIF+WebP `<picture>` with `srcset`, add a real accessibility statement page and cookie consent
   wiring, set `noindex` until launch if needed.

## Section order (the page's spine)

1. **Header** - sticky, transparent until scrolled, then frosted. Brand | centred in-page nav | secondary link + small CTA | burger (<1024).
2. **Hero** - centred; h1 of 2-3 masked lines (48→132px, line-height .98); **rotor** of three verbs (accent dots between, highlighter under the last); note with one bold `<mark>`; lg primary CTA with `data-pulse` + micro line ("בדיקה בשתי דקות"); **devices** figure: laptop with an app mock that ticks itself off + phone with a quiz mock + 3 glass chips + glows.
3. **Split** - kicker, h2, lead, 3 perks with glowing icon squares, button | person on a tint card with glass tiles, glowing accent squares, one tile with an accent tick.
4. **Split, flipped** - same, media on the other side; media is a "watch it work" mock (a form filling itself, a call card) on a deep card.
5. **Carousel** - h2 + round prev/next | Swiper of 4:5 photo cards, deep gradient from the foot, white title + accent line.
6. **Deep band** (rounded `--r-lg`, radial light) - lead line, logo marquee, h2, three stat cards (accent figure, white unit, soft label), a fine-print note.
7. **Steps** - kicker + h2 + four numbered discs on a line drawn by the scroll.
8. **Promise band** - a deep section with a *huge* rounded top (up to 240px), centred h2, 3 promises with ring icons; the **price panel** (dark glass + radial light, pill with the price, small lines, white button) inside it.
9. **FAQ** on deep - title column | dark-glass rows, accent plus that turns into ×, smooth 0fr→1fr open.
10. **Closing** - an accent-coloured rounded card on the deep: one huge sentence + deep lg CTA.
11. **Footer** on deep - brand + one line, 3 link columns with accent heads, legal lines.
12. **Overlays** - cookie bar (bottom card), modal (`.lp-modal`), phone menu, warp.

Details, markup and variants for each: `references/patterns.md`.

## Non-negotiables

- `<html lang="he" dir="rtl">`. Use logical properties (`inset-inline-start`, `padding-inline`, `margin-inline-end`) everywhere. "Forward" arrows point **left**.
- **One deep + one accent.** The accent appears only on what moves or matters: arrow discs, progress fills, the selected option, the key figure, kicker text, the last rotor word's highlight, step discs when reached, the closing card. Never as body text on light backgrounds.
- **Text on glass is near-black** (`--on-glass`), second line regular weight in `--on-glass-soft`. Brand-coloured text on glass does not read.
- **Glass needs colour behind it**: every figure with floating panes gets radial glows (`::before/::after`). Phones/tablets get near-opaque panes with no `backdrop-filter`.
- **Nothing hidden without JS**: `boot.js` + `.lp-anim` start states + `lp-ready`; if GSAP fails, everything shows. On "lite" screens text is never hidden.
- **Motion respects** `prefers-reduced-motion` (short fades only), pauses loops off-screen, and moves only `transform`/`opacity` (`translate`/`rotate` for the CSS float, so it never fights GSAP).
- **No horizontal scroll on phones**: `overflow-x: clip` on html/body, floating tiles pulled to `-6px` from the edge at ≤768.
- Accessibility: skip link, focus-visible rings, menus/modals are dialogs with a focus trap + Esc + focus return, decorative things `aria-hidden`, figures get `role="img"` + `aria-label`, the rotor has an `aria-label` with the three words, carousel a11y messages in Hebrew, tap targets ≥44px.
- Build DOM from data with `textContent`, never `innerHTML`.
- Don't copy the source brand: no יציב+ logo, coin/piggy animation, bank logos or its copy. The *language* is reusable; the *identity* is not.

## Extending

New component? Follow the house recipe: a glass pane (`lp-glass`/`lp-chip`/`lp-tile` material + rim), an `lp-ico` square,
a heavy word over a light one (`.lp-txt`), `data-float` if it floats, `data-r` if it should reveal, and a small loop
registered with `onScreen()` if it animates (see `references/motion.md`). Add phone sizes in the ≤768 block.
