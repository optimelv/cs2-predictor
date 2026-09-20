// Resolve before first paint. Native controls use the same color scheme.
(() => {
  const key = 'strikesignal-appearance';
  const system = matchMedia('(prefers-color-scheme: dark)');
  const valid = (value) => ['dark', 'light', 'system'].includes(value) ? value : 'dark';
  let preference = 'dark';
  try { preference = valid(localStorage.getItem(key)); } catch { /* Storage is optional. */ }
  let paletteFrame = 0;
  const apply = () => {
    // Snap palette changes so text never crosses an intermediate background.
    const root = document.documentElement;
    if (typeof requestAnimationFrame === 'function') {
      cancelAnimationFrame(paletteFrame);
      root.dataset.paletteChanging = 'true';
    }
    const theme = preference === 'system' ? (system.matches ? 'dark' : 'light') : preference;
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    const select = document.querySelector('#themePreference');
    if (select) select.value = preference;
    if (typeof requestAnimationFrame === 'function') {
      void root.offsetWidth;
      paletteFrame = requestAnimationFrame(() => { delete root.dataset.paletteChanging; });
    }
  };
  apply();
  system.addEventListener('change', () => { if (preference === 'system') apply(); });
  addEventListener('storage', (event) => {
    if (event.key === key || event.key === null) { preference = valid(event.newValue); apply(); }
  });
  document.addEventListener('DOMContentLoaded', () => {
    apply();
    document.querySelector('#themePreference')?.addEventListener('change', (event) => {
      preference = valid(event.target.value);
      try { localStorage.setItem(key, preference); } catch { /* Keep the in-memory preference. */ }
      apply();
    });
  });
})();
