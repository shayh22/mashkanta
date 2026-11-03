/*
 * Behaviour + motion for the landing page. GSAP + ScrollTrigger for motion, Swiper for the carousel (all optional: without
 * them the page is complete and static). Motion vocabulary:
 *   hero      lines rise out of their masks, then the [data-r] blocks, then the devices scale up from below
 *   rotor     three verbs rise in one by one, hold, leave upwards, loop (only while the hero is on screen)
 *   reveals   every [data-r] rises 60px and fades in, batched with a 0.12s stagger; [data-media] slides in from its side
 *   parallax  [data-parallax="-50"] drifts slower than the scroll (desktop only)
 *   floats    [data-float] pop in with back.out, then CSS keeps them bobbing
 *   counters  [data-count] counts up in he-IL format
 *   steps     the line is drawn by the scroll, each disc turns accent as it is reached
 *   mock-ups  small loops (ticks, bars, form rows) that play only while on screen
 *   marquee   CSS animation, toggled on only while visible
 * "lite" = every screen that is not wide-with-a-mouse: text is never hidden there, only media fade, nothing loops off screen.
 * Reduced motion: a short fade per block and nothing else.
 */
(function () {
  "use strict";

  var root = document.documentElement;
  var LITE = "not all and (min-width: 769px) and (pointer: fine)";
  function $(id) { return document.getElementById(id); }
  function all(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }

  // ---- header ------------------------------------------------------------------------------------------
  function topBar() {
    var top = $("top");
    if (!top) return;
    function on() { top.classList.toggle("is-scrolled", window.scrollY > 8); }
    window.addEventListener("scroll", on, { passive: true });
    on();
  }

  // ---- phone menu: a dialog with a focus trap, Esc, and a slide-out ----------------------------------------
  function menu() {
    var m = $("menu"), open = $("menu-open"), close = $("menu-close");
    if (!m || !open || !close) return;
    var reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    function show() {
      m.hidden = false; m.classList.remove("is-closing");
      open.setAttribute("aria-expanded", "true");
      document.body.style.overflow = "hidden";
      close.focus();
    }
    function hide(back) {
      if (m.hidden) return;
      open.setAttribute("aria-expanded", "false");
      document.body.style.overflow = "";
      var done = function () { m.hidden = true; m.classList.remove("is-closing"); };
      if (reduced.matches) done(); else { m.classList.add("is-closing"); setTimeout(done, 300); }
      if (back) open.focus();
    }
    open.addEventListener("click", show);
    close.addEventListener("click", function () { hide(true); });
    m.addEventListener("click", function (e) {
      if (e.target === m) hide(true); else if (e.target.closest("a")) hide(false);
    });
    document.addEventListener("keydown", function (e) {
      if (m.hidden) return;
      if (e.key === "Escape") hide(true);
      if (e.key === "Tab") trap(e, m);
    });
    window.matchMedia("(min-width: 1025px)").addEventListener("change", function (q) { if (q.matches) hide(false); });
  }

  function trap(e, box) {
    var f = all("a[href], button:not([disabled]), input, select, textarea", box).filter(function (x) { return x.offsetParent !== null; });
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  // ---- modal: [data-modal-open="id"] opens <div class="lp-modal" id="id" role="dialog" aria-modal="true" hidden> -------
  function modals() {
    var reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    var opener = null;
    function open(m) {
      opener = document.activeElement;
      m.hidden = false;
      document.body.classList.add("has-modal");
      void m.offsetWidth; // start from the closed state so the transition plays
      m.classList.add("is-open");
      if (!m.querySelector("[data-step-pane]")) { var f = m.querySelector("input, button:not(.lp-modal__close)"); if (f) f.focus(); }
      step(m, 0);
    }
    function close(m) {
      if (!m.classList.contains("is-open")) return;
      m.classList.remove("is-open");
      document.body.classList.remove("has-modal");
      setTimeout(function () { m.hidden = true; }, reduced.matches ? 0 : 300);
      if (opener) opener.focus();
    }
    // multi-step modals: children with [data-step-pane]; dots reflect the current pane
    function step(m, i) {
      var panes = all("[data-step-pane]", m);
      if (!panes.length) return;
      panes.forEach(function (p, k) { p.hidden = k !== i; });
      all(".lp-modal__dots i", m).forEach(function (d, k) { d.classList.toggle("is-on", k === i); });
      m.dataset.step = i;
      var f = panes[i].querySelector("input, button, a[href]");
      if (f) f.focus();
    }
    all("[data-modal-open]").forEach(function (b) {
      b.addEventListener("click", function (e) {
        var m = $(b.getAttribute("data-modal-open"));
        if (m) { e.preventDefault(); open(m); }
      });
    });
    all(".lp-modal").forEach(function (m) {
      m.addEventListener("click", function (e) {
        if (e.target === m || e.target.closest(".lp-modal__close, [data-modal-close]")) close(m);
        var next = e.target.closest("[data-step-next]");
        if (next) { e.preventDefault(); step(m, Number(m.dataset.step || 0) + 1); }
      });
    });
    // on the document, not the modal: focus can fall to <body> when a step pane hides the focused button
    document.addEventListener("keydown", function (e) {
      var m = document.querySelector(".lp-modal.is-open");
      if (!m) return;
      if (e.key === "Escape") close(m);
      if (e.key === "Tab") trap(e, m);
    });
  }

  // ---- FAQ: the answer's grid row animates 0fr -> 1fr; <details> stays open until the closing transition ends ---------
  function faq() {
    all(".lp-faq details").forEach(function (d) {
      var s = d.querySelector("summary"), a = d.querySelector(".lp-faq__a"), timer = null;
      if (!s || !a) return;
      function done() {
        clearTimeout(timer);
        if (!d.classList.contains("is-open")) d.open = false;
        if (window.ScrollTrigger) window.ScrollTrigger.refresh();
      }
      s.addEventListener("click", function (e) {
        e.preventDefault();
        clearTimeout(timer);
        if (!d.classList.contains("is-open")) { d.open = true; void a.offsetHeight; d.classList.add("is-open"); }
        else d.classList.remove("is-open");
        timer = setTimeout(done, 520);
      });
      a.addEventListener("transitionend", function (e) { if (e.target === a && e.propertyName === "grid-template-rows") done(); });
    });
  }

  // ---- the warp: a [data-warp] link fills the screen accent then deep from the finger, then navigates ----------------
  function warp() {
    var reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    var going = false;
    all("a[data-warp]").forEach(function (a) {
      a.addEventListener("click", function (e) {
        if (reduced.matches || going || e.defaultPrevented || e.button > 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        if (!document.body.animate || !a.href || a.getAttribute("href").charAt(0) === "#") return;
        e.preventDefault();
        going = true;
        var r = a.getBoundingClientRect();
        var x = e.clientX || r.left + r.width / 2, y = e.clientY || r.top + r.height / 2;
        var far = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y)) + 2;
        a.classList.add("is-going");
        var box = document.createElement("div"); box.className = "lp-warp"; box.setAttribute("aria-hidden", "true");
        var s1 = document.createElement("span"); s1.className = "lp-warp__a";
        var s2 = document.createElement("span"); s2.className = "lp-warp__d";
        box.appendChild(s1); box.appendChild(s2); document.body.appendChild(box);
        var from = "circle(0px at " + x + "px " + y + "px)", to = "circle(" + far + "px at " + x + "px " + y + "px)";
        var ease = "cubic-bezier(0.65, 0, 0.35, 1)";
        s1.animate([{ clipPath: from }, { clipPath: to }], { duration: 320, easing: ease, fill: "forwards" });
        s2.animate([{ clipPath: from }, { clipPath: to }], { duration: 290, delay: 70, easing: ease, fill: "forwards" });
        setTimeout(function () { location.href = a.href; }, 360);
      });
    });
    window.addEventListener("pageshow", function (e) {
      if (!e.persisted) return;
      going = false;
      all(".lp-warp").forEach(function (w) { w.remove(); });
      all(".is-going").forEach(function (b) { b.classList.remove("is-going"); });
    });
  }

  // ---- cookie bar ---------------------------------------------------------------------------------------------
  function cookie() {
    var bar = $("cookie");
    if (!bar) return;
    var v = null;
    try { v = localStorage.getItem("lp_consent"); } catch (e) { /* private mode */ }
    if (!v) bar.hidden = false;
    function set(val) { try { localStorage.setItem("lp_consent", val); } catch (e) { /* ignore */ } bar.hidden = true; }
    var yes = $("cookie-accept"), no = $("cookie-reject"), again = $("cookie-settings");
    if (yes) yes.addEventListener("click", function () { set("yes"); });
    if (no) no.addEventListener("click", function () { set("no"); });
    if (again) again.addEventListener("click", function () { bar.hidden = false; });
  }

  // ---- carousel -----------------------------------------------------------------------------------------------
  function carousel(reduced) {
    if (!window.Swiper || !$("carousel")) return;
    var coarse = window.matchMedia("(pointer: coarse)").matches;
    // eslint-disable-next-line no-new
    new window.Swiper("#carousel", {
      slidesPerView: 1.2, spaceBetween: 16, rewind: true, grabCursor: !coarse, speed: coarse ? 400 : 700,
      navigation: { prevEl: "#carousel-prev", nextEl: "#carousel-next" },
      autoplay: reduced || coarse ? false : { delay: 3200, disableOnInteraction: false, pauseOnMouseEnter: true },
      a11y: { prevSlideMessage: "הקודם", nextSlideMessage: "הבא", firstSlideMessage: "זה הראשון", lastSlideMessage: "זה האחרון" },
      breakpoints: { 480: { slidesPerView: 1.6, spaceBetween: 20 }, 768: { slidesPerView: 2.4, spaceBetween: 24 }, 1024: { slidesPerView: 3.5, spaceBetween: 24 } },
    });
  }

  // ---- motion -------------------------------------------------------------------------------------------------
  function onScreen(ST, trigger, tl, eager) {
    if (!eager) tl.pause();
    ST.create({ trigger: trigger, start: "top 90%", end: "bottom 10%", onToggle: function (s) { if (s.isActive) tl.play(); else tl.pause(); } });
  }

  function hero(gsap, ST, dy) {
    gsap.timeline({ defaults: { ease: "power3.out" } })
      .fromTo(".lp-hero .lp-line", { yPercent: 110, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 1, stagger: 0.12 })
      .fromTo(".lp-hero [data-r]", { y: dy, opacity: 0 }, { y: 0, opacity: 1, duration: 1, stagger: 0.12 }, "-=0.55")
      .fromTo(".lp-devices", { y: 90, opacity: 0, scale: 0.95 }, { y: 0, opacity: 1, scale: 1, duration: 1.2 }, "-=0.8");
    rotor(gsap, ST);
  }

  function rotor(gsap, ST) {
    var words = all(".lp-rotor__word > span");
    if (!words.length) return;
    gsap.set(words, { yPercent: 110, opacity: 0 });
    var tl = gsap.timeline({ repeat: -1, repeatDelay: 0.5, delay: 0.7 })
      .to(words, { yPercent: 0, opacity: 1, duration: 0.8, ease: "power3.out", stagger: 0.15 })
      .to(words, { yPercent: -110, opacity: 0, duration: 0.55, ease: "power3.in", stagger: 0.1 }, "+=2.4");
    onScreen(ST, ".lp-hero", tl, true);
  }

  function reveals(gsap, ST, dy, lite) {
    if (lite) {
      all("[data-media]").forEach(function (m) {
        gsap.fromTo(m, { opacity: 0 }, { opacity: 1, duration: 0.4, ease: "none", scrollTrigger: { trigger: m, start: "top bottom", once: true } });
      });
      return;
    }
    var items = all("[data-r]").filter(function (e) { return !e.closest(".lp-hero"); });
    gsap.set(items, { y: dy, opacity: 0 });
    ST.batch(items, {
      start: "top 85%", once: true,
      onEnter: function (b) { gsap.to(b, { y: 0, opacity: 1, duration: 1, ease: "power3.out", stagger: 0.12, overwrite: true }); },
    });
    all("[data-media]").forEach(function (m) {
      var r = m.getBoundingClientRect();
      var fromLeft = r.left + r.width / 2 < window.innerWidth / 2;
      gsap.fromTo(m, { x: fromLeft ? -80 : 80, opacity: 0, scale: 0.95 },
        { x: 0, opacity: 1, scale: 1, duration: 1.1, ease: "power3.out", scrollTrigger: { trigger: m, start: "top 80%", once: true } });
    });
  }

  function parallax(gsap) {
    all("[data-parallax]").forEach(function (e) {
      gsap.to(e, { y: Number(e.getAttribute("data-parallax")) || -60, ease: "none",
        scrollTrigger: { trigger: e.closest("section") || e, start: "top bottom", end: "bottom top", scrub: 1 } });
    });
  }

  function floats(gsap, lite) {
    all(".lp-person, .lp-devices").forEach(function (fig) {
      var tiles = all("[data-float]", fig);
      if (!tiles.length) return;
      gsap.from(tiles, { scale: lite ? 0.8 : 0.5, opacity: 0, duration: lite ? 0.45 : 0.7, ease: "back.out(1.8)", stagger: lite ? 0.07 : 0.18,
        scrollTrigger: { trigger: fig, start: lite ? "top 85%" : "top 70%", once: true } });
    });
  }

  function counters(gsap, ST) {
    var fmt = new Intl.NumberFormat("he-IL");
    all("[data-count]").forEach(function (e) {
      var end = Number(e.getAttribute("data-count")), o = { v: 0 }, t = document.createTextNode("0");
      e.textContent = ""; e.appendChild(t);
      ST.create({ trigger: e, start: "top 85%", once: true, onEnter: function () {
        gsap.to(o, { v: end, duration: 2, ease: "power2.out", onUpdate: function () { t.nodeValue = fmt.format(Math.round(o.v)); } });
      } });
    });
  }

  function steps(gsap, ST) {
    var list = document.querySelector("[data-steps]"), line = document.querySelector("[data-line]");
    if (!list) return;
    if (line && line.offsetParent !== null) {
      gsap.fromTo(line, { scaleX: 0 }, { scaleX: 1, ease: "none", scrollTrigger: { trigger: list, start: "top 75%", end: "bottom 45%", scrub: 1 } });
    }
    all("[data-step]", list).forEach(function (s) {
      ST.create({ trigger: s, start: "top 70%", onEnter: function () { s.classList.add("is-on"); }, onLeaveBack: function () { s.classList.remove("is-on"); } });
    });
  }

  function mockups(gsap, ST) {
    var dev = document.querySelector(".lp-devices");
    if (dev) {
      var items = all("[data-item]", dev), fill = dev.querySelector("[data-fill]"), bars = all("[data-bars] i", dev);
      var stamp = dev.querySelector("[data-stamp]"), opts = all("[data-opt]", dev), level = dev.querySelector("[data-level]");
      var tl = gsap.timeline({ repeat: -1, repeatDelay: 1.6 });
      tl.call(function () { items.concat(opts).forEach(function (i) { i.classList.remove("is-on"); }); });
      if (fill) tl.set(fill, { scaleX: 0 });
      if (stamp) tl.set(stamp, { opacity: 0, scale: 0.6 });
      if (level) tl.set(level, { scaleX: 0.3, transformOrigin: "100% 50%" });
      if (bars.length) tl.from(bars, { scaleY: 0.05, duration: 0.9, ease: "power3.out", stagger: 0.06 }, 0.2);
      items.forEach(function (it, i) {
        tl.call(function () { it.classList.add("is-on"); }, null, 0.5 + i * 0.55);
        if (fill) tl.to(fill, { scaleX: (i + 1) / items.length, duration: 0.45, ease: "power2.out" }, 0.5 + i * 0.55);
      });
      if (stamp) tl.to(stamp, { opacity: 1, scale: 1, duration: 0.5, ease: "back.out(2.4)" }, ">-0.1");
      if (opts[0]) tl.call(function () { opts[0].classList.add("is-on"); }, null, 1.3);
      if (level) tl.to(level, { scaleX: 0.55, duration: 0.6, ease: "power2.out" }, 1.6);
      tl.to({}, { duration: 2.2 });
      onScreen(ST, dev, tl);
    }
    all("[data-sheet]").forEach(function (sheet) {
      var rows = all("[data-row]", sheet);
      var st = gsap.timeline({ repeat: -1, repeatDelay: 1.4 });
      st.call(function () { rows.forEach(function (r) { r.classList.remove("is-on"); }); });
      st.set(all(".lp-sheet__val i", sheet), { scaleX: 0 });
      rows.forEach(function (r, i) {
        var at = 0.3 + i * 0.6;
        st.to(r.querySelector(".lp-sheet__val i"), { scaleX: 0.55 + ((i * 37) % 40) / 100, duration: 0.5, ease: "power2.out" }, at);
        st.call(function () { r.classList.add("is-on"); }, null, at + 0.45);
      });
      st.to({}, { duration: 2 });
      onScreen(ST, sheet, st);
    });
    var wave = all(".lp-callcard__wave i");
    if (wave.length) {
      var wt = gsap.timeline();
      wt.to(wave, { scaleY: 0.35, duration: 0.45, yoyo: true, repeat: -1, ease: "sine.inOut", stagger: { each: 0.12, from: "center" } });
      onScreen(ST, wave[0].closest(".lp-callcard"), wt);
    }
  }

  function marquee(ST) {
    all(".lp-marquee").forEach(function (box) {
      ST.create({ trigger: box, start: "top bottom", end: "bottom top", toggleClass: { targets: box, className: "is-on" } });
    });
  }

  function motion() {
    var gsap = window.gsap, ST = window.ScrollTrigger;
    if (!gsap || !ST) {
      root.classList.remove("lp-anim");
      all(".lp-marquee").forEach(function (m) { m.classList.add("is-on"); });
      return;
    }
    gsap.registerPlugin(ST);
    var shown = !root.classList.contains("lp-anim");
    // "full" must be there: matchMedia runs the callback only when at least one condition matches
    gsap.matchMedia().add({ full: "(prefers-reduced-motion: no-preference)", reduced: "(prefers-reduced-motion: reduce)", lite: LITE }, function (ctx) {
      var c = ctx.conditions;
      if (c.reduced) {
        if (!shown) all("[data-r], [data-media], .lp-hero .lp-line, .lp-rotor__word > span").forEach(function (e) {
          gsap.fromTo(e, { opacity: 0 }, { opacity: 1, duration: 0.4, ease: "none", scrollTrigger: { trigger: e, start: "top 92%", once: true } });
        });
        return;
      }
      var dy = c.lite ? 30 : 60;
      if (!shown) { hero(gsap, ST, dy); reveals(gsap, ST, dy, c.lite); } else rotor(gsap, ST);
      if (!c.lite) parallax(gsap);
      floats(gsap, c.lite);
      counters(gsap, ST);
      steps(gsap, ST);
      mockups(gsap, ST);
      marquee(ST);
    });
  }

  (function start() {
    var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    topBar(); menu(); modals(); faq(); warp(); cookie();
    carousel(reduced);   // first: Swiper settles its height before anything below is measured
    try { motion(); } catch (e) { root.classList.remove("lp-anim"); }
    root.classList.add("lp-ready");
    if (document.fonts) document.fonts.ready.then(function () { if (window.ScrollTrigger) window.ScrollTrigger.refresh(); });
  })();
})();
