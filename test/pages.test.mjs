import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

// The project page's Pages workflow (.github/workflows/pages.yml) tells IndexNow when a deploy changed the page. The
// key is the name of docs/site/public/<key>.txt, which the search engines fetch to check that the ping is ours.
const yml = readFileSync('.github/workflows/pages.yml', 'utf8');
// one step of the workflow, from its name to the next step
const step = (name) => {
  const from = yml.indexOf(`- name: ${name}`);
  assert.ok(from > 0, `no step "${name}"`);
  const to = yml.indexOf('\n      - ', from + 1);
  return yml.slice(from, to < 0 ? undefined : to);
};

test('the IndexNow key file holds its own name and nothing else', () => {
  const keys = readdirSync('docs/site/public').filter((f) => /^[0-9a-f]{32}\.txt$/.test(f));
  assert.equal(keys.length, 1, 'one key file');
  assert.equal(readFileSync(`docs/site/public/${keys[0]}`, 'utf8'), keys[0].slice(0, 32), 'no newline, no space');
});

test('the deploy tells IndexNow only a changed page, only its own address, and never fails on it', () => {
  const check = step('Has the page changed?');
  assert.match(check, /_site\/index\.html/, 'the built page against the one online');
  assert.match(check, /continue-on-error: true/);
  const ping = step('Tell IndexNow the page changed');
  assert.match(ping, /if: needs\.build\.outputs\.changed == 'true' && github\.repository == 'Barabosik\/one-shot-site'/);
  assert.match(ping, /continue-on-error: true/);
  assert.match(ping, /"urlList":\["%s"\]/, 'one address: the page');
  assert.match(ping, /"keyLocation":"%s%s\.txt"/, 'the key file beside the page, so it covers that folder only');
});
