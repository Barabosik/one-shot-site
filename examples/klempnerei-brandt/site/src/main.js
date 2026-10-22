import '@fontsource-variable/anybody/wdth.css'; // display: wide for the lettering, narrow for the numbers
import '@fontsource-variable/work-sans';
import './tokens.css';
import './base.css';
import './style.css';

document.documentElement.setAttribute('data-ready', ''); // tells the safety timer in index.html that scripts run

// Motion level: Still. No reveals, no entrances; the page is simply there.

for (const el of document.querySelectorAll('[data-year]')) el.textContent = new Date().getFullYear();

// Skip link: move focus into main so the next Tab continues from there.
document.querySelector('.skip')?.addEventListener('click', () => document.getElementById('main')?.focus());
