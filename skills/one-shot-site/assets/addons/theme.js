// A light/dark switch that follows the system until the visitor picks, then remembers the pick.
//
//   <button class="theme-toggle" type="button" aria-pressed="false">Dark</button>
//   initTheme(document.querySelector('.theme-toggle'));
//
// The visible word stays the same and aria-pressed carries the state, so a screen reader hears "Dark, pressed".
//
// In tokens.css, add the second palette (palette.mjs --mode dark) under both:
//   @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { …dark tokens… } }
//   :root[data-theme="dark"] { …dark tokens… }
// To avoid a flash of the wrong theme, put this in <head> before the CSS:
//   <script>try{var t=localStorage.getItem('site-theme');if(t)document.documentElement.dataset.theme=t}catch(e){}</script>
const KEY = 'site-theme';

export function initTheme(button) {
  if (!button) return;
  const html = document.documentElement;
  const system = matchMedia('(prefers-color-scheme: dark)');
  const isDark = () => (html.dataset.theme ? html.dataset.theme === 'dark' : system.matches);
  const show = () => {
    const dark = isDark();
    button.setAttribute('aria-pressed', String(dark));
    // new-site writes one meta per scheme; the one the browser uses follows the system, so both take the choice
    const ground = getComputedStyle(html).getPropertyValue('--ground').trim();
    if (ground) for (const meta of document.querySelectorAll('meta[name="theme-color"]')) meta.content = ground;
  };
  button.addEventListener('click', () => {
    const next = isDark() ? 'light' : 'dark';
    const swap = () => { html.dataset.theme = next; show(); };
    // a soft cross-fade where the browser can do it
    if (document.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches) document.startViewTransition(swap);
    else swap();
    try { localStorage.setItem(KEY, next); } catch { /* ignore */ }
  });
  system.addEventListener('change', show);
  show();
}
