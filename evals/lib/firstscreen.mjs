import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// Which of layout.md's first-screen patterns a site uses, measured at 1440 × 900 with reduced motion (so entrances
// have finished): type-led, image-led, split, object, statement + proof. Read from where the h1 and the biggest
// picture sit, so it says what the eye lands on, not what the classes are called. A rough label for sameness
// across a batch ("all five sites are a split"), not a judgement of one site.

// Runs in the page: the h1, the biggest visual (img, video, canvas, svg or a background image) and the biggest
// block of proof (a table, list, definition list, form or code) on the first screen, as rectangles.
export function firstScreenParts() {
  const vw = innerWidth, vh = innerHeight;
  const clip = (r) => {
    const x = Math.max(0, r.left), y = Math.max(0, r.top);
    const w = Math.max(0, Math.min(vw, r.right) - x), h = Math.max(0, Math.min(vh, r.bottom) - y);
    return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
  };
  const shown = (el) => { const s = getComputedStyle(el); return s.visibility !== 'hidden' && s.display !== 'none' && +s.opacity > 0.05; };
  // the nav, buttons and the logo aren't the picture; nor is a texture on the whole page
  const chrome = (el) => el.closest('nav, button, [class*="logo"]') || /^(HTML|BODY|MAIN)$/.test(el.tagName) || el.getBoundingClientRect().height > 3 * vh;
  const biggest = (els) => {
    let best = null;
    for (const el of els) {
      if (!shown(el) || chrome(el)) continue;
      const c = clip(el.getBoundingClientRect());
      if (!best || c.w * c.h > best.w * best.h) best = { ...c, tag: el.tagName.toLowerCase() };
    }
    return best && best.w * best.h > 0 ? best : null;
  };
  const h1el = document.querySelector('h1');
  const h1 = h1el && shown(h1el) ? clip(h1el.getBoundingClientRect()) : null;
  const all = [document.body, ...document.body.querySelectorAll('*')];
  const media = all.filter((el) => /^(IMG|VIDEO|CANVAS|PICTURE)$/.test(el.tagName) || (el.tagName === 'svg' && !el.parentElement.closest('svg')) || /url\(/.test(getComputedStyle(el).backgroundImage));
  const proof = all.filter((el) => /^(TABLE|OL|UL|DL|FORM|PRE)$/.test(el.tagName) && !el.closest('nav, header, footer'));
  return { vw, vh, h1: h1 && h1.w * h1.h ? h1 : null, visual: biggest(media), proof: biggest(proof) };
}

const area = (r) => (r ? r.w * r.h : 0);
const overlap = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

export function firstScreenPattern({ vw, vh, h1, visual, proof }) {
  const screen = vw * vh;
  const share = area(visual) / screen;
  if (share < 0.08) return area(proof) / screen >= 0.06 ? 'statement + proof' : 'type-led';
  // the headline on the picture, or a picture filling most of the screen
  if (share >= 0.55 || (h1 && overlap(h1, visual) > 0.5 * area(h1))) return 'image-led';
  if (h1) {
    const apart = visual.x >= h1.x + h1.w - 0.04 * vw || visual.x + visual.w <= h1.x + 0.04 * vw;
    if (apart) return 'split';
    const below = visual.y >= h1.y + h1.h - 4;
    if (below && visual.w >= 0.6 * vw) return 'statement + proof';
  }
  return Math.abs(visual.x + visual.w / 2 - vw / 2) < 0.15 * vw ? 'object' : 'split';
}

// url: where the site is served. Uses the skill's own Chrome helpers.
export async function probeFirstScreen(url, skillDir) {
  const { launch, sleep } = await import(pathToFileURL(join(skillDir, 'scripts/lib/chrome.mjs')).href);
  const b = await launch();
  try {
    const p = await b.newPage({ width: 1440, height: 900, reducedMotion: true });
    await p.goto(url);
    await sleep(1200);
    const parts = await p.call(firstScreenParts);
    return { pattern: firstScreenPattern(parts), ...parts };
  } finally {
    await b.close();
  }
}
