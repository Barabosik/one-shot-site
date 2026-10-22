// Click-to-load for maps, videos and other outside content: nothing is fetched from Google, YouTube or anyone
// else until the visitor asks for it, so the page needs no consent banner for them.
//
//   <div class="embed" data-src="https://www.youtube-nocookie.com/embed/VIDEO_ID" data-title="The oven at work"
//        data-kind="video">
//     <img src="/img/oven-poster.webp" alt="" width="1280" height="720">
//   </div>
//   initEmbeds();
//
// data-kind: video or map (for the button text). data-label / data-note override the wording.
// For a map, a plain link is often better: <a href="{{site.address|maps}}">Open in maps</a>.
const WORDS = {
  en: { load: (k, p) => `Load the ${k} from ${p}`, note: (p) => `Loading it sends your IP address to ${p}.`, kinds: { video: 'video', map: 'map' } },
  de: { load: (k, p) => `${k} von ${p} laden`, note: (p) => `Dabei wird Ihre IP-Adresse an ${p} übertragen.`, kinds: { video: 'Video', map: 'Karte' } },
};

const NAMES = [[/youtube\.com$/, 'YouTube'], [/vimeo\.com$/, 'Vimeo'], [/google\.[a-z.]+$/, 'Google'], [/openstreetmap\.org$/, 'OpenStreetMap'], [/spotify\.com$/, 'Spotify'], [/soundcloud\.com$/, 'SoundCloud']];

export function initEmbeds(root = document) {
  const w = WORDS[(document.documentElement.lang || 'en').slice(0, 2)] || WORDS.en;
  for (const box of root.querySelectorAll('.embed[data-src]')) {
    const host = new URL(box.dataset.src).hostname.replace(/^www\./, '').replace(/-nocookie/, '');
    const provider = box.dataset.provider || NAMES.find(([re]) => re.test(host))?.[1] || host;
    const kind = w.kinds[box.dataset.kind] || box.dataset.kind || w.kinds.video;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'embed-load';
    button.textContent = box.dataset.label || w.load(kind, provider);
    const note = document.createElement('p');
    note.className = 'embed-note';
    note.textContent = box.dataset.note || w.note(provider);
    box.append(button, note);
    button.addEventListener('click', () => {
      const frame = document.createElement('iframe');
      frame.src = box.dataset.src;
      frame.title = box.dataset.title || provider;
      frame.allow = 'autoplay; fullscreen; picture-in-picture';
      frame.allowFullscreen = true;
      box.replaceChildren(frame);
      frame.focus();
    }, { once: true });
  }
}
