// The page background: a small raked-sand garden on a rock floating in
// space, drawn with three.js. A tiny gardener tends it and plants trees,
// which are saved per page in the visitor's browser.
//
// Two fixed layers sit behind the text: a plain canvas of stars filling the
// window, and a small WebGL box holding the rock. Keeping the 3D part small
// is what lets it afford soft contact shading (ambient occlusion).
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ImprovedNoise } from 'three/addons/math/ImprovedNoise.js';
import { mergeGeometries, toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';

const R = 5; // rough island radius, in world units
const EXTENT = R * 1.12; // half-width of the area the sand textures cover
const SPACING = 0.25; // gap between rake lines
const MOST_TREES = 4;

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

const root = document.documentElement;
const media = matchMedia('(prefers-color-scheme: dark)');
const isNight = () => (root.dataset.theme || (media.matches ? 'dark' : 'light')) === 'dark';
const onTheme = (run) => {
  media.addEventListener('change', run);
  new MutationObserver(run).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
};

// Stars: drawn once on a flat canvas, at night only.
function stars() {
  const canvas = document.createElement('canvas');
  canvas.className = 'space';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.prepend(canvas);
  const draw = () => {
    const ratio = Math.min(devicePixelRatio, 2);
    canvas.width = innerWidth * ratio;
    canvas.height = innerHeight * ratio;
    const ctx = canvas.getContext('2d');
    if (!isNight()) return;
    const rand = seeded('stars');
    const count = Math.round((innerWidth * innerHeight) / 6500);
    for (let i = 0; i < count; i++) {
      const size = (0.35 + rand() ** 4 * 1.25) * ratio;
      ctx.fillStyle = `rgba(${225 + rand() * 30}, ${230 + rand() * 25}, 255, ${0.25 + rand() ** 2 * 0.7})`;
      ctx.beginPath();
      ctx.arc(rand() * canvas.width, rand() * canvas.height, size, 0, 7);
      ctx.fill();
    }
  };
  addEventListener('resize', draw);
  onTheme(draw);
  draw();
}

function garden() {
  const canvas = document.createElement('canvas');
  canvas.className = 'garden';
  canvas.setAttribute('aria-hidden', 'true');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
  } catch {
    return; // no WebGL: the page keeps its plain background
  }
  document.body.prepend(canvas);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const rand = seeded(location.pathname);
  const between = (lo, hi) => lo + rand() * (hi - lo);
  const shift = [between(0, 50), between(0, 50), between(0, 50)];
  const perlin = new ImprovedNoise();
  // Layered noise: `sharp` folds it into ridges, as on broken rock.
  const fbm = (x, y, z, octaves = 4, sharp = false) => {
    let sum = 0;
    let size = 1;
    let weight = 0.5;
    for (let i = 0; i < octaves; i++) {
      const n = perlin.noise(x * size + shift[0], y * size + shift[1], z * size + shift[2]);
      sum += weight * (sharp ? 1 - 2 * Math.abs(n) : n);
      size *= 2.1;
      weight *= 0.5;
    }
    return sum;
  };

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(26, 1, 1, 80);
  camera.position.set(0, 14, 26.5);
  camera.lookAt(0, -2.5, 0);

  // Light: a low sun or moon with shadows, sky fill, a back light that
  // outlines the rock, and soft reflected light from all around.
  const sun = new THREE.DirectionalLight();
  sun.position.set(-9, 7, 4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -6.4, right: 6.4, top: 6.4, bottom: -6.4, near: 1, far: 40 });
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.04;
  sun.shadow.radius = 5;
  const sky = new THREE.HemisphereLight();
  const back = new THREE.DirectionalLight();
  back.position.set(6, -2, -9);
  const under = new THREE.DirectionalLight();
  under.position.set(-4, -7, 8);
  scene.add(sun, sky, back, under);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const island = new THREE.Group();
  scene.add(island);

  // The island's outline is an uneven circle.
  const phase = [rand() * 6.28, rand() * 6.28, rand() * 6.28];
  const rimAt = (a) => R * (1 + 0.055 * Math.sin(2 * a + phase[0]) + 0.035 * Math.sin(3 * a + phase[1]) + 0.05 * fbm(Math.cos(a) * 1.3, Math.sin(a) * 1.3, 3, 3));
  const inside = (x, z, pad) => Math.hypot(x, z) < rimAt(Math.atan2(z, x)) - pad;

  // Turns a greyscale height picture into a normal map.
  const SIZE = innerWidth < 960 ? 1024 : 2048;
  const sheet = (size = SIZE) => {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    return c;
  };
  const normalsFrom = (heights, strength) => {
    const size = heights.width;
    const src = heights.getContext('2d').getImageData(0, 0, size, size).data;
    const out = new ImageData(size, size);
    const at = (x, y) => src[(((y + size) % size) * size + ((x + size) % size)) * 4] / 255;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = (at(x - 1, y) - at(x + 1, y)) * strength;
        const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
        const k = 1 / Math.hypot(dx, dy, 1);
        const i = (y * size + x) * 4;
        out.data[i] = (dx * k * 0.5 + 0.5) * 255;
        out.data[i + 1] = (dy * k * 0.5 + 0.5) * 255;
        out.data[i + 2] = (k * 0.5 + 0.5) * 255;
        out.data[i + 3] = 255;
      }
    }
    const c = sheet(size);
    c.getContext('2d').putImageData(out, 0, 0);
    const texture = new THREE.CanvasTexture(c);
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return { texture, src };
  };

  // Rock surface: mottled colour, with cracks and pits in the relief.
  const rockColour = sheet(512);
  const rockHeights = sheet(512);
  {
    const colour = rockColour.getContext('2d');
    const height = rockHeights.getContext('2d');
    const tint = colour.createImageData(512, 512);
    const relief = height.createImageData(512, 512);
    for (let y = 0; y < 512; y++) {
      for (let x = 0; x < 512; x++) {
        const broad = fbm(x / 90, y / 90, 7, 4);
        const fine = fbm(x / 14, y / 14, 11, 3, true);
        const i = (y * 512 + x) * 4;
        const shade = 0.82 + broad * 0.5 + fine * 0.1;
        tint.data[i] = 118 * shade;
        tint.data[i + 1] = 111 * shade;
        tint.data[i + 2] = 101 * shade;
        tint.data[i + 3] = 255;
        const lift = 128 + broad * 70 + fine * 90;
        relief.data[i] = relief.data[i + 1] = relief.data[i + 2] = lift;
        relief.data[i + 3] = 255;
      }
    }
    colour.putImageData(tint, 0, 0);
    height.putImageData(relief, 0, 0);
    for (let i = 0; i < 26; i++) {
      // a crack: a thin dark line that wanders
      let x = Math.random() * 512;
      let y = Math.random() * 512;
      let turn = Math.random() * 6.28;
      height.strokeStyle = 'rgba(0, 0, 0, 0.75)';
      colour.strokeStyle = 'rgba(30, 26, 22, 0.35)';
      height.lineWidth = colour.lineWidth = 1 + Math.random() * 1.4;
      height.beginPath();
      colour.beginPath();
      for (let k = 0; k < 28; k++) {
        height.lineTo(x, y);
        colour.lineTo(x, y);
        turn += (Math.random() - 0.5) * 0.9;
        x += Math.cos(turn) * 9;
        y += Math.sin(turn) * 9;
      }
      height.stroke();
      colour.stroke();
    }
  }
  const rockMap = new THREE.CanvasTexture(rockColour);
  rockMap.colorSpace = THREE.SRGBColorSpace;
  const rockNormal = normalsFrom(rockHeights, 5).texture;
  for (const t of [rockMap, rockNormal]) {
    t.wrapS = t.wrapT = THREE.MirroredRepeatWrapping;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  }

  // A boulder: a lump of noise with flat breaks sliced into it, hard edges
  // where the breaks meet, and moss gathered on the top.
  const stoneGrey = new THREE.Color('#ffffff');
  const mossGreen = new THREE.Color('#7f8f5c');
  const boulder = (radius, squash, { rnd = rand, cuts = 7, moss = 0.7, detail = 30 } = {}) => {
    const g = new THREE.SphereGeometry(radius, detail, Math.round(detail * 0.7));
    const at = g.attributes.position;
    const v = new THREE.Vector3();
    const offset = rnd() * 40;
    const planes = [];
    for (let i = 0; i < cuts; i++) planes.push({ n: new THREE.Vector3(rnd() - 0.5, rnd() * 0.9 - 0.15, rnd() - 0.5).normalize(), d: radius * (0.66 + rnd() * 0.24) });
    const shades = [];
    for (let i = 0; i < at.count; i++) {
      v.fromBufferAttribute(at, i);
      const n = v.clone().divideScalar(radius);
      v.multiplyScalar(1 + 0.2 * fbm(n.x * 1.3 + offset, n.y * 1.3, n.z * 1.3, 3));
      for (const plane of planes) {
        const over = v.dot(plane.n) - plane.d;
        if (over > 0) v.addScaledVector(plane.n, -over);
      }
      at.setXYZ(i, v.x * squash[0], v.y * squash[1], v.z * squash[2]);
      const green = Math.min(1, Math.max(0, (n.y - 0.25 + 0.9 * fbm(n.x * 2.4 + offset, n.y * 2.4, n.z * 2.4, 3)) * 2.4)) * moss;
      const c = stoneGrey.clone().lerp(mossGreen, green);
      shades.push(c.r, c.g, c.b);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(shades, 3));
    return toCreasedNormals(g, 0.55);
  };

  // Three stones in one group to one side: tall, low, and small.
  const centre = rand() * 6.28;
  const group = { x: Math.cos(centre) * 1.5, z: Math.sin(centre) * 1.5 };
  const turn = rand() * 6.28;
  const stones = [
    { x: group.x, z: group.z, r: 0.66, squash: [1, 1.15, 0.85], rings: 4 },
    { x: group.x + Math.cos(turn) * 2.2, z: group.z + Math.sin(turn) * 2.2, r: 0.52, squash: [1.3, 0.55, 1], rings: 2 },
    { x: group.x + Math.cos(turn + 2.3) * 0.9, z: group.z + Math.sin(turn + 2.3) * 0.9, r: 0.28, squash: [1, 0.8, 1.1], rings: 0 },
  ];
  for (const s of stones) s.field = s.rings ? s.r * 1.05 + 0.12 + s.rings * SPACING : 0;

  // Sand: a colour picture and a height picture. The heights shape the
  // surface itself and also light the fine grain.
  const px = (v) => (v / EXTENT / 2 + 0.5) * SIZE;
  const len = (v) => (v / EXTENT / 2) * SIZE;
  const rake = (ctx, colour, flat, width) => {
    ctx.strokeStyle = colour;
    ctx.lineCap = 'round';
    let row = 0;
    for (let z = -EXTENT; z <= EXTENT; z += SPACING) {
      row++;
      ctx.lineWidth = len(width * (1 + 0.16 * Math.sin(row * 2.7 + phase[1]))); // the rake is never perfectly even
      ctx.beginPath();
      for (let x = -EXTENT; x <= EXTENT; x += 0.08) ctx.lineTo(px(x), px(z + 0.05 * fbm(x * 0.5, z * 0.5, 5, 2) + 0.012 * Math.sin(x * 4.1 + row)));
      ctx.stroke();
    }
    for (const s of stones) {
      if (!s.rings) continue;
      // clear the straight rows around the stone, feathered at the edge
      const edge = ctx.createRadialGradient(px(s.x), px(s.z), len(s.field + SPACING * 0.2), px(s.x), px(s.z), len(s.field + SPACING * 1.1));
      edge.addColorStop(0, flat);
      edge.addColorStop(1, flat.replace(/[\d.]+\)$/, '0)'));
      ctx.fillStyle = edge;
      ctx.beginPath();
      ctx.arc(px(s.x), px(s.z), len(s.field + SPACING * 1.1), 0, 7);
      ctx.fill();
      ctx.lineWidth = len(width);
      for (let k = 0; k < s.rings; k++) {
        ctx.beginPath();
        ctx.arc(px(s.x), px(s.z), len(s.r * 1.05 + 0.12 + (k + 0.5) * SPACING), 0, 7);
        ctx.stroke();
      }
    }
  };
  const speckle = (ctx, count, shades) => {
    for (let i = 0; i < count; i++) {
      ctx.fillStyle = shades[i % shades.length];
      ctx.fillRect(Math.random() * SIZE, Math.random() * SIZE, 1 + Math.random(), 1 + Math.random());
    }
  };
  const grains = (SIZE * SIZE) / 40;

  const colourSheet = sheet();
  {
    const ctx = colourSheet.getContext('2d');
    ctx.fillStyle = '#d9c9a6';
    ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.filter = `blur(${SIZE / 700}px)`;
    rake(ctx, 'rgba(110, 88, 55, 0.16)', 'rgba(217, 201, 166, 1)', 0.1);
    ctx.filter = 'none';
    // sand is never one even tone: broad soft patches, a few percent lighter or darker
    for (let i = 0; i < 46; i++) {
      const x = Math.random() * SIZE;
      const y = Math.random() * SIZE;
      const r = SIZE * (0.05 + Math.random() * 0.1);
      const patch = ctx.createRadialGradient(x, y, 0, x, y, r);
      patch.addColorStop(0, i % 2 ? 'rgba(70, 52, 28, 0.07)' : 'rgba(255, 250, 235, 0.09)');
      patch.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = patch;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // damp sand, darker, right where each stone sits
    for (const s of stones) {
      const damp = ctx.createRadialGradient(px(s.x), px(s.z), len(s.r * 0.8), px(s.x), px(s.z), len(s.r * 1.35));
      damp.addColorStop(0, 'rgba(60, 44, 24, 0.5)');
      damp.addColorStop(1, 'rgba(60, 44, 24, 0)');
      ctx.fillStyle = damp;
      ctx.fillRect(px(s.x - s.r * 2), px(s.z - s.r * 2), len(s.r * 4), len(s.r * 4));
    }
    speckle(ctx, grains, ['rgba(90, 72, 45, 0.16)', 'rgba(255, 248, 230, 0.2)', 'rgba(60, 48, 30, 0.1)']);
  }
  const sandMap = new THREE.CanvasTexture(colourSheet);
  sandMap.colorSpace = THREE.SRGBColorSpace;
  sandMap.anisotropy = renderer.capabilities.getMaxAnisotropy();

  const heights = sheet();
  {
    const h = heights.getContext('2d');
    h.fillStyle = '#a0a0a0';
    h.fillRect(0, 0, SIZE, SIZE);
    h.filter = `blur(${SIZE / 330}px)`; // a wide blur turns each line into a rounded trough
    rake(h, 'rgba(20, 20, 20, 1)', 'rgba(160, 160, 160, 1)', 0.12);
    // sand banked up around each stone
    for (const s of stones) {
      h.strokeStyle = 'rgba(245, 245, 245, 0.9)';
      h.lineWidth = len(0.13);
      h.beginPath();
      h.arc(px(s.x), px(s.z), len(s.r * 1.06), 0, 7);
      h.stroke();
    }
    h.filter = 'none';
    speckle(h, grains * 2.5, ['rgba(255, 255, 255, 0.09)', 'rgba(0, 0, 0, 0.09)']);
  }
  const sandRelief = normalsFrom(heights, SIZE / 170);
  const heightAt = (x, z) => {
    const col = Math.min(SIZE - 1, Math.max(0, Math.round(px(x))));
    const row = Math.min(SIZE - 1, Math.max(0, Math.round(px(z))));
    return (sandRelief.src[(row * SIZE + col) * 4] / 255 - 0.627) * 0.085;
  };
  const sandLook = new THREE.MeshStandardMaterial({ map: sandMap, normalMap: sandRelief.texture, roughness: 1, envMapIntensity: 0.4 });
  {
    const rings = 150;
    const spokes = 260;
    const spots = [0, heightAt(0, 0), 0];
    const uvs = [0.5, 0.5];
    const faces = [];
    for (let i = 1; i <= rings; i++) {
      for (let j = 0; j < spokes; j++) {
        const a = (j / spokes) * Math.PI * 2;
        const r = (i / rings) * rimAt(a) * 0.985;
        const x = Math.cos(a) * r;
        const z = Math.sin(a) * r;
        spots.push(x, heightAt(x, z), z);
        uvs.push(x / EXTENT / 2 + 0.5, 0.5 - z / EXTENT / 2);
      }
    }
    const at = (i, j) => 1 + (i - 1) * spokes + (j % spokes);
    for (let j = 0; j < spokes; j++) faces.push(0, at(1, j + 1), at(1, j));
    for (let i = 1; i < rings; i++) {
      for (let j = 0; j < spokes; j++) faces.push(at(i, j), at(i + 1, j + 1), at(i + 1, j), at(i, j), at(i, j + 1), at(i + 1, j + 1));
    }
    const shape = new THREE.BufferGeometry();
    shape.setAttribute('position', new THREE.Float32BufferAttribute(spots, 3));
    shape.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    shape.setIndex(faces);
    shape.computeVertexNormals();
    const sand = new THREE.Mesh(shape, sandLook);
    sand.receiveShadow = true;
    island.add(sand);
  }

  // The rock: its top edge rises unevenly around the sand as a natural
  // rim, then the mass below breaks into ridges and narrows to a point.
  const rockLook = new THREE.MeshStandardMaterial({ map: rockMap, normalMap: rockNormal, normalScale: new THREE.Vector2(1.6, 1.6), vertexColors: true, roughness: 0.97, envMapIntensity: 0.5 });
  {
    const T = 220;
    const steps = 46;
    const spots = [];
    const shades = [];
    const uvs = [];
    const faces = [];
    const edge = (a, k) => fbm(Math.cos(a) * k, Math.sin(a) * k, 9 + k, 3); // noise that joins up around the rim
    let count = 0;
    const ring = (place) => {
      count++;
      for (let j = 0; j <= T; j++) {
        const a = (j / T) * Math.PI * 2;
        const [r, y, shade, v] = place(a);
        spots.push(Math.cos(a) * r, y, Math.sin(a) * r);
        shades.push(shade, shade, shade);
        uvs.push((j / T) * 7, v);
      }
    };
    ring((a) => [rimAt(a) * 0.92, -0.06, 0.9, 0]); // under the sand
    ring((a) => [rimAt(a) * (0.97 + 0.02 * edge(a, 2.6)), 0.05 + 0.1 * (edge(a, 3.4) + 0.4), 1.0, 0.05]); // inner lip
    ring((a) => [rimAt(a) * (1.005 + 0.03 * edge(a, 2.1)), 0.07 + 0.15 * (edge(a, 3.4) + 0.4) + 0.07 * edge(a, 7), 1.04, 0.12]); // crest
    ring((a) => [rimAt(a) * (1.04 + 0.03 * edge(a, 2.1)), -0.05 + 0.08 * edge(a, 5), 0.95, 0.2]);
    for (let k = 1; k <= steps; k++) {
      const v = k / steps;
      const y0 = -0.03 - 5.5 * v;
      ring((a) => {
        const x = Math.cos(a);
        const z = Math.sin(a);
        const crag = Math.min(1, v * 5);
        const ridges = 0.44 * fbm(x * 1.1, y0 * 0.42, z * 1.1, 5, true) + 0.12 * fbm(x * 3.3, y0 * 1.2, z * 3.3, 3);
        const r = rimAt(a) * 1.04 * (1 - v) ** 1.08 * (1 + crag * ridges) + crag * 0.1 * (1 - v);
        const y = y0 + crag * 0.22 * fbm(x * 1.6, y0 * 0.5, z * 1.6, 3);
        const hollow = 0.72 + 0.9 * Math.max(-0.3, ridges); // darker in the hollows between ridges
        return [Math.max(0.02, r), y, hollow * (1 - 0.42 * v) * (v < 0.14 ? 0.8 : 1), 0.2 + v * 3.2];
      });
    }
    for (let i = 0; i < count - 1; i++) {
      for (let j = 0; j < T; j++) {
        const a = i * (T + 1) + j;
        const b = a + T + 1;
        faces.push(a, a + 1, b, b, a + 1, b + 1);
      }
    }
    const shape = new THREE.BufferGeometry();
    shape.setAttribute('position', new THREE.Float32BufferAttribute(spots, 3));
    shape.setAttribute('color', new THREE.Float32BufferAttribute(shades, 3));
    shape.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    shape.setIndex(faces);
    shape.computeVertexNormals();
    const body = new THREE.Mesh(shape, rockLook);
    body.castShadow = body.receiveShadow = true;
    island.add(body);
  }

  const stoneLook = new THREE.MeshStandardMaterial({ map: rockMap, normalMap: rockNormal, normalScale: new THREE.Vector2(1.2, 1.2), vertexColors: true, roughness: 0.93, envMapIntensity: 0.5 });
  for (const s of stones) {
    const mesh = new THREE.Mesh(boulder(s.r, s.squash), stoneLook);
    mesh.position.set(s.x, s.r * s.squash[1] * 0.3, s.z); // bedded into the sand
    mesh.rotation.set(between(-0.15, 0.15), rand() * 6, between(-0.15, 0.15));
    mesh.castShadow = mesh.receiveShadow = true;
    island.add(mesh);
  }

  // A short trail of chips hangs below the tip, smaller the further down.
  [0.22, 0.14, 0.09, 0.055].forEach((size, i) => {
    const mesh = new THREE.Mesh(boulder(size, [1, between(0.7, 1), between(0.7, 1.1)], { cuts: 5, moss: 0, detail: 12 }), stoneLook);
    mesh.position.set(between(-0.5, 0.5), -5.95 - i * 0.42, between(-0.4, 0.4));
    mesh.rotation.set(rand() * 6, rand() * 6, 0);
    mesh.castShadow = true;
    island.add(mesh);
  });

  // The box is filled with the page's own background colour, so it never
  // shows. At night a faint glow is painted into it behind the rock, which
  // keeps the rock's outline readable against the dark.
  const backdrop = (night) => {
    const c = sheet(512);
    const g = c.getContext('2d');
    g.fillStyle = night ? '#0d0f14' : '#f6f3ec';
    g.fillRect(0, 0, 512, 512);
    if (night) {
      const haze = g.createRadialGradient(256, 262, 0, 256, 262, 215);
      haze.addColorStop(0, 'rgba(96, 124, 205, 0.26)');
      haze.addColorStop(0.55, 'rgba(70, 95, 175, 0.1)');
      haze.addColorStop(1, 'rgba(60, 80, 160, 0)');
      g.fillStyle = haze;
      g.fillRect(0, 0, 512, 512);
    }
    const texture = new THREE.CanvasTexture(c);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  };
  const backdrops = { day: backdrop(false), night: backdrop(true) };

  // Trees: pruned garden trees. Each pad of foliage is a cluster of many
  // small leaves on its own branch.
  const bark = new THREE.MeshStandardMaterial({ color: '#4d3f31', roughness: 1, envMapIntensity: 0.3 });
  const foliage = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true, envMapIntensity: 0.3 });
  const up = new THREE.Vector3(0, 1, 0);
  const stick = (from, to, wideFrom, wideTo) => {
    const span = to.clone().sub(from);
    const g = new THREE.CylinderGeometry(wideTo, wideFrom, span.length(), 7).translate(0, span.length() / 2, 0);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, span.clone().normalize()));
    return g.translate(from.x, from.y, from.z);
  };
  const key = `space-garden:${location.pathname}`;
  let trees = [];
  try {
    trees = JSON.parse(localStorage.getItem(key)) || [];
  } catch {}
  const buildTree = (tree, grown) => {
    const pick = seeded(`${tree.x},${tree.z}`);
    const h = tree.s;
    const wood = [];
    const leaf = [];
    const tone = tree.t === 0 ? [0.1, 0.19, 0.11] : [0.2, 0.29, 0.12]; // pine is darker and bluer
    const pad = (at, wide, flat) => {
      const leaves = 34;
      for (let i = 0; i < leaves; i++) {
        const a = pick() * 6.28;
        const far = Math.sqrt(pick());
        const lift = (pick() - 0.35) * flat;
        const g = new THREE.IcosahedronGeometry(wide * (0.2 + pick() * 0.16), 0);
        g.rotateX(pick() * 3).rotateY(pick() * 3);
        g.translate(at.x + Math.cos(a) * far * wide, at.y + lift * wide * (1 - far * 0.6), at.z + Math.sin(a) * far * wide);
        const light = 0.62 + 0.55 * (lift / flat + 0.35) + (pick() - 0.5) * 0.18; // darker underneath, lighter on top
        const shades = [];
        for (let k = 0; k < g.attributes.position.count; k++) shades.push(tone[0] * light, tone[1] * light, tone[2] * light);
        g.setAttribute('color', new THREE.Float32BufferAttribute(shades, 3));
        leaf.push(g);
      }
    };
    const v = (x, y, z) => new THREE.Vector3(x * h, y * h, z * h);
    const lean = (pick() - 0.5) * 0.3;
    if (tree.t === 0) {
      // pine: a trunk that sways, with flat pads on short branches up both sides
      const joints = [v(0, 0, 0), v(lean * 0.4, 0.34, 0.03), v(lean * 0.2, 0.66, -0.03), v(lean * 0.5, 0.95, 0)];
      joints.slice(1).forEach((p, i) => wood.push(stick(joints[i], p, h * (0.075 - i * 0.02), h * (0.055 - i * 0.02))));
      for (let i = 0; i < 5; i++) {
        const t = 0.3 + i * 0.16;
        const side = i % 2 ? 1 : -1;
        const a = pick() * 6.28;
        const from = v(lean * t * 0.5, t, 0);
        const reach = (0.34 - i * 0.055) * (i === 4 ? 0.2 : 1);
        const to = v(lean * t * 0.5 + Math.cos(a) * reach * side, t + 0.05, Math.sin(a) * reach);
        if (i < 4) wood.push(stick(from, to, h * 0.022, h * 0.012));
        pad(to, h * (0.27 - i * 0.035), 0.34);
      }
    } else if (tree.t === 1) {
      // cloud-pruned tree: a bent trunk that forks, each fork ending in a pad
      const fork = v(0.12 + lean, 0.42, 0);
      wood.push(stick(v(0, 0, 0), fork, h * 0.08, h * 0.05));
      const ends = [v(0.3 + lean, 0.86, 0.05), v(-0.26 + lean, 0.66, 0.12), v(0.44 + lean, 0.52, -0.16), v(-0.02 + lean, 1.04, -0.08)];
      ends.forEach((end, i) => {
        wood.push(stick(fork, end, h * 0.04, h * 0.016));
        pad(end, h * [0.3, 0.24, 0.2, 0.17][i], 0.42);
      });
    } else {
      // a low mound of shrub
      pad(v(0, 0.1, 0), h * 0.32, 0.5);
      pad(v(0.22, 0.08, 0.1), h * 0.2, 0.5);
    }
    const g = new THREE.Group();
    if (wood.length) {
      const trunk = new THREE.Mesh(mergeGeometries(wood), bark);
      trunk.castShadow = true;
      g.add(trunk);
    }
    const crown = new THREE.Mesh(mergeGeometries(leaf), foliage);
    crown.castShadow = crown.receiveShadow = true;
    g.add(crown);
    g.position.set(tree.x, 0, tree.z);
    g.rotation.y = pick() * 6;
    g.scale.setScalar(grown ? 1 : 0.02);
    island.add(g);
    return g;
  };
  trees.forEach((tree) => buildTree(tree, true));

  // The gardener: tiny and solid, in dark work clothes and a pale straw hat.
  const cloth = new THREE.MeshStandardMaterial({ color: '#2f3947', roughness: 1 });
  const skin = new THREE.MeshStandardMaterial({ color: '#c9b08e', roughness: 1 });
  const straw = new THREE.MeshStandardMaterial({ color: '#f0e0b0', roughness: 1 });
  const handle = new THREE.MeshStandardMaterial({ color: '#6a5540', roughness: 1 });
  const solid = (geometry, material, parent, x = 0, y = 0, z = 0) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  };
  const figure = new THREE.Group();
  figure.scale.setScalar(1.3);
  const torso = new THREE.Group();
  torso.position.y = 0.2;
  solid(new THREE.CapsuleGeometry(0.05, 0.12, 4, 10), cloth, torso, 0, 0.11);
  solid(new THREE.SphereGeometry(0.042, 14, 10), skin, torso, 0, 0.255);
  solid(new THREE.ConeGeometry(0.13, 0.055, 16), straw, torso, 0, 0.3);
  const arm = solid(new THREE.CapsuleGeometry(0.016, 0.1, 3, 6).translate(0, -0.06, 0), cloth, torso, 0.03, 0.18, 0.04);
  arm.rotation.z = 1.0;
  const rakeTool = solid(new THREE.CylinderGeometry(0.008, 0.008, 0.5, 6).translate(0, -0.25, 0), handle, torso, 0.12, 0.26, 0.04);
  rakeTool.rotation.z = 0.3;
  solid(new THREE.BoxGeometry(0.02, 0.012, 0.13), handle, rakeTool, 0, -0.5, 0);
  const leg = () => solid(new THREE.CapsuleGeometry(0.022, 0.14, 3, 6).translate(0, -0.09, 0), cloth, figure, 0, 0.2, 0);
  const legA = leg();
  const legB = leg();
  legA.position.z = 0.025;
  legB.position.z = -0.025;
  figure.add(torso);
  island.add(figure);

  // Where the gardener may walk and plant: open sand, away from the rim,
  // the stones and their rings.
  const blocked = (x, z, pad) => !inside(x, z, 0.8 + pad) || stones.some((s) => Math.hypot(x - s.x, z - s.z) < Math.max(s.field, s.r * 1.4) + pad);
  const crosses = (x1, z1, x2, z2) => {
    for (let t = 0; t <= 1; t += 0.05) if (blocked(x1 + (x2 - x1) * t, z1 + (z2 - z1) * t, 0)) return true;
    return false;
  };
  const spot = (from) => {
    for (let i = 0; i < 80; i++) {
      const a = Math.random() * Math.PI * 2;
      const far = (0.45 + 0.4 * Math.random()) * rimAt(a);
      const x = Math.cos(a) * far;
      const z = Math.sin(a) * far;
      if (blocked(x, z, 0.3)) continue;
      if (trees.some((t) => Math.hypot(t.x - x, t.z - z) < 1.3)) continue;
      if (from && crosses(from.x, from.z, x, z)) continue;
      return { x, z };
    }
    return null;
  };
  const me = spot() || { x: 0, z: R - 1.6 };
  let state = 'rest';
  let until = 2;
  let target = null;
  let growing = null;
  let stride = 0;

  const tend = (now, dt) => {
    if (state === 'rest' && now > until) {
      target = spot(me);
      if (target) state = 'walk';
      else until = now + 8;
    } else if (state === 'walk') {
      const dx = target.x - me.x;
      const dz = target.z - me.z;
      const far = Math.hypot(dx, dz);
      const move = 0.16 * dt; // a slow walk
      if (far <= move) {
        me.x = target.x;
        me.z = target.z;
        const planting = trees.length < MOST_TREES;
        state = planting ? 'plant' : 'rest';
        until = now + (planting ? 2.6 : 14 + Math.random() * 10);
      } else {
        me.x += (dx / far) * move;
        me.z += (dz / far) * move;
        figure.rotation.y = Math.atan2(dx, dz) - Math.PI / 2;
        stride += dt * 5;
      }
    } else if (state === 'plant' && now > until) {
      const ahead = new THREE.Vector3(0.5, 0, 0).applyAxisAngle(up, figure.rotation.y);
      const tree = { x: +(me.x + ahead.x).toFixed(2), z: +(me.z + ahead.z).toFixed(2), t: Math.floor(Math.random() * 3), s: +(1.2 + Math.random() * 0.5).toFixed(2) };
      trees.push(tree);
      try {
        localStorage.setItem(key, JSON.stringify(trees));
      } catch {}
      growing = { tree: buildTree(tree, false), from: now };
      state = 'rest';
      until = now + 9 + Math.random() * 7;
    }
    if (growing) {
      const k = Math.min(1, (now - growing.from) / 6);
      growing.tree.scale.setScalar(Math.max(0.02, 1 - (1 - k) ** 3));
      if (k === 1) growing = null;
    }
    const swing = state === 'walk' ? Math.sin(stride) * 0.5 : 0.06;
    legA.rotation.z = swing;
    legB.rotation.z = -swing;
    torso.rotation.z = state === 'plant' ? -0.55 : 0;
    rakeTool.rotation.z = 0.3 + (state === 'rest' ? Math.sin(now * 0.7) * 0.06 : 0);
    figure.position.set(me.x, 0, me.z);
  };

  // Drawing goes through a second pass that darkens creases and contact
  // points, which is most of what makes small objects look solid.
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(4, 4, { samples: 4, type: THREE.HalfFloatType }));
  composer.addPass(new RenderPass(scene, camera));
  const contact = new GTAOPass(scene, camera, 4, 4);
  contact.updateGtaoMaterial({ radius: 0.55, distanceExponent: 1.4, thickness: 1.3, scale: 1.25, samples: 16 });
  composer.addPass(contact);
  composer.addPass(new OutputPass());

  let now = 0;
  const draw = () => {
    island.rotation.y = 0.5 + now * 0.012;
    island.position.y = Math.sin(now * 0.25) * 0.07;
    composer.render();
  };

  // Colours follow the page theme: warm low daylight, or cool moonlight.
  const theme = () => {
    const night = isNight();
    scene.background = night ? backdrops.night : backdrops.day;
    sun.color.set(night ? '#c3d0ff' : '#fff0da');
    sun.intensity = night ? 1.55 : 2.25;
    sky.color.set(night ? '#31406a' : '#fffaf0');
    sky.groundColor.set(night ? '#0e1426' : '#9a8c70');
    sky.intensity = night ? 0.4 : 0.62;
    back.color.set(night ? '#8fb0ff' : '#ffe2c2');
    back.intensity = night ? 1.5 : 0.35;
    under.color.set(night ? '#5d7ad0' : '#ecd9b8');
    under.intensity = night ? 0.8 : 0.3;
    scene.environmentIntensity = night ? 0.1 : 0.34;
    sandLook.roughness = night ? 0.72 : 1; // a faint silver sheen on the ridges under the moon
    sandLook.color.set(night ? '#cfd6ea' : '#ffffff'); // moonlit sand is cooler
    canvas.classList.toggle('garden-night', night);
    draw();
  };

  // On wide screens the box sits in the right-hand margin, clear of the
  // text. Otherwise it sits at the bottom of the window, behind the text.
  const place = () => {
    const w = innerWidth;
    const h = innerHeight;
    const rem = parseFloat(getComputedStyle(root).fontSize);
    const gutter = (w - 38 * rem) / 2 - 1.5 * rem; // space beside the text column
    const wide = gutter >= 250;
    const size = Math.round(wide ? Math.min(gutter - 30, h * 0.72, 620) : Math.min(w * 0.72, h * 0.4));
    canvas.classList.toggle('garden-low', !wide);
    canvas.style.width = canvas.style.height = `${size}px`;
    canvas.style.left = `${Math.round(wide ? w - gutter + (gutter - size) / 2 - 18 : (w - size) / 2)}px`;
    canvas.style.top = `${Math.round(wide ? h * 0.46 - size / 2 : h - size * 0.98)}px`;
    const ratio = Math.min(devicePixelRatio, 2);
    renderer.setPixelRatio(ratio);
    renderer.setSize(size, size, false);
    composer.setPixelRatio(ratio);
    composer.setSize(size, size);
    draw();
  };

  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
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

  addEventListener('resize', place);
  onTheme(theme);
  figure.position.set(me.x, 0, me.z);
  place();
  theme();
  if (!still) {
    requestAnimationFrame((ms) => {
      last = ms;
      tick(ms);
    });
  }
}

stars();
garden();
