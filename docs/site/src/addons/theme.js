// A light/dark switch that follows the system until the visitor picks, then remembers the pick.
//
//   <button class="theme-toggle" type="button" data-light="Light" data-dark="Dark">
//     <span class="visually-hidden">Switch to </span><span class="theme-word">Dark</span>
//   </button>
//   initTheme(document.querySelector('.theme-toggle'));
//
// The button names the theme a click switches to: "Dark" on a light page, "Light" on a dark one. The word is set
// on load, on every click and when the system changes, so it never contradicts the page (data-next on the button
// says which, for CSS). Write both words, and the hidden "Switch to", in the site's language (data-light and
// data-dark; English without them). A button with no <svg> gets its icon drawn here: a ring with the left half
// filled, in SVG, so it stays whole at every zoom (a CSS dot made of a border and a half gradient leaves a gap
// between the two at 150 %). It is 1em; size it in CSS with .theme-icon.
//
// In tokens.css, add the second palette (palette.mjs --mode dark) under both:
//   @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { …dark tokens… } }
//   :root[data-theme="dark"] { …dark tokens… }
// To avoid a flash of the wrong theme, put this in <head> before the CSS:
//   <script>try{var t=localStorage.getItem('site-theme');if(t)document.documentElement.dataset.theme=t}catch(e){}</script>
const KEY = 'site-theme';
const ICON = '<svg class="theme-icon" viewBox="0 0 16 16" width="1em" height="1em" aria-hidden="true" focusable="false">'
  + '<circle cx="8" cy="8" r="6.75" fill="none" stroke="currentColor" stroke-width="1.5"/>'
  + '<path d="M8 1.25a6.75 6.75 0 0 0 0 13.5z" fill="currentColor"/></svg>';

export function initTheme(button) {
  if (!button) return;
  const html = document.documentElement;
  const system = matchMedia('(prefers-color-scheme: dark)');
  const words = { light: button.dataset.light || 'Light', dark: button.dataset.dark || 'Dark' };
  // the word to change: .theme-word, or a bare word in the button (older markup), wrapped so the icon stays
  let word = button.querySelector('.theme-word');
  if (!word) {
    word = document.createElement('span');
    word.className = 'theme-word';
    for (const n of [...button.childNodes]) if (n.nodeType === Node.TEXT_NODE) n.remove();
    button.append(word);
  }
  if (!button.querySelector('svg')) button.insertAdjacentHTML('afterbegin', ICON);
  // the word now says the state, so a pressed state would say it twice, and wrongly half the time
  button.removeAttribute('aria-pressed');
  const isDark = () => (html.dataset.theme ? html.dataset.theme === 'dark' : system.matches);
  let wanted = null; // the last pick, before a cross-fade has put it on the page, so a quick second click undoes it
  const show = () => {
    const next = isDark() ? 'light' : 'dark';
    word.textContent = words[next];
    button.dataset.next = next;
    // new-site writes one meta per scheme; the one the browser uses follows the system, so both take the choice
    const ground = getComputedStyle(html).getPropertyValue('--ground').trim();
    if (ground) for (const meta of document.querySelectorAll('meta[name="theme-color"]')) meta.content = ground;
  };
  button.addEventListener('click', () => {
    const next = (wanted || (isDark() ? 'dark' : 'light')) === 'dark' ? 'light' : 'dark';
    wanted = next;
    const swap = () => { html.dataset.theme = next; show(); };
    // a soft cross-fade where the browser can do it
    if (document.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches) document.startViewTransition(swap);
    else swap();
    try { localStorage.setItem(KEY, next); } catch { /* ignore */ }
  });
  system.addEventListener('change', show);
  show();
}
