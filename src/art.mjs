// Generated SVG drawings. Every shape is seeded, so the same seed always
// draws the same picture and each page gets its own garden.

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

// The page background: a dry garden seen from above. Straight raked lines
// cover the whole view, and rings are raked around groups of stones. It is
// drawn twice from one seed: a wide one that keeps stones in the side
// margins, clear of the text column, and a tall one for phones, where the
// stones sit half off the edges and only their rings reach under the text.
// src/gardener.js adds a small figure who plants trees in it.
const gap = 14;
const stretch = 1.12; // stones and their rings are a little wider than tall

export function backdrop(seed) {
  // stones in the margins on wide screens; half off the edges on narrow ones
  return (
    layer('wide', seed, 1600, [[40, 370], [1230, 1560]], 7, [[40, 330], [1270, 1560]], 12) +
    layer('tall', seed, 500, [[14, 34], [466, 486]], 5, [[24, 46], [454, 476]], 6)
  );
}

// `plant` and `trees` tell the gardener script where it may plant, and how much.
function layer(name, seed, width, zones, count, plant, trees) {
  const { markup, stones } = sand(name, seed, width, 1000, zones, count);
  const data = JSON.stringify(stones.map((s) => [Math.round(s.x), s.y, Math.round(s.outer * stretch)]));
  return `<svg class="backdrop backdrop-${name}" viewBox="0 0 ${width} 1000" preserveAspectRatio="xMidYMid slice" aria-hidden="true" data-stones="${data}" data-plant="${JSON.stringify(plant)}" data-trees="${trees}">${markup}</svg>
`;
}

function sand(name, seed, width, height, zones, count) {
  const rand = rng(seed);

  // Place stones on rake lines, inside the allowed zones, without overlap.
  const stones = [];
  for (let tries = 0; stones.length < count && tries < 400; tries++) {
    const zone = zones[(stones.length + tries) % zones.length];
    const rings = 2 + Math.floor(rand() * 4);
    const stone = {
      x: between(rand, zone[0], zone[1]),
      y: gap * Math.round(between(rand, 6, height / gap - 6)),
      r: between(rand, 9, 13) + rings * 1.6,
      outer: gap * (rings + 1.5),
      rings,
      turn: rand() * 6.28,
    };
    const clear = stones.every((s) => Math.hypot((s.x - stone.x) / stretch, s.y - stone.y) > s.outer + stone.outer + gap);
    if (clear) stones.push(stone);
  }

  // Straight lines that stop a steady half-gap short of each ring field.
  const phase = rand() * 6.28;
  const wave = (x, base) => base + 1.2 * Math.sin(x / 170 + phase + base * 0.013);
  let d = '';
  for (let base = gap; base < height; base += gap) {
    const cuts = [];
    for (const s of stones) {
      const dy = Math.abs(base - s.y);
      if (dy >= s.outer) continue;
      const half = stretch * Math.sqrt(s.outer * s.outer - dy * dy) + gap / 2;
      cuts.push([s.x - half, s.x + half]);
    }
    cuts.sort((p, q) => p[0] - q[0]);
    let from = 0;
    const stroke = (to) => {
      if (to - from < 6) return;
      for (let x = from; x < to; x += 16) d += `${x === from ? 'M' : 'L'}${n(x)} ${n(wave(x, base))}`;
      d += `L${n(to)} ${n(wave(to, base))}`;
    };
    for (const [start, end] of cuts) {
      stroke(start);
      from = Math.max(from, end);
    }
    stroke(width);
  }

  const loop = (s, radius, wobble, dx = 0, dy = 0) => {
    let path = '';
    for (let i = 0; i < 40; i++) {
      const angle = (i / 40) * 6.2832;
      const r = radius * (1 + wobble * Math.sin(angle * 3 + s.turn) + wobble * 0.6 * Math.sin(angle * 5 - s.turn));
      path += `${i ? 'L' : 'M'}${n(s.x + dx + r * stretch * Math.cos(angle))} ${n(s.y + dy + r * Math.sin(angle))}`;
    }
    return `${path}Z`;
  };
  let rocks = '';
  let shadows = '';
  for (const s of stones) {
    for (let k = 1; k <= s.rings; k++) d += loop(s, gap * (k + 0.5), 0.015);
    const big = loop(s, s.r, 0.08);
    rocks += `<path d="${big}"/>`;
    shadows += `<path d="${big}"/>`;
    // Larger groups get a small companion stone tucked beside the big one.
    if (s.rings >= 4) {
      const small = loop(s, s.r * 0.42, 0.1, s.r * 1.25, s.r * 0.55);
      rocks += `<path d="${small}"/>`;
      shadows += `<path d="${small}"/>`;
    }
  }

  // The light comes from the top left. Each rake line is drawn three times
  // (a soft ridge, a shadow, a highlight just below it) so it reads as a
  // groove, and each stone gets a shaded face and a blurred cast shadow.
  const markup = `<defs>
<path id="rake-${name}" d="${d}"/>
<radialGradient id="rock-${name}" cx="0.34" cy="0.26" r="0.9"><stop class="rock-hi" offset="0"/><stop class="rock-mid" offset="0.5"/><stop class="rock-lo" offset="1"/></radialGradient>
<filter id="soft-${name}" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="4.5"/></filter>
</defs>
<g class="rake"><use class="rake-ridge" href="#rake-${name}"/><use class="rake-shade" href="#rake-${name}"/><use class="rake-light" href="#rake-${name}" transform="translate(0.8 1.7)"/></g>
<g class="cast" filter="url(#soft-${name})" transform="translate(7 9)">${shadows}</g>
<g class="rocks" fill="url(#rock-${name})">${rocks}</g>`;
  return { markup, stones };
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

// Sand grain: a small seamless tile of fine dark and light specks, used as
// the page's background image. Being an SVG, it stays sharp on any screen.
// Dark specks show on the light theme and light specks on the dark one, so
// the two opacities tune the two themes separately.
const speck = (id, seed, colour, channel) =>
  `<filter id="${id}" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="3" seed="${seed}" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 ${colour}  0 0 0 0 ${colour}  0 0 0 0 ${colour}  ${channel} -0.7"/></filter>`;
export const grain = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256">${speck('dark', 4, 0.25, '1.4 0 0 0')}${speck('light', 9, 1, '0 1.4 0 0')}<rect width="256" height="256" filter="url(#dark)" opacity="0.5"/><rect width="256" height="256" filter="url(#light)" opacity="0.16"/></svg>`;
