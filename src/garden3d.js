// The page background: a raked-sand garden that fills the whole window,
// drawn with three.js and shown faintly behind the text. A tiny gardener
// tends it and plants trees, which are saved per page in the visitor's
// browser.
//
// The stones and the tree are photoscanned models from Poly Haven (CC0), in
// public/models; see the README for credits. The sand and the gardener are
// made here in code.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const SPACING = 0.3; // gap between rake lines, in world units
const TILT = 1.0; // how steeply the camera looks down, in radians

// Seeded random numbers, so each page always gets the same garden.
function seeded(text) {
  let a = 2166136261;
  for (let i = 0; i < text.length; i++) a = Math.imul(a ^ text.charCodeAt(i), 16777619);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function garden() {
  const canvas = document.createElement('canvas');
  canvas.className = 'garden';
  canvas.setAttribute('aria-hidden', 'true');
  let renderer;
  try {
    // preserveDrawingBuffer keeps the last picture on frames that are skipped
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  } catch {
    return; // no WebGL: the page keeps its plain background
  }
  document.body.prepend(canvas);
  canvas.addEventListener('webglcontextlost', () => canvas.remove());
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  // The layout is chosen once, from the shape of the window at load.
  const wide = innerWidth / innerHeight > 1;
  const halfW = wide ? 9 : 4.4; // half the width of sand in view at the middle of the window
  const halfD = (halfW / (innerWidth / innerHeight)) * 1.05; // roughly half its depth
  const EXTENT = Math.max(halfW * 1.3, halfD * 1.7); // half-width of the square of sand
  const mostTrees = wide ? 3 : 1;

  const rand = seeded(location.pathname);
  const between = (lo, hi) => lo + rand() * (hi - lo);
  const phase = [rand() * 6.28, rand() * 6.28, rand() * 6.28];

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.5, 200);

  // Light: a low sun or moon that casts shadows, and soft fill from the sky.
  const sun = new THREE.DirectionalLight();
  sun.position.set(-11, 9.5, 5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const reach = Math.max(halfW, halfD) * 1.35;
  Object.assign(sun.shadow.camera, { left: -reach, right: reach, top: reach, bottom: -reach, near: 1, far: 50 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.03;
  sun.shadow.radius = 3;
  const sky = new THREE.HemisphereLight();
  scene.add(sun, sky);

  // Five stones in two unequal groups, set on a diagonal: a host group of
  // three (a tall master, a low companion, a small one) and a smaller guest
  // group of two. On wide screens they keep to the sides, so the middle of
  // the sand, under the text, stays empty.
  const stones = [];
  const groups = wide
    ? [{ at: [-0.64, 0.3], rings: 4, size: 1, three: true }, { at: [0.72, -0.38], rings: 3, size: 0.66, three: false }]
    : [{ at: [-0.72, 0.58], rings: 3, size: 0.9, three: true }, { at: [0.72, -0.42], rings: 2, size: 0.6, three: false }];
  groups.forEach((g, id) => {
    const x = g.at[0] * halfW + between(-0.25, 0.25);
    const z = g.at[1] * halfD + between(-0.3, 0.3);
    const away = (x > 0 ? 0 : Math.PI) + between(-0.9, 0.9); // companions sit on the side away from the text
    const k = g.size;
    const near = wide ? 1 : 0.75;
    stones.push({ x, z, r: 0.82 * k, group: id, model: id, tall: 1.4 });
    stones.push({ x: x + Math.cos(away) * 1.6 * k * near, z: z + Math.sin(away) * 1.6 * k * near, r: 0.42 * k, group: id, model: id + 3, tall: 0.75 });
    if (g.three) stones.push({ x: x + Math.cos(away + 1.9) * 0.95 * near, z: z + Math.sin(away + 1.9) * 0.95 * near, r: 0.22, group: id, model: id + 1, tall: 1 });
  });
  // Rings are raked round a whole group, like water round islands: each
  // stone's rings stop where they would enter a neighbour's.
  const ringAt = (s, k) => s.r * 1.05 + 0.14 + (k + 0.5) * SPACING;
  for (const s of stones) s.field = s.r * 1.05 + 0.14 + groups[s.group].rings * SPACING;

  // Sand: a colour picture, and a height picture that becomes a normal map
  // so the raked grooves catch the low light.
  const SIZE = 2048;
  const sheet = () => {
    const c = document.createElement('canvas');
    c.width = c.height = SIZE;
    return c;
  };
  const px = (v) => (v / EXTENT / 2 + 0.5) * SIZE;
  const len = (v) => (v / EXTENT / 2) * SIZE;
  const wander = (x, z) => 0.07 * Math.sin(x * 0.5 + phase[0]) * Math.cos(z * 0.7 + phase[1]) + 0.03 * Math.sin(x * 1.6 + z * 1.1 + phase[2]);
  const rake = (ctx, colour, flat, width) => {
    ctx.strokeStyle = colour;
    ctx.lineCap = 'round';
    let row = 0;
    for (let z = -EXTENT; z <= EXTENT; z += SPACING) {
      row++;
      ctx.lineWidth = len(width * (1 + 0.16 * Math.sin(row * 2.7 + phase[1]))); // the rake is never perfectly even
      ctx.beginPath();
      for (let x = -EXTENT; x <= EXTENT; x += 0.12) ctx.lineTo(px(x), px(z + wander(x, z)));
      ctx.stroke();
    }
    for (const s of stones) {
      // clear the straight rows around the stone, feathered at the edge
      const edge = ctx.createRadialGradient(px(s.x), px(s.z), len(s.field + SPACING * 0.2), px(s.x), px(s.z), len(s.field + SPACING * 1.1));
      edge.addColorStop(0, flat);
      edge.addColorStop(1, flat.replace(/[\d.]+\)$/, '0)'));
      ctx.fillStyle = edge;
      ctx.beginPath();
      ctx.arc(px(s.x), px(s.z), len(s.field + SPACING * 1.1), 0, 7);
      ctx.fill();
    }
    ctx.strokeStyle = colour;
    ctx.lineWidth = len(width);
    for (const s of stones) {
      const others = stones.filter((o) => o !== s && o.group === s.group);
      for (let k = 0; k < groups[s.group].rings; k++) {
        const radius = ringAt(s, k);
        let drawing = false;
        ctx.beginPath();
        for (let i = 0; i <= 180; i++) {
          const a = (i / 180) * Math.PI * 2;
          const x = s.x + Math.cos(a) * radius;
          const z = s.z + Math.sin(a) * radius;
          const hidden = others.some((o) => Math.hypot(x - o.x, z - o.z) < ringAt(o, k) - 0.01);
          if (hidden) drawing = false;
          else if (drawing) ctx.lineTo(px(x), px(z));
          else {
            ctx.moveTo(px(x), px(z));
            drawing = true;
          }
        }
        ctx.stroke();
      }
    }
  };
  const speckle = (ctx, count, shades) => {
    for (let i = 0; i < count; i++) {
      ctx.fillStyle = shades[i % shades.length];
      ctx.fillRect(Math.random() * SIZE, Math.random() * SIZE, 1 + Math.random(), 1 + Math.random()); // about one grain
    }
  };
  const grains = (SIZE * SIZE) / 40;

  const colourSheet = sheet();
  {
    const ctx = colourSheet.getContext('2d');
    ctx.fillStyle = '#d8d5cc'; // pale grey-white gravel, not beach sand
    ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.filter = `blur(${SIZE / 700}px)`;
    rake(ctx, 'rgba(72, 70, 64, 0.16)', 'rgba(216, 213, 204, 1)', 0.12);
    ctx.filter = 'none';
    // sand is never one even tone: broad soft patches, a few percent lighter or darker
    for (let i = 0; i < 60; i++) {
      const x = Math.random() * SIZE;
      const y = Math.random() * SIZE;
      const r = SIZE * (0.04 + Math.random() * 0.09);
      const patch = ctx.createRadialGradient(x, y, 0, x, y, r);
      patch.addColorStop(0, i % 2 ? 'rgba(48, 46, 42, 0.06)' : 'rgba(255, 254, 250, 0.09)');
      patch.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = patch;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // a little shade right where each stone sits
    for (const s of stones) {
      const damp = ctx.createRadialGradient(px(s.x), px(s.z), len(s.r * 0.8), px(s.x), px(s.z), len(s.r * 1.35));
      damp.addColorStop(0, 'rgba(58, 56, 50, 0.18)');
      damp.addColorStop(1, 'rgba(58, 56, 50, 0)');
      ctx.fillStyle = damp;
      ctx.fillRect(px(s.x - s.r * 2), px(s.z - s.r * 2), len(s.r * 4), len(s.r * 4));
    }
    speckle(ctx, grains, ['rgba(84, 82, 76, 0.1)', 'rgba(255, 255, 252, 0.14)', 'rgba(40, 40, 38, 0.06)']);
  }
  const sandMap = new THREE.CanvasTexture(colourSheet);
  sandMap.colorSpace = THREE.SRGBColorSpace;
  sandMap.anisotropy = renderer.capabilities.getMaxAnisotropy();

  const normalSheet = sheet();
  {
    const heights = sheet();
    const h = heights.getContext('2d');
    h.fillStyle = '#a0a0a0';
    h.fillRect(0, 0, SIZE, SIZE);
    h.filter = `blur(${SIZE / 330}px)`; // a wide blur turns each line into a rounded trough
    rake(h, 'rgba(20, 20, 20, 1)', 'rgba(160, 160, 160, 1)', 0.14);
    // sand banked up around each stone
    for (const s of stones) {
      h.strokeStyle = 'rgba(245, 245, 245, 0.9)';
      h.lineWidth = len(0.15);
      h.beginPath();
      h.arc(px(s.x), px(s.z), len(s.r * 1.06), 0, 7);
      h.stroke();
    }
    h.filter = 'none';
    speckle(h, grains * 1.5, ['rgba(255, 255, 255, 0.05)', 'rgba(0, 0, 0, 0.05)']);
    const src = h.getImageData(0, 0, SIZE, SIZE).data;
    const out = new ImageData(SIZE, SIZE);
    const strength = SIZE / 130;
    const at = (x, y) => src[(Math.min(SIZE - 1, Math.max(0, y)) * SIZE + Math.min(SIZE - 1, Math.max(0, x))) * 4] / 255;
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const dx = (at(x - 1, y) - at(x + 1, y)) * strength;
        const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
        const k = 1 / Math.hypot(dx, dy, 1);
        const i = (y * SIZE + x) * 4;
        out.data[i] = (dx * k * 0.5 + 0.5) * 255;
        out.data[i + 1] = (dy * k * 0.5 + 0.5) * 255;
        out.data[i + 2] = (k * 0.5 + 0.5) * 255;
        out.data[i + 3] = 255;
      }
    }
    normalSheet.getContext('2d').putImageData(out, 0, 0);
  }
  const sandNormal = new THREE.CanvasTexture(normalSheet);
  sandNormal.anisotropy = sandMap.anisotropy;
  const sandLook = new THREE.MeshStandardMaterial({ map: sandMap, normalMap: sandNormal, roughness: 1 });
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(EXTENT * 2, EXTENT * 2).rotateX(-Math.PI / 2), sandLook);
  sand.receiveShadow = true;
  scene.add(sand);

  // The gardener: tiny and solid, in dark work clothes and a pale straw hat.
  const cloth = new THREE.MeshStandardMaterial({ color: '#3a3f48', roughness: 1 });
  const skin = new THREE.MeshStandardMaterial({ color: '#c9b08e', roughness: 1 });
  const straw = new THREE.MeshStandardMaterial({ color: '#cdbf98', roughness: 1 });
  const handle = new THREE.MeshStandardMaterial({ color: '#5e5244', roughness: 1 });
  const solid = (geometry, material, parent, x = 0, y = 0, z = 0) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  };
  const up = new THREE.Vector3(0, 1, 0);
  const figure = new THREE.Group();
  figure.scale.setScalar(wide ? 1.7 : 1.3);
  const torso = new THREE.Group();
  torso.position.y = 0.2;
  solid(new THREE.CapsuleGeometry(0.05, 0.12, 3, 8), cloth, torso, 0, 0.11);
  solid(new THREE.SphereGeometry(0.042, 10, 8), skin, torso, 0, 0.255);
  solid(new THREE.ConeGeometry(0.13, 0.055, 12), straw, torso, 0, 0.3);
  const arm = solid(new THREE.CapsuleGeometry(0.016, 0.1, 2, 5).translate(0, -0.06, 0), cloth, torso, 0.03, 0.18, 0.04);
  arm.rotation.z = 1.0;
  const rakeTool = solid(new THREE.CylinderGeometry(0.008, 0.008, 0.5, 5).translate(0, -0.25, 0), handle, torso, 0.12, 0.26, 0.04);
  rakeTool.rotation.z = 0.3;
  solid(new THREE.BoxGeometry(0.02, 0.012, 0.13), handle, rakeTool, 0, -0.5, 0);
  const leg = () => solid(new THREE.CapsuleGeometry(0.022, 0.14, 2, 5).translate(0, -0.09, 0), cloth, figure, 0, 0.2, 0);
  const legA = leg();
  const legB = leg();
  legA.position.z = 0.025;
  legB.position.z = -0.025;
  figure.add(torso);
  scene.add(figure);

  // Trees the gardener has planted on this page, in earlier visits and now.
  const key = `dry-garden:${location.pathname}:${wide ? 'wide' : 'tall'}`;
  let trees = [];
  try {
    trees = JSON.parse(localStorage.getItem(key)) || [];
  } catch {}
  let buildTree = () => null; // set once the tree model has loaded

  // Where the gardener may walk: sand in view, clear of the stones and
  // their rings. Trees are planted only at the edges of the garden, never
  // in the open raked field.
  const blocked = (x, z, pad) => Math.abs(x) > halfW * 0.95 || Math.abs(z) > halfD * 0.8 || stones.some((s) => Math.hypot(x - s.x, z - s.z) < s.field + pad);
  const crosses = (x1, z1, x2, z2) => {
    for (let t = 0; t <= 1; t += 0.04) if (blocked(x1 + (x2 - x1) * t, z1 + (z2 - z1) * t, 0)) return true;
    return false;
  };
  const full = () => trees.length >= mostTrees;
  const spot = (from, planting) => {
    const stroll = full() ? halfW * 0.35 : halfW * 0.8; // once the planting is done he barely moves
    for (let i = 0; i < 120; i++) {
      const x = (Math.random() * 2 - 1) * halfW * 0.9;
      const z = (Math.random() * 2 - 1) * halfD * 0.7;
      if (wide && Math.abs(x) < halfW * 0.5) continue;
      if (planting && Math.abs(x) < halfW * (wide ? 0.8 : 0.7)) continue; // only at the side edges
      if (blocked(x, z, 0.4)) continue;
      if (trees.some((t) => Math.hypot(t.x - x, t.z - z) < 2.6)) continue;
      if (from && !planting && Math.hypot(from.x - x, from.z - z) > stroll) continue;
      if (from && crosses(from.x, from.z, x, z)) continue;
      return { x, z };
    }
    return null;
  };
  const me = spot() || { x: halfW * 0.6, z: halfD * 0.3 };
  let state = 'rest';
  let until = 3;
  let target = null;
  let growing = null;
  let stride = 0;
  let willPlant = false;

  const tend = (now, dt) => {
    if (state === 'rest' && now > until) {
      willPlant = !full() && buildTree(null) !== false;
      target = spot(me, willPlant) || spot(me, false);
      if (target) state = 'walk';
      else until = now + 20;
    } else if (state === 'walk') {
      const dx = target.x - me.x;
      const dz = target.z - me.z;
      const far = Math.hypot(dx, dz);
      const move = (full() ? 0.15 : 0.22) * dt; // a slow walk
      if (far <= move) {
        me.x = target.x;
        me.z = target.z;
        state = willPlant ? 'plant' : 'rake';
        until = now + (willPlant ? 2.6 : 8 + Math.random() * 4);
      } else {
        me.x += (dx / far) * move;
        me.z += (dz / far) * move;
        figure.rotation.y = Math.atan2(dx, dz) - Math.PI / 2;
        stride += dt * 5;
      }
    } else if (state === 'plant' && now > until) {
      const ahead = new THREE.Vector3(0.7, 0, 0).applyAxisAngle(up, figure.rotation.y);
      const tree = { x: +(me.x + ahead.x).toFixed(2), z: +(me.z + ahead.z).toFixed(2), s: +(1.7 + Math.random() * 0.9).toFixed(2) };
      trees.push(tree);
      try {
        localStorage.setItem(key, JSON.stringify(trees));
      } catch {}
      growing = { tree: buildTree(tree, false), from: now };
      state = 'rest';
      until = now + 12 + Math.random() * 10;
    } else if (state === 'rake' && now > until) {
      state = 'rest';
      until = now + (full() ? 40 + Math.random() * 50 : 12 + Math.random() * 10); // mostly he stands still
    }
    if (growing) {
      const k = Math.min(1, (now - growing.from) / 20); // slow enough to notice only on a second look
      growing.tree.scale.setScalar(Math.max(0.02, 1 - (1 - k) ** 3));
      if (k === 1) growing = null;
    }
    const swing = state === 'walk' ? Math.sin(stride) * 0.5 : 0.06;
    legA.rotation.z = swing;
    legB.rotation.z = -swing;
    torso.rotation.z = state === 'plant' ? -0.55 : state === 'rake' ? -0.28 : 0;
    rakeTool.rotation.z = 0.3 + (state === 'rake' ? Math.sin(now * 2.5) * 0.25 : 0);
    figure.position.set(me.x, 0, me.z);
  };

  const draw = () => renderer.render(scene, camera);

  // Colours follow the page theme: warm low daylight, or cool moonlight.
  const root = document.documentElement;
  const media = matchMedia('(prefers-color-scheme: dark)');
  const tinted = []; // [material, day colour, night colour]
  const theme = () => {
    const night = (root.dataset.theme || (media.matches ? 'dark' : 'light')) === 'dark';
    // Day is soft, slightly cool morning light. Night is moonlight on pale
    // gravel: nearly neutral ink grey, with enough fill that stones keep
    // their form.
    sun.color.set(night ? '#d3d9e4' : '#fff8ef');
    sun.intensity = night ? 2.8 : 3.4;
    sun.shadow.radius = night ? 7 : 5;
    sun.shadow.intensity = night ? 0.7 : 1;
    sky.color.set(night ? '#464b56' : '#f7f8f6');
    sky.groundColor.set(night ? '#34363a' : '#b2afa6');
    sky.intensity = night ? 1.5 : 0.9;
    sandLook.roughness = night ? 0.72 : 1; // a faint silver sheen on the ridges under the moon
    sandLook.color.set(night ? '#d4d7dd' : '#ffffff');
    for (const [look, day, dark] of tinted) look.color.set(night ? dark : day);
    canvas.classList.toggle('garden-night', night);
    draw();
  };

  // The camera looks down at the sand from the near side. Phones change the
  // window height all the time while scrolling (the address bar slides
  // away), so only a real change in size re-frames the scene.
  let sizedFor = [0, 0];
  const frame = () => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w === sizedFor[0] && Math.abs(h - sizedFor[1]) < 140) return;
    sizedFor = [w, h];
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const distance = halfW / (Math.tan((camera.fov * Math.PI) / 360) * camera.aspect);
    camera.position.set(0, Math.sin(TILT) * distance, Math.cos(TILT) * distance);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    draw();
  };

  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let now = 0;
  let last = 0;
  let skip = false;
  const tick = (ms) => {
    requestAnimationFrame(tick);
    skip = !skip;
    if (skip) return; // the scene moves slowly, so every other frame is plenty
    const dt = Math.min(0.2, (ms - last) / 1000);
    last = ms;
    now += dt;
    tend(now, dt);
    draw();
  };

  addEventListener('resize', frame);
  media.addEventListener('change', theme);
  new MutationObserver(theme).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
  figure.position.set(me.x, 0, me.z);
  frame();
  theme();
  requestAnimationFrame(() => canvas.classList.add('garden-ready')); // the sand fades in straight away
  if (!still) {
    requestAnimationFrame((ms) => {
      last = ms;
      tick(ms);
    });
  }

  // The scanned stones and tree arrive after the sand is already showing.
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const meshesIn = (object) => {
    const found = [];
    object.traverse((o) => o.isMesh && found.push(o));
    return found;
  };
  // Scanned models come with packed numbers and their own offsets, so each
  // is wrapped in a holder that stands on the origin.
  const standing = (object) => {
    object.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(object);
    const size = box.getSize(new THREE.Vector3());
    const mid = box.getCenter(new THREE.Vector3());
    const holder = new THREE.Group();
    object.position.sub(new THREE.Vector3(mid.x, box.min.y, mid.z));
    holder.add(object);
    return { holder, size };
  };
  const tune = (object) => {
    for (const mesh of meshesIn(object)) {
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.frustumCulled = false; // the scans' packed sizes mislead the off-screen test
      const look = mesh.material;
      look.vertexColors = false; // the scans keep wind data there, not colour
      if (look.transparent || look.alphaTest) {
        // leaves: cut out by their texture, seen from both sides
        look.transparent = false;
        look.alphaTest = 0.2;
        look.alphaToCoverage = true; // soft edges, so they do not sparkle
        look.side = THREE.DoubleSide;
      }
    }
    return object;
  };

  loader.loadAsync('/models/stones.glb').then((model) => {
    const scanned = meshesIn(tune(model.scene));
    for (const look of new Set(scanned.map((m) => m.material))) tinted.push([look, '#c4c7c2', '#eceef1']); // cooled toward weathered grey
    for (const s of stones) {
      const source = scanned[s.model % scanned.length];
      source.updateWorldMatrix(true, false);
      const copy = new THREE.Mesh(source.geometry, source.material);
      copy.applyMatrix4(source.matrixWorld);
      copy.castShadow = copy.receiveShadow = true;
      copy.frustumCulled = false;
      const { holder, size } = standing(copy);
      const k = (s.r * 2.1) / Math.max(size.x, size.z);
      copy.material.roughness = 1;
      holder.scale.set(k, k * s.tall, k);
      holder.position.set(s.x, -size.y * k * s.tall * 0.2, s.z); // sunk well into the sand
      holder.rotation.y = rand() * 6;
      scene.add(holder);
    }
    theme();
  }).catch(() => {});

  loader.loadAsync('/models/jacaranda.glb').then((model) => {
    const kind = tune(model.scene);
    for (const look of new Set(meshesIn(kind).map((m) => m.material))) tinted.push([look, /lea/i.test(look.name) ? '#a9b894' : '#e8e6e0', '#eceef1']); // deep, quiet green
    const moss = new THREE.MeshStandardMaterial({ roughness: 1 });
    tinted.push([moss, '#59614a', '#4b5246']);
    buildTree = (tree, grown) => {
      if (!tree) return true; // asked only whether planting is possible yet
      const pick = seeded(`${tree.x},${tree.z}`);
      const { holder, size } = standing(kind.clone(true));
      holder.scale.setScalar(tree.s / size.y);
      holder.rotation.y = pick() * 6;
      // each tree stands on its own small island of moss
      const outline = new THREE.Shape();
      const lobes = [pick() * 6, pick() * 6];
      for (let i = 0; i < 40; i++) {
        const a = (i / 40) * Math.PI * 2;
        const r = tree.s * 0.3 * (1 + 0.16 * Math.sin(a * 2 + lobes[0]) + 0.1 * Math.sin(a * 3 + lobes[1]));
        outline[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r * 1.25, Math.sin(a) * r);
      }
      const island = new THREE.Mesh(new THREE.ShapeGeometry(outline).rotateX(-Math.PI / 2), moss);
      island.position.y = 0.012;
      island.receiveShadow = true;
      const g = new THREE.Group();
      g.add(island, holder);
      g.position.set(tree.x, 0, tree.z);
      g.scale.setScalar(grown ? 1 : 0.02);
      scene.add(g);
      return g;
    };
    trees.forEach((tree) => buildTree(tree, true));
    theme();
  }).catch(() => {});
  buildTree = (tree) => (tree ? null : false); // until the model is in, the gardener only walks
}

garden();
