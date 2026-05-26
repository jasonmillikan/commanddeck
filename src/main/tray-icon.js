const zlib = require('zlib');

// ─── Minimal PNG encoder ──────────────────────────────────────────────────────
// Converts a raw RGBA buffer to a valid PNG with an sRGB chunk so that GTK and
// the window manager apply the same color management as Chromium's CSS pipeline.
// Raw RGBA via createFromBuffer skips sRGB handling on Linux, causing the icon
// green to look visually different from the same #4ade80 rendered in CSS.

function _crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let j = 0; j < 8; j++) c = (c >>> 1) ^ (c & 1 ? 0xEDB88320 : 0);
  }
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function _pngChunk(type, data) {
  const tb = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([tb, data]);
  const cv = Buffer.alloc(4);
  cv.writeUInt32BE(_crc32(td));
  return Buffer.concat([len, td, cv]);
}

function _rgbaToPng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  const stride = width * 4;
  const rows = Buffer.alloc(height * (1 + stride));
  for (let y = 0; y < height; y++)
    rgba.copy(rows, y * (1 + stride) + 1, y * stride, (y + 1) * stride);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    _pngChunk('IHDR', ihdr),
    _pngChunk('sRGB', Buffer.from([0])), // perceptual rendering intent
    _pngChunk('IDAT', zlib.deflateSync(rows, { level: 6 })),
    _pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function _pngDataUrl(width, height, rgba) {
  return 'data:image/png;base64,' + _rgbaToPng(width, height, rgba).toString('base64');
}

// ─────────────────────────────────────────────────────────────────────────────

const COLOR = {
  bg:        '#0c0e14',
  active:    '#4ade80',  // Linux / Windows
  activeMac: '#000000',  // macOS template image
  idle:      '#3a4060',
  red:       '#f87171',
  amber:     '#fbbf24',
};

// Four pointy-top hexagons in a 2×2 grid, fill order: TL → BR → TR → BL (diagonal).
// r=3.5 circumradius; each cell center aligns with the old 8×8 square centers.
const HEX_R = 3.5;
const HEX_GRID = [
  { cx: 6,  cy: 6,  pts: '6,2.5 9.03,4.25 9.03,7.75 6,9.5 2.97,7.75 2.97,4.25' },
  { cx: 16, cy: 16, pts: '16,12.5 19.03,14.25 19.03,17.75 16,19.5 12.97,17.75 12.97,14.25' },
  { cx: 16, cy: 6,  pts: '16,2.5 19.03,4.25 19.03,7.75 16,9.5 12.97,7.75 12.97,4.25' },
  { cx: 6,  cy: 16, pts: '6,12.5 9.03,14.25 9.03,17.75 6,19.5 2.97,17.75 2.97,14.25' },
];

function buildTrayIconSvg(runningCount, alertLevel, platform, size = 22) {
  const activeColor = platform === 'darwin' ? COLOR.activeMac : COLOR.active;
  const filled = Math.max(0, Math.min(runningCount, 4));
  const unfilledStroke = filled > 0 ? activeColor : COLOR.idle;

  const cells = HEX_GRID.map(({ pts }, i) =>
    i < filled
      ? `<polygon points="${pts}" fill="${activeColor}"/>`
      : `<polygon points="${pts}" fill="none" stroke="${unfilledStroke}" stroke-width="1"/>`
  ).join('');

  const badgeColor = alertLevel === 'red' ? COLOR.red : alertLevel === 'amber' ? COLOR.amber : null;
  // Badge overlaps top-right cell by design — SVG paint order keeps it visible at all run counts
  const badge = badgeColor ? `<circle cx="19" cy="3" r="3" fill="${badgeColor}"/>` : '';

  return `<svg width="${size}" height="${size}" viewBox="0 0 22 22" xmlns="http://www.w3.org/2000/svg"><rect width="22" height="22" rx="3" fill="${COLOR.bg}"/>${cells}${badge}</svg>`;
}

// ─── Pixel-level RGBA renderer ────────────────────────────────────────────────

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const RGBA = {
  bg:        hexToRgb(COLOR.bg),
  active:    hexToRgb(COLOR.active),
  activeMac: hexToRgb(COLOR.activeMac),
  idle:      hexToRgb(COLOR.idle),
  red:       hexToRgb(COLOR.red),
  amber:     hexToRgb(COLOR.amber),
};

function setPixel(buf, size, x, y, color) {
  if (x < 0 || x >= size || y < 0 || y >= size) return;
  const i = (y * size + x) * 4;
  buf[i] = color[0]; buf[i + 1] = color[1]; buf[i + 2] = color[2]; buf[i + 3] = 255;
}

function inRoundRect(lx, ly, w, h, r) {
  if (lx < 0 || ly < 0 || lx >= w || ly >= h) return false;
  const cr = Math.min(r, Math.floor(w / 2), Math.floor(h / 2));
  if (lx < cr && ly < cr)           return (lx - cr) ** 2 + (ly - cr) ** 2 <= cr * cr;
  if (lx >= w - cr && ly < cr)      return (lx - (w - cr - 1)) ** 2 + (ly - cr) ** 2 <= cr * cr;
  if (lx < cr && ly >= h - cr)      return (lx - cr) ** 2 + (ly - (h - cr - 1)) ** 2 <= cr * cr;
  if (lx >= w - cr && ly >= h - cr) return (lx - (w - cr - 1)) ** 2 + (ly - (h - cr - 1)) ** 2 <= cr * cr;
  return true;
}

function fillRoundRect(buf, size, x, y, w, h, r, color) {
  for (let py = y; py < y + h; py++)
    for (let px = x; px < x + w; px++)
      if (inRoundRect(px - x, py - y, w, h, r)) setPixel(buf, size, px, py, color);
}

function fillCircle(buf, size, cx, cy, r, color) {
  for (let py = cy - r - 1; py <= cy + r + 1; py++)
    for (let px = cx - r - 1; px <= cx + r + 1; px++)
      if ((px - cx) ** 2 + (py - cy) ** 2 <= r * r) setPixel(buf, size, px, py, color);
}

// Pointy-top regular hexagon: vertex i at angle i*60° − 90° from center
function _hexVerts(cx, cy, r) {
  return Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i - Math.PI / 2;
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  });
}

function _inPolygon(x, y, verts) {
  let inside = false;
  for (let i = 0, j = verts.length - 1; i < verts.length; j = i++) {
    const { x: xi, y: yi } = verts[i], { x: xj, y: yj } = verts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
      inside = !inside;
  }
  return inside;
}

function fillHexagon(buf, size, cx, cy, r, color) {
  const verts = _hexVerts(cx, cy, r);
  for (let py = Math.floor(cy - r); py <= Math.ceil(cy + r); py++)
    for (let px = Math.floor(cx - r); px <= Math.ceil(cx + r); px++)
      if (_inPolygon(px + 0.5, py + 0.5, verts)) setPixel(buf, size, px, py, color);
}

function strokeHexagon(buf, size, cx, cy, r, sw, color) {
  fillHexagon(buf, size, cx, cy, r, color);
  if (r > sw) fillHexagon(buf, size, cx, cy, r - sw, RGBA.bg);
}

function buildIconRgba(runningCount, alertLevel, platform, size) {
  const buf = Buffer.alloc(size * size * 4);
  const S = size / 22;
  const activeColor = platform === 'darwin' ? RGBA.activeMac : RGBA.active;

  fillRoundRect(buf, size, 0, 0, size, size, Math.round(3 * S), RGBA.bg);

  const filled = Math.max(0, Math.min(runningCount, 4));
  const unfilledColor = filled > 0 ? activeColor : RGBA.idle;
  const r = HEX_R * S;
  const sw = Math.max(1, Math.round(1.5 * S));

  for (let i = 0; i < 4; i++) {
    const cx = HEX_GRID[i].cx * S, cy = HEX_GRID[i].cy * S;
    if (i < filled) {
      fillHexagon(buf, size, cx, cy, r, activeColor);
    } else {
      strokeHexagon(buf, size, cx, cy, r, sw, unfilledColor);
    }
  }

  if (alertLevel) {
    const badgeColor = alertLevel === 'red' ? RGBA.red : RGBA.amber;
    fillCircle(buf, size, Math.round(19 * S), Math.round(3 * S), Math.max(1, Math.round(3 * S)), badgeColor);
  }

  return buf;
}

function buildTrayIcon(runningCount, alertLevel) {
  // Lazy require — keeps this file importable by plain Node (for tests)
  const { nativeImage } = require('electron');
  const platform = process.platform;
  const size = platform === 'linux' ? 22 : 16;

  const buf1x = buildIconRgba(runningCount, alertLevel, platform, size);
  const img = nativeImage.createFromDataURL(_pngDataUrl(size, size, buf1x));

  // Add 2x representation for Retina / HiDPI (macOS and Windows)
  if (platform === 'darwin' || platform === 'win32') {
    const buf2x = buildIconRgba(runningCount, alertLevel, platform, size * 2);
    img.addRepresentation({ scaleFactor: 2.0, dataURL: _pngDataUrl(size * 2, size * 2, buf2x) });
  }

  if (platform === 'darwin') img.setTemplateImage(true);

  return img;
}

function buildAppIcon() {
  const { nativeImage } = require('electron');
  const size = 64;
  const S = size / 22;
  const buf = Buffer.alloc(size * size * 4);

  fillRoundRect(buf, size, 0, 0, size, size, Math.round(3 * S), RGBA.bg);

  const r = HEX_R * S;
  const sw = Math.max(1, Math.round(1.5 * S));
  HEX_GRID.forEach(({ cx, cy }, i) => {
    const x = cx * S, y = cy * S;
    if (i < 2) fillHexagon(buf, size, x, y, r, RGBA.active);
    else        strokeHexagon(buf, size, x, y, r, sw, RGBA.active);
  });

  return nativeImage.createFromDataURL(_pngDataUrl(size, size, buf));
}

function buildRawIconPng(size) {
  const rgba = buildIconRgba(2, null, 'linux', size);
  return _rgbaToPng(size, size, rgba);
}

module.exports = { buildTrayIconSvg, buildTrayIcon, buildAppIcon, buildRawIconPng };
