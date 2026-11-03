# Theming

## Colour: two hues

`tokens.css` derives everything from `--hue` (brand) and `--ahue` (accent) in OKLCH, so lightness and contrast stay
right whatever you pick.

| Feel | `--hue` | `--ahue` | Note |
|---|---|---|---|
| Spruce + lime (the original) | 163 | 122 | steady, money, growth - not gov blue/navy-gold |
| Indigo + amber | 265 | 85 | tech/finance, still calm |
| Plum + coral-ish | 320 | 40 | lifestyle, health |
| Teal + yellow | 195 | 100 | services, logistics |
| Terracotta + mint | 35 | 165 | warm, local business |

Rules: brand chroma stays low (≈0.045 deep, 0.088 mid); the accent is high-chroma and light (L≈0.89) so deep text on
it passes contrast. Check: white on `--deep` ≥ 7:1, `--deep` on `--accent` ≥ 7:1, `--ink-soft` on `--bg` ≥ 4.5:1.
Avoid the hue of a government body or a competitor if the brand must not look like one. Update `<meta name="theme-color">` to the deep colour.

## Type

Default: **Heebo** (400/600/700/800) for everything, **Rubik 700** for figures (Google Fonts). The original used the
licensed Tel Aviv family (Modernist for text, Brutalist Bold for figures) - if the client has a licensed Hebrew grotesk,
self-host it with `@font-face` (`font-display: swap`, preload the regular+bold) and change `--font`/`--font-figure`.
Requirements for any replacement: a real heavy weight, tight-looking at 130px, Hebrew + Latin + digits.

## Logo

Header 128-134px wide, inline SVG if it animates (letters rise, mark slides in, small pop - ≤1.4s, once, disabled for
reduced motion). Provide a white version for the menu, footer and the promise title.

## Imagery

- People: photo-real, warm, everyday business owners, waist-up cut-outs on transparent background, 480/960 widths,
  AVIF+WebP. Pose relates to the copy (thinking with a tablet, pointing at a mock, on the phone). Keep faces clear of tiles.
- Carousel: 4:5, real places of work, natural light, subject on one side so the caption gradient has room.
- One 3D object (the source used a steel safe) may live in a square glass box in the hero, a stat and the closing card,
  slightly rotated, floating. Optional.

## What never changes when re-theming

Pill buttons with the arrow disc, masked hero lines + rotor, glass material + rims + glows, the light/deep rhythm,
the accent-only-on-what-moves rule, the motion rules, RTL logical properties, accessibility behaviour.
