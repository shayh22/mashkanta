/* First thing in <head>: mark the page as animated before the first paint, so scroll reveals start hidden instead of
   flashing in. site.js removes the mark if the animation library did not load; a timer is the safety net. */
(function () {
  "use strict";
  var root = document.documentElement;
  root.classList.add("lp-js");
  if (!window.matchMedia || !window.matchMedia("(prefers-reduced-motion: reduce)").matches) root.classList.add("lp-anim");
  setTimeout(function () {
    if (!root.classList.contains("lp-ready")) root.classList.remove("lp-anim");
  }, 2500);
})();
