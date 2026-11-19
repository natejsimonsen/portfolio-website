import sharp from 'sharp';
import fs from 'node:fs';
const mask = fs.existsSync('leaves_alpha.png') ? 'leaves_alpha.png' : 'leaves_alpha.jpg';
const a = await sharp(mask).resize(1024, 1024).greyscale().raw().toBuffer();
await sharp('raw/jacaranda_tree/textures/jacaranda_tree_leaves_diff_1k.jpg').removeAlpha().joinChannel(a, { raw: { width: 1024, height: 1024, channels: 1 } }).png().toFile('leaves_rgba.png');
console.log(await sharp('leaves_rgba.png').metadata().then((m) => [m.width, m.channels, m.hasAlpha]));
