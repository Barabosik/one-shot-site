// A 3D hero with three.js that never costs the page its speed or its content.
//
//   <div class="hero-3d" aria-hidden="true"><img class="hero-3d-poster" src="/img/hero-poster.webp" alt=""></div>
//   initHero3d(document.querySelector('.hero-3d'), { build });
//
// - Loads three.js only after the page has painted, as its own chunk.
// - Checks WebGL first; without it (or on any error) the poster image simply stays.
// - Pixel ratio capped (1.5 on phones, 2 elsewhere), drawing stops off-screen and in hidden tabs.
// - Reduced motion: draws one still frame, no animation.
//
// `build({ THREE, scene, camera, renderer, accent })` sets up the scene and returns a function
// (time, pointer) => void that runs every frame. The default is a placeholder: replace it with the
// subject's own object (a product model, the menu's signature dish, a stylised building…). Load a model
// with GLTFLoader from 'three/addons/loaders/GLTFLoader.js'; compress it first (gltf-transform meshopt).

// any CSS colour (oklch, a var) -> a hex number three.js understands
function cssColor(value) {
  const c = document.createElement('canvas').getContext('2d');
  c.fillStyle = value;
  c.fillRect(0, 0, 1, 1);
  const [r, g, b] = c.getImageData(0, 0, 1, 1).data;
  return (r << 16) | (g << 8) | b;
}

function placeholder({ THREE, scene, camera, accent }) {
  camera.position.set(0, 0, 6);
  const geo = new THREE.SphereGeometry(1.6, 96, 64); // indexed, so normals come out smooth
  const base = geo.attributes.position.array.slice();
  const mat = new THREE.MeshStandardMaterial({ color: accent, roughness: 0.35, metalness: 0.1 });
  const mesh = new THREE.Mesh(geo, mat);
  scene.add(mesh);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x222222, 1.4));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(3, 4, 5);
  scene.add(key);
  const v = new THREE.Vector3();
  return (t, p) => {
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      v.fromArray(base, i * 3);
      const k = 1 + 0.08 * Math.sin(v.x * 1.7 + t * 0.6) * Math.sin(v.y * 1.9 + t * 0.5) * Math.sin(v.z * 1.5 + t * 0.4);
      pos.setXYZ(i, v.x * k, v.y * k, v.z * k);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    mesh.rotation.y += (p.x * 0.5 - mesh.rotation.y) * 0.04 + 0.002;
    mesh.rotation.x += (p.y * 0.3 - mesh.rotation.x) * 0.04;
  };
}

export async function initHero3d(holder, { build = placeholder } = {}) {
  if (!holder) return;
  const test = document.createElement('canvas');
  if (!(test.getContext('webgl2') || test.getContext('webgl'))) return; // the poster stays
  await new Promise((r) => (window.requestIdleCallback ? requestIdleCallback(r, { timeout: 1500 }) : setTimeout(r, 300)));

  try {
    const THREE = await import('three');
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(devicePixelRatio, matchMedia('(pointer: coarse)').matches ? 1.5 : 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
    const accent = cssColor(getComputedStyle(document.documentElement).getPropertyValue('--accent') || '#888');
    const frame = build({ THREE, scene, camera, renderer, accent });

    const canvas = renderer.domElement;
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;opacity:0;transition:opacity 600ms ease';
    if (getComputedStyle(holder).position === 'static') holder.style.position = 'relative';
    holder.append(canvas);

    const size = () => {
      const { width, height } = holder.getBoundingClientRect();
      renderer.setSize(width, height, false);
      camera.aspect = width / Math.max(1, height);
      camera.updateProjectionMatrix();
      if (shown && still) draw(); // resizing clears the canvas; a still frame has no loop to redraw it
    };
    let shown = false;
    size();
    new ResizeObserver(size).observe(holder);

    const pointer = { x: 0, y: 0 };
    addEventListener('pointermove', (e) => { pointer.x = e.clientX / innerWidth - 0.5; pointer.y = e.clientY / innerHeight - 0.5; }, { passive: true });

    let visible = true;
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(holder);
    const clock = new THREE.Clock();
    const draw = () => { frame(clock.getElapsedTime(), pointer); renderer.render(scene, camera); };

    await renderer.compileAsync?.(scene, camera);
    draw();
    shown = true;
    canvas.style.opacity = '1';
    holder.querySelector('.hero-3d-poster')?.style.setProperty('visibility', 'hidden');
    if (still) return;
    renderer.setAnimationLoop(() => { if (visible && !document.hidden) draw(); });
  } catch (err) {
    console.warn('3D hero skipped:', err); // the poster stays
  }
}
