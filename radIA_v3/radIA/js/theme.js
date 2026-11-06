(function initializeTheme() {
  const storageKey = 'radia_theme';

  function preferredTheme() {
    const saved = localStorage.getItem(storageKey);
    if (saved === 'dark' || saved === 'light') return saved;
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function applyTheme(theme) {
    const dark = theme === 'dark';
    document.documentElement.classList.toggle('dark', dark);
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';

    document.querySelectorAll('.theme-toggle i').forEach((icon) => {
      icon.className = dark ? 'fas fa-sun' : 'fas fa-moon';
    });

    document.querySelectorAll('.theme-toggle').forEach((button) => {
      button.setAttribute('aria-label', dark ? 'Usar tema claro' : 'Usar tema escuro');
      button.setAttribute('title', dark ? 'Usar tema claro' : 'Usar tema escuro');
    });
  }

  window.toggleTheme = function toggleTheme() {
    const next = document.documentElement.classList.contains('dark') ? 'light' : 'dark';
    localStorage.setItem(storageKey, next);
    applyTheme(next);
  };

  applyTheme(preferredTheme());
  document.addEventListener('DOMContentLoaded', () => applyTheme(preferredTheme()));
})();
