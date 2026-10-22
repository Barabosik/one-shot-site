// Finds Playwright, which is not a dependency of this skill: safari.mjs uses it only when the person has it.
// Looked for next to this file, then from the folder the command runs in, then from the site's own folder (where
// `npm i -D playwright` puts it). null when it isn't there.
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const INSTALL = 'npm i -D playwright && npx playwright install webkit';

export async function loadPlaywright(dirs = []) {
  const names = ['playwright', 'playwright-core'];
  for (const name of names) {
    try { return await import(name); } catch {}
  }
  for (const dir of [process.cwd(), ...dirs]) {
    for (const name of names) {
      try {
        const file = createRequire(join(resolve(dir), 'noop.js')).resolve(name);
        return await import(pathToFileURL(file).href);
      } catch {}
    }
  }
  return null;
}

// the engine object (webkit) whichever way the package exposes it: named export, or on the CommonJS default
export const webkitOf = (mod) => mod?.webkit ?? mod?.default?.webkit ?? null;
