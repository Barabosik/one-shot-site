import { defineConfig } from 'vite';
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { siteData } from './site-data.js';
import { preloadFonts } from './preload-fonts.js';

// Every .html file is a page: index.html, about.html, de/index.html… Skipped: public/ (copied as-is, home of
// 404.html), src/, tools/ and anything installed or built.
const root = import.meta.dirname;
const SKIP = new Set(['node_modules', 'dist', 'public', 'src', 'tools']);
function pages(dir, found = {}) {
  for (const f of readdirSync(dir)) {
    if (SKIP.has(f) || f.startsWith('.')) continue;
    const p = join(dir, f);
    if (statSync(p).isDirectory()) pages(p, found);
    else if (f.endsWith('.html')) found[relative(root, p).replace(/\\/g, '/').slice(0, -5)] = p;
  }
  return found;
}

export default defineConfig({
  // A GitHub project page lives under /repo-name/: build with BASE=/repo-name/ (the Pages workflow does). Git Bash
  // on Windows turns /repo-name/ into a path inside its own folder (C:/Program Files/Git/repo-name/): cut it back.
  base: (process.env.BASE || '/').replace(/^[A-Za-z]:.*?[\\/](?:git[\\/]current|PortableGit|Git)[\\/]/i, '/'),
  build: { rolldownOptions: { input: pages(root) } },
  // site.json -> {{site.…}} values and <!-- site:… --> blocks in every page (see site-data.js), and the first
  // fonts preloaded so text doesn't jump when they arrive (see preload-fonts.js)
  plugins: [siteData(root), preloadFonts()],
});
