// Vite plugin: preload the web fonts the page needs first, so text doesn't jump when they arrive.
//
// Without it the browser finds a font only after it has read the CSS, draws the text in a fallback font, then
// swaps: lines rewrap and everything below moves (a layout shift, which Google counts against the page). With a
// preload the font is usually there before the first paint.
//
// Fontsource names its files <family>-<subset>-<weight or axis>-<style>-<hash>.woff2. This picks the subset for
// the page's language, upright styles only, variable fonts first, then 400 and 700, at most three files.
const SUBSET = { ru: 'cyrillic', uk: 'cyrillic', bg: 'cyrillic', sr: 'cyrillic', el: 'greek', vi: 'vietnamese' };

export function pick(files, lang = 'en') {
  const subset = SUBSET[lang.slice(0, 2).toLowerCase()] || 'latin';
  const want = new RegExp(`-${subset}-(?!ext-)([\\w-]+?)-normal-[\\w-]+\\.woff2$`);
  const rank = (axis) => (/^(wght|wdth|opsz|full|standard)/.test(axis) ? 0 : axis === '400' ? 1 : axis === '700' ? 2 : 3);
  const fonts = [];
  for (const f of files) {
    const m = f.match(want);
    if (m) fonts.push({ f, rank: rank(m[1]) });
  }
  return fonts.sort((x, y) => x.rank - y.rank).slice(0, 3).map((x) => x.f);
}

export function preloadFonts() {
  let base = '/';
  return {
    name: 'one-shot-preload-fonts',
    apply: 'build',
    configResolved(config) { base = config.base; },
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        if (!ctx.bundle) return html;
        const lang = html.match(/<html[^>]*\blang="([^"]+)"/)?.[1] || 'en';
        return pick(Object.keys(ctx.bundle).filter((f) => f.endsWith('.woff2')), lang).map((f) => ({
          tag: 'link',
          attrs: { rel: 'preload', as: 'font', type: 'font/woff2', crossorigin: true, href: base + f },
          injectTo: 'head',
        }));
      },
    },
  };
}
