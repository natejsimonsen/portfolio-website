// Shrink the tree: simplify trunk and branches hard, and thin the foliage by
// keeping a fraction of whole leaves (enlarged to fill in), since simplifying
// tiny separate leaves just collapses them.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import * as fn from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
const [src, dest, keepPct, grow, woodRatio] = process.argv.slice(2);
await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(src);
for (const mesh of doc.getRoot().listMeshes()) {
  for (const prim of mesh.listPrimitives()) {
    const name = prim.getMaterial().getName();
    const index = prim.getIndices().getArray();
    const before = index.length / 3;
    if (/lea/i.test(name)) {
      const pos = prim.getAttribute('POSITION');
      const xyz = pos.getArray();
      const count = pos.getCount();
      const parent = new Uint32Array(count).map((_, i) => i);
      const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
      for (let i = 0; i < index.length; i += 3) {
        const a = find(index[i]);
        parent[find(index[i + 1])] = a;
        parent[find(index[i + 2])] = a;
      }
      const keep = (r) => (Math.imul(r, 2654435761) >>> 0) % 1000 < Number(keepPct) * 10;
      const sum = new Map();
      for (let v = 0; v < count; v++) {
        const r = find(v);
        if (!keep(r)) continue;
        const s = sum.get(r) || [0, 0, 0, 0];
        s[0] += xyz[v * 3]; s[1] += xyz[v * 3 + 1]; s[2] += xyz[v * 3 + 2]; s[3]++;
        sum.set(r, s);
      }
      const out = new Float32Array(xyz);
      for (let v = 0; v < count; v++) {
        const s = sum.get(find(v));
        if (!s) continue;
        for (let k = 0; k < 3; k++) { const c = s[k] / s[3]; out[v * 3 + k] = c + (xyz[v * 3 + k] - c) * Number(grow); }
      }
      pos.setArray(out);
      const kept = [];
      for (let i = 0; i < index.length; i += 3) if (keep(find(index[i]))) kept.push(index[i], index[i + 1], index[i + 2]);
      prim.getIndices().setArray(new Uint32Array(kept));
      fn.compactPrimitive(prim);
      console.log(name, before, '->', kept.length / 3, 'leaves kept', sum.size);
    } else {
      fn.weldPrimitive(prim);
      fn.simplifyPrimitive(prim, { simplifier: MeshoptSimplifier, ratio: Number(woodRatio), error: 0.1 });
      console.log(name, before, '->', prim.getIndices().getCount() / 3);
    }
  }
}
// The leaf picture ships without transparency; swap in one with the cut-out mask merged.
import fs from 'node:fs';
for (const m of doc.getRoot().listMaterials()) {
  if (!/lea/i.test(m.getName())) continue;
  m.getBaseColorTexture().setImage(fs.readFileSync('leaves_rgba.png')).setMimeType('image/png');
  m.setAlphaMode('MASK').setAlphaCutoff(0.4).setDoubleSided(true);
}
await doc.transform(fn.prune());
await io.write(dest, doc);
