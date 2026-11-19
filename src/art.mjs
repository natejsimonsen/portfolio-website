// Generated SVG drawings. Every shape is seeded, so the same seed always
// draws the same picture and each blog post gets its own garden.

function rng(seed) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const n = (v) => v.toFixed(1);
const between = (rand, lo, hi) => lo + rand() * (hi - lo);

// Ensō: a brush circle that tapers and leaves a gap. The brush shape is a
// filled outline; a thick dashed stroke in a mask reveals it as if painted.
export function enso(seed, id = 'enso') {
  const rand = rng(seed);
  const c = 110;
  const radius = 76;
  const start = between(rand, -2.3, -1.9);
  const sweep = between(rand, 5.55, 5.8);
  const p1 = rand() * 6.28;
  const p2 = rand() * 6.28;
  const steps = 120;

  const outer = [];
  const inner = [];
  const centre = [];
  const at = (t, offset) => {
    const angle = start + t * sweep;
    const r = radius + 2.4 * Math.sin(t * 5 + p1) + 1.2 * Math.sin(t * 11 + p2) + offset;
    return [c + r * Math.cos(angle), c + r * Math.sin(angle)];
  };
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    let width = 3 + 11 * Math.pow(1 - t, 0.8) + 1.5 * Math.sin(t * 9 + p1);
    if (t < 0.04) width *= Math.sqrt(t / 0.04);
    if (t > 0.88) width *= Math.pow((1 - t) / 0.12, 0.7);
    outer.push(at(t, width / 2));
    inner.push(at(t, -width / 2));
    centre.push(at(t, 0));
  }
  const line = (pts) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${n(x)} ${n(y)}`).join('');
  const brush = `${line(outer)}${line(inner.reverse()).replace('M', 'L')}Z`;

  // Dry-brush streaks: thin gaps in the tail of the stroke.
  const streaks = [-2.6, 0.8, 3.4]
    .map((offset) => {
      const from = between(rand, 0.5, 0.62);
      const pts = [];
      for (let t = from; t <= 0.985; t += 0.01) pts.push(at(t, offset));
      return `<path d="${line(pts)}" stroke="#000" stroke-width="${n(between(rand, 0.6, 1.2))}" fill="none"/>`;
    })
    .join('');

  // Fit the box to the ink so the drawing lines up with the column edge.
  const xs = [...outer, ...inner].map(([x]) => x);
  const ys = [...outer, ...inner].map(([, y]) => y);
  const x0 = Math.floor(Math.min(...xs)) - 1;
  const y0 = Math.floor(Math.min(...ys)) - 1;
  const w = Math.ceil(Math.max(...xs)) + 1 - x0;
  const h = Math.ceil(Math.max(...ys)) + 1 - y0;

  return `<svg class="enso" viewBox="${x0} ${y0} ${w} ${h}" role="img" aria-label="A brush-drawn circle">
<mask id="${id}" maskUnits="userSpaceOnUse" x="${x0}" y="${y0}" width="${w}" height="${h}">
<path class="draw" pathLength="1" d="${line(centre)}" stroke="#fff" stroke-width="36" fill="none"/>${streaks}
</mask>
<path class="ink" mask="url(#${id})" d="${brush}"/>
</svg>`;
}

// A dry garden: straight raked lines, with rings raked around each stone.
// It is drawn twice from one seed, wide and narrow, so phones get the same
// line gap and stone size instead of a scaled-down picture.
const height = 108;
const gap = 9;
const stretch = 1.15; // stones and their rings are a little wider than tall
const rings = 3;

export function garden(seed) {
  return `<svg class="garden garden-wide" viewBox="0 0 720 ${height}" role="img" aria-label="A raked sand garden with stones">${sand(seed, 720, 3)}</svg>
<svg class="garden garden-narrow" viewBox="0 0 360 ${height}" aria-hidden="true">${sand(seed, 360, 2)}</svg>`;
}

function sand(seed, width, most) {
  const rand = rng(seed);
  const count = Math.min(most, 2 + Math.floor(rand() * 2));
  const outer = gap * (rings + 0.5); // radius of the last raked ring
  const stones = [];
  for (let i = 0; i < count; i++) {
    const slot = width / count;
    stones.push({
      x: slot * i + between(rand, slot * 0.32, slot * 0.68),
      // Centred on a rake line, so the rings sit evenly between the lines.
      y: gap / 2 + gap * (4 + Math.floor(rand() * 4)),
      r: between(rand, 7.5, 10.5),
      turn: rand() * 6.28,
    });
  }

  // Straight lines that stop a steady half-gap short of each stone's rings.
  const phase = rand() * 6.28;
  const wave = (x, base) => base + 0.6 * Math.sin(x / 110 + phase + base * 0.02);
  let d = '';
  for (let base = gap / 2; base < height; base += gap) {
    let from = 0;
    const stretchOf = (to) => {
      if (to - from < 4) return;
      for (let x = from; x < to; x += 8) d += `${x === from ? 'M' : 'L'}${n(x)} ${n(wave(x, base))}`;
      d += `L${n(to)} ${n(wave(to, base))}`;
    };
    for (const s of stones) {
      const dy = Math.abs(base - s.y);
      if (dy >= outer) continue;
      const half = stretch * Math.sqrt(outer * outer - dy * dy) + gap / 2;
      stretchOf(s.x - half);
      from = s.x + half;
    }
    stretchOf(width);
  }

  const loop = (s, radius, wobble) => {
    let path = '';
    for (let i = 0; i < 36; i++) {
      const angle = (i / 36) * 6.2832;
      const r = radius * (1 + wobble * Math.sin(angle * 3 + s.turn));
      path += `${i ? 'L' : 'M'}${n(s.x + r * stretch * Math.cos(angle))} ${n(s.y + r * Math.sin(angle))}`;
    }
    return `${path}Z`;
  };
  for (const s of stones) for (let k = 1; k <= rings; k++) d += loop(s, gap * (k + 0.5), 0.02);

  const blobs = stones.map((s) => `<path d="${loop(s, s.r, 0.07)}"/>`).join('');
  return `<path class="sand" d="${d}"/><g class="stones">${blobs}</g>`;
}

// Ripples: a small mark for each post in a list.
export function ripples(seed) {
  const rand = rng(seed);
  const cx = 22;
  const cy = 22;
  let arcs = '';
  const rings = 4;
  for (let i = 0; i < rings; i++) {
    const r = 5 + i * 4.6;
    const from = rand() * 6.28;
    const span = between(rand, 3.4, 5.9);
    const x1 = cx + r * Math.cos(from);
    const y1 = cy + r * Math.sin(from);
    const x2 = cx + r * Math.cos(from + span);
    const y2 = cy + r * Math.sin(from + span);
    arcs += `<path d="M${n(x1)} ${n(y1)}A${n(r)} ${n(r)} 0 ${span > Math.PI ? 1 : 0} 1 ${n(x2)} ${n(y2)}"/>`;
  }
  return `<svg class="ripples" viewBox="2 2 40 40" aria-hidden="true">${arcs}<circle cx="${n(cx)}" cy="${n(cy)}" r="1.7"/></svg>`;
}

// A small red seal. The footer copy is coloured by CSS so it follows the
// accent; the favicon is a standalone file, so it carries fixed colours.
const sealBg = 'M5.2 3.6 26.4 3c1.6 0 2.7 1.1 2.7 2.6l.3 20.6c0 1.6-1 2.8-2.6 2.8l-21 .4c-1.6 0-2.8-1-2.8-2.6L2.6 6.3c0-1.5 1-2.7 2.6-2.7Z';
const sealMark = 'M10.5 22.5v-13l11 13v-13';
const markShape = 'stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"';

export const seal = `<svg class="seal" viewBox="0 0 32 32" aria-hidden="true"><path class="seal-bg" d="${sealBg}"/><path class="seal-mark" ${markShape} d="${sealMark}"/></svg>`;

export const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path fill="#a83e29" d="${sealBg}"/><path fill="none" stroke="#f6f3ec" ${markShape} d="${sealMark}"/></svg>`;
