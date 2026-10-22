import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lintCopy, vagueAction } from '../skills/one-shot-site/scripts/lib/words.mjs';

const rules = (text) => lintCopy(text).map((f) => f.rule);

test('filler words are flagged', () => {
  assert.ok(rules('We elevate your brand with seamless, cutting-edge design.').includes('filler-words'));
});
test('plain facts pass', () => {
  assert.deepEqual(rules('Sourdough, rye and spelt, baked from 6 every morning. Closed Mondays.'), []);
});
test('placeholders fail', () => {
  const f = lintCopy('Hello {{NAME}}, lorem ipsum dolor.');
  assert.ok(f.some((x) => x.rule === 'placeholder' && x.level === 'fail'));
});
test('"not just X, but Y" is flagged', () => {
  assert.ok(rules('It is not just a café, but a home.').includes('not-just'));
});
test('vague button text', () => {
  assert.ok(vagueAction('Learn more →'));
  assert.ok(!vagueAction('Book a table'));
});

test('generated-text vocabulary and habits', () => {
  const r = rules('Nestled in the heart of the old town, the café stands as a testament to slow coffee, showcasing beans from three farms.');
  assert.ok(r.includes('ai-words'));
  assert.ok(r.includes('ing-tail'));
  assert.ok(rules("It's not about coffee, it's about people.").includes('not-just'));
  assert.ok(rules('Additionally, we roast. Moreover, we bake.').includes('connectors'));
});
test('pasted chat answers fail', () => {
  const f = lintCopy('Here is a revised version of your about text. I hope this helps! [Your Name]');
  assert.ok(f.some((x) => x.rule === 'chat-leftover' && x.level === 'fail'));
  assert.ok(lintCopy('Certainly! Here is your page.').some((x) => x.rule === 'chat-leftover'));
  assert.ok(!lintCopy('Of course we roast on Tuesdays.').some((x) => x.rule === 'chat-leftover'));
});
test('title case headings, but not short names', async () => {
  const { titleCase } = await import('../skills/one-shot-site/scripts/lib/words.mjs');
  assert.ok(titleCase('Our Story And Our Mission'));
  assert.ok(!titleCase('Our story and our mission'));
  assert.ok(!titleCase('Patch Night'));
  assert.ok(!titleCase('Kofi & the Cables'));
  assert.ok(!titleCase('Come and see us on Gloucester Road.'), 'a name at the end of a sentence');
  assert.ok(titleCase('Fresh Bread For The Whole Street'));
});
test('made-up addresses are found, real ones pass', async () => {
  const { madeUp } = await import('../skills/one-shot-site/scripts/lib/words.mjs');
  assert.deepEqual(madeUp('Write to hi@rosas.example or see https://rosas.example/menu and github.com/example/repo'),
    ['hi@rosas.example', 'https://rosas.example/menu', 'github.com/example/repo']);
  assert.deepEqual(madeUp('mailto:a@b.test https://example.org'), ['a@b.test', 'example.org']);
  // a name on an ordinary domain reads as real (this one is made up, on the examples' made-up Röstergasse)
  assert.deepEqual(madeUp('brot@roestergasse-baeckerei.de, https://roestergasse-baeckerei.de/, for example, a unit.test file'), []);
});

test('title case leaves out days, months and the names the page itself capitalises', async () => {
  const { namesIn, titleCase } = await import('../skills/one-shot-site/scripts/lib/words.mjs');
  assert.ok(!titleCase('Open Wednesday and Saturday'));
  assert.ok(!titleCase('Closed Every Monday in August'), 'Every is one long word; a heading needs two');
  assert.ok(!titleCase('Geöffnet Samstag bis Sonntag, Januar'), 'de');
  assert.ok(!titleCase('Ouvert Mercredi et Samedi'), 'fr');
  assert.ok(!titleCase('Abierto Miércoles y Sábado'), 'es');
  assert.ok(!titleCase('Aperto Mercoledì e Sabato'), 'it');
  assert.ok(!titleCase('Open Woensdag en Zaterdag'), 'nl');
  assert.ok(!titleCase('Aberto Quarta-feira e Sábado'), 'pt');
  assert.ok(titleCase('Free on Universal Credit'), 'with nothing else to go on it reads as Title Case');
  const text = 'Courses\nFree on Universal Credit\nIf you are on Universal Credit, every course here is free of charge.\nOur Story And Our Mission\nBook A Table Now Please';
  const names = namesIn(text);
  assert.ok(names.has('universal') && names.has('credit'), [...names].join(','));
  assert.ok(!titleCase('Free on Universal Credit', names));
  // the old true positives stay, even next to sentences with names in them
  for (const h of ['Our Story And Our Mission', 'Fresh Bread For The Whole Street', 'Winter Tour Dates Announced Today', 'Book A Table Now Please']) assert.ok(titleCase(h, names), h);
  assert.ok(!names.has('story') && !names.has('table'), 'Title Case lines give no names');
  assert.ok(!namesIn('We bake every day. Fresh loaves come out at seven.').has('fresh'), 'a capital after a full stop starts a sentence');
  // a heading of small words reads as a sentence: its own line lends it no names
  const h = 'Coffee and Cake for the Rest of the Day';
  assert.ok(titleCase(h, namesIn(`${h}\nWe bake from six every morning.`, [h])), 'a heading of small words lends itself no names');
  assert.ok(titleCase(h, namesIn('Coffee and Cake\nfor the Rest of the Day\nWe bake from six every morning.', [h])), 'nor split by a <br>');
});

test('a book or work title in the heading keeps its capitals', async () => {
  const { titleCase, wordsIn } = await import('../skills/one-shot-site/scripts/lib/words.mjs');
  assert.ok(titleCase('Reading Wolf Hall Together'), 'without the markup it reads as Title Case');
  assert.ok(!titleCase('Reading Wolf Hall Together', wordsIn('Wolf Hall')));
  assert.ok(titleCase('Our Story And Our Mission', wordsIn('')), 'nothing in <cite>: as before');
  assert.deepEqual([...wordsIn('“The Remains of the Day,”')], ['the', 'remains', 'of', 'day']);
});
