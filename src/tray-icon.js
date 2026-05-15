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

function buildTrayIcon(runningCount, alertLevel) {
  // Lazy require — keeps this file importable by plain Node (for tests)
  const { nativeImage } = require('electron');
  const platform = process.platform;
  const size = platform === 'linux' ? 22 : 16;

  const svg1x = buildTrayIconSvg(runningCount, alertLevel, platform, size);
  const url1x = `data:image/svg+xml;base64,${Buffer.from(svg1x).toString('base64')}`;
  const img = nativeImage.createFromDataURL(url1x);

  // Add 2x representation for Retina / HiDPI (macOS and Windows)
  if (platform === 'darwin' || platform === 'win32') {
    const svg2x = buildTrayIconSvg(runningCount, alertLevel, platform, size * 2);
    const url2x = `data:image/svg+xml;base64,${Buffer.from(svg2x).toString('base64')}`;
    img.addRepresentation({ scaleFactor: 2.0, dataURL: url2x });
  }

  if (platform === 'darwin') img.setTemplateImage(true);

  return img;
}

module.exports = { buildTrayIconSvg, buildTrayIcon };
