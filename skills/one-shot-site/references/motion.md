# Motion

Motion exists to explain or to delight, never to decorate. Before animating anything, name its job:
feedback (you pressed this), orientation (this came from there), state (this is open now), focus (look here
first), or delight (a moment people remember). No job, no animation.

## How often decides how much

- Things people use constantly (nav links, buttons, form fields): instant or nearly so. A colour change on hover
  and a small press. Nothing that makes them wait.
- Things seen once per visit (the hero entrance, a section arriving): this is where the motion budget goes.
- One authored moment per site: the place the brief's idea comes alive. Spend the effort there, keep the rest
  quiet. The same fade-up on every section is not a design.

## Timing

| What | Duration | Easing |
|---|---|---|
| Press (scale to 0.97) | 100–150ms | ease-out |
| Hover colour / underline | 150–200ms | ease |
| Menus, tooltips, small panels | 180–260ms | ease-out |
| Sections arriving on scroll | 500–900ms | strong ease-out |
| Hero entrance, total | under 1.5s | ease-out, staggered 60–100ms |
| Things moving across the screen | 300–600ms | ease-in-out |

Tokens: `--ease-out: cubic-bezier(0.22, 1, 0.36, 1)`, `--ease-in-out: cubic-bezier(0.65, 0, 0.35, 1)`.
In GSAP: `power3.out` / `expo.out` for arrivals, `power2.inOut` for moves.

## Rules

- Animate `transform` and `opacity` (and `clip-path`, `filter` sparingly). Never width, height, top, left or margin.
- Name the properties: `transition: opacity 200ms, transform 200ms`. Never `transition: all`.
- Nothing appears from `scale(0)`: start at 0.9–0.97 with opacity 0.
- No ease-in for things people trigger (it feels laggy). Ease-out for arrivals.
- Bounce and overshoot only in Playful.
- Transitions, not keyframes, for anything that can be interrupted (hover, toggles), so it reverses smoothly.
- Hover effects only for real pointers: `@media (hover: hover) and (pointer: fine)`.
- Scroll-triggered reveals play once. Content is visible in the HTML first; the hidden starting state is only
  applied on a screen, when JS runs and motion is allowed (base.css does this with `.js` and
  `@media screen and (prefers-reduced-motion: no-preference)`), so a printed page or a saved PDF shows it all.
- Keep it smooth on a mid-range phone: few animated elements at once, no animated blur over ~20px, no animating
  huge images.

## Reduced motion

When the visitor asks for reduced motion: drop movement, parallax, scrubbing, autoplaying video and 3D animation
(show a still frame). A short fade is fine; so is content that is just there. Never hide content behind an
animation that won't run. base.css shows every `data-reveal` block at once, and motion.js keeps only a short
fade on the first screen. Test it: `film.mjs dist --reduced` must come back clean (anything that still slides,
grows, turns or loops is a fault), and look at the sheets from `look.mjs dist --reduced`, which go to
`.one-shot/look-reduced`.

## The levels

- **Still:** only instant state changes and the focus ring. Remove `data-reveal` attributes.
- **Gentle:** `data-reveal` on sections (base.css + main.js). To stagger, put `data-reveal` and
  `style="--i: n"` on each child. On the first screen the headline is there from the start and only what follows
  it staggers: when all of the first screen starts hidden, Chrome holds the first paint until the fades end, so
  the visitor waits on a blank page and never sees them move. Press and hover states. No library. At most one
  effect from the effects addon, used once (a `data-draw` underline, a `data-count` for the one number that
  matters).
- **Lively:** the effects addon (`data-split` on the h1, `data-mask` on the key pictures, `data-magnetic` on
  the main button) or, when sections should build with the scroll, the motion addon (GSAP): `data-hero`
  entrance, `data-stagger` lists, `data-parallax` on one or two images, `data-scrub` for a section that builds
  with the scroll. Pin a section only if the brief's idea needs it.
- **Showpiece:** Lively plus the one big piece: the hero3d addon with the subject's own model, or a custom canvas
  or SVG interaction. Lazy-load it, give it a poster image, pause it off-screen.

## Watch it move

Screenshots can't show motion. `film.mjs` can:

```
npm run build && node SKILL_DIR/scripts/film.mjs dist   # film-load.jpg, film-scroll.jpg, film.md
node SKILL_DIR/scripts/film.mjs dist --width 390        # on a phone
node SKILL_DIR/scripts/film.mjs dist --video            # film.webm, to show the person
```

Read the two strips and the timeline in film.md. Check: the motion matches the level they chose; the headline
is readable within about a second (`slow-headline`); nothing jumps while loading (`layout-shift`, usually a web
font or an image without a size); nothing beside text loops forever without a pause control (`forever`);
loops stop when scrolled away (`offscreen-loop`); every section that reveals on scroll has settled in the
"settled" frames.

## Patterns worth knowing

- **Split headline:** `data-split` (effects addon) does it, with the sentence kept whole for screen readers.
  Short headlines only: every extra word adds a wait.
- **Pointer-follow:** `data-magnetic` and `data-tilt` (effects addon), or a light or an eye that follows the mouse,
  eased with `gsap.quickTo`. Off on touch.
- **View transitions:** `document.startViewTransition` for theme switches and in-page state changes;
  `@view-transition { navigation: auto; }` for a soft cross-fade between pages of a multi-page site
  (browsers without it just navigate normally).
- **Scroll-driven CSS:** `animation-timeline: view()` for simple scroll effects without JS, inside
  `@supports (animation-timeline: view())` so other browsers show the end state.
