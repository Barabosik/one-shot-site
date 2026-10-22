import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pick } from '../skills/one-shot-site/assets/starter/preload-fonts.js';

const FILES = [
  'assets/saira-latin-ext-wdth-normal-3Ba4ICIc.woff2',
  'assets/saira-latin-wdth-normal-X2eA-qfZ.woff2',
  'assets/plex-latin-300-normal-a1.woff2',
  'assets/plex-latin-700-normal-b2.woff2',
  'assets/plex-latin-400-normal-c3.woff2',
  'assets/plex-latin-400-italic-d4.woff2',
  'assets/plex-cyrillic-400-normal-e5.woff2',
];

test('preloads the page language subset, upright, variable first, then 400 and 700, at most three', () => {
  assert.deepEqual(pick(FILES), ['assets/saira-latin-wdth-normal-X2eA-qfZ.woff2', 'assets/plex-latin-400-normal-c3.woff2', 'assets/plex-latin-700-normal-b2.woff2']);
  assert.deepEqual(pick(FILES, 'de-DE'), pick(FILES));
  assert.deepEqual(pick(FILES, 'ru'), ['assets/plex-cyrillic-400-normal-e5.woff2']);
  assert.deepEqual(pick(['assets/index-abc.css']), []);
});
