// The page background: a small raked-sand garden on a rock floating in
// space, drawn with three.js. A tiny gardener tends it and plants trees,
// which are saved per page in the visitor's browser.
//
// The rock, the garden stones and the tree are photoscanned models from
// Poly Haven (CC0), in public/models; see the README for credits. The sand and the gardener are made
// here in code.
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
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const R = 5; // rough island radius, in world units
const EXTENT = R * 1.25; // half-width of the area the sand textures cover
const SPACING = 0.25; // gap between rake lines
const MOST_TREES = 3;

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

async function garden() {
  const canvas = document.createElement('canvas');
  canvas.className = 'garden';
  canvas.setAttribute('aria-hidden', 'true');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true }); // keeps the last picture on frames that are skipped
  } catch {
    return; // no WebGL: the page keeps its plain background
  }

  // The models load in the background; nothing shows until they are in.
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  let models;
  try {
    models = await Promise.all(['island', 'stones', 'jacaranda'].map((name) => loader.loadAsync(`/models/${name}.glb`)));
  } catch {
    return;
  }
  const [islandModel, stonesModel, treeModel] = models;
  document.body.prepend(canvas);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  canvas.addEventListener('webglcontextlost', () => canvas.remove()); // if the graphics card gives up, leave the plain page

  const rand = seeded(location.pathname);
  const between = (lo, hi) => lo + rand() * (hi - lo);
  const phase = [rand() * 6.28, rand() * 6.28, rand() * 6.28];

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(); // set to the page's own colour, so the box never shows
  const camera = new THREE.PerspectiveCamera(28, 1, 1, 90);
  camera.position.set(0, 13, 25);
  camera.lookAt(0, -3.3, 0);

  // Light: a low sun or moon with shadows, sky fill, a back light that
  // outlines the rock, and a little soft reflected light from all around.
  const sun = new THREE.DirectionalLight();
  sun.position.set(-9, 7, 4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 2, far: 34 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.025;
  sun.shadow.radius = 2.5;
  const sky = new THREE.HemisphereLight();
  const back = new THREE.DirectionalLight();
  back.position.set(6, -2, -9);
  const under = new THREE.DirectionalLight();
  under.position.set(-4, -7, 8);
  scene.add(sun, sky, back, under);
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;

  const island = new THREE.Group();
  scene.add(island);

  // Model helpers. Scanned models arrive with packed numbers and their own
  // offsets, so each is wrapped in a holder that stands on the origin.
  const meshesIn = (object) => {
    const found = [];
    object.traverse((o) => o.isMesh && found.push(o));
    return found;
  };
  const tune = (object) => {
    for (const mesh of meshesIn(object)) {
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.frustumCulled = false; // the scans' packed sizes mislead the off-screen test, which was dropping leaves
      const look = mesh.material;
      look.envMapIntensity = 0.3;
      look.vertexColors = false; // the scans keep wind data there, not colour; as colour it hides the leaves
      if (look.transparent || look.alphaTest) {
        // leaves: cut out by their texture, seen from both sides
        look.transparent = false;
        look.alphaTest = 0.2;
        look.alphaToCoverage = true; // soft leaf edges, so they do not sparkle as the rock turns
        look.side = THREE.DoubleSide;
        mesh.userData.thin = true;
      }
    }
    return object;
  };
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

  // The rock is a scanned boulder turned upside down, so its broad base is
  // the top and its crown tapers below. The top is pressed nearly flat to
  // take the sand, keeping some of its natural bumps around the edge.
  const rock = meshesIn(islandModel.scene)[0];
  rock.updateWorldMatrix(true, false);
  const rockShape = rock.geometry.clone();
  {
    const packed = rockShape.attributes.position;
    const spots = new Float32Array(packed.count * 3);
    const v = new THREE.Vector3();
    for (let i = 0; i < packed.count; i++) v.fromBufferAttribute(packed, i).applyMatrix4(rock.matrixWorld).toArray(spots, i * 3);
    rockShape.setAttribute('position', new THREE.BufferAttribute(spots, 3));
    rockShape.rotateX(Math.PI);
    rockShape.computeBoundingBox();
    const box = rockShape.boundingBox;
    const size = box.getSize(new THREE.Vector3());
    const mid = box.getCenter(new THREE.Vector3());
    rockShape.translate(-mid.x, -box.max.y, -mid.z);
    rockShape.scale((2 * R * 1.08) / size.x, 10.5 / size.y, (2 * R * 1.0) / size.z);
    rockShape.translate(0, 2.8, 0); // the top 2.8 units are what gets pressed flat
  }
  // The outline of the rock where the sand will sit, by direction.
  const BINS = 120;
  const reach = new Float32Array(BINS);
  {
    const at = rockShape.attributes.position;
    for (let i = 0; i < at.count; i++) {
      if (at.getY(i) < -0.25) continue;
      const bin = Math.floor(((Math.atan2(at.getZ(i), at.getX(i)) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2) * BINS) % BINS;
      reach[bin] = Math.max(reach[bin], Math.hypot(at.getX(i), at.getZ(i)));
    }
    const rough = Array.from(reach, (r, i) => r || reach[(i + 1) % BINS] || R);
    for (let i = 0; i < BINS; i++) {
      let sum = 0;
      for (let k = -5; k <= 5; k++) sum += rough[(i + k + BINS) % BINS];
      reach[i] = sum / 11;
    }
  }
  const rimAt = (a) => {
    const at = (((a + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2)) * BINS;
    const low = Math.floor(at) % BINS;
    const t = at - Math.floor(at);
    return reach[low] * (1 - t) + reach[(low + 1) % BINS] * t;
  };
  const SAND = 0.9; // the sand stops this far out; beyond it is bare rock
  const inside = (x, z, pad) => Math.hypot(x, z) < rimAt(Math.atan2(z, x)) * SAND - pad;
  {
    const at = rockShape.attributes.position;
    for (let i = 0; i < at.count; i++) {
      const y = at.getY(i);
      if (y <= 0) continue;
      const x = at.getX(i);
      const z = at.getZ(i);
      const out = Math.hypot(x, z) / rimAt(Math.atan2(z, x));
      const keep = 0.3 * Math.min(1, Math.max(0, (out - 0.84) / 0.14)) ** 2; // flat in the middle, bumpy at the rim
      at.setY(i, y * keep);
    }
    rockShape.deleteAttribute('normal'); // the scan's packed normals cannot hold new values; start fresh
    rockShape.computeVertexNormals();
  }
  const rockLook = rock.material;
  rockLook.envMapIntensity = 0.3;
  const body = new THREE.Mesh(rockShape, rockLook);
  body.castShadow = body.receiveShadow = true;
  island.add(body);

  // Three stones in one group to one side: tall, low, and small.
  const centre = rand() * 6.28;
  const group = { x: Math.cos(centre) * 1.2, z: Math.sin(centre) * 1.2 };
  const turn = rand() * 6.28;
  const stones = [
    { x: group.x, z: group.z, r: 0.62, rings: 4, model: 0, tall: 1.25 },
    { x: group.x + Math.cos(turn) * 2.1, z: group.z + Math.sin(turn) * 2.1, r: 0.5, rings: 2, model: 3, tall: 0.75 },
    { x: group.x + Math.cos(turn + 2.3) * 0.86, z: group.z + Math.sin(turn + 2.3) * 0.86, r: 0.27, rings: 0, model: 1, tall: 1 },
  ];
  for (const s of stones) s.field = s.rings ? s.r * 1.05 + 0.12 + s.rings * SPACING : 0;
  const scanned = meshesIn(tune(stonesModel.scene));
  const stoneAt = (index, width, tall) => {
    const source = scanned[index % scanned.length];
    source.updateWorldMatrix(true, false);
    const copy = new THREE.Mesh(source.geometry, source.material);
    copy.applyMatrix4(source.matrixWorld);
    copy.castShadow = copy.receiveShadow = true;
    const { holder, size } = standing(copy);
    const k = width / Math.max(size.x, size.z);
    holder.scale.set(k, k * tall, k);
    return { holder, height: size.y * k * tall };
  };
  for (const s of stones) {
    const { holder, height } = stoneAt(s.model, s.r * 2.1, s.tall);
    holder.position.set(s.x, -height * 0.2, s.z); // sunk well into the sand
    holder.rotation.y = rand() * 6;
    island.add(holder);
  }
  // A few chips of the same rock hang below the tip, scattered.
  [0.5, 0.34, 0.22].forEach((width, i) => {
    const { holder } = stoneAt(i + 2, width, 1);
    holder.position.set([-0.8, 1.0, 0.1][i], [-8.6, -9.2, -10][i], [0.5, -0.6, 0.9][i]);
    holder.rotation.set(rand() * 6, rand() * 6, rand() * 6);
    island.add(holder);
  });

  // Sand: a colour picture and a height picture. The heights shape the
  // surface itself and also light the fine grain.
  const SIZE = innerWidth < 960 ? 1024 : 2048;
  const sheet = () => {
    const c = document.createElement('canvas');
    c.width = c.height = SIZE;
    return c;
  };
  const px = (v) => (v / EXTENT / 2 + 0.5) * SIZE;
  const len = (v) => (v / EXTENT / 2) * SIZE;
  const wander = (x, z) => 0.05 * Math.sin(x * 0.7 + phase[0]) * Math.cos(z * 0.9 + phase[1]) + 0.025 * Math.sin(x * 1.9 + z * 1.3 + phase[2]);
  const rake = (ctx, colour, flat, width) => {
    ctx.strokeStyle = colour;
    ctx.lineCap = 'round';
    let row = 0;
    for (let z = -EXTENT; z <= EXTENT; z += SPACING) {
      row++;
      ctx.lineWidth = len(width * (1 + 0.16 * Math.sin(row * 2.7 + phase[1]))); // the rake is never perfectly even
      ctx.beginPath();
      for (let x = -EXTENT; x <= EXTENT; x += 0.08) ctx.lineTo(px(x), px(z + wander(x, z) + 0.012 * Math.sin(x * 4.1 + row)));
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
    // At the edge the rake turns: the straight rows stop short, and two
    // rows follow the edge of the sand round instead.
    const trace = (scale) => {
      ctx.beginPath();
      for (let i = 0; i <= 240; i++) {
        const a = (i / 240) * Math.PI * 2;
        ctx.lineTo(px(Math.cos(a) * rimAt(a) * SAND * scale), px(Math.sin(a) * rimAt(a) * SAND * scale));
      }
      ctx.closePath();
      ctx.stroke();
    };
    ctx.strokeStyle = flat;
    ctx.lineWidth = len(0.62);
    trace(0.985);
    ctx.strokeStyle = colour;
    ctx.lineWidth = len(width);
    trace(0.925);
    trace(0.87);
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
    ctx.fillStyle = '#d7cbb1';
    ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.filter = `blur(${SIZE / 700}px)`;
    rake(ctx, 'rgba(110, 88, 55, 0.16)', 'rgba(215, 203, 177, 1)', 0.1);
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
  const relief = heights.getContext('2d').getImageData(0, 0, SIZE, SIZE).data;
  const normalSheet = sheet();
  {
    const out = new ImageData(SIZE, SIZE);
    const strength = SIZE / 170;
    const at = (x, y) => relief[(Math.min(SIZE - 1, Math.max(0, y)) * SIZE + Math.min(SIZE - 1, Math.max(0, x))) * 4] / 255;
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
  const heightAt = (x, z) => {
    const col = Math.min(SIZE - 1, Math.max(0, Math.round(px(x))));
    const row = Math.min(SIZE - 1, Math.max(0, Math.round(px(z))));
    return (relief[(row * SIZE + col) * 4] / 255 - 0.627) * 0.085;
  };
  const sandLook = new THREE.MeshStandardMaterial({ map: sandMap, normalMap: sandNormal, roughness: 1, envMapIntensity: 0.4 });
  {
    const rings = 150;
    const spokes = 260;
    const lift = 0.09; // the sand lies a little above the flattened rock
    const spots = [0, heightAt(0, 0) + lift, 0];
    const uvs = [0.5, 0.5];
    const faces = [];
    for (let i = 1; i <= rings; i++) {
      for (let j = 0; j < spokes; j++) {
        const a = (j / spokes) * Math.PI * 2;
        const t = i / rings;
        const r = t * rimAt(a) * SAND;
        const x = Math.cos(a) * r;
        const z = Math.sin(a) * r;
        const slope = Math.max(0, (t - 0.94) / 0.06) ** 2; // the edge of the sand slopes down onto the rock
        spots.push(x, heightAt(x, z) + lift * (1 - slope) - 0.03 * slope, z);
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

  // Trees: one scanned tree, scaled to garden size. Each one the gardener
  // plants is a copy of it, turned and sized differently.
  const treeKind = tune(treeModel.scene);
  const key = `space-garden:${location.pathname}`;
  let trees = [];
  try {
    trees = JSON.parse(localStorage.getItem(key)) || [];
  } catch {}
  const buildTree = (tree, grown) => {
    const pick = seeded(`${tree.x},${tree.z}`);
    const { holder, size } = standing(treeKind.clone(true));
    holder.scale.setScalar((tree.s * (tree.t === 1 ? 1.9 : 1.45)) / size.y);
    holder.rotation.y = pick() * 6;
    const g = new THREE.Group();
    g.add(holder);
    g.position.set(tree.x, 0.05, tree.z);
    g.scale.setScalar(grown ? 1 : 0.02);
    island.add(g);
    return g;
  };
  trees.forEach((tree) => buildTree(tree, true));

  // The gardener: tiny and solid, in dark work clothes and a pale straw hat.
  const cloth = new THREE.MeshStandardMaterial({ color: '#2f3947', roughness: 1 });
  const skin = new THREE.MeshStandardMaterial({ color: '#c9b08e', roughness: 1 });
  const straw = new THREE.MeshStandardMaterial({ color: '#d9c89c', roughness: 1 });
  const handle = new THREE.MeshStandardMaterial({ color: '#6a5540', roughness: 1 });
  const solid = (geometry, material, parent, x = 0, y = 0, z = 0) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  };
  const up = new THREE.Vector3(0, 1, 0);
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

  // Where the gardener may walk and plant: open sand, away from the edge,
  // the stones and their rings.
  const blocked = (x, z, pad) => !inside(x, z, 0.7 + pad) || stones.some((s) => Math.hypot(x - s.x, z - s.z) < Math.max(s.field, s.r * 1.4) + pad);
  const crosses = (x1, z1, x2, z2) => {
    for (let t = 0; t <= 1; t += 0.05) if (blocked(x1 + (x2 - x1) * t, z1 + (z2 - z1) * t, 0)) return true;
    return false;
  };
  const spot = (from) => {
    for (let i = 0; i < 80; i++) {
      const a = Math.random() * Math.PI * 2;
      const far = (0.4 + 0.42 * Math.random()) * rimAt(a) * SAND;
      const x = Math.cos(a) * far;
      const z = Math.sin(a) * far;
      if (blocked(x, z, 0.3)) continue;
      if (trees.some((t) => Math.hypot(t.x - x, t.z - z) < 1.5)) continue;
      if (from && crosses(from.x, from.z, x, z)) continue;
      return { x, z };
    }
    return null;
  };
  const me = spot() || { x: 0, z: 2 };
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
      const tree = { x: +(me.x + ahead.x).toFixed(2), z: +(me.z + ahead.z).toFixed(2), t: trees.length % 2, s: +(1.0 + Math.random() * 0.6).toFixed(2) };
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
    figure.position.set(me.x, 0.09, me.z);
  };

  // Drawing goes through a second pass that darkens creases and contact
  // points, which is most of what makes small objects look solid. Leaves
  // are flat cut-outs, so they sit that pass out.
  class ContactPass extends GTAOPass {
    _overrideVisibility() {
      super._overrideVisibility();
      this.scene.traverse((o) => {
        if (o.userData.thin && o.visible) {
          o.visible = false;
          this._visibilityCache.push(o);
        }
      });
    }
  }
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(4, 4, { samples: 4, type: THREE.HalfFloatType }));
  composer.addPass(new RenderPass(scene, camera));
  const contact = new ContactPass(scene, camera, 4, 4);
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
  const tinted = [rockLook, ...new Set(meshesIn(stonesModel.scene).map((m) => m.material))];
  const theme = () => {
    const night = isNight();
    scene.background.set(night ? '#0d0f14' : '#f6f3ec');
    sun.color.set(night ? '#c3d0ff' : '#fff0da');
    sun.intensity = night ? 2.3 : 3.6;
    sky.color.set(night ? '#31406a' : '#fffaf0');
    sky.groundColor.set(night ? '#0e1426' : '#9a8c70');
    sky.intensity = night ? 0.35 : 0.7;
    back.color.set(night ? '#8fb0ff' : '#ffe2c2');
    back.intensity = night ? 1.5 : 0.35;
    under.color.set(night ? '#5d7ad0' : '#ecd9b8');
    under.intensity = night ? 0.8 : 0.3;
    scene.environmentIntensity = night ? 0.05 : 0.1; // only a little, or it washes out the shadows
    sandLook.roughness = night ? 0.72 : 1; // a faint silver sheen on the ridges under the moon
    sandLook.color.set(night ? '#e3e8f8' : '#ffffff'); // moonlit sand is cooler and stays lighter than the rock
    for (const look of tinted) look.color.set(night ? '#aab2cc' : '#ffffff');
    canvas.classList.toggle('garden-night', night);
    draw();
  };

  // On wide screens the box sits in the right-hand margin, clear of the
  // text. Otherwise it sits at the bottom of the window, behind the text.
  // Phones change the window height all the time while scrolling (the
  // address bar slides away), so only a change in width re-sizes the scene.
  let placedFor = 0;
  const place = () => {
    const w = innerWidth;
    if (w === placedFor) return;
    placedFor = w;
    const h = innerHeight;
    const rem = parseFloat(getComputedStyle(root).fontSize);
    const gutter = (w - 38 * rem) / 2 - 1.5 * rem; // space beside the text column
    const wide = gutter >= 250;
    const size = Math.round(wide ? Math.min(gutter - 64, h * 0.72, 620) : Math.min(w * 0.72, h * 0.4));
    canvas.classList.toggle('garden-low', !wide);
    canvas.style.width = canvas.style.height = `${size}px`;
    canvas.style.left = `${Math.round(wide ? w - gutter + (gutter - size) / 2 : (w - size) / 2)}px`;
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
  figure.position.set(me.x, 0.09, me.z);
  place();
  theme();
  requestAnimationFrame(() => canvas.classList.add('garden-ready')); // fade in once the first picture is drawn
  if (!still) {
    requestAnimationFrame((ms) => {
      last = ms;
      tick(ms);
    });
  }
}

stars();
garden();
