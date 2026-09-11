(() => {
  const root = document.documentElement;
  const preference = window.matchMedia('(prefers-color-scheme: dark)');
  let saved;
  try { saved = localStorage.getItem('ahern-theme'); } catch {}
  const valid = value => value === 'light' || value === 'dark';
  function apply(theme) {
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
    const button = document.querySelector('[data-portal-theme-toggle]');
    if (button) {
      const label = `Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`;
      button.setAttribute('aria-label', label);
      button.title = label;
    }
    document.dispatchEvent(new CustomEvent('ahern-theme-change', {detail:{theme}}));
  }
  // Loaded before the stylesheets so returning visits paint the saved theme.
  apply(valid(saved) ? saved : preference.matches ? 'dark' : 'light');
  document.addEventListener('DOMContentLoaded', () => {
    apply(root.dataset.theme);
    document.querySelector('[data-portal-theme-toggle]')?.addEventListener('click', () => {
      saved = root.dataset.theme === 'dark' ? 'light' : 'dark';
      apply(saved);
      try { localStorage.setItem('ahern-theme', saved); } catch {}
    });
  });
  preference.addEventListener('change', () => { if (!valid(saved)) apply(preference.matches ? 'dark' : 'light'); });
  window.addEventListener('storage', event => {
    if (event.key !== 'ahern-theme' && event.key !== null) return;
    saved = event.newValue;
    apply(valid(saved) ? saved : preference.matches ? 'dark' : 'light');
  });
})();
