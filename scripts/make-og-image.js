// Builds public/brand/og-image.png — the 1200x630 card that shows up when a
// link to the site is pasted into a text, Slack, or Facebook.
//
// Why this exists instead of just pointing og:image at the lockup: the lockup
// is a transparent PNG. Link scrapers flatten transparency onto a background of
// their own choosing — white in most clients — so a mark drawn for one ground
// can come out invisible. This bakes the brand background in so the card looks
// the same everywhere.
//
// The source is the *dark* lockup on purpose. The card ground is #0a0d0c, and
// the light lockup is near-black line-work, which on that ground would be all
// but invisible. brand/lockup-dark.png is already the inverted mark plus the
// light-on-dark wordmark, so it composites straight on with no colour work here.
//
// Both lockup rasters are exported from the site's own lockup — the same mark
// art and the same Cabinet Grotesk wordmark carrying the same gradient — and
// committed as brand assets. They are not built by this script; regenerate them
// from the live lockup if the wordmark ever changes, then re-run this.
//
// Run by hand when the lockup changes; the output is committed:
//
//   node scripts/make-og-image.js
//
// No image library on purpose — it would be a native dependency carried in
// every deploy forever to produce one static file. Node's zlib is enough:
// PNG is deflate plus per-scanline filters, and both directions are here.

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SOURCE = path.join(__dirname, '..', 'public', 'brand', 'lockup-dark.png');
const OUTPUT = path.join(__dirname, '..', 'public', 'brand', 'og-image.png');

const CARD_WIDTH = 1200;
const CARD_HEIGHT = 630;
// --color-bg and --color-primary, dark theme (public/styles.css).
const BACKGROUND = [0x0a, 0x0d, 0x0c];
const ACCENT = [0x00, 0xe5, 0xa0];
const ACCENT_BAR_HEIGHT = 8;
// Leaves comfortable margin on all sides at typical preview crops.
const LOGO_MAX_WIDTH = 840;
const LOGO_MAX_HEIGHT = 400;

// ---------- PNG decode ----------

function readChunks(buffer) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (!buffer.subarray(0, 8).equals(signature)) {
    throw new Error('Source is not a PNG.');
  }

  const chunks = [];
  let offset = 8;
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    chunks.push({ type, data });
    offset += 12 + length; // length + type + data + crc
  }
  return chunks;
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

// Reverses the per-scanline filters PNG applies before deflating. Assumes
// 8-bit RGBA, non-interlaced — verified against IHDR by the caller.
function unfilter(raw, width, height) {
  const bpp = 4;
  const stride = width * bpp;
  const out = Buffer.alloc(stride * height);

  for (let y = 0; y < height; y += 1) {
    const filterType = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    const outRow = y * stride;
    const prevRow = outRow - stride;

    for (let x = 0; x < stride; x += 1) {
      const rawByte = line[x];
      const a = x >= bpp ? out[outRow + x - bpp] : 0;
      const b = y > 0 ? out[prevRow + x] : 0;
      const c = x >= bpp && y > 0 ? out[prevRow + x - bpp] : 0;

      let value;
      switch (filterType) {
        case 0: value = rawByte; break;
        case 1: value = rawByte + a; break;
        case 2: value = rawByte + b; break;
        case 3: value = rawByte + ((a + b) >> 1); break;
        case 4: value = rawByte + paeth(a, b, c); break;
        default: throw new Error(`Unsupported PNG filter type: ${filterType}`);
      }
      out[outRow + x] = value & 0xff;
    }
  }
  return out;
}

function decodePng(file) {
  const chunks = readChunks(fs.readFileSync(file));
  const ihdr = chunks.find((c) => c.type === 'IHDR');
  if (!ihdr) throw new Error('PNG has no IHDR chunk.');

  const width = ihdr.data.readUInt32BE(0);
  const height = ihdr.data.readUInt32BE(4);
  const bitDepth = ihdr.data[8];
  const colorType = ihdr.data[9];
  const interlace = ihdr.data[12];

  if (bitDepth !== 8 || colorType !== 6 || interlace !== 0) {
    throw new Error(
      `Expected an 8-bit RGBA non-interlaced PNG, got depth=${bitDepth} colorType=${colorType} interlace=${interlace}.`
    );
  }

  const idat = Buffer.concat(chunks.filter((c) => c.type === 'IDAT').map((c) => c.data));
  return { width, height, pixels: unfilter(zlib.inflateSync(idat), width, height) };
}

// ---------- PNG encode ----------

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData), 0);
  return Buffer.concat([length, typeAndData, crc]);
}

// Writes 8-bit RGB (no alpha — the card is fully opaque by construction).
function encodePng(width, height, rgb) {
  const stride = width * 3;
  // Filter type 1 (Sub) turns the large flat regions into runs of zeros,
  // which deflate collapses to almost nothing.
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 1;
    for (let x = 0; x < stride; x += 1) {
      const left = x >= 3 ? rgb[y * stride + x - 3] : 0;
      raw[rowStart + 1 + x] = (rgb[y * stride + x] - left) & 0xff;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: truecolour
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

// ---------- Compose ----------

// Box-average the source down to the destination size, averaging in
// premultiplied space. Averaging straight RGBA instead would pull the colour
// of fully transparent pixels into the edges and leave a halo.
function scalePremultiplied(src, srcW, srcH, dstW, dstH) {
  const out = new Float64Array(dstW * dstH * 4);
  const xRatio = srcW / dstW;
  const yRatio = srcH / dstH;

  for (let y = 0; y < dstH; y += 1) {
    const y0 = Math.floor(y * yRatio);
    const y1 = Math.max(y0 + 1, Math.min(srcH, Math.ceil((y + 1) * yRatio)));

    for (let x = 0; x < dstW; x += 1) {
      const x0 = Math.floor(x * xRatio);
      const x1 = Math.max(x0 + 1, Math.min(srcW, Math.ceil((x + 1) * xRatio)));

      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let count = 0;

      for (let sy = y0; sy < y1; sy += 1) {
        for (let sx = x0; sx < x1; sx += 1) {
          const i = (sy * srcW + sx) * 4;
          const alpha = src[i + 3] / 255;
          r += src[i] * alpha;
          g += src[i + 1] * alpha;
          b += src[i + 2] * alpha;
          a += alpha;
          count += 1;
        }
      }

      const o = (y * dstW + x) * 4;
      out[o] = r / count;
      out[o + 1] = g / count;
      out[o + 2] = b / count;
      out[o + 3] = a / count;
    }
  }
  return out;
}

function build() {
  const logo = decodePng(SOURCE);

  const scale = Math.min(LOGO_MAX_WIDTH / logo.width, LOGO_MAX_HEIGHT / logo.height);
  const destW = Math.max(1, Math.round(logo.width * scale));
  const destH = Math.max(1, Math.round(logo.height * scale));
  const scaled = scalePremultiplied(logo.pixels, logo.width, logo.height, destW, destH);

  const offsetX = Math.round((CARD_WIDTH - destW) / 2);
  // Nudged above centre: the accent bar has visual weight at the bottom, and
  // optical centring sits slightly high of geometric centring.
  const offsetY = Math.round((CARD_HEIGHT - destH) / 2) - 10;

  const canvas = Buffer.alloc(CARD_WIDTH * CARD_HEIGHT * 3);
  for (let i = 0; i < CARD_WIDTH * CARD_HEIGHT; i += 1) {
    canvas[i * 3] = BACKGROUND[0];
    canvas[i * 3 + 1] = BACKGROUND[1];
    canvas[i * 3 + 2] = BACKGROUND[2];
  }

  for (let y = 0; y < destH; y += 1) {
    const cy = offsetY + y;
    if (cy < 0 || cy >= CARD_HEIGHT) continue;
    for (let x = 0; x < destW; x += 1) {
      const cx = offsetX + x;
      if (cx < 0 || cx >= CARD_WIDTH) continue;

      const s = (y * destW + x) * 4;
      const alpha = scaled[s + 3];
      if (alpha <= 0) continue;

      const d = (cy * CARD_WIDTH + cx) * 3;
      // Source is already premultiplied, so this is src + dst * (1 - alpha).
      canvas[d] = Math.round(Math.min(255, scaled[s] + canvas[d] * (1 - alpha)));
      canvas[d + 1] = Math.round(Math.min(255, scaled[s + 1] + canvas[d + 1] * (1 - alpha)));
      canvas[d + 2] = Math.round(Math.min(255, scaled[s + 2] + canvas[d + 2] * (1 - alpha)));
    }
  }

  for (let y = CARD_HEIGHT - ACCENT_BAR_HEIGHT; y < CARD_HEIGHT; y += 1) {
    for (let x = 0; x < CARD_WIDTH; x += 1) {
      const d = (y * CARD_WIDTH + x) * 3;
      canvas[d] = ACCENT[0];
      canvas[d + 1] = ACCENT[1];
      canvas[d + 2] = ACCENT[2];
    }
  }

  const png = encodePng(CARD_WIDTH, CARD_HEIGHT, canvas);
  fs.writeFileSync(OUTPUT, png);
  console.log(
    `Wrote ${path.relative(path.join(__dirname, '..'), OUTPUT)} ` +
      `(${CARD_WIDTH}x${CARD_HEIGHT}, ${(png.length / 1024).toFixed(0)}KB) ` +
      `from a ${logo.width}x${logo.height} lockup scaled to ${destW}x${destH}.`
  );
}

build();
