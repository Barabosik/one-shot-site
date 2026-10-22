// Scroll motion with GSAP, for the "Lively" setting. The plain [data-reveal] fades in base.css cover
// "Gentle"; use this when sections should build up, drift or follow the scroll.
//
//   <section data-hero> …children enter one after another on load… </section>
//   <ul data-stagger> …items arrive in a quick cascade as the list scrolls in… </ul>
//   <img data-parallax="0.15">   drifts slower than the page (0.1 to 0.3 is plenty)
//   <div data-scrub>             fades and rises in step with the scroll, then stays
//
// Reduced motion keeps a short fade on the first screen and shows everything else as it is: nothing waits
// on a scroll trigger, so nothing can be left hidden.
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

export function initMotion(root = document) {
  const mm = gsap.matchMedia();
  mm.add({ full: '(prefers-reduced-motion: no-preference)', calm: '(prefers-reduced-motion: reduce)' }, ({ conditions }) => {
    const move = conditions.full;
    const rise = move ? 24 : 0;

    // the first screen: one composed entrance, once
    for (const hero of root.querySelectorAll('[data-hero]')) {
      // fromTo, not from: with reduced motion base.css shortens every transition, and from() would then
      // read the hidden start state as the end state and leave the hero invisible
      gsap.fromTo(hero.children, { autoAlpha: 0, y: rise }, { autoAlpha: 1, y: 0, duration: move ? 1 : 0.4, ease: 'expo.out', stagger: 0.09, delay: 0.1 });
    }

    // lists and grids: items cascade in when they reach the screen, once
    const items = root.querySelectorAll('[data-stagger] > *');
    if (items.length && move) {
      gsap.set(items, { autoAlpha: 0, y: rise });
      ScrollTrigger.batch(items, {
        start: 'top 88%',
        once: true,
        onEnter: (els) => gsap.to(els, { autoAlpha: 1, y: 0, duration: 0.75, ease: 'power3.out', stagger: 0.06, overwrite: true }),
      });
    }

    if (!move) return;

    for (const el of root.querySelectorAll('[data-parallax]')) {
      const k = parseFloat(el.dataset.parallax) || 0.15;
      gsap.fromTo(el, { yPercent: k * 50 }, {
        yPercent: -k * 50, ease: 'none',
        scrollTrigger: { trigger: el, start: 'top bottom', end: 'bottom top', scrub: true },
      });
    }
    for (const el of root.querySelectorAll('[data-scrub]')) {
      if (el.getBoundingClientRect().top < innerHeight * 0.95) continue; // already on screen: nothing to build
      // clamp: near the bottom of the page "top 55%" may never be reached, which would leave it half-faded.
      // once: when it has built up, it stays, also when the visitor scrolls back up.
      gsap.fromTo(el, { autoAlpha: 0, y: 60 }, { autoAlpha: 1, y: 0, ease: 'none', scrollTrigger: { trigger: el, start: 'top 95%', end: 'clamp(top 55%)', scrub: 0.6, once: true } });
    }
  });

  // web fonts change line breaks, which moves every trigger: measure again once they are in
  document.fonts?.ready.then(() => ScrollTrigger.refresh());
  return mm;
}
