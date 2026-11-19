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

  return `<svg class="enso" viewBox="0 0 220 220" role="img" aria-label="A brush-drawn circle">
<mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="220" height="220">
<path class="draw draw-slow" pathLength="1" d="${line(centre)}" stroke="#fff" stroke-width="36" fill="none"/>${streaks}
</mask>
<path class="ink" mask="url(#${id})" d="${brush}"/>
</svg>`;
}

// Raked sand: parallel lines that bend around a few stones.
export function garden(seed, { width = 720, height = 132, gap = 9 } = {}) {
  const rand = rng(seed);
  const count = 2 + Math.floor(rand() * 2);
  const rows = Math.floor(height / gap);
  const stones = [];
  for (let i = 0; i < count; i++) {
    const slot = width / count;
    stones.push({
      x: slot * i + between(rand, slot * 0.25, slot * 0.75),
      y: gap * Math.round(between(rand, rows * 0.35, rows * 0.65)),
      r: between(rand, 11, 21),
    });
  }

  const phase = rand() * 6.28;
  let lines = '';
  for (let row = 0; row < rows; row++) {
    const base = gap / 2 + row * gap;
    const pts = [];
    for (let x = -4; x <= width + 4; x += 6) {
      let y = base + 1.3 * Math.sin(x / 95 + phase + row * 0.12);
      for (const s of stones) {
        const u = y - s.y;
        const reach = Math.exp(-(((x - s.x) / (1.5 * s.r)) ** 2));
        y = s.y + Math.sign(u || 1) * Math.sqrt(u * u + (s.r + 4) ** 2 * reach);
      }
      pts.push(`${pts.length ? 'L' : 'M'}${n(x)} ${n(y)}`);
    }
    lines += `<path class="draw" pathLength="1" style="--i:${row}" d="${pts.join('')}"/>`;
  }

  const blobs = stones
    .map((s) => {
      const pts = [];
      const sides = 9;
      for (let i = 0; i < sides; i++) {
        const angle = (i / sides) * 6.283;
        const r = (s.r - 3) * between(rand, 0.84, 1.04);
        pts.push([s.x + r * 1.15 * Math.cos(angle), s.y + r * Math.sin(angle)]);
      }
      const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const first = mid(pts[sides - 1], pts[0]);
      let d = `M${n(first[0])} ${n(first[1])}`;
      for (let i = 0; i < sides; i++) {
        const m = mid(pts[i], pts[(i + 1) % sides]);
        d += `Q${n(pts[i][0])} ${n(pts[i][1])} ${n(m[0])} ${n(m[1])}`;
      }
      return `<path d="${d}Z"/>`;
    })
    .join('');

  return `<svg class="garden" viewBox="0 0 ${width} ${height}" role="img" aria-label="Raked sand flowing around stones">
<g class="sand">${lines}</g><g class="stones">${blobs}</g>
</svg>`;
}

// Ripples: a small mark for each post in a list.
export function ripples(seed) {
  const rand = rng(seed);
  const cx = between(rand, 19, 25);
  const cy = between(rand, 19, 25);
  let arcs = '';
  const rings = 3 + Math.floor(rand() * 2);
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
  return `<svg class="ripples" viewBox="0 0 44 44" aria-hidden="true">${arcs}<circle cx="${n(cx)}" cy="${n(cy)}" r="1.7"/></svg>`;
}

// A small red seal, used as the favicon and the footer mark.
export const seal = `<svg xmlns="http://www.w3.org/2000/svg" class="seal" viewBox="0 0 32 32" aria-hidden="true"><path fill="#b5452f" d="M5.2 3.6 26.4 3c1.6 0 2.7 1.1 2.7 2.6l.3 20.6c0 1.6-1 2.8-2.6 2.8l-21 .4c-1.6 0-2.8-1-2.8-2.6L2.6 6.3c0-1.5 1-2.7 2.6-2.7Z"/><path fill="none" stroke="#f6f3ec" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" d="M10.5 22.5v-13l11 13v-13"/></svg>`;
