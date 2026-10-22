import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// leftovers from a tool call pasted into a file (two once sat at the end of SKILL.md)
const STRAY = /<\/?(?:invoke|parameter|content|function_calls|antml:[a-z_]+)\b/;

function files(dir, list = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) files(p, list);
    else if (/\.(md|json)$/.test(e.name)) list.push(p);
  }
  return list;
}

test('no tool-call leftovers in the skill, the agents or the top-level docs', () => {
  const list = [...files('skills'), ...files('agents'), 'README.md', 'CONTRIBUTING.md', 'CHANGELOG.md', 'SECURITY.md'];
  const bad = list.filter((f) => STRAY.test(readFileSync(f, 'utf8')));
  assert.deepEqual(bad, []);
});
