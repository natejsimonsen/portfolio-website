// A small figure tends the background garden: it walks slowly, plants a tree,
// rests, and repeats. Trees are saved per page, so the garden fills in over
// visits. Everything is drawn inside the background SVG, behind the text.
(() => {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = [...document.querySelectorAll('.backdrop')].find((el) => getComputedStyle(el).display !== 'none');
  if (!svg) return;

  const stones = JSON.parse(svg.dataset.stones);
  const zones = JSON.parse(svg.dataset.plant);
  const most = Number(svg.dataset.trees);
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const key = `garden:${location.pathname}:${svg.viewBox.baseVal.width}`;
  const rand = (lo, hi) => lo + Math.random() * (hi - lo);
  // On narrow screens the planting strips are the page edges: never cross the text.
  const stay = zones[0][1] - zones[0][0] < 60 ? 1 : 0.75;
  const SIZE = 1.5; // the figure is about 30 drawing units tall

  const make = (name, attrs, parent) => {
    const el = document.createElementNS(NS, name);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    parent.append(el);
    return el;
  };

  // The part of the drawing that is on screen right now, in drawing units.
  const view = () => {
    const toDrawing = svg.getScreenCTM().inverse();
    const at = (x, y) => new DOMPoint(x, y).matrixTransform(toDrawing);
    const a = at(0, 0);
    const b = at(innerWidth, innerHeight);
    return { left: a.x + 16, right: b.x - 16, top: a.y + 44, bottom: b.y - 10 };
  };

  const nearStone = (x, y, pad) => stones.some(([sx, sy, r]) => Math.hypot(x - sx, y - sy) < r + pad);
  const crossesStone = (x1, y1, x2, y2) => {
    for (let t = 0; t <= 1; t += 0.05) if (nearStone(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, 4)) return true;
    return false;
  };

  // Trees
  let trees = [];
  try {
    trees = JSON.parse(localStorage.getItem(key)) || [];
  } catch {}
  const grove = make('g', { class: 'grove' }, svg);

  const drawTree = (tree, grown) => {
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('class', 'tree');
    const h = tree.s;
    make('path', { class: 'trunk', d: `M0 0V${-h * 0.5}` }, g);
    if (tree.t === 0) {
      // pine: three stacked tiers
      for (let i = 0; i < 3; i++) {
        const y = -h * (0.3 + i * 0.22);
        const w = h * (0.34 - i * 0.08);
        make('path', { class: 'leaf', d: `M${-w} ${y}L0 ${y - h * 0.34}L${w} ${y}Z` }, g);
      }
    } else if (tree.t === 1) {
      // round crown
      make('circle', { class: 'leaf', cx: -h * 0.14, cy: -h * 0.62, r: h * 0.24 }, g);
      make('circle', { class: 'leaf', cx: h * 0.16, cy: -h * 0.58, r: h * 0.22 }, g);
      make('circle', { class: 'leaf', cx: 0, cy: -h * 0.8, r: h * 0.22 }, g);
    } else {
      // low shrub
      make('ellipse', { class: 'leaf', cx: -h * 0.2, cy: -h * 0.2, rx: h * 0.3, ry: h * 0.2 }, g);
      make('ellipse', { class: 'leaf', cx: h * 0.18, cy: -h * 0.24, rx: h * 0.32, ry: h * 0.24 }, g);
    }
    // Nearer trees (lower on the page) are drawn over farther ones.
    const after = [...grove.children].find((el) => Number(el.dataset.y) > tree.y);
    g.dataset.y = tree.y;
    grove.insertBefore(g, after || null);
    const size = (k) => g.setAttribute('transform', `translate(${tree.x} ${tree.y}) scale(${k})`);
    size(grown ? 1 : 0.02);
    return size;
  };
  trees.forEach((tree) => drawTree(tree, true));

  // The figure, drawn with its feet at the origin.
  const figure = make('g', { class: 'gardener' }, svg);
  const body = make('g', {}, figure);
  make('circle', { class: 'head', cx: 0, cy: -19, r: 2.5 }, body);
  make('path', { d: 'M0 -16V-8' }, body);
  make('path', { d: 'M0 -14L4.5 -10' }, body);
  const rake = make('path', { d: 'M3 -15L8 0M6.5 0H9.5' }, body);
  const legA = make('path', {}, figure);
  const legB = make('path', {}, figure);

  const spot = (from) => {
    const seen = view();
    for (let i = 0; i < 40; i++) {
      // Mostly stay on the same side, so walks are short.
      const near = from && zones.find((z) => from.x >= z[0] - 20 && from.x <= z[1] + 20);
      const zone = near && Math.random() < stay ? near : zones[Math.floor(Math.random() * zones.length)];
      const lo = Math.max(zone[0], seen.left);
      const hi = Math.min(zone[1], seen.right);
      if (hi - lo < 8) continue;
      const x = rand(lo, hi);
      const y = rand(seen.top, seen.bottom);
      if (nearStone(x, y, 10)) continue;
      if (trees.some((t) => Math.hypot(t.x - x, t.y - y) < 34)) continue;
      if (from && crossesStone(from.x, from.y, x, y)) continue;
      return { x, y };
    }
    return null;
  };

  const start = spot() || { x: zones[0][0], y: 500 };
  const me = { x: start.x, y: start.y, face: 1 };
  let state = 'rest';
  let until = 2500;
  let target = null;
  let growing = null;
  let step = 0;

  const pose = (now) => {
    const stride = state === 'walk' ? Math.sin(step) * 3 : 1.5;
    legA.setAttribute('d', `M0 -8L${stride} 0`);
    legB.setAttribute('d', `M0 -8L${-stride} 0`);
    const bend = state === 'plant' ? 32 : 0;
    const sweep = state === 'rest' ? Math.sin(now / 1400) * 5 : 0;
    body.setAttribute('transform', `rotate(${bend} 0 -8)`);
    rake.setAttribute('transform', `rotate(${sweep} 3 -15)`);
    figure.setAttribute('transform', `translate(${me.x} ${me.y}) scale(${me.face * SIZE} ${SIZE})`);
  };

  if (still) {
    pose(0);
    return;
  }

  let last = 0;
  const tick = (now) => {
    const dt = Math.min(100, now - last) / 1000;
    last = now;

    if (state === 'rest' && now > until) {
      target = spot(me);
      if (target) state = 'walk';
      else until = now + 8000;
    } else if (state === 'walk') {
      const dx = target.x - me.x;
      const dy = target.y - me.y;
      const far = Math.hypot(dx, dy);
      const move = 9 * dt; // drawing units per second: a slow walk
      if (far <= move) {
        me.x = target.x;
        me.y = target.y;
        if (trees.length < most) {
          state = 'plant';
          until = now + 2600;
        } else {
          state = 'rest';
          until = now + rand(14000, 24000);
        }
      } else {
        me.x += (dx / far) * move;
        me.y += (dy / far) * move;
        me.face = dx < 0 ? -1 : 1;
        step += dt * 5;
      }
    } else if (state === 'plant' && now > until) {
      const tree = { x: Math.round(me.x + me.face * 13), y: Math.round(me.y), t: Math.floor(Math.random() * 3), s: Math.round(rand(20, 30)) };
      trees.push(tree);
      try {
        localStorage.setItem(key, JSON.stringify(trees));
      } catch {}
      growing = { size: drawTree(tree, false), from: now };
      state = 'rest';
      until = now + rand(9000, 16000);
    }

    if (growing) {
      const k = Math.min(1, (now - growing.from) / 6000);
      growing.size(1 - (1 - k) ** 3);
      if (k === 1) growing = null;
    }

    pose(now);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame((now) => {
    last = now;
    until += now;
    tick(now);
  });
})();
