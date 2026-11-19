// The page background: a small raked-sand garden on a rock floating in
// space, drawn with three.js. A figure tends it and plants trees, which are
// saved per page in the visitor's browser. It is fixed behind the text.
import * as THREE from 'three';

const R = 5; // island radius, in world units
const SPACING = 0.24; // gap between rake lines
const MOST_TREES = 9;

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
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 400);

  // Lights: one sun (or moon) that casts shadows, and soft fill from the sky.
  const sun = new THREE.DirectionalLight();
  sun.position.set(-7, 11, 5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 1, far: 40 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  const sky = new THREE.HemisphereLight();
  const rim = new THREE.DirectionalLight();
  rim.position.set(8, 3, -8);
  scene.add(sun, sky, rim);

  // Everything on the rock moves together.
  const island = new THREE.Group();
  scene.add(island);

  // Stones, placed first so the rake pattern can go around them.
  const stones = [];
  for (let tries = 0; stones.length < 3 && tries < 200; tries++) {
    const angle = rand() * Math.PI * 2;
    const far = between(0.6, R - 2.1);
    const stone = { x: Math.cos(angle) * far, z: Math.sin(angle) * far, r: between(0.34, 0.6), rings: 2 + Math.floor(rand() * 3) };
    stone.field = stone.r + 0.12 + stone.rings * SPACING;
    if (stones.every((s) => Math.hypot(s.x - stone.x, s.z - stone.z) > s.field + stone.field + SPACING)) stones.push(stone);
  }

  // Sand: a colour map with fine grain, and a height map with the grooves.
  const SIZE = 2048;
  const px = (v) => (v / R / 2 + 0.5) * SIZE;
  const len = (v) => (v / R / 2) * SIZE;
  const paint = (draw) => {
    const c = document.createElement('canvas');
    c.width = c.height = SIZE;
    draw(c.getContext('2d'));
    const texture = new THREE.CanvasTexture(c);
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return texture;
  };
  const grooves = (ctx, colour, flat, width) => {
    ctx.strokeStyle = colour;
    ctx.lineWidth = len(width);
    ctx.lineCap = 'round';
    const wobble = rand() * 6;
    for (let z = -R; z <= R; z += SPACING) {
      ctx.beginPath();
      for (let x = -R; x <= R; x += 0.1) ctx.lineTo(px(x), px(z + 0.012 * Math.sin(x * 1.3 + wobble + z)));
      ctx.stroke();
    }
    for (const s of stones) {
      ctx.fillStyle = flat;
      ctx.beginPath();
      ctx.arc(px(s.x), px(s.z), len(s.field + SPACING * 0.45), 0, 7);
      ctx.fill();
      for (let k = 0; k < s.rings; k++) {
        ctx.beginPath();
        ctx.arc(px(s.x), px(s.z), len(s.r + 0.12 + (k + 0.5) * SPACING), 0, 7);
        ctx.stroke();
      }
    }
    // a smooth border where the sand meets the edging
    ctx.strokeStyle = flat;
    ctx.lineWidth = len(0.5);
    ctx.beginPath();
    ctx.arc(SIZE / 2, SIZE / 2, len(R - 0.2), 0, 7);
    ctx.stroke();
  };
  const speckle = (ctx, count, shades) => {
    for (let i = 0; i < count; i++) {
      ctx.fillStyle = shades[i % shades.length];
      ctx.fillRect(Math.random() * SIZE, Math.random() * SIZE, 1 + Math.random(), 1 + Math.random());
    }
  };
  const colourMap = paint((ctx) => {
    ctx.fillStyle = '#d8ccb2';
    ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.filter = 'blur(3px)';
    grooves(ctx, 'rgba(120, 100, 70, 0.22)', '#d8ccb2', 0.1);
    ctx.filter = 'none';
    speckle(ctx, 90000, ['rgba(90, 75, 50, 0.16)', 'rgba(255, 250, 235, 0.2)', 'rgba(60, 50, 35, 0.1)']);
  });
  colourMap.colorSpace = THREE.SRGBColorSpace;
  const heightMap = paint((ctx) => {
    ctx.fillStyle = '#9a9a9a';
    ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.filter = 'blur(2.5px)';
    grooves(ctx, '#3c3c3c', '#9a9a9a', 0.11);
    ctx.filter = 'none';
    speckle(ctx, 120000, ['rgba(255, 255, 255, 0.1)', 'rgba(0, 0, 0, 0.1)']);
  });

  const sand = new THREE.Mesh(
    new THREE.CircleGeometry(R, 128).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ map: colourMap, bumpMap: heightMap, bumpScale: 2.2, roughness: 1 }),
  );
  sand.receiveShadow = true;
  island.add(sand);

  // The rock the garden sits on: a stone edging, then a rough mass below.
  const rock = new THREE.MeshStandardMaterial({ color: '#6b665e', roughness: 0.95, flatShading: true });
  const rough = (geometry, amount) => {
    const at = geometry.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < at.count; i++) {
      v.fromBufferAttribute(at, i);
      const lump = 1 + amount * (Math.sin(v.x * 3.1 + v.y * 2.3) * Math.cos(v.z * 2.7 - v.y) + 0.6 * Math.sin(v.x * 7.3 + v.z * 6.1));
      v.multiplyScalar(lump);
      at.setXYZ(i, v.x, v.y, v.z);
    }
    geometry.computeVertexNormals();
    return geometry;
  };
  const edging = new THREE.Mesh(new THREE.TorusGeometry(R + 0.04, 0.11, 10, 160).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#7d776d', roughness: 0.9 }));
  edging.castShadow = edging.receiveShadow = true;
  island.add(edging);
  const profile = [
    [0.02, -4.6], [0.7, -4.2], [1.3, -3.3], [2.1, -2.6], [2.6, -1.7], [3.6, -1.15], [4.3, -0.55], [R + 0.06, -0.1], [R + 0.06, 0],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const mass = new THREE.Mesh(new THREE.LatheGeometry(profile, 56), rock);
  const at = mass.geometry.attributes.position;
  for (let i = 0; i < at.count; i++) {
    const x = at.getX(i);
    const y = at.getY(i);
    const z = at.getZ(i);
    if (y > -0.15) continue; // keep the rim true so it meets the edging
    const push = 1 + 0.16 * Math.sin(x * 2.1 + y * 3) * Math.cos(z * 1.7 + y * 2) + 0.07 * Math.sin(x * 6 + z * 5 + y * 4);
    at.setXYZ(i, x * push, y, z * push);
  }
  mass.geometry.computeVertexNormals();
  island.add(mass);

  const pebble = new THREE.MeshStandardMaterial({ color: '#8a857b', roughness: 0.85 });
  const moss = new THREE.MeshStandardMaterial({ color: '#6f7d54', roughness: 1 });
  for (const s of stones) {
    const mesh = new THREE.Mesh(rough(new THREE.IcosahedronGeometry(s.r, 4), 0.09), pebble);
    mesh.scale.y = 0.72;
    mesh.position.set(s.x, s.r * 0.36, s.z);
    mesh.rotation.y = rand() * 6;
    mesh.castShadow = mesh.receiveShadow = true;
    const skirt = new THREE.Mesh(new THREE.CircleGeometry(s.r * 1.12, 28).rotateX(-Math.PI / 2), moss);
    skirt.position.set(s.x, 0.012, s.z);
    skirt.receiveShadow = true;
    island.add(mesh, skirt);
  }

  // A few small rocks drift nearby, and stars far behind.
  const drifters = [];
  for (let i = 0; i < 4; i++) {
    const mesh = new THREE.Mesh(rough(new THREE.IcosahedronGeometry(between(0.12, 0.34), 1), 0.18), rock);
    mesh.userData = { far: between(R + 1.6, R + 4.5), turn: rand() * 6.28, speed: between(0.012, 0.03), height: between(-2.2, 1.6) };
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

  // Trees
  const bark = new THREE.MeshStandardMaterial({ color: '#5a4a3a', roughness: 1 });
  const needles = new THREE.MeshStandardMaterial({ color: '#4f6b48', roughness: 0.9, flatShading: true });
  const leaves = new THREE.MeshStandardMaterial({ color: '#7a9160', roughness: 0.9, flatShading: true });
  const key = `space-garden:${location.pathname}`;
  let trees = [];
  try {
    trees = JSON.parse(localStorage.getItem(key)) || [];
  } catch {}
  const buildTree = (tree, grown) => {
    const g = new THREE.Group();
    const h = tree.s;
    const part = (geometry, material, y) => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.y = y;
      mesh.castShadow = true;
      g.add(mesh);
      return mesh;
    };
    part(new THREE.CylinderGeometry(h * 0.035, h * 0.05, h * 0.5, 7), bark, h * 0.25);
    if (tree.t === 0) {
      for (let i = 0; i < 3; i++) part(new THREE.ConeGeometry(h * (0.3 - i * 0.07), h * 0.42, 9), needles, h * (0.48 + i * 0.22));
    } else if (tree.t === 1) {
      part(new THREE.IcosahedronGeometry(h * 0.27, 1), leaves, h * 0.66);
      part(new THREE.IcosahedronGeometry(h * 0.2, 1), leaves, h * 0.82).position.x = h * 0.14;
      part(new THREE.IcosahedronGeometry(h * 0.19, 1), leaves, h * 0.6).position.x = -h * 0.2;
    } else {
      g.children[0].visible = false;
      part(new THREE.IcosahedronGeometry(h * 0.2, 1), leaves, h * 0.14).scale.set(1.4, 0.8, 1.1);
      part(new THREE.IcosahedronGeometry(h * 0.15, 1), leaves, h * 0.12).position.x = h * 0.24;
    }
    g.position.set(tree.x, 0, tree.z);
    g.rotation.y = tree.x * 7;
    g.scale.setScalar(grown ? 1 : 0.02);
    island.add(g);
    return g;
  };
  trees.forEach((tree) => buildTree(tree, true));

  // The gardener: a thin dark figure with a rake.
  const dark = new THREE.MeshStandardMaterial({ color: '#2f2c28', roughness: 1 });
  const limb = (length, radius = 0.014) => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 6).translate(0, -length / 2, 0), dark);
    mesh.castShadow = true;
    return mesh;
  };
  const figure = new THREE.Group();
  const torso = new THREE.Group();
  torso.position.y = 0.24;
  const spine = limb(0.2, 0.017);
  spine.position.y = 0.2;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 10), dark);
  head.position.y = 0.25;
  head.castShadow = true;
  const arm = limb(0.16);
  arm.position.y = 0.17;
  arm.rotation.z = 0.9;
  const rake = limb(0.5, 0.009);
  rake.position.set(0.1, 0.24, 0);
  rake.rotation.z = 0.28;
  torso.add(spine, head, arm, rake);
  const legA = limb(0.24);
  const legB = limb(0.24);
  legA.position.y = legB.position.y = 0.24;
  figure.add(torso, legA, legB);
  island.add(figure);

  const blocked = (x, z, pad) => Math.hypot(x, z) > R - 0.55 || stones.some((s) => Math.hypot(x - s.x, z - s.z) < s.field + pad);
  const crosses = (x1, z1, x2, z2) => {
    for (let t = 0; t <= 1; t += 0.05) if (blocked(x1 + (x2 - x1) * t, z1 + (z2 - z1) * t, 0.05)) return true;
    return false;
  };
  const spot = (from) => {
    for (let i = 0; i < 60; i++) {
      const angle = Math.random() * Math.PI * 2;
      const far = Math.sqrt(Math.random()) * (R - 0.7);
      const x = Math.cos(angle) * far;
      const z = Math.sin(angle) * far;
      if (blocked(x, z, 0.25)) continue;
      if (trees.some((t) => Math.hypot(t.x - x, t.z - z) < 0.8)) continue;
      if (from && crosses(from.x, from.z, x, z)) continue;
      return { x, z };
    }
    return null;
  };
  const me = spot() || { x: 0, z: R - 1 };
  figure.position.set(me.x, 0, me.z);
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
      const ahead = new THREE.Vector3(0.3, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), figure.rotation.y);
      const tree = { x: +(me.x + ahead.x).toFixed(2), z: +(me.z + ahead.z).toFixed(2), t: Math.floor(Math.random() * 3), s: +(0.55 + Math.random() * 0.4).toFixed(2) };
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
    const swing = state === 'walk' ? Math.sin(stride) * 0.5 : 0.1;
    legA.rotation.z = swing;
    legB.rotation.z = -swing;
    torso.rotation.z = state === 'plant' ? -0.6 : 0;
    rake.rotation.z = 0.28 + (state === 'rest' ? Math.sin(now * 0.7) * 0.07 : 0);
    figure.position.set(me.x, 0, me.z);
  };

  // Colours follow the page theme: warm daylight, or cool moonlight.
  const root = document.documentElement;
  const media = matchMedia('(prefers-color-scheme: dark)');
  const theme = () => {
    const night = (root.dataset.theme || (media.matches ? 'dark' : 'light')) === 'dark';
    sun.color.set(night ? '#a9bfff' : '#fff1dc');
    sun.intensity = night ? 1.5 : 3.2;
    sky.color.set(night ? '#3a4a70' : '#ffffff');
    sky.groundColor.set(night ? '#07080c' : '#b9ad92');
    sky.intensity = night ? 0.55 : 1.15;
    rim.color.set(night ? '#5f7fd0' : '#ffe2c0');
    rim.intensity = night ? 0.9 : 0.35;
    starLook.color.set(night ? '#ffffff' : '#7a7062');
    starLook.opacity = night ? 0.95 : 0.4;
    renderer.toneMappingExposure = night ? 0.85 : 1;
    draw();
  };

  // The rock sits to the right of the text on wide screens, and low on
  // narrow ones. Its size on screen follows the window.
  const frame = () => {
    const w = innerWidth;
    const h = innerHeight;
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(w, h, false);
    const wide = w >= 960;
    const across = wide ? Math.min(w * 0.29, h * 0.62) : w * 0.7; // island width in px
    const distance = (2 * R * h) / (across * 2 * Math.tan((camera.fov * Math.PI) / 360));
    camera.aspect = w / h;
    camera.position.set(0, 0.46, 0.89).multiplyScalar(distance);
    camera.lookAt(0, -0.6, 0);
    const cx = wide ? w * 0.82 : w * 0.5;
    const cy = wide ? h * 0.52 : h * 0.72;
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
