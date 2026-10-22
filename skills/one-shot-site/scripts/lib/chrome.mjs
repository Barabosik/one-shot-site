// A small driver for an installed Chrome, Edge, Brave or Chromium over the DevTools protocol.
// No npm packages: Node 22+ ships fetch and WebSocket.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { appLinkGuard } from './probes.mjs';

// the addresses that start another program: mail, phone, messages, chat and meeting apps, app stores
export const APP_SCHEMES = ['mailto', 'tel', 'sms', 'callto', 'skype', 'whatsapp', 'tg', 'ms-outlook', 'msteams', 'zoommtg', 'facetime', 'market', 'itms-apps', 'intent'];
// an address the browser shows itself; every other scheme is handed to some program
const webLink = (u, base) => { try { return /^(https?|file|data|blob|about):$/.test(new URL(u, base).protocol); } catch { return true; } };

const env = process.env;
const home = env.HOME || env.USERPROFILE || '';
const LINUX = ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'brave-browser', 'brave', 'microsoft-edge', 'microsoft-edge-stable'];
const PLACES = {
  win32: [env.PROGRAMFILES, env['PROGRAMFILES(X86)'], env.LOCALAPPDATA].flatMap((d) => [
    [d, 'Google/Chrome/Application/chrome.exe'],
    [d, 'BraveSoftware/Brave-Browser/Application/brave.exe'],
    [d, 'Microsoft/Edge/Application/msedge.exe'],
    [d, 'Chromium/Application/chrome.exe'],
  ]),
  darwin: ['/Applications', join(home, 'Applications')].flatMap((d) => [
    [d, 'Google Chrome.app/Contents/MacOS/Google Chrome'],
    [d, 'Chromium.app/Contents/MacOS/Chromium'],
    [d, 'Brave Browser.app/Contents/MacOS/Brave Browser'],
    [d, 'Microsoft Edge.app/Contents/MacOS/Microsoft Edge'],
  ]),
  // everything on PATH first (nix, distro packages, ~/bin), then the usual folders, /opt and Flatpak
  linux: [
    ...[...(env.PATH || '').split(':').filter(Boolean), '/usr/bin', '/usr/local/bin', '/snap/bin'].flatMap((d) => LINUX.map((b) => [d, b])),
    ['/opt/google/chrome', 'chrome'], ['/opt/brave.com/brave', 'brave'], ['/opt/microsoft/msedge', 'msedge'],
    ...['/var/lib/flatpak/exports/bin', join(home, '.local/share/flatpak/exports/bin')].flatMap((d) =>
      ['com.google.Chrome', 'org.chromium.Chromium', 'com.brave.Browser', 'com.microsoft.Edge'].map((b) => [d, b])),
  ],
};

// CHROME_PATH must name the browser's program file; a folder or a typo falls back to the installed one (launch
// says so once).
const givenPath = () => { try { return env.CHROME_PATH && statSync(env.CHROME_PATH).isFile() ? env.CHROME_PATH : null; } catch { return null; } };

export function findBrowser() {
  if (givenPath()) return env.CHROME_PATH;
  for (const [dir, file] of PLACES[process.platform] || PLACES.linux) {
    if (!dir) continue;
    const p = join(dir, file);
    if (existsSync(p)) return p;
  }
  return null;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Browsers still open when Node exits (a crash, Ctrl+C, a thrown error): kill them and remove their profiles,
// so no Chrome keeps running and no temp folder is left behind.
const open = new Set();
// Chrome's helper processes (GPU, renderer…) outlive the main one by a moment and keep files in the profile open, which
// on Windows blocks the delete: without the retries a Ctrl+C left a 50-70 MB folder behind every time. The wait is
// synchronous because this runs while Node is exiting.
function removeProfile(dir) {
  for (let i = 0; i < 20; i++) {
    try { rmSync(dir, { recursive: true, force: true }); return; } catch {}
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 150);
  }
}
process.once('exit', () => {
  for (const { proc, profile } of open) {
    try { proc.kill(); } catch {}
    removeProfile(profile);
  }
});
for (const sig of ['SIGINT', 'SIGTERM']) process.once(sig, () => process.exit(130));

// App links stay in the browser: a check going through a site must never open the person's mail program, phone or
// chat. This is the profile setting older Chromium builds read (true = never hand on); current Chrome ignores it and
// passes mailto: on without asking, so each page also gets appLinkGuard (probes.mjs) and the redirect check in init.
export function appLinkPrefs(profile) {
  mkdirSync(join(profile, 'Default'), { recursive: true });
  writeFileSync(join(profile, 'Default', 'Preferences'), JSON.stringify({ protocol_handler: { excluded_schemes: Object.fromEntries(APP_SCHEMES.map((s) => [s, true])) } }));
}

let warned = false;

// headed = a real window pushed off-screen, so the GPU draws WebGL exactly as a visitor sees it.
// Headless uses SwiftShader, which renders WebGL too, only slower.
export async function launch({ headed = false } = {}) {
  if (typeof WebSocket === 'undefined') throw new Error('Node 22 or newer is needed (built-in WebSocket).');
  const exe = findBrowser();
  if (env.CHROME_PATH && !givenPath() && !warned) {
    warned = true;
    console.error(`CHROME_PATH is ${env.CHROME_PATH}, which is not a program file${exe ? `; using ${exe} instead` : ''}.`);
  }
  if (!exe) throw new Error('No Chrome, Edge, Brave or Chromium found. Install one, or set CHROME_PATH to its executable.');
  // CHROME_PATH may name some other program: if that is what fails to start, the error asks about it
  const ask = env.CHROME_PATH && exe === env.CHROME_PATH ? ' Is CHROME_PATH a Chrome, Edge, Brave or Chromium program?' : '';
  // A run that was killed outright (terminal window closed, task killed) cannot clean up after itself: its profile folder
  // is removed here once it is old, so they never pile up.
  try {
    for (const d of readdirSync(tmpdir())) {
      const old = join(tmpdir(), d);
      // one folder that is locked (Windows: an orphaned Chrome still holds it) or just gone must not stop the rest
      try { if (d.startsWith('oss-chrome-') && Date.now() - statSync(old).mtimeMs > 3 * 36e5) rmSync(old, { recursive: true, force: true }); } catch {}
    }
  } catch {}
  const profile = mkdtempSync(join(tmpdir(), 'oss-chrome-'));
  appLinkPrefs(profile);
  const args = [
    '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check',
    '--mute-audio', '--hide-scrollbars', '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows', '--disable-features=Translate,MediaRouter', '--force-color-profile=srgb',
  ];
  // CI machines and root shells (containers, WSL) can't start Chrome's sandbox
  if (env.CI || process.getuid?.() === 0) args.push('--no-sandbox');
  if (headed) args.push('--window-position=-4000,0', '--window-size=1500,1000');
  else args.push('--headless=new', '--enable-unsafe-swiftshader', '--use-angle=swiftshader');
  args.push('about:blank');

  let proc;
  try { proc = spawn(exe, args, { stdio: ['ignore', 'ignore', 'pipe'] }); } catch (e) {
    removeProfile(profile);
    throw new Error(`Could not start ${exe} (${e.code || e.message}).${ask}`); // a text file: EFTYPE on Windows
  }
  const entry = { proc, profile };
  open.add(entry);
  const wsUrl = await new Promise((resolve, reject) => {
    let buf = '';
    // the last lines Chrome printed ("No usable sandbox", "error while loading shared libraries"…) say why
    const said = () => { const l = buf.trim().split(/\r?\n/).slice(-3).join(' | ').slice(0, 300); return l ? ` It printed: ${l}` : ''; };
    const t = setTimeout(() => reject(new Error(`The browser did not start within 20 s.${said()}`)), 20000);
    proc.stderr.on('data', (d) => {
      buf += d;
      const m = buf.match(/DevTools listening on (ws:\/\/\S+)/);
      if (m) { clearTimeout(t); resolve(m[1]); }
    });
    proc.on('exit', (code) => { clearTimeout(t); reject(new Error(`The browser exited early (code ${code}).${ask && ask.replace('CHROME_PATH', `CHROME_PATH (${exe})`)}${said()}`)); });
    proc.on('error', (e) => { clearTimeout(t); reject(new Error(`Could not start ${exe} (${e.code || e.message}).${ask}`)); });
  }).catch((err) => {
    try { proc.kill(); } catch {}
    removeProfile(profile);
    open.delete(entry);
    throw err;
  });
  const b = new Browser(proc, profile, entry);
  await b.connect(wsUrl);
  // a link that sends a file (an old site's download.php) must not drop it in the person's Downloads folder
  await b.send('Browser.setDownloadBehavior', { behavior: 'deny' }).catch(() => {});
  return b;
}

class Browser {
  constructor(proc, profile, entry) {
    this.proc = proc;
    this.profile = profile;
    this.entry = entry;
    this.id = 0;
    this.waiting = new Map();
    this.listeners = new Map(); // sessionId -> Set(fn)
  }

  connect(url) {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(url);
      this.ws.onopen = () => resolve();
      this.ws.onerror = () => reject(new Error('Could not connect to the browser.'));
      // the browser went away: every call still waiting fails now instead of hanging forever
      this.ws.onclose = () => {
        for (const { fail, method } of this.waiting.values()) fail(new Error(`${method}: the browser closed`));
        this.waiting.clear();
      };
      this.ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg.id && this.waiting.has(msg.id)) {
          const { ok, fail, method } = this.waiting.get(msg.id);
          this.waiting.delete(msg.id);
          if (msg.error) fail(new Error(`${method}: ${msg.error.message}`));
          else ok(msg.result);
        } else if (msg.method) {
          for (const fn of this.listeners.get(msg.sessionId || '') || []) fn(msg.method, msg.params);
        }
      };
    });
  }

  send(method, params = {}, sessionId) {
    if (this.ws.readyState !== WebSocket.OPEN) return Promise.reject(new Error(`${method}: the browser closed`));
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params, ...(sessionId && { sessionId }) }));
    return new Promise((ok, fail) => {
      // no single call should take two minutes; if one does, the page is stuck
      const timer = setTimeout(() => { this.waiting.delete(id); fail(new Error(`${method}: no answer from the browser in 120 s`)); }, 120000);
      timer.unref();
      this.waiting.set(id, { ok: (v) => { clearTimeout(timer); ok(v); }, fail: (e) => { clearTimeout(timer); fail(e); }, method });
    });
  }

  listen(sessionId, fn) {
    if (!this.listeners.has(sessionId)) this.listeners.set(sessionId, new Set());
    this.listeners.get(sessionId).add(fn);
    return () => this.listeners.get(sessionId).delete(fn);
  }

  async newPage(opts = {}) {
    const { targetId } = await this.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await this.send('Target.attachToTarget', { targetId, flatten: true });
    const page = new Page(this, targetId, sessionId);
    await page.init(opts);
    return page;
  }

  async close() {
    try { await Promise.race([this.send('Browser.close'), sleep(2000)]); } catch {} // Chrome may drop the socket without answering
    await new Promise((r) => { if (this.proc.exitCode !== null) r(); else { this.proc.once('exit', r); setTimeout(r, 3000); } });
    try { this.proc.kill(); } catch {}
    for (let i = 0; i < 5; i++) {
      try { rmSync(this.profile, { recursive: true, force: true }); break; } catch { await sleep(300); }
    }
    open.delete(this.entry);
  }
}

// Chrome's error names, in the person's words
const HINTS = [
  [/NAME_NOT_RESOLVED|INTERNET_DISCONNECTED|NETWORK_CHANGED|ADDRESS_UNREACHABLE/, ' (no internet connection, or a typo in the address?)'],
  [/CONNECTION_REFUSED/, ' (nothing answers there: is the server running, is the port right?)'],
  [/TIMED_OUT|CONNECTION_TIMED_OUT/, ' (no answer: offline, or the site is down?)'],
];

class Page {
  constructor(browser, targetId, sessionId) {
    this.b = browser;
    this.targetId = targetId;
    this.sessionId = sessionId;
    this.problems = []; // console errors, uncaught exceptions, failed requests
    this.bytes = new Map(); // url -> encoded bytes over the wire
  }

  send(method, params) { return this.b.send(method, params, this.sessionId); }

  on(event, fn) {
    return this.b.listen(this.sessionId, (m, p) => { if (m === event) fn(p); });
  }

  // colorScheme is pinned (light unless asked): headless Chrome otherwise follows the machine's own setting, so a
  // PC in dark mode would check a different palette than CI does
  async init({ width = 1440, height = 900, mobile = false, scale = 1, reducedMotion = false, colorScheme = 'light' } = {}) {
    await Promise.all(['Page.enable', 'Runtime.enable', 'Network.enable', 'Log.enable'].map((m) => this.send(m)));
    await this.send('Page.addScriptToEvaluateOnNewDocument', { source: `(${appLinkGuard})()` });
    const urls = new Map();
    this.b.listen(this.sessionId, (m, p) => {
      if (m === 'Runtime.exceptionThrown') {
        const d = p.exceptionDetails;
        this.problems.push({ kind: 'exception', text: d.exception?.description?.split('\n')[0] || d.text, where: d.url });
      } else if (m === 'Runtime.consoleAPICalled' && p.type === 'error') {
        this.problems.push({ kind: 'console', text: p.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 300) });
      } else if (m === 'Log.entryAdded' && p.entry.source === 'intervention') {
        this.problems.push({ kind: 'intervention', text: p.entry.text.slice(0, 300), where: p.entry.url });
      } else if (m === 'Log.entryAdded' && p.entry.level === 'error' && p.entry.source !== 'network') {
        this.problems.push({ kind: 'browser', text: p.entry.text.slice(0, 300), where: p.entry.url });
      } else if (m === 'Network.requestWillBeSent') {
        urls.set(p.requestId, p.request.url);
      } else if (m === 'Network.responseReceived' && p.response.status >= 400) {
        this.problems.push({ kind: 'http', text: `${p.response.status} ${p.response.url}` });
      } else if (m === 'Fetch.requestPaused') {
        const to = p.responseStatusCode >= 300 && p.responseStatusCode < 400 && p.responseHeaders?.find((h) => /^location$/i.test(h.name))?.value;
        const app = to && !webLink(to, p.request.url);
        if (app) this.appLink = to;
        this.send(app ? 'Fetch.failRequest' : 'Fetch.continueResponse', { requestId: p.requestId, ...(app && { errorReason: 'BlockedByClient' }) }).catch(() => {});
      } else if (m === 'Network.loadingFailed' && p.errorText === 'net::ERR_BLOCKED_BY_CLIENT') {
        // a frame that forwards to an app link (above): stopped on purpose, not a broken request
      } else if (m === 'Network.loadingFailed' && !p.canceled && p.errorText !== 'net::ERR_ABORTED') {
        this.problems.push({ kind: 'network', text: `${p.errorText} ${urls.get(p.requestId) || ''}` });
      } else if (m === 'Network.loadingFinished') {
        const u = urls.get(p.requestId);
        if (u) this.bytes.set(u, p.encodedDataLength);
      }
    });
    // A server redirect to mailto: (a /contact that forwards to the mail program) never reaches the page's guard, the
    // browser follows it by itself: page answers stop here first, and one that forwards to an app link goes no further.
    await this.send('Fetch.enable', { patterns: [{ urlPattern: 'http*', resourceType: 'Document', requestStage: 'Response' }] });
    await this.send('Network.setCacheDisabled', { cacheDisabled: true });
    await this.viewport({ width, height, mobile, scale });
    await this.send('Emulation.setEmulatedMedia', { features: [
      { name: 'prefers-color-scheme', value: colorScheme || 'light' },
      { name: 'prefers-reduced-motion', value: reducedMotion ? 'reduce' : 'no-preference' },
    ] });
  }

  async viewport({ width, height, mobile = false, scale = 1 }) {
    this.size = { width, height };
    await this.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile });
    await this.send('Emulation.setTouchEmulationEnabled', mobile ? { enabled: true, maxTouchPoints: 5 } : { enabled: false });
  }

  // Runs before any of the page's own scripts on every navigation.
  async beforeLoad(source) {
    await this.send('Page.addScriptToEvaluateOnNewDocument', { source });
  }

  // navigate: how long the server may take to send the page at all (one that takes the connection and never answers
  // otherwise held the run for the browser's own 120 s limit, which then blamed the browser); timeout: how long the
  // page may then take to load.
  async goto(url, { timeout = 30000, navigate = 30000 } = {}) {
    if (!webLink(url)) throw new Error(`Not opened: ${url} would start another program. Pass a web address (https://…) or a folder.`);
    const loaded = new Promise((r) => { const off = this.on('Page.loadEventFired', () => { off(); r(); }); });
    this.appLink = null;
    let gate;
    const res = await Promise.race([
      this.send('Page.navigate', { url }),
      new Promise((_, no) => { gate = setTimeout(() => no(new Error(`Could not open ${url}: no answer within ${navigate / 1000} s (the server is stuck, or the site is down?)`)), navigate); }),
    ]).finally(() => clearTimeout(gate));
    if (res.errorText && this.appLink) throw new Error(`Not opened: ${url} forwards to ${this.appLink.slice(0, 80)}, which would start another program.`);
    if (res.errorText) throw new Error(`Could not open ${url}: ${res.errorText}${HINTS.find(([re]) => re.test(res.errorText))?.[1] || ''}`);
    let timer, late = true;
    await Promise.race([loaded.then(() => { late = false; }), new Promise((r) => { timer = setTimeout(r, timeout); })]);
    clearTimeout(timer); // a pending timer would keep Node alive for the full timeout after the work is done
    if (late) this.problems.push({ kind: 'network', text: `${url} was still loading after ${timeout / 1000} s; the checks ran on what had arrived` });
    // a web font that never arrives would otherwise hold the run for the 120 s limit too
    await this.eval('document.fonts ? Promise.race([document.fonts.ready.then(() => 1), new Promise((r) => setTimeout(r, 5000, 1))]) : 1');
  }

  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  }

  // a function defined in this file, run in the page with JSON arguments
  call(fn, ...args) {
    return this.eval(`(${fn.toString()})(...${JSON.stringify(args)})`);
  }

  // clip is in page coordinates (from the top of the document, not of the screen). By default a clip may reach past
  // the screen (a tall contact sheet); beyond: false keeps to what the screen shows, fixed and sticky bars where they
  // are, so a part of this screen is { y: scrollY + top }. With no path, returns the image as base64.
  async shot(path, { type = 'jpeg', quality = 82, clip, beyond = !!clip } = {}) {
    const r = await this.send('Page.captureScreenshot', { format: type, ...(type === 'jpeg' && { quality }), ...(clip && { clip: { ...clip, scale: 1 } }), captureBeyondViewport: beyond });
    if (!path) return r.data;
    writeFileSync(path, Buffer.from(r.data, 'base64'));
  }

  async close() {
    try { await this.b.send('Target.closeTarget', { targetId: this.targetId }); } catch {}
  }
}
