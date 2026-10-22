// Every colour set palette.mjs prints must pass WCAG AA for every text pairing it names,
// whatever brand colour goes in: pale, dark, neon, grey.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contrast, hex, hexToRgb, moodDefaults, palette, rgbToOklch } from '../skills/one-shot-site/scripts/palette.mjs';

const BRANDS = ['#fea100', '#2f6f4e', '#d9480f', '#ff00ff', '#0000ff', '#ffff00', '#00ffcc', '#777777', '#111111', '#f5f5f5', '#8b5cf6', '#e11d48'];

for (const hex of BRANDS) {
  for (const mode of ['light', 'dark']) {
    for (const strategy of ['quiet', 'committed', 'drenched']) for (const ground of [undefined, 'warm', 'cool', 'neutral', 'brand', '#efe6d8', '#34482a']) {
      test(`${hex} ${strategy} ${mode} ${ground || 'tinted'}`, () => {
        const p = palette(rgbToOklch(hexToRgb(hex)), { mode, strategy, ground });
        const pairs = [
          ['ink on ground', p.ink, p.ground],
          ['ink on surface', p.ink, p.surface],
          ['muted on ground', p.muted, p.ground],
          ['muted on surface', p.muted, p.surface],
          ['text on accent', p.accentInk, p.accent],
          ['accent text on ground', p.accentText, p.ground],
        ];
        for (const [what, a, b] of pairs) {
          const c = contrast(a, b);
          assert.ok(c >= 4.5, `${what}: ${c.toFixed(2)}:1`);
        }
      });
    }
  }
}

test('hex round trip through OKLCH stays put', () => {
  const [L, C, H] = rgbToOklch(hexToRgb('#d9480f'));
  assert.ok(L > 0.5 && L < 0.7 && C > 0.15 && H > 30 && H < 50);
});

test('a ground given as a colour stays that colour, drenched too', () => {
  for (const strategy of ['quiet', 'committed', 'drenched']) {
    const p = palette(rgbToOklch(hexToRgb('#8a4b2c')), { strategy, ground: '#34482a' });
    assert.equal(hex(p.ground), '#34482a', strategy);
    assert.ok(p.dark, `${strategy}: a dark ground makes a dark palette`);
  }
});

// "--ground #dfe2c6" (a pale olive) gave olive body text: the text keeps the brand's hue, or none, never the ground's
test('a ground given as a colour does not tint the ink or the quiet text with its own hue', () => {
  const hueGap = (x, y) => Math.min(Math.abs(x - y), 360 - Math.abs(x - y));
  for (const [ground, brandHex] of [['#dfe2c6', '#d9480f'], ['#34482a', '#2563eb'], ['#efe6d8', '#8b5cf6'], ['#1d2a44', '#e11d48']]) {
    const brand = rgbToOklch(hexToRgb(brandHex));
    const g = rgbToOklch(hexToRgb(ground));
    for (const strategy of ['quiet', 'committed', 'drenched']) {
      const p = palette(brand, { strategy, ground });
      assert.equal(hex(p.ground), ground, `${ground} ${strategy}: the ground stays as given`);
      for (const k of ['ink', 'muted']) {
        const [, C, H] = p[k];
        assert.ok(C <= 0.02, `${k} on ${ground} is near neutral (chroma ${C.toFixed(3)})`);
        if (C > 0.003) {
          assert.ok(hueGap(H, brand[2]) < 2, `${k} on ${ground} ${strategy} takes the brand's hue ${brand[2].toFixed(0)}, got ${H.toFixed(0)}`);
          assert.ok(hueGap(H, g[2]) > 20, `${k} on ${ground} is not the ground's hue ${g[2].toFixed(0)}`);
        }
      }
    }
  }
});

// A green brand gave a Warm café a sage ground: the calm moods start on warm white or cream, and the brand's hue
// reaches the ground only when asked for.
test('quiet starts on warm white, warm and editorial on cream; the brand tints the ground only when asked', () => {
  for (const brandHex of ['#2f6f4e', '#c2410c', '#2a6fdb', '#8b5cf6']) {
    const brand = rgbToOklch(hexToRgb(brandHex));
    const ground = (mood, given) => rgbToOklch(hexToRgb(hex(palette(brand, moodDefaults(mood, given)).ground)));
    const [qL, qC] = ground('quiet');
    assert.ok(qL >= 0.98 && qC <= 0.01, `${brandHex} quiet: warm white (L ${qL.toFixed(3)}, C ${qC.toFixed(3)})`);
    for (const mood of ['warm', 'editorial']) {
      const [L, C, H] = ground(mood);
      assert.ok(L >= 0.93 && C <= 0.03 && H >= 70 && H <= 90, `${brandHex} ${mood}: cream (L ${L.toFixed(3)}, C ${C.toFixed(3)}, H ${H.toFixed(0)})`);
    }
    assert.equal(hex(palette(brand, moodDefaults('warm', { ground: 'brand' })).ground), hex(palette(brand, { strategy: 'committed' }).ground), `${brandHex}: --ground brand is the brand's tint`);
    assert.equal(hex(palette(brand, moodDefaults('warm', { ground: 'cool' })).ground), hex(palette(brand, { strategy: 'committed', ground: 'cool' }).ground), `${brandHex}: a ground given wins`);
    assert.equal(hex(palette(brand, moodDefaults('warm', { strategy: 'quiet' })).ground), hex(palette(brand, { ground: 'warm' }).ground), `${brandHex}: a strategy given wins`);
    for (const mood of ['bold', 'night', 'playful', undefined]) assert.deepEqual(moodDefaults(mood), { ground: undefined, strategy: undefined }, `${mood}: as before`);
  }
});
