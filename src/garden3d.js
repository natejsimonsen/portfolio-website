// The page background: a small raked-sand garden on a rock floating in
// space, drawn with three.js. A tiny gardener tends it and plants trees,
// which are saved per page in the visitor's browser. It is fixed behind the
// text and moves very little.
import * as THREE from 'three';

const R = 5; // rough island radius, in world units
const EXTENT = R * 1.12; // half-width of the area the sand textures cover
const SPACING = 0.25; // gap between rake lines
const MOST_TREES = 5;

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

function start() {
  const canvas = document.createElement('canvas');
  canvas.className = 'space';
  canvas.setAttribute('aria-hidden', 'true');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch {
    return; // no WebGL: the page keeps its plain background
  }
  document.body.prepend(canvas);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  const rand = seeded(location.pathname);
  const between = (lo, hi) => lo + rand() * (hi - lo);
  const phase = [rand() * 6.28, rand() * 6.28, rand() * 6.28, rand() * 6.28];
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 400);

  // Lights: a low sun (or moon) that casts shadows, soft fill from the sky,
  // and a back light that separates the rock from the space behind it.
  const sun = new THREE.DirectionalLight();
  sun.position.set(-9, 6.5, 4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 1, far: 40 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  sun.shadow.radius = 4;
  const sky = new THREE.HemisphereLight();
  const back = new THREE.DirectionalLight();
  back.position.set(7, -4, -8);
  scene.add(sun, sky, back);

  const island = new THREE.Group();
  scene.add(island);

  // The island's outline is an uneven circle.
  const rimAt = (a) => R * (1 + 0.05 * Math.sin(2 * a + phase[0]) + 0.03 * Math.sin(3 * a + phase[1]) + 0.018 * Math.sin(5 * a + phase[2]));
  const inside = (x, z, pad) => Math.hypot(x, z) < rimAt(Math.atan2(z, x)) - pad;

  // A lumpy round shape with smooth shading: stones, moss, rock fragments.
  const lump = (radius, amount, squash = [1, 1, 1]) => {
    const g = new THREE.SphereGeometry(radius, 36, 26);
    const at = g.attributes.position;
    const v = new THREE.Vector3();
    const p = [rand() * 9, rand() * 9, rand() * 9];
    for (let i = 0; i < at.count; i++) {
      v.fromBufferAttribute(at, i);
      const n = v.clone().divideScalar(radius);
      const d = 1 + amount * (Math.sin(n.x * 2.3 + p[0]) * Math.cos(n.y * 2.9 + p[1]) + 0.55 * Math.sin(n.z * 4.6 + n.x * 3.1 + p[2]) + 0.3 * Math.sin(n.y * 9 + n.z * 7 + p[0]));
      at.setXYZ(i, v.x * d * squash[0], v.y * d * squash[1], v.z * d * squash[2]);
    }
    g.computeVertexNormals();
    return g;
  };

  // Three stones in one group to one side: tall, low, and small.
  const centre = rand() * 6.28;
  const group = { x: Math.cos(centre) * 1.5, z: Math.sin(centre) * 1.5 };
  const turn = rand() * 6.28;
  const stones = [
    { x: group.x, z: group.z, r: 0.62, squash: [1, 1.05, 0.85], rings: 4 },
    { x: group.x + Math.cos(turn) * 2.15, z: group.z + Math.sin(turn) * 2.15, r: 0.5, squash: [1.25, 0.5, 1], rings: 2 },
    { x: group.x + Math.cos(turn + 2.3) * 0.86, z: group.z + Math.sin(turn + 2.3) * 0.86, r: 0.27, squash: [1, 0.8, 1.1], rings: 0 },
  ];
  for (const s of stones) s.field = s.rings ? s.r * 1.05 + 0.12 + s.rings * SPACING : 0;

  // Sand: a colour map, and a height map that becomes a normal map so the
  // raked grooves catch the low light.
  const SIZE = innerWidth < 960 ? 1024 : 2048;
  const px = (v) => (v / EXTENT / 2 + 0.5) * SIZE;
  const len = (v) => (v / EXTENT / 2) * SIZE;
  const sheet = () => {
    const c = document.createElement('canvas');
    c.width = c.height = SIZE;
    return c;
  };
  const rake = (ctx, colour, flat, width) => {
    ctx.strokeStyle = colour;
    ctx.lineWidth = len(width);
    ctx.lineCap = 'round';
    for (let z = -EXTENT; z <= EXTENT; z += SPACING) {
      ctx.beginPath();
      for (let x = -EXTENT; x <= EXTENT; x += 0.1) ctx.lineTo(px(x), px(z + 0.014 * Math.sin(x * 1.3 + phase[3] + z)));
      ctx.stroke();
    }
    for (const s of stones) {
      if (!s.rings) continue;
      ctx.fillStyle = flat;
      ctx.beginPath();
      ctx.arc(px(s.x), px(s.z), len(s.field + SPACING * 0.5), 0, 7);
      ctx.fill();
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
    ctx.fillStyle = '#d6c6a3';
    ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.filter = `blur(${SIZE / 700}px)`;
    rake(ctx, 'rgba(110, 88, 55, 0.2)', '#d6c6a3', 0.1);
    ctx.filter = 'none';
    // soft dark where each stone meets the sand
    for (const s of stones) {
      const shade = ctx.createRadialGradient(px(s.x), px(s.z), len(s.r * 0.5), px(s.x), px(s.z), len(s.r * 1.7));
      shade.addColorStop(0, 'rgba(50, 38, 20, 0.5)');
      shade.addColorStop(1, 'rgba(50, 38, 20, 0)');
      ctx.fillStyle = shade;
      ctx.fillRect(px(s.x - s.r * 2), px(s.z - s.r * 2), len(s.r * 4), len(s.r * 4));
    }
    speckle(ctx, grains, ['rgba(90, 72, 45, 0.16)', 'rgba(255, 248, 230, 0.2)', 'rgba(60, 48, 30, 0.1)']);
  }
  const colourMap = new THREE.CanvasTexture(colourSheet);
  colourMap.colorSpace = THREE.SRGBColorSpace;
  colourMap.anisotropy = renderer.capabilities.getMaxAnisotropy();

  const normalSheet = sheet();
  {
    const heights = sheet();
    const h = heights.getContext('2d');
    h.fillStyle = '#a0a0a0';
    h.fillRect(0, 0, SIZE, SIZE);
    h.filter = `blur(${SIZE / 620}px)`;
    rake(h, '#303030', '#a0a0a0', 0.115);
    h.filter = 'none';
    speckle(h, grains * 1.5, ['rgba(255, 255, 255, 0.07)', 'rgba(0, 0, 0, 0.07)']);
    const src = h.getImageData(0, 0, SIZE, SIZE).data;
    const out = new ImageData(SIZE, SIZE);
    const strength = SIZE / 300;
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
  const normalMap = new THREE.CanvasTexture(normalSheet);
  normalMap.anisotropy = colourMap.anisotropy;

  const outline = new THREE.Shape();
  for (let i = 0; i < 160; i++) {
    const a = (i / 160) * Math.PI * 2;
    const r = rimAt(a) * 0.985;
    // drawn mirrored in y, because laying the shape flat flips that axis
    outline[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, -Math.sin(a) * r);
  }
  const sandShape = new THREE.ShapeGeometry(outline, 1);
  const uv = sandShape.attributes.uv;
  const flatAt = sandShape.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, flatAt.getX(i) / EXTENT / 2 + 0.5, flatAt.getY(i) / EXTENT / 2 + 0.5);
  sandShape.rotateX(-Math.PI / 2);
  const sand = new THREE.Mesh(sandShape, new THREE.MeshStandardMaterial({ map: colourMap, normalMap, roughness: 1 }));
  sand.receiveShadow = true;
  island.add(sand);

  // The rock: a low uneven kerb around the sand, then a craggy mass that
  // starts at the full width of the garden and tapers to a point.
  const rockLook = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96 });
  {
    const rings = [
      [0.975, 0.0], [0.992, 0.08], [1.03, 0.075], [1.05, -0.06], [1.03, -0.35], [0.97, -0.8], [0.89, -1.3], [0.78, -1.85],
      [0.66, -2.4], [0.53, -2.95], [0.4, -3.5], [0.28, -4.05], [0.16, -4.55], [0.07, -4.95], [0.0, -5.25],
    ];
    const T = 144;
    const spots = [];
    const shades = [];
    const faces = [];
    const base = new THREE.Color('#756e63');
    rings.forEach(([f, y0], i) => {
      const crag = Math.min(1, Math.max(0, (i - 2) / 3)); // the kerb stays close to the outline
      for (let j = 0; j <= T; j++) {
        const a = (j / T) * Math.PI * 2;
        const wob = 1 + crag * (0.13 * Math.sin(3 * a + 1.3 * y0 + phase[0]) + 0.09 * Math.sin(7 * a - 2.1 * y0 + phase[1]) + 0.05 * Math.sin(13 * a + 4 * y0 + phase[2]) + 0.025 * Math.sin(23 * a + 9 * y0));
        const r = rimAt(a) * f * wob;
        const y = y0 + crag * 0.14 * Math.sin(5 * a + y0 * 2 + phase[3]) + (i === 1 || i === 2 ? 0.035 * Math.sin(9 * a + phase[1]) + 0.02 * Math.sin(17 * a + phase[2]) : 0);
        spots.push(Math.cos(a) * r, y, Math.sin(a) * r);
        const band = 0.84 + 0.16 * Math.sin(y * 5.5 + a * 0.8 + phase[0]) + (i < 4 ? 0.14 : 0); // strata, and a paler kerb
        shades.push(base.r * band, base.g * band, base.b * band);
      }
    });
    for (let i = 0; i < rings.length - 1; i++) {
      for (let j = 0; j < T; j++) {
        const a = i * (T + 1) + j;
        const b = a + T + 1;
        faces.push(a, a + 1, b, b, a + 1, b + 1);
      }
    }
    const shape = new THREE.BufferGeometry();
    shape.setAttribute('position', new THREE.Float32BufferAttribute(spots, 3));
    shape.setAttribute('color', new THREE.Float32BufferAttribute(shades, 3));
    shape.setIndex(faces);
    shape.computeVertexNormals();
    const body = new THREE.Mesh(shape, rockLook);
    body.castShadow = body.receiveShadow = true;
    island.add(body);
  }

  const stoneLook = new THREE.MeshStandardMaterial({ color: '#8d877c', roughness: 0.88 });
  const mossLook = new THREE.MeshStandardMaterial({ color: '#56643f', roughness: 1 });
  for (const s of stones) {
    const mesh = new THREE.Mesh(lump(s.r, 0.1, s.squash), stoneLook);
    mesh.position.set(s.x, s.r * s.squash[1] * 0.42, s.z); // sunk a little into the sand
    mesh.rotation.y = rand() * 6;
    mesh.castShadow = mesh.receiveShadow = true;
    island.add(mesh);
    if (!s.rings) continue;
    const patch = new THREE.Mesh(lump(s.r * 0.9, 0.22, [1.25, 0.1, 1.2]), mossLook);
    patch.position.set(s.x + s.r * 0.25, 0.0, s.z + s.r * 0.2);
    patch.receiveShadow = true;
    island.add(patch);
  }

  // Two small fragments of the same rock drift below the island, and stars.
  const fragmentLook = new THREE.MeshStandardMaterial({ color: '#6b655b', roughness: 0.96 });
  const drifters = [];
  for (let i = 0; i < 2; i++) {
    const mesh = new THREE.Mesh(lump(between(0.14, 0.24), 0.28, [1, between(0.6, 0.9), between(0.7, 1.1)]), fragmentLook);
    mesh.userData = { far: between(R * 0.5, R * 0.9), turn: rand() * 6.28, speed: between(0.01, 0.02), height: between(-4.6, -3.2) };
    drifters.push(mesh);
    scene.add(mesh);
  }
  const starSpots = [];
  const starShades = [];
  for (let i = 0; i < 1400; i++) {
    const v = new THREE.Vector3().setFromSphericalCoords(140, Math.acos(2 * Math.random() - 1), Math.random() * Math.PI * 2);
    starSpots.push(v.x, v.y, v.z);
    const b = 0.25 + Math.random() ** 3 * 0.75;
    starShades.push(b, b, b);
  }
  const starShape = new THREE.BufferGeometry();
  starShape.setAttribute('position', new THREE.Float32BufferAttribute(starSpots, 3));
  starShape.setAttribute('color', new THREE.Float32BufferAttribute(starShades, 3));
  const starLook = new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, transparent: true, depthWrite: false });
  const stars = new THREE.Points(starShape, starLook);
  scene.add(stars);

  // Trees: pruned garden trees built from a few uneven clumps.
  const bark = new THREE.MeshStandardMaterial({ color: '#5b4936', roughness: 1 });
  const needles = new THREE.MeshStandardMaterial({ color: '#4c6a45', roughness: 0.95, flatShading: true });
  const leaves = new THREE.MeshStandardMaterial({ color: '#73895a', roughness: 0.95, flatShading: true });
  const key = `space-garden:${location.pathname}`;
  let trees = [];
  try {
    trees = JSON.parse(localStorage.getItem(key)) || [];
  } catch {}
  const buildTree = (tree, grown) => {
    const pick = seeded(`${tree.x},${tree.z}`);
    const g = new THREE.Group();
    const h = tree.s;
    const part = (geometry, material, x, y, z) => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      g.add(mesh);
      return mesh;
    };
    const clump = (radius, material, x, y, z, flat = 0.75) => {
      const geometry = new THREE.IcosahedronGeometry(radius, 1);
      const at = geometry.attributes.position;
      for (let i = 0; i < at.count; i++) {
        const k = 1 + 0.16 * Math.sin(at.getX(i) * 31 + at.getY(i) * 17 + at.getZ(i) * 23);
        at.setXYZ(i, at.getX(i) * k, at.getY(i) * k * flat, at.getZ(i) * k);
      }
      geometry.computeVertexNormals();
      part(geometry, material, x, y, z).rotation.y = pick() * 6;
    };
    if (tree.t === 0) {
      // pine: a flared trunk and four tiers, each turned and a little off centre
      part(new THREE.CylinderGeometry(h * 0.025, h * 0.06, h * 0.45, 8), bark, 0, h * 0.22, 0);
      for (let i = 0; i < 4; i++) {
        const tier = part(new THREE.ConeGeometry(h * (0.3 - i * 0.055), h * 0.34, 7), needles, (pick() - 0.5) * h * 0.05, h * (0.42 + i * 0.17), (pick() - 0.5) * h * 0.05);
        tier.rotation.set((pick() - 0.5) * 0.14, pick() * 6, (pick() - 0.5) * 0.14);
      }
    } else if (tree.t === 1) {
      // cloud-pruned tree: a leaning trunk carrying a few flat pads of leaves
      const trunk = part(new THREE.CylinderGeometry(h * 0.03, h * 0.065, h * 0.7, 8), bark, h * 0.06, h * 0.34, 0);
      trunk.rotation.z = -0.18;
      clump(h * 0.3, leaves, h * 0.12, h * 0.74, 0, 0.6);
      clump(h * 0.21, leaves, -h * 0.2, h * 0.56, h * 0.08, 0.6);
      clump(h * 0.18, leaves, h * 0.34, h * 0.52, -h * 0.1, 0.6);
      clump(h * 0.15, leaves, h * 0.02, h * 0.95, h * 0.05, 0.65);
    } else {
      // low shrub
      clump(h * 0.24, leaves, 0, h * 0.13, 0, 0.7);
      clump(h * 0.17, leaves, h * 0.24, h * 0.1, h * 0.06, 0.7);
      clump(h * 0.14, leaves, -h * 0.18, h * 0.09, -h * 0.12, 0.7);
    }
    g.position.set(tree.x, 0, tree.z);
    g.rotation.set((pick() - 0.5) * 0.1, pick() * 6, (pick() - 0.5) * 0.1);
    g.scale.setScalar(grown ? 1 : 0.02);
    island.add(g);
    return g;
  };
  trees.forEach((tree) => buildTree(tree, true));

  // The gardener: tiny and solid, in work clothes and a straw hat.
  const cloth = new THREE.MeshStandardMaterial({ color: '#4d5a6b', roughness: 1 });
  const skin = new THREE.MeshStandardMaterial({ color: '#c9b08e', roughness: 1 });
  const straw = new THREE.MeshStandardMaterial({ color: '#c9b27c', roughness: 1 });
  const wood = new THREE.MeshStandardMaterial({ color: '#6a5540', roughness: 1 });
  const solid = (geometry, material, parent, x = 0, y = 0, z = 0) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  };
  const figure = new THREE.Group();
  const torso = new THREE.Group();
  torso.position.y = 0.2;
  solid(new THREE.CapsuleGeometry(0.05, 0.12, 4, 10), cloth, torso, 0, 0.11);
  solid(new THREE.SphereGeometry(0.042, 14, 10), skin, torso, 0, 0.255);
  solid(new THREE.ConeGeometry(0.1, 0.045, 14), straw, torso, 0, 0.3);
  const arm = solid(new THREE.CapsuleGeometry(0.016, 0.1, 3, 6).translate(0, -0.06, 0), cloth, torso, 0.03, 0.18, 0.04);
  arm.rotation.z = 1.0;
  const rakeTool = solid(new THREE.CylinderGeometry(0.008, 0.008, 0.5, 6).translate(0, -0.25, 0), wood, torso, 0.12, 0.26, 0.04);
  rakeTool.rotation.z = 0.3;
  solid(new THREE.BoxGeometry(0.02, 0.012, 0.13), wood, rakeTool, 0, -0.5, 0);
  const leg = () => solid(new THREE.CapsuleGeometry(0.022, 0.14, 3, 6).translate(0, -0.09, 0), cloth, figure, 0, 0.2, 0);
  const legA = leg();
  const legB = leg();
  legA.position.z = 0.025;
  legB.position.z = -0.025;
  figure.add(torso);
  island.add(figure);

  // Where the gardener may walk and plant: open sand, away from the rim,
  // the stones and their rings. Trees go toward the outer part of the garden.
  const blocked = (x, z, pad) => !inside(x, z, 0.55 + pad) || stones.some((s) => Math.hypot(x - s.x, z - s.z) < Math.max(s.field, s.r * 1.4) + pad);
  const crosses = (x1, z1, x2, z2) => {
    for (let t = 0; t <= 1; t += 0.05) if (blocked(x1 + (x2 - x1) * t, z1 + (z2 - z1) * t, 0)) return true;
    return false;
  };
  const spot = (from) => {
    for (let i = 0; i < 80; i++) {
      const a = Math.random() * Math.PI * 2;
      const far = (0.55 + 0.4 * Math.random()) * rimAt(a);
      const x = Math.cos(a) * far;
      const z = Math.sin(a) * far;
      if (blocked(x, z, 0.3)) continue;
      if (trees.some((t) => Math.hypot(t.x - x, t.z - z) < 1.1)) continue;
      if (from && crosses(from.x, from.z, x, z)) continue;
      return { x, z };
    }
    return null;
  };
  const me = spot() || { x: 0, z: R - 1.2 };
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
      const ahead = new THREE.Vector3(0.45, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), figure.rotation.y);
      const tree = { x: +(me.x + ahead.x).toFixed(2), z: +(me.z + ahead.z).toFixed(2), t: Math.floor(Math.random() * 3), s: +(1.1 + Math.random() * 0.5).toFixed(2) };
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

  // Colours follow the page theme: warm low daylight, or cool moonlight.
  const root = document.documentElement;
  const media = matchMedia('(prefers-color-scheme: dark)');
  const theme = () => {
    const night = (root.dataset.theme || (media.matches ? 'dark' : 'light')) === 'dark';
    sun.color.set(night ? '#b6c6ff' : '#ffeed6');
    sun.intensity = night ? 2.3 : 3.4;
    sky.color.set(night ? '#42527c' : '#ffffff');
    sky.groundColor.set(night ? '#131a30' : '#a89a7c');
    sky.intensity = night ? 0.75 : 1.0;
    back.color.set(night ? '#7b9cf0' : '#ffdcb8');
    back.intensity = night ? 1.7 : 0.5;
    starLook.color.set(night ? '#ffffff' : '#8a7f6e');
    starLook.opacity = night ? 0.95 : 0.22;
    starShape.setDrawRange(0, night ? 1400 : 380);
    renderer.toneMappingExposure = night ? 0.9 : 1;
    draw();
  };

  // On wide screens the rock sits wholly inside the right-hand margin,
  // clear of the text. Otherwise it sits low in the window, behind the text.
  const frame = () => {
    const w = innerWidth;
    const h = innerHeight;
    const rem = parseFloat(getComputedStyle(root).fontSize);
    const gutter = (w - 38 * rem) / 2 - 1.5 * rem; // space beside the text column
    const wide = gutter >= 250;
    canvas.classList.toggle('space-low', !wide);
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(w, h, false);
    const across = wide ? Math.min(gutter - 64, h * 0.62) : w * 0.66; // island width in px
    const distance = (2.75 * R * h) / (across * 2 * Math.tan((camera.fov * Math.PI) / 360));
    camera.aspect = w / h;
    camera.position.set(0, 0.46, 0.89).multiplyScalar(distance);
    camera.lookAt(0, -0.9, 0);
    const cx = wide ? w - gutter / 2 + 10 : w * 0.5;
    const cy = wide ? h * 0.5 : h * 0.84;
    camera.setViewOffset(w, h, w / 2 - cx, h / 2 - cy, w, h);
    camera.updateProjectionMatrix();
    draw();
  };

  let now = 0;
  function draw() {
    island.rotation.y = 0.5 + now * 0.012;
    island.position.y = Math.sin(now * 0.25) * 0.07;
    stars.rotation.y = now * 0.002;
    for (const d of drifters) {
      const a = d.userData.turn + now * d.userData.speed;
      d.position.set(Math.cos(a) * d.userData.far, d.userData.height + Math.sin(now * 0.2 + d.userData.turn) * 0.15, Math.sin(a) * d.userData.far);
      d.rotation.set(a * 2, a * 3, 0);
    }
    renderer.render(scene, camera);
  }

  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let last = 0;
  const tick = (ms) => {
    const dt = Math.min(0.1, (ms - last) / 1000);
    last = ms;
    now += dt;
    tend(now, dt);
    draw();
    requestAnimationFrame(tick);
  };

  addEventListener('resize', frame);
  media.addEventListener('change', theme);
  new MutationObserver(theme).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
  figure.position.set(me.x, 0, me.z);
  theme();
  frame();
  if (!still) {
    requestAnimationFrame((ms) => {
      last = ms;
      tick(ms);
    });
  }
}

start();
