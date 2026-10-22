#!/usr/bin/env node
// publish: put the built site online. Run from the site folder after `npm run build` and a clean audit.
//
//   node publish.mjs branch --repo https://github.com/OWNER/REPO.git [--branch gh-pages] [--cname www.example.com]
//        [--force]   (needed only to publish onto main, master or the branch you are on: that replaces the code there)
//   node publish.mjs vercel --name my-site
//   node publish.mjs netlify --name my-site
//   node publish.mjs cloudflare --name my-site
//   ... add --dry to print what would run without running it, --dist <folder> for a build that isn't in dist
//
// GitHub Pages through Actions needs no script: copy assets/deploy/github-pages.yml to
// .github/workflows/deploy.yml and push (see references/deploy.md).
import { execFileSync, spawn } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { args, stopOnError, usage } from './lib/cli.mjs';

// Windows: cmd.exe (npx goes through it) runs an npx.cmd or git.exe in the site's own folder before the real one,
// unless this is set
process.env.NoDefaultCurrentDirectoryInExePath = '1';

stopOnError();
const a = args(import.meta.url);
if (a.help) usage(import.meta.url, 0);
const how = a._[0];
const dist = resolve(a.dist || 'dist');
const dry = !!a.dry;
const npx = 'npx';
// npx needs a shell on Windows, so every value that reaches it is checked first: a site name is plain
// letters, digits and dashes, and the path may not hold anything a shell would act on. The branch route runs git
// without a shell, so a folder called "Smith & Sons" is fine there.
const quote = (s) => (/^[\w@./:=-]+$/.test(s) ? s : `"${s}"`);
if (a.name !== undefined && !/^[a-z0-9][a-z0-9-]{0,62}$/.test(String(a.name))) {
  console.error('--name may hold only lowercase letters, digits and dashes (it becomes part of the address).');
  process.exit(2);
}
if (['vercel', 'netlify', 'cloudflare'].includes(how) && /["$`%!^&|<>;\n]/.test(dist)) {
  console.error(`The site path ${dist} has characters a shell would act on. Move or rename the folder.`);
  process.exit(2);
}
if (a.cname !== undefined && !/^(?!-)[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(String(a.cname))) {
  console.error('--cname takes the domain alone, like www.example.com (no https://, no path).');
  process.exit(2);
}
// not starting with a dash: git reads that as an option (--branch=--mirror mirror-pushed, deleting every other branch)
if (a.branch !== undefined && !/^(?!-)[\w.-]+(\/[\w.-]+)*$/.test(String(a.branch === true ? '' : a.branch))) {
  console.error('--branch takes a branch name, like gh-pages.');
  process.exit(2);
}
// the same for --repo: --repo=--receive-pack=<command> reached git push as an option and ran the command
if (a.repo !== undefined && /^-/.test(String(a.repo))) { console.error('--repo takes the repository address, like https://github.com/OWNER/REPO.git.'); process.exit(2); }

if (!existsSync(join(dist, 'index.html'))) {
  console.error(`No built site in ${dist}. Run npm run build first.`);
  process.exit(2);
}

// autocrlf off: the build goes up byte for byte, without a "LF will be replaced by CRLF" line per file on Windows
const git = (cmd, cwd) => {
  try {
    return execFileSync('git', ['-c', 'core.autocrlf=false', '-c', 'core.safecrlf=false', ...cmd], { cwd, stdio: ['ignore', 'pipe', 'inherit'] }).toString().trim();
  } catch (e) {
    if (e.code === 'ENOENT') throw new Error('git was not found. Install it from https://git-scm.com/, then run this again.');
    throw e;
  }
};

// Output is passed on as it comes, so a first-run login prompt shows and can be answered, and kept, to find the
// live address in it.
async function run(cmd, list) {
  console.log(`$ ${cmd} ${list.join(' ')}`);
  if (dry) return '';
  const child = spawn([cmd, ...list.map(quote)].join(' '), { stdio: ['inherit', 'pipe', 'inherit'], shell: true });
  let out = '';
  child.stdout.on('data', (d) => { out += d; process.stdout.write(d); });
  const status = await new Promise((done) => child.on('close', done));
  if (status !== 0) { console.error(`\n${cmd} ${list[1] || ''} failed (exit ${status}).`); process.exit(1); }
  return out;
}

const live = (text, re = /https:\/\/[^\s"'<>]+/g) => {
  const urls = text.match(re) || [];
  const url = urls.reverse().find((u) => !/dashboard|inspect|vercel\.com\/[^/]+\/[^/]+\/|app\.netlify|dash\.cloudflare|docs\./.test(u));
  if (url) console.log(`\nLive: ${url}\nNext: node look.mjs ${url}  (check the real thing)`);
};

if (how === 'branch') {
  // The branch holds only the built files; the code stays on its own branch. Same as a hand-made
  // gh-pages branch, without the npm package.
  if (!a.repo) { console.error('Pass --repo https://github.com/OWNER/REPO.git'); process.exit(2); }
  const branch = a.branch || 'gh-pages';
  // the push replaces the branch with the built files alone: on the branch the code lives on, the code is gone
  if (!a.force) {
    let here = '';
    try { here = execFileSync('git', ['symbolic-ref', '--short', '-q', 'HEAD'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch {}
    if ([here, 'main', 'master'].includes(branch)) {
      console.error(`--branch ${branch} would replace that branch with the built files only, and the code on it would be gone. Use gh-pages, or add --force.`);
      process.exit(2);
    }
  }
  git(['--version']); // stops here, also in a dry run, when git is missing
  let name = 'site', email = 'site@localhost', sha = 'build';
  try { name = git(['config', 'user.name']); email = git(['config', 'user.email']); sha = git(['rev-parse', '--short', 'HEAD']); } catch {}
  try {
    if (git(['status', '--porcelain', '--', 'src', 'public', 'index.html'])) {
      // a dry run only shows what would happen, so it says so and goes on
      console.error(`The site has uncommitted changes. Commit them first, so the live site matches a commit.${dry ? ' (Dry run: carrying on.)' : ''}`);
      if (!dry) process.exit(1);
    }
  } catch {}
  const dir = mkdtempSync(join(tmpdir(), 'one-shot-publish-'));
  try {
    cpSync(dist, dir, { recursive: true });
    writeFileSync(join(dir, '.nojekyll'), ''); // GitHub would otherwise drop files and folders starting with _
    // The push replaces the branch, and GitHub drops a custom domain once its CNAME file is gone: so the build's own
    // CNAME (public/CNAME lands in dist) stays, and without one either it says so.
    const cname = a.cname ? String(a.cname) : existsSync(join(dist, 'CNAME')) ? readFileSync(join(dist, 'CNAME'), 'utf8').trim() : '';
    if (a.cname) writeFileSync(join(dir, 'CNAME'), cname + '\n');
    else if (cname) console.log(`Custom domain from ${join(dist, 'CNAME')}: ${cname}`);
    else console.log('No --cname and no CNAME in the build: if the site had a custom domain, GitHub Pages drops it with this publish. Pass --cname www.example.com to keep it.');
    console.log(`Publishing ${dist} to ${a.repo} (${branch})`);
    if (!dry) {
      git(['init', '-q', '-b', branch], dir);
      git(['add', '-A'], dir);
      git(['-c', `user.name=${name}`, '-c', `user.email=${email}`, 'commit', '-q', '-m', `Publish ${sha}`], dir);
      try { git(['push', '-q', '-f', a.repo, branch], dir); } catch (e) {
        if (/^git was not found/.test(e.message)) throw e;
        throw new Error(`git push to ${a.repo} failed (git's own lines above say why). Check the address, and that you may write to it.`);
      }
    }
    const m = String(a.repo).match(/github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?\/?$/);
    if (m) {
      const url = cname ? `https://${cname}/` : m[2].toLowerCase() === `${m[1].toLowerCase()}.github.io` ? `https://${m[2]}/` : `https://${m[1].toLowerCase()}.github.io/${m[2]}/`;
      console.log(`\n${dry ? 'Dry run: nothing was pushed.' : 'Done.'} If this is the first publish: Settings → Pages → Deploy from a branch → ${branch} / root.\n${dry ? 'It would be live at:' : 'Live in a minute or two:'} ${url}`);
    } else if (dry) console.log('\nDry run: nothing was pushed.'); // any other remote says so too
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
} else if (how === 'vercel') {
  // Never logs in by itself: the first time `npx --yes vercel@latest login` runs before it (references/deploy.md).
  // Without --name the project is named after the folder, "dist", and --yes puts every site into that one project.
  if (!a.name) { console.error('Pass --name my-site (the Vercel project: my-site.vercel.app when that is free)'); process.exit(2); }
  live(await run(npx, ['--yes', 'vercel@latest', 'deploy', dist, '--prod', '--yes', '--name', a.name]));
} else if (how === 'netlify') {
  const out = await run(npx, ['--yes', 'netlify-cli@latest', 'deploy', '--prod', `--dir=${dist}`, '--json', ...(a.name ? [`--site-name=${a.name}`] : [])]);
  try { const j = JSON.parse(out.slice(out.indexOf('{'))); console.log(`\nLive: ${j.url || j.deploy_url}`); } catch { live(out); }
} else if (how === 'cloudflare') {
  if (!a.name) { console.error('Pass --name my-site (becomes my-site.<account>.workers.dev)'); process.exit(2); }
  // Without a config Cloudflare answers a missing page with an empty 404 ("not_found_handling" is "none" by default),
  // so the site's own 404.html never showed. The config says to serve it. It goes in .one-shot/ (not committed): a
  // wrangler config of their own in the site folder is left as it is.
  const conf = resolve('.one-shot/wrangler.json');
  if (/["$`%!^&|<>;\n]/.test(conf)) { console.error(`The site path ${conf} has characters a shell would act on. Move or rename the folder.`); process.exit(2); }
  mkdirSync(dirname(conf), { recursive: true });
  const config = { name: a.name, compatibility_date: new Date().toISOString().slice(0, 10), assets: { directory: dist, not_found_handling: '404-page' } };
  writeFileSync(conf, JSON.stringify(config, null, 2) + '\n');
  live(await run(npx, ['--yes', 'wrangler@latest', 'deploy', '--config', conf, '--name', a.name]));
} else {
  usage(import.meta.url);
  process.exit(2);
}
