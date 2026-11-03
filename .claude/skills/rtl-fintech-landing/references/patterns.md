# Patterns: every section and component

Class names refer to `template/css/site.css`. Markup is in `template/index.html`; copy from there, this file explains
the *why*, the contract and the variants.

## Layout grammar

- **Container** `.lp-wrap`: max 1280px, gutter `clamp(16px, 4vw, 40px)`.
- **Section rhythm** `.lp-sec`: `padding-top: clamp(72px, 11vw, 200px)`. Sections carry space on top only, so removing one never leaves a double gap.
- **Light ↔ deep**: light page (`--bg`, a faint tint of the brand hue), then a rounded deep band, light again, then the
  bottom third goes deep for good (promise → FAQ → closing → footer). Deep blocks always have radial light, never a flat fill.
- **Radii**: `28px` cards, `clamp(28px,4vw,56px)` bands and big cards, `50px` pills, `clamp(60px,14vw,240px)` for the promise band's top corners. Concentric radii for nested things (inner = outer − padding).
- **Breakpoints**: 1240 (nav tightens) / 1024 (burger, single column, stats stack) / 768 (hero aligns start, buttons full width, floats shrink) / 480 (hero type clamps, footer one column).

## Type scale

| Role | Size | Weight / leading |
|---|---|---|
| h1 hero | `clamp(48px, 7.4vw, 132px)` | 800 / .98 |
| closing title | `clamp(44px, 6.4vw, 112px)` | 800 / .98 |
| h2 | `clamp(36px, 4.5vw, 72px)` | 800 / 1.05, `text-wrap: balance` |
| rotor | `clamp(26px, 3vw, 46px)` | 800, brand colour |
| lead | `clamp(17px, .5vw+15px, 20px)` | 400, `--ink-soft`, max 34em |
| body | `clamp(16px, .35vw+15px, 18px)` | 1.7, letter-spacing .3px |
| figures | `clamp(56px, 5.6vw, 104px)` in `--font-figure`, tabular nums, accent; unit at .26em white |
| kicker | 15px 700 | deep pill, accent text |

## Buttons (`.lp-btn`)

- Pill, min-height 52 (sm 44, lg 60). Variants: `--primary` (deep), `--accent`, `--white` (on deep), `--ghost` (2px inset ring).
- **Arrow disc** `.lp-btn__arrow`: 30px accent circle with a CSS chevron pointing left, pulled into the padding (`margin-inline-end: -18px`); on hover it nudges 4px left. On accent/white buttons the disc turns deep and the chevron accent.
- **Rolling label**: `<span class="lp-btn__label" data-alt="מתחילים עכשיו"><span class="lp-btn__t">לבדיקת התאמה</span></span>` - on hover/focus the label rolls up and the alt line rolls in. Off on touch.
- **Pulse**: `data-pulse` on the one hero CTA only: a ring every 4.5s.
- **Warp**: `data-warp` on a link to another page: accent circle then deep circle open from the finger, navigate after 360ms; cross-document view transition fades the next page in. Skipped for modifier keys, middle click, reduced motion, `#` links.
- Hover lift `translateY(-2px) scale(1.03)` + soft brand shadow; disabled on `(hover: none)`.
- Round icon button `.lp-round` (52px glass circle) for carousel nav.

## Header (`.lp-top`)

Sticky; `.is-scrolled` after 8px adds a 92%-opaque tint, blur 10px and a soft shadow. Nav links use `.lp-link`
(underline grows from the right). Below 1024 the nav and secondary link hide and the glass burger appears (three lines,
middle one shorter). Below 768 the header CTA hides too - the hero's CTA is right there.

**Phone menu** (`.lp-menu`): a full-screen deep panel sliding in from the right, huge 30-40px links separated by hairlines,
accent block CTA pinned to the bottom. Dialog semantics, focus trap, Esc, closes on link click and when resizing to desktop.

## Hero

- Title lines: each line in `<span class="lp-mask"><span class="lp-line">…</span></span>`; the mask clips the rise.
  Write 2-3 short lines; each line one phrase. A line may hold a playful inline element (the source swapped a letter for
  its logo coin) - only with the brand's own mark, keep the letter in the DOM for readers.
- Rotor: exactly three short verbs in the same form (present plural: בודקים · בונים · מגישים). `aria-label` holds them as a sentence.
- Note: one bold `<mark>` phrase + a quiet rest.
- CTA block: lg primary + micro line under it (time/effort reassurance).
- **Devices** (`figure.lp-devices role="img"`): laptop (16:10 screen, dark bezel, light base with notch) holding an
  `.lp-app` - deep title bar, a list of rows (badge PDF/XLS/DOC/brand + bold/light text + tick), a progress bar, a bar
  chart with the last bar accent, a "signed" stamp. Phone (9:19) overlapping the laptop's start side with a quiz mock
  (question, 3-4 options, one becomes selected, progress moves). Three glass chips around (`--a` start-top, `--b`
  start-middle, `--c` end-top). All of it is a UI *illustration* of the product - make it show the product's real steps.

## Split sections (`.lp-split`, `.lp-split--flip` on the section)

Two equal columns, centred vertically, gap up to 110px. Text column: kicker → h2 → lead → (perks) → button/actions.
Media column is one of:

1. **Person** (`figure.lp-person data-media`): rounded card (`__card`, tint / `--deep` / `--accent` variants) inset 22%
   from the top so the person rises out of it; the cut-out `img.lp-person__img` with `mask-image` fading the bottom 18%;
   `data-parallax="-40"` so the person drifts slower. Around it: 2-3 `.lp-glass` panes (wide 15vw×8vw, or squares
   ~10vw) holding a logo/word/number, 1-2 `.lp-accent` glowing squares (brand gradient, one accent variant) peeking
   *behind* the panes, and one `.lp-tile` with an accent tick + "done" line near the bottom. Two radial glows behind
   (brand top-end, accent bottom-start).
2. **Mock on a person/card**: `.lp-sheet` (a form whose bars fill and ticks turn, row by row), `.lp-callcard` (ringing
   square + brand + wave in a deep pill), file tiles with PDF/XLS badges. Make the mock *do* the thing the copy promises.

Perks list: 46px glowing icon square + bold title line + soft description. Alternate the media side section by section.
Below 1024 the media goes under the text, max 560px wide.

## Carousel

Head row: h2 at start, round prev/next at end (hidden ≤768: swipe). Swiper: 1.2 / 1.6 / 2.4 / 3.5 slides per view,
autoplay 3.2s on desktop only (never under a thumb), rewind, overflow visible but clipped at the page. Card: 4:5 photo,
30px radius, a deep gradient rising from 42% down, caption = white bold trade + accent short benefit. Lift 6px on hover.

## Deep band (`.lp-band`)

Rounded deep block with three radial lights (brand top-centre, brand bottom-end, faint accent bottom-start).
- **Marquee**: two identical `<ul>`s in a track (second `aria-hidden`), `translateX(50%)` loop (RTL), 46s, paused
  until on screen; edges faded with deep gradients painted on pseudo-elements (no mask on a moving layer); tiles are
  white "porcelain" slabs 156-196×74-92 with the logo at 68%×48% max. Reduced motion: stops and wraps.
- **Stats**: 3 dark-glass cards; figure counts up (`data-count`), optional prefix "עד" and unit in white at .26em,
  label in soft text. A fine-print note under them for honesty.

## Steps

`ol.lp-steps[data-steps]` with a first `li.lp-steps__line` (`aria-hidden`) whose inner span scales with scroll
(scrub). Discs 68px white with an inset ring, figure font; `.is-on` turns them accent when their step crosses 70%.
Titles h3 21-26px, one short sentence each. 2 columns ≤1024 (line hidden), and a disc-beside-text row ≤768.

## Promise band + price

Deep section, top corners rounded up to 240px. Centred h2 (may include the brand logo inline at .95em). Three promises,
each a 76px dark-glass ring icon with an accent glyph and an accent glow, and one bold line ("X? Y." pattern).
Price panel inside: dark glass + accent and brand radial lights, h2 "כמה זה עולה?", a huge pill with the price or
"נקבע בשיחה", 1-3 soft lines, a white button.

## FAQ

On deep with one brand glow. Grid 1fr / 1.6fr (title / list). Each `details.lp-dark-glass` row: 22px radius, summary
bold 18-22px with a 40px accent disc drawing a plus that rotates 45°. The answer lives in `.lp-faq__a > .lp-faq__in > p`
so the grid row can animate 0fr→1fr; JS keeps `<details>` open until the close transition ends.

## Closing + footer

Closing: accent rounded card (gutters on both sides) sitting on the deep background, title max 10em, deep lg button.
Footer: 1.6fr/1fr/1fr/1fr grid → 2 cols → 1 col; column heads accent 14px with letter-spacing; legal lines soft 14px
(company name + ID, "not the government" style disclaimers when relevant, AI-imagery note, third-party marks note).

## Overlays

- **Cookie bar**: bottom-centred white card 560px max, 24px radius, two sm buttons (primary "מסכים/ה", ghost "רק הכרחיות"); re-openable from the footer.
- **Modal** (`.lp-modal role="dialog" aria-modal="true" hidden`): scrim fades to 50% deep, card rises from 10px/0.96;
  400px max, 28px radius, close × at the top *start* corner; optional step dots (active dot stretches to 22px) and
  `[data-step-pane]` panes advanced by `[data-step-next]`. Opened by `[data-modal-open="id"]`, closed by ×, scrim,
  Esc or `[data-modal-close]`. Use for short lead capture (phone → done), never for long forms - those get their own
  page reached by a warp.
- **Quiz page** (the source's check page): one question per screen in a card, 2-column option tiles (`min-height 54px`,
  radio/checkbox disc that fills accent with a deep tick when chosen), a progress "level" bar in accent, a back button,
  questions slide in 14px from the side they come from. Logo options become 104px square tiles. Results animate in the same way.

## Icons

Inline SVG, `viewBox="0 0 24 24"`, stroke only (`fill:none; stroke:currentColor; stroke-width:1.8-2.2; round caps/joins`),
simple geometric glyphs. Decorative → `aria-hidden="true"`. Familiar format badges (PDF red, XLS green, DOC blue) beat abstract icons.
