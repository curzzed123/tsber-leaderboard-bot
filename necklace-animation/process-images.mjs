import sharp from 'sharp';
import { copyFileSync, mkdirSync } from 'fs';

const PNG_PATH = 'C:\\Users\\ziyad\\Downloads\\2c59c371-2fa1-41e0-8533-1d73ae9277df.png';
const GIF_PATH = 'C:\\Users\\ziyad\\Downloads\\54c00e71c0e4c2f5034b3e1f4a46fe0e.gif';
const OUT = 'C:\\Users\\ziyad\\.codely\\Default\\necklace-animation\\assets';

mkdirSync(OUT, { recursive: true });
copyFileSync(GIF_PATH, `${OUT}/background.gif`);

const { data, info } = await sharp(PNG_PATH).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const { width, height, channels } = info;

console.log(`Image: ${width}x${height}`);

// For each row, estimate the background color by sampling pixels from the
// left and right edges. Since the background is a gradient, we sample
// multiple pixels and take the darkest (background is darker than the chain).
const N_SAMPLES = 10;
const EDGE_OFFSET = 2;
const bgLeft = new Array(height);
const bgRight = new Array(height);

for (let y = 0; y < height; y++) {
  // Left edge: sample N pixels, keep darkest 3
  const leftSamples = [];
  for (let s = 0; s < N_SAMPLES; s++) {
    const idx = (y * width + EDGE_OFFSET + s) * channels;
    leftSamples.push({
      r: data[idx], g: data[idx + 1], b: data[idx + 2],
      bright: (data[idx] + data[idx + 1] + data[idx + 2]) / 3
    });
  }
  leftSamples.sort((a, b) => a.bright - b.bright);
  const ld = leftSamples.slice(0, 3);
  bgLeft[y] = {
    r: ld.reduce((s, p) => s + p.r, 0) / 3,
    g: ld.reduce((s, p) => s + p.g, 0) / 3,
    b: ld.reduce((s, p) => s + p.b, 0) / 3
  };

  // Right edge: sample N pixels, keep darkest 3
  const rightSamples = [];
  for (let s = 0; s < N_SAMPLES; s++) {
    const idx = (y * width + (width - 1 - EDGE_OFFSET - s)) * channels;
    rightSamples.push({
      r: data[idx], g: data[idx + 1], b: data[idx + 2],
      bright: (data[idx] + data[idx + 1] + data[idx + 2]) / 3
    });
  }
  rightSamples.sort((a, b) => a.bright - b.bright);
  const rd = rightSamples.slice(0, 3);
  bgRight[y] = {
    r: rd.reduce((s, p) => s + p.r, 0) / 3,
    g: rd.reduce((s, p) => s + p.g, 0) / 3,
    b: rd.reduce((s, p) => s + p.b, 0) / 3
  };
}

// Smooth background estimates (moving average over 7 rows)
function smoothRow(arr, radius) {
  const out = new Array(arr.length);
  for (let y = 0; y < arr.length; y++) {
    let r = 0, g = 0, b = 0, n = 0;
    for (let dy = -radius; dy <= radius; dy++) {
      const yy = Math.max(0, Math.min(arr.length - 1, y + dy));
      r += arr[yy].r; g += arr[yy].g; b += arr[yy].b; n++;
    }
    out[y] = { r: r / n, g: g / n, b: b / n };
  }
  return out;
}

const smoothL = smoothRow(bgLeft, 4);
const smoothR = smoothRow(bgRight, 4);

// Build RGBA: pixel is transparent if close to estimated background
const rgba = Buffer.alloc(width * height * 4);
const THRESHOLD = 22;
const GRADIENT = 23;
let transparentCount = 0;

for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const t = x / (width - 1);
    // Interpolate between left and right background colors
    const bgR = smoothL[y].r * (1 - t) + smoothR[y].r * t;
    const bgG = smoothL[y].g * (1 - t) + smoothR[y].g * t;
    const bgB = smoothL[y].b * (1 - t) + smoothR[y].b * t;

    const i = (y * width + x) * channels;
    const r = data[i], g = data[i + 1], b = data[i + 2];

    const dist = Math.sqrt((r - bgR) ** 2 + (g - bgG) ** 2 + (b - bgB) ** 2);

    let alpha;
    if (dist < THRESHOLD) {
      alpha = 0;
      transparentCount++;
    } else if (dist < THRESHOLD + GRADIENT) {
      alpha = Math.round(((dist - THRESHOLD) / GRADIENT) * 255);
    } else {
      alpha = 255;
    }

    const o = (y * width + x) * 4;
    rgba[o] = r;
    rgba[o + 1] = g;
    rgba[o + 2] = b;
    rgba[o + 3] = alpha;
  }
}

console.log(`Transparent: ${transparentCount} pixels (${(transparentCount / (width * height) * 100).toFixed(1)}%)`);

// Save full necklace
await sharp(rgba, { raw: { width, height, channels: 4 } })
  .png()
  .toFile(`${OUT}/necklace-full.png`);

// Split into 3 parts
const third = Math.floor(width / 3);

await sharp(rgba, { raw: { width, height, channels: 4 } })
  .extract({ left: 0, top: 0, width: third, height })
  .png()
  .toFile(`${OUT}/necklace-left.png`);

await sharp(rgba, { raw: { width, height, channels: 4 } })
  .extract({ left: third, top: 0, width: third, height })
  .png()
  .toFile(`${OUT}/necklace-center.png`);

await sharp(rgba, { raw: { width, height, channels: 4 } })
  .extract({ left: third * 2, top: 0, width: width - third * 2, height })
  .png()
  .toFile(`${OUT}/necklace-right.png`);

console.log('Done! All images saved.');
