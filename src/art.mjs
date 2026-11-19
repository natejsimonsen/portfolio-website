// Small generated SVG marks. Every shape is seeded, so the same seed always
// draws the same picture. The 3D background lives in garden3d.js.

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
