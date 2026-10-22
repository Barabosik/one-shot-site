// Shared by run.mjs and trigger.mjs: finding the claude CLI, giving it a clean environment, and loading the skill
// under test from a checkout instead of ~/.claude/skills.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { delimiter, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

export function findClaude(given) {
  if (given) return given;
  if (process.env.CLAUDE_BIN) return process.env.CLAUDE_BIN;
  const names = process.platform === 'win32' ? ['claude.exe', 'claude.cmd'] : ['claude'];
  for (const d of [...(process.env.PATH || '').split(delimiter), join(homedir(), '.local', 'bin')]) {
    for (const n of names) if (d && existsSync(join(d, n))) return join(d, n);
  }
  throw new Error('No claude CLI found. Install Claude Code, or pass --claude <path> (or set CLAUDE_BIN).');
}

// The environment the benchmark's agent gets: an allow-list, not a copy. What the system, Node, npm, git and Chrome
// need to run, proxy and certificate settings, and Claude Code's own login (the cloud provider's credentials only
// when Claude Code is set to use that provider). Nothing from a host app's own session (CLAUDECODE, CLAUDE_CODE_*
// set for its children), no other tokens or keys, and no way to publish by accident: gh and token-based deploys
// get dead tokens.
const SYSTEM = /^(PATH|PATHEXT|HOME|USERPROFILE|HOMEDRIVE|HOMEPATH|USER|USERNAME|LOGNAME|SHELL|TERM|LANG|LANGUAGE|LC_\w+|TZ|TMP|TEMP|TMPDIR|SYSTEMROOT|SYSTEMDRIVE|WINDIR|COMSPEC|APPDATA|LOCALAPPDATA|PROGRAMDATA|PROGRAMFILES|PROGRAMFILES\(X86\)|PROGRAMW6432|COMMONPROGRAMFILES(\(X86\))?|COMMONPROGRAMW6432|ALLUSERSPROFILE|PUBLIC|PSMODULEPATH|MSYSTEM|NUMBER_OF_PROCESSORS|PROCESSOR_\w+|OS|XDG_\w+|DISPLAY|WAYLAND_DISPLAY|CI)$/i;
const NETWORK = /^(HTTPS?_PROXY|NO_PROXY|ALL_PROXY|NODE_EXTRA_CA_CERTS|NODE_USE_SYSTEM_CA|SSL_CERT_(FILE|DIR))$/i;
const TOOLS = /^(CHROME_PATH|NPM_CONFIG_\w+)$/i;
const SECRET = /TOKEN|SECRET|PASSWORD|PASSWD|_AUTH|KEY/i;
const CLAUDE = /^(ANTHROPIC_\w+|CLAUDE_CODE_OAUTH_TOKEN|CLAUDE_CODE_USE_(BEDROCK|VERTEX)|CLAUDE_CODE_GIT_BASH_PATH|CLAUDE_CONFIG_DIR|API_TIMEOUT_MS|DISABLE_\w+|MAX_THINKING_TOKENS)$/;
export function agentEnv(source = process.env) {
  const bedrock = !!source.CLAUDE_CODE_USE_BEDROCK, vertex = !!source.CLAUDE_CODE_USE_VERTEX;
  const env = {};
  for (const [k, v] of Object.entries(source)) {
    const pass = SYSTEM.test(k) || NETWORK.test(k) || CLAUDE.test(k) || (TOOLS.test(k) && !SECRET.test(k))
      || (bedrock && /^AWS_\w+$/.test(k)) || (vertex && /^(CLOUD_ML_REGION|GOOGLE_APPLICATION_CREDENTIALS|GOOGLE_CLOUD_PROJECT|GCLOUD_PROJECT)$/.test(k));
    if (pass) env[k] = v;
  }
  return { ...env, GH_TOKEN: 'benchmark-no-publish', GITHUB_TOKEN: 'benchmark-no-publish', GIT_TERMINAL_PROMPT: '0', ONE_SHOT_HISTORY: 'off', NETLIFY_AUTH_TOKEN: 'none', VERCEL_TOKEN: 'none' };
}

// Deploy commands the agent may not run at all, on top of the dead tokens above.
export const DENY = ['Bash(git push:*)', 'Bash(gh:*)', 'Bash(npx vercel:*)', 'Bash(vercel:*)', 'Bash(npx netlify:*)', 'Bash(netlify:*)', 'Bash(npx wrangler:*)',
  'Bash(wrangler:*)', 'Bash(*publish.mjs*)', 'PowerShell(git push*)', 'PowerShell(gh *)', 'PowerShell(*publish.mjs*)'];

// The skill goes into <project>/.claude/skills/one-shot-site, and the agent runs with --setting-sources project:
// user skills, user plugins and user settings stay out, so only this copy of the skill exists for it.
export const ISOLATE = ['--setting-sources', 'project', '--strict-mcp-config'];
export function installSkill(skillDir, project, description) {
  const to = join(project, '.claude', 'skills', 'one-shot-site');
  mkdirSync(dirname(to), { recursive: true });
  cpSync(skillDir, to, { recursive: true, filter: (s) => !/[\\/](node_modules|\.one-shot)([\\/]|$)/.test(s) });
  if (description) { // trying another description: only the frontmatter line changes
    const f = join(to, 'SKILL.md');
    const md = readFileSync(f, 'utf8');
    if (!/^description: .*$/m.test(md)) throw new Error('SKILL.md has no description line to replace.');
    writeFileSync(f, md.replace(/^description: .*$/m, () => `description: ${description.replace(/\s+/g, ' ').trim()}`));
  }
  return to;
}

export function killTree(child) {
  if (!child || child.exitCode !== null) return;
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  else try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); }
}

// next to the main checkout, also from a worktree: <projects>/one-shot-site-runs/evals
export function defaultRunsDir() {
  const r = spawnSync('git', ['-C', REPO, 'rev-parse', '--path-format=absolute', '--git-common-dir'], { encoding: 'utf8' });
  const main = r.status === 0 ? dirname(r.stdout.trim()) : REPO;
  return join(dirname(main), 'one-shot-site-runs', 'evals');
}

// The skill as committed at a git ref (a branch, a sha), written to `to`: what a branch would ship, without its
// uncommitted edits. Returns the short sha.
export function exportSkill(ref, to, repo = REPO) {
  const git = (args, enc = 'utf8') => {
    const r = spawnSync('git', ['-C', repo, ...args], { encoding: enc, maxBuffer: 64 * 1024 * 1024 });
    if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${String(r.stderr).trim()}`);
    return r.stdout;
  };
  const sha = git(['rev-parse', '--short', `${ref}^{commit}`]).trim();
  for (const f of git(['ls-tree', '-r', '--name-only', sha, '--', 'skills/one-shot-site']).split('\n').filter(Boolean)) {
    const out = join(to, f.slice('skills/one-shot-site/'.length));
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, git(['show', `${sha}:${f}`], 'buffer'));
  }
  return sha;
}

export function gitSha(dir) {
  const r = spawnSync('git', ['-C', dir, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' });
  if (r.status !== 0) return null;
  const dirty = spawnSync('git', ['-C', dir, 'status', '--porcelain', '--', '.'], { encoding: 'utf8' }).stdout.trim();
  return r.stdout.trim() + (dirty ? '+dirty' : '');
}

// The skill's files as one short hash, so two runs can tell they tested the same skill even without git.
export function hashDir(dir) {
  const h = createHash('sha256');
  const walk = (d) => {
    for (const f of readdirSync(d).sort()) {
      if (f === 'node_modules' || f === '.one-shot') continue;
      const p = join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else h.update(relative(dir, p).replace(/\\/g, '/')).update(readFileSync(p));
    }
  };
  walk(dir);
  return h.digest('hex').slice(0, 12);
}
