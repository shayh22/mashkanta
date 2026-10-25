// Applies the saved or system colour theme before first paint, so a dark-mode visitor never sees
// a white flash. External rather than inline because the Content-Security-Policy forbids inline
// scripts.
(function () {
  var theme = null;
  try {
    theme = window.localStorage.getItem('mashkanta-theme');
  } catch (error) {
    theme = null;
  }
  if (theme !== 'light' && theme !== 'dark') {
    theme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  document.documentElement.classList.toggle('dark', theme === 'dark');
})();
