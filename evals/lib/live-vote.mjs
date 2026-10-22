// The live vote page's sites: each pair's two built sites, copied under neutral paths (/p1/3fa2/) of one local
// server, so people can scroll and click through them instead of looking at screenshots.
import { copyFileSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';

// A site's pages point at its own root ("/team.html", url(/assets/x.woff2), "/assets/main.js"); under a path of
// the server they need that path in front. Full and protocol-relative URLs (https://, //host) stay as they are.
// What this misses (a path built in a script) the server finds by the page that asked for it (vote-serve.mjs).
export function underPath(text, prefix, ext) {
  const p = prefix.replace(/\/$/, '');
  let t = text;
  if (['.html', '.htm', '.svg', '.xml'].includes(ext)) {
    t = t.replace(/(\s(?:href|src|action|poster|data-src|data-href|content|xlink:href)\s*=\s*)(["'])(\/(?!\/)[^"']*)\2/gi, (m, a, q, u) => `${a}${q}${p}${u}${q}`);
    t = t.replace(/(\s(?:srcset|imagesrcset)\s*=\s*)(["'])([^"']*)\2/gi, (m, a, q, v) => `${a}${q}${v.split(',').map((x) => x.replace(/^(\s*)(\/(?!\/)\S*)/, (mm, s, u) => `${s}${p}${u}`)).join(',')}${q}`);
  }
  if (['.html', '.htm', '.css', '.svg'].includes(ext)) t = t.replace(/url\(\s*(["']?)(\/(?!\/)[^)"']*)\1\s*\)/g, (m, q, u) => `url(${q}${p}${u}${q})`);
  if (['.html', '.htm', '.js', '.mjs'].includes(ext)) t = t.replace(/(["'`])\/assets\//g, `$1${p}/assets/`);
  if (['.json', '.webmanifest'].includes(ext)) t = t.replace(/(":\s*")\/(?!\/)/g, `$1${p}/`);
  return t;
}

// The sites are demos: a form sends nothing and a mail, phone or text link opens nothing; a note says so instead.
// It runs first on every page (in the vote page's frames and in a tab of its own alike).
export const GUARD = `<script>/* demo */(()=>{const say=(t)=>{let n=document.getElementById('demo-note');if(!n){n=document.createElement('div');n.id='demo-note';n.setAttribute('role','status');n.style.cssText='position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:2147483647;background:#1d1d1b;color:#fff;font:14px/1.4 system-ui,sans-serif;padding:10px 14px;border-radius:8px;max-width:90vw;box-shadow:0 4px 16px rgba(0,0,0,.3)';document.body.append(n)}n.textContent=t;clearTimeout(say.t);say.t=setTimeout(()=>n.remove(),3500)};addEventListener('submit',(e)=>{e.preventDefault();e.stopPropagation();say('A demo: this form sends nothing.')},true);addEventListener('click',(e)=>{const a=e.target.closest&&e.target.closest('a[href]');const h=a&&a.getAttribute('href')||'';if(/^(mailto|tel|sms):/i.test(h)){e.preventDefault();e.stopPropagation();say(/^mailto/i.test(h)?'A demo: this would open your mail app with a message to '+h.slice(7).split('?')[0]+'.':'A demo: this would call or text '+h.replace(/^[a-z]+:/i,'')+'.')}},true)})();</script>`;

// Copies a built site (dist, or a folder with index.html) to dest for the path prefix: its web files only (no
// dot folders, node_modules, package files or notes), root links moved under the prefix, the guard on every page.
const SKIP = (name) => name.startsWith('.') || ['node_modules', 'scratch'].includes(name) || /^package(-lock)?\.json$|\.md$|^vite\.config\.|\.(py|sh)$/.test(name);
const TEXT = ['.html', '.htm', '.css', '.js', '.mjs', '.json', '.webmanifest', '.svg', '.xml'];
export function copySite(src, dest, prefix) {
  let files = 0;
  const walk = (from, to) => {
    mkdirSync(to, { recursive: true });
    for (const name of readdirSync(from)) {
      if (SKIP(name)) continue;
      const a = join(from, name), b = join(to, name);
      if (statSync(a).isDirectory()) { walk(a, b); continue; }
      const ext = extname(name).toLowerCase();
      if (!TEXT.includes(ext)) { copyFileSync(a, b); files++; continue; }
      let t = underPath(readFileSync(a, 'utf8'), prefix, ext);
      if (ext === '.html' || ext === '.htm') t = /<head[^>]*>/i.test(t) ? t.replace(/<head[^>]*>/i, (h) => h + GUARD) : GUARD + t;
      writeFileSync(b, t);
      files++;
    }
  };
  walk(src, dest);
  return files;
}
