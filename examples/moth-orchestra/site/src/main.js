import '@fontsource-variable/imbue/opsz.css';
import '@fontsource-variable/hanken-grotesk';
import './tokens.css';
import './base.css';
import './style.css';
import { initEffects } from './addons/effects.js';
import { initSound } from './addons/sound.js';
import { initLamp } from './lamp.js';

document.documentElement.setAttribute('data-ready', ''); // tells the safety timer in index.html that scripts run

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

// [data-reveal] blocks arrive once as they scroll into view. Children with style="--i: n" stagger.
const reveals = document.querySelectorAll('[data-reveal]');
if (reduced || !('IntersectionObserver' in window)) {
  reveals.forEach((el) => el.classList.add('is-in'));
} else {
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.classList.add('is-in');
      io.unobserve(e.target);
    }
  }, { rootMargin: '0px 0px -12% 0px' });
  reveals.forEach((el) => io.observe(el));
}

initEffects();
// a low, slow bed in D minor and soft glass clicks; off until the visitor presses Sound
const sounds = initSound(document.querySelector('.sound-toggle'), { mood: 'deep', key: 50 });
initLamp(document.querySelector('.scene'), { onBump: () => sounds.tap() });

for (const el of document.querySelectorAll('[data-year]')) el.textContent = new Date().getFullYear();

// Skip link: move focus into main so the next Tab continues from there.
document.querySelector('.skip')?.addEventListener('click', () => document.getElementById('main')?.focus());
