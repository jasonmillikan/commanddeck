// Fill order: top-left → bottom-right → top-right → bottom-left
// Diagonal pattern reads clearly at 22px (avoids L-shape)
const FILL_ORDER = [
  { x: 2,  y: 2  },  // top-left
  { x: 12, y: 12 },  // bottom-right
  { x: 12, y: 2  },  // top-right
  { x: 2,  y: 12 },  // bottom-left
];

const CELL = 8;
const CORNER = 1.5;

const COLOR = {
  bg:        '#0c0e14',
  active:    '#4ade80',  // Linux / Windows
  activeMac: '#000000',  // macOS template image
  idle:      '#3a4060',
  red:       '#f87171',
  amber:     '#fbbf24',
};

function buildTrayIconSvg(runningCount, alertLevel, platform, size = 22) {
  const activeColor = platform === 'darwin' ? COLOR.activeMac : COLOR.active;
  const filled = Math.max(0, Math.min(runningCount, 4));

  const cells = FILL_ORDER.map((cell, i) =>
    i < filled
      ? `<rect x="${cell.x}" y="${cell.y}" width="${CELL}" height="${CELL}" rx="${CORNER}" fill="${activeColor}"/>`
      : `<rect x="${cell.x}" y="${cell.y}" width="${CELL}" height="${CELL}" rx="${CORNER}" fill="none" stroke="${COLOR.idle}" stroke-width="1"/>`
  ).join('');

  const badgeColor = alertLevel === 'red' ? COLOR.red : alertLevel === 'amber' ? COLOR.amber : null;
  // Badge overlaps top-right cell by design — SVG paint order keeps it visible at all run counts
  const badge = badgeColor ? `<circle cx="19" cy="3" r="3" fill="${badgeColor}"/>` : '';

  return `<svg width="${size}" height="${size}" viewBox="0 0 22 22" xmlns="http://www.w3.org/2000/svg"><rect width="22" height="22" rx="3" fill="${COLOR.bg}"/>${cells}${badge}</svg>`;
}

// ─── Pixel-level RGBA renderer ────────────────────────────────────────────────
// nativeImage.createFromBuffer() accepts raw RGBA (4 bytes/pixel, row-major).
// This avoids SVG data URLs which Electron v29 on Linux does not support for tray icons.

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
  for (let py = y; py < y + h; py++) {
    for (let px = x; px < x + w; px++) {
      if (inRoundRect(px - x, py - y, w, h, r)) setPixel(buf, size, px, py, color);
    }
  }
}

function strokeRoundRect(buf, size, x, y, w, h, r, color, sw) {
  fillRoundRect(buf, size, x, y, w, h, r, color);
  if (w > 2 * sw && h > 2 * sw) {
    fillRoundRect(buf, size, x + sw, y + sw, w - 2 * sw, h - 2 * sw, Math.max(0, r - sw), RGBA.bg);
  }
}

function fillCircle(buf, size, cx, cy, r, color) {
  for (let py = cy - r - 1; py <= cy + r + 1; py++) {
    for (let px = cx - r - 1; px <= cx + r + 1; px++) {
      if ((px - cx) ** 2 + (py - cy) ** 2 <= r * r) setPixel(buf, size, px, py, color);
    }
  }
}

function buildIconRgba(runningCount, alertLevel, platform, size) {
  const buf = Buffer.alloc(size * size * 4);
  const S = size / 22;
  const activeColor = platform === 'darwin' ? RGBA.activeMac : RGBA.active;
  const filled = Math.max(0, Math.min(runningCount, 4));

  // Fill background
  for (let i = 0; i < buf.length; i += 4) {
    buf[i] = RGBA.bg[0]; buf[i + 1] = RGBA.bg[1]; buf[i + 2] = RGBA.bg[2]; buf[i + 3] = 255;
  }

  // Draw grid cells
  for (let idx = 0; idx < 4; idx++) {
    const cell = FILL_ORDER[idx];
    const x = Math.round(cell.x * S);
    const y = Math.round(cell.y * S);
    const w = Math.round(CELL * S);
    const h = Math.round(CELL * S);
    const r = Math.round(CORNER * S);
    if (idx < filled) {
      fillRoundRect(buf, size, x, y, w, h, r, activeColor);
    } else {
      strokeRoundRect(buf, size, x, y, w, h, r, RGBA.idle, Math.max(1, Math.round(S)));
    }
  }

  // Draw alert badge — overlaps top-right cell by design, drawn last so always visible
  if (alertLevel) {
    const badgeColor = alertLevel === 'red' ? RGBA.red : RGBA.amber;
    const cx = Math.round(19 * S);
    const cy = Math.round(3 * S);
    const r  = Math.max(1, Math.round(3 * S));
    fillCircle(buf, size, cx, cy, r, badgeColor);
  }

  return buf;
}

function buildTrayIcon(runningCount, alertLevel) {
  // Lazy require — keeps this file importable by plain Node (for tests)
  const { nativeImage } = require('electron');
  const platform = process.platform;
  const size = platform === 'linux' ? 22 : 16;

  const buf1x = buildIconRgba(runningCount, alertLevel, platform, size);
  const img = nativeImage.createFromBuffer(buf1x, { width: size, height: size });

  // Add 2x representation for Retina / HiDPI (macOS and Windows)
  if (platform === 'darwin' || platform === 'win32') {
    const buf2x = buildIconRgba(runningCount, alertLevel, platform, size * 2);
    img.addRepresentation({ scaleFactor: 2.0, width: size * 2, height: size * 2, buffer: buf2x });
  }

  if (platform === 'darwin') img.setTemplateImage(true);

  return img;
}

function buildAppIcon() {
  const { nativeImage } = require('electron');
  const size = 64;
  const buf = buildIconRgba(0, null, process.platform, size);
  return nativeImage.createFromBuffer(buf, { width: size, height: size });
}

module.exports = { buildTrayIconSvg, buildTrayIcon, buildAppIcon };
