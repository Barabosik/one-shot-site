// The lamp and the moth on the first screen.
//
// A bare bulb hangs on its cord; the moth from the album cover flies round it, bumps it now and then (the bulb
// swings and flickers), and throws a big soft shadow on the wall behind the name. After a few seconds it lands
// on the wall and everything goes still within about five seconds (WCAG 2.2.2: nothing keeps moving on
// its own). Move the mouse over the
// first screen, or tap it on a phone, and the moth takes off again and follows you, as if you were the light.
//
// Without scripts, or with reduced motion, the moth simply rests on the wall where the CSS puts it.
const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const turn = (a, b, k) => a + (((b - a + Math.PI * 3) % TAU) - Math.PI) * k; // ease an angle the short way round

export function initLamp(scene, { onBump } = {}) {
  if (!scene) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hero = scene.parentElement;
  const lamp = scene.querySelector('.lamp');
  const bulb = scene.querySelector('.bulb');
  const glow = scene.querySelector('.glow');
  const moth = scene.querySelector('.moth');
  const shade = scene.querySelector('.moth-shadow');
  const right = scene.querySelectorAll('.wr');
  const left = scene.querySelectorAll('.wl');
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;

  // geometry, from the CSS (computed and offset values ignore transforms, so a swinging lamp or a flying moth
  // measures the same; SVG elements have no offsetLeft, so the moth and bulb are read from their computed style)
  let anchor, cord, bulbR, size, rest, restAng, orbit;
  const px = (el, prop) => parseFloat(getComputedStyle(el)[prop]) || 0;
  const measure = () => {
    anchor = { x: lamp.offsetLeft + lamp.offsetWidth / 2, y: lamp.offsetTop };
    cord = scene.querySelector('.cord').offsetHeight + px(bulb, 'height') * 0.575;
    bulbR = px(bulb, 'width') * 0.36;
    size = px(moth, 'width');
    rest = { x: px(moth, 'left') + size / 2, y: px(moth, 'top') + px(moth, 'height') / 2 };
    restAng = (parseFloat(getComputedStyle(moth).getPropertyValue('--rest')) || 0) * (Math.PI / 180);
    orbit = clamp(scene.offsetWidth * 0.11, 70, 150);
  };
  measure();
  if (reduced) { // a still frame: the moth on the wall, its shadow beside it, nothing moving
    const p = rest, b = { x: anchor.x, y: anchor.y + cord }, k = 2.1;
    shade.style.transform = `translate(${b.x + (p.x - b.x) * k - size / 2}px, ${b.y + (p.y - b.y) * k - size * 0.32}px) rotate(${restAng}rad) scale(${k})`;
    shade.style.opacity = '0.55';
    return;
  }

  const p = { ...rest }, v = { x: rand(-40, 40), y: -260 };
  let ang = restAng, phase = 0, flap = 1, swing = 0, swingV = 0, around = rand(0, TAU), spin = Math.random() < 0.5 ? -1 : 1;
  let mode = 'fly', flyUntil = performance.now() + 2000, dash = 0, nextDash = performance.now() + 2200, lastBump = 0;
  let pointer = null, pointerAt = 0, running = false, visible = true, last = 0;
  moth.style.setProperty('rotate', '0deg'); // the resting angle comes from the script from now on

  // the flight runs in small fixed steps, so it looks the same at 30, 60 or 120 frames a second
  function frame(t) {
    let left = clamp((t - last) / 1000, 0, 0.1), b;
    last = t;
    do { const dt = Math.min(left, 1 / 120); b = step(dt, t); left -= dt; } while (left > 1e-6);
    draw(b);
    const still = mode === 'rest' && Math.abs(swing) < 0.003 && Math.abs(swingV) < 0.004 && flap > 0.995
      && Math.abs(((restAng - ang + Math.PI * 3) % TAU) - Math.PI) < 0.003;
    if (still || !visible) { running = false; return; }
    requestAnimationFrame(frame);
  }

  function step(dt, t) {
    // the lamp: a damped pendulum, nudged when the moth hits the bulb
    swingV += (-5 * swing - 3 * swingV) * dt;
    swing += swingV * dt;
    const b = { x: anchor.x - Math.sin(swing) * cord, y: anchor.y + Math.cos(swing) * cord };

    const chasing = pointer && t - pointerAt < 2600;
    if (mode === 'fly' && !chasing && t > flyUntil) mode = 'land';
    let goal;
    if (mode === 'fly') {
      const target = chasing ? pointer : b;
      around += dt * spin * (2.3 + 1.3 * Math.sin(t / 830));
      let r = (chasing ? 42 : orbit) * (0.72 + 0.38 * Math.sin(t / 1270 + 1.3));
      if (!chasing && t > nextDash) { dash = 0.32; nextDash = t + rand(1700, 3600); }
      if (dash > 0) { r = 4; dash -= dt; }
      goal = { x: target.x + r * Math.cos(around), y: target.y + r * 0.7 * Math.sin(around) };
      v.x += ((goal.x - p.x) * 15 - v.x * 4.2 + rand(-1, 1) * 1400) * dt;
      v.y += ((goal.y - p.y) * 15 - v.y * 4.2 + rand(-1, 1) * 1400) * dt;
      // bump: the bulb swings away from the hit, flickers, and the moth bounces off
      const dx = p.x - b.x, dy = p.y - b.y, d = Math.hypot(dx, dy) || 1;
      if (!chasing && d < bulbR + size * 0.12 && t - lastBump > 500) {
        lastBump = t; dash = 0;
        swingV += clamp(-v.x / 1200, -0.3, 0.3);
        v.x = (dx / d) * 380; v.y = (dy / d) * 380;
        if (Math.random() < 0.4) spin = -spin;
        glow.animate([{ opacity: 0.55 }, { opacity: 1 }], { duration: 260, easing: 'ease-out' });
        onBump?.();
      }
    } else {
      goal = rest;
      v.x += ((rest.x - p.x) * 30 - v.x * 11) * dt;
      v.y += ((rest.y - p.y) * 30 - v.y * 11) * dt;
    }
    const speed = Math.hypot(v.x, v.y);
    if (speed > 950) { v.x *= 950 / speed; v.y *= 950 / speed; }
    p.x += v.x * dt;
    p.y += v.y * dt;

    const landed = mode !== 'fly' && Math.hypot(rest.x - p.x, rest.y - p.y) < 2.5 && speed < 30;
    if (landed) { mode = 'rest'; p.x = rest.x; p.y = rest.y; v.x = v.y = 0; }
    // head into the flight; on the wall, settle to the resting angle with the wings open
    ang = turn(ang, mode === 'rest' ? restAng : Math.atan2(v.y, v.x) + Math.PI / 2, 1 - Math.exp(-(mode === 'rest' ? 6 : 11) * dt));
    if (mode === 'rest') flap += (1 - flap) * (1 - Math.exp(-8 * dt));
    else { phase += dt * TAU * (8 + speed / 140); flap = 0.2 + 0.8 * (0.5 + 0.5 * Math.cos(phase)); }
    return b;
  }

  function draw(b) {
    const w = size / 2;
    moth.style.transform = `translate(${(p.x - rest.x).toFixed(1)}px, ${(p.y - rest.y).toFixed(1)}px) rotate(${ang.toFixed(3)}rad)`;
    // the shadow: projected from the bulb onto the wall, bigger the closer the moth is to the light
    const d = Math.hypot(p.x - b.x, p.y - b.y);
    const k = clamp(1.7 + 140 / (d + 40), 1.7, 4.2);
    const sx = b.x + (p.x - b.x) * k, sy = b.y + (p.y - b.y) * k;
    shade.style.transform = `translate(${(sx - w).toFixed(1)}px, ${(sy - w * 0.64).toFixed(1)}px) rotate(${ang.toFixed(3)}rad) scale(${k.toFixed(3)})`;
    shade.style.opacity = (0.62 - (k - 1.7) * 0.1).toFixed(3);
    const s = flap.toFixed(3);
    for (const g of right) g.setAttribute('transform', `scale(${s} 1)`);
    for (const g of left) g.setAttribute('transform', `scale(${-s} 1)`);
    lamp.style.transform = `rotate(${swing.toFixed(4)}rad)`;
    glow.style.transform = `translate(${(b.x - anchor.x).toFixed(1)}px, ${(b.y - anchor.y - cord).toFixed(1)}px)`;
  }

  function start() {
    if (running || !visible) return;
    running = true;
    last = performance.now();
    requestAnimationFrame(frame);
  }
  function wake(x, y) {
    pointer = { x, y };
    pointerAt = performance.now();
    if (mode !== 'fly') { mode = 'fly'; v.y -= 200; }
    flyUntil = pointerAt + 6000;
    start();
  }
  const local = (e) => { const r = scene.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };

  if (fine) {
    hero.addEventListener('pointermove', (e) => wake(...local(e)));
    hero.addEventListener('pointerleave', () => { pointer = null; });
  } else {
    hero.addEventListener('pointerdown', (e) => { if (!e.target.closest('a, button')) wake(...local(e)); });
  }
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible && mode !== 'rest') start(); }).observe(scene);
  let resized;
  addEventListener('resize', () => {
    clearTimeout(resized);
    resized = setTimeout(() => {
      const was = { ...rest };
      moth.style.transform = '';
      measure();
      p.x += rest.x - was.x; p.y += rest.y - was.y;
      draw({ x: anchor.x - Math.sin(swing) * cord, y: anchor.y + Math.cos(swing) * cord });
    }, 150);
  });

  draw({ x: anchor.x, y: anchor.y + cord });
  start();
}
