# Motion

Libraries: GSAP 3.13.0 + ScrollTrigger 3.13.0, Swiper 11.2.10 (exact versions; vendor them for production).
All motion lives in `template/js/site.js`; CSS owns the continuous, cheap loops (float, marquee, pulse, ring).

## Principles

1. **Quiet and purposeful.** Things rise into place, small product loops show the service working, nothing spins for fun.
2. **Easing:** `power3.out` for entrances, `back.out(1.8)` for pops, `power2.inOut`/`sine.inOut` for loops, CSS `cubic-bezier(0.22, 1, 0.36, 1)` (`--ease`).
3. **Only transform/opacity.** The CSS float uses the individual `translate`/`rotate` properties so GSAP's `transform` tweens never conflict.
4. **Never hide content you can't guarantee to show**: `boot.js` adds `.lp-anim` (start states) before paint; site.js adds `.lp-ready`; if GSAP is missing it removes `.lp-anim`; a 2.5s timer removes it if site.js never ran.
5. **Lite mode** = `not all and (min-width: 769px) and (pointer: fine)` (phones and tablets): text is never hidden, media only fade (0.4s), pop-ins are smaller/faster, no parallax.
6. **Reduced motion**: a 0.4s opacity fade per block, nothing else; CSS kills float/pulse/marquee and view transitions.
7. **Loops run only on screen** via `onScreen(ST, trigger, timeline, eager)`. Hero loops are `eager` so they start before ScrollTrigger's first measure.
8. `gsap.matchMedia()` runs its callback only if **at least one** condition matches - always include `full: "(prefers-reduced-motion: no-preference)"`.

## The choreography

| Moment | What | Timing |
|---|---|---|
| Page open | hero `.lp-line`s rise `yPercent 110→0` + fade | 1s, stagger .12 |
| | hero `[data-r]` rise 60px (30 lite) | 1s, stagger .12, overlap −.55 |
| | `.lp-devices` rise 90px, scale .95→1 | 1.2s, overlap −.8 |
| | rotor: verbs rise in one by one, hold 2.4s, leave up, repeat | in .8s stagger .15 / out .55s stagger .1, delay .7, repeatDelay .5 |
| Scroll | every `[data-r]` outside the hero: batched rise 60px + fade at `top 85%` | 1s, stagger .12, once |
| | `[data-media]`: slides in 80px from its own side, scale .95→1 at `top 80%` | 1.1s, once |
| | `[data-parallax="-N"]`: drifts N px over the section's pass | scrub 1 (desktop only) |
| | `[data-float]` inside a person/devices figure: pop from scale .5 | .7s back.out(1.8), stagger .18, at `top 70%` |
| | `[data-count]`: counts 0→N in he-IL format into its own text node | 2s power2.out at `top 85%` |
| | steps line `scaleX 0→1` scrubbed `top 75%`→`bottom 45%`; discs `.is-on` at `top 70%` (reversible) | |
| Loops | laptop: bars grow, rows tick one by one (.55s apart) while the progress fills, stamp pops; phone: an option selects, level advances | repeatDelay 1.6 |
| | sheet: each row's bar fills (.5s) then its tick turns, .6s apart | repeatDelay 1.4 |
| | call card: wave bars breathe `scaleY .35` yoyo from centre | |
| CSS | float bob 4.9-7.1s per element with negative delays; CTA pulse ring every 4.5s; call ring 2.2s; marquee 46s linear (only while `.is-on`) | |
| Click | warp: accent circle 320ms, deep circle 290ms +70ms delay, navigate at 360ms; view transition old 180ms fade / new 420ms rise 24px | |
| UI | menu slides in .45s / out .3s; modal scrim 240ms, card 300ms; FAQ row 0fr→1fr .45s with the text fading down 8px | |

## Adding a new animated mock

```js
// inside mockups(gsap, ST)
var box = document.querySelector("[data-mything]");
if (box) {
  var tl = gsap.timeline({ repeat: -1, repeatDelay: 1.5 });
  tl.call(function () { /* reset classes */ });
  // ... small steps, each ≤0.6s, total cycle 3-6s, end with tl.to({}, { duration: 2 }) as a hold
  onScreen(ST, box, tl);
}
```

Rules: reset at the start of every cycle (classes + `set`), keep the steps causal (the thing the copy promises
happens in order), hold the finished state ~2s before repeating, never animate layout properties.
After content that changes height loads (fonts, FAQ, async copy), call `ScrollTrigger.refresh()` once.
